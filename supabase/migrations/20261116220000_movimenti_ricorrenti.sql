-- Movimenti ricorrenti: regole che inseriscono da sole un movimento nel suo giorno.
-- calc = 'fisso'  importo della regola
--        'rata'   giroconto della rata verso un finanziamento + interessi come spesa sul finanziamento
--        'carta'  addebito di una carta a saldo: acquisti del mese prima + rata del piano + bollo
-- check_mode = "da controllare": il movimento entra con to_check = true e l'app chiede di confermarlo.

create table public.recurring (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  kind text not null check (kind in ('spesa', 'entrata', 'giroconto')),
  account_id uuid not null references public.accounts (id) on delete cascade,
  to_account_id uuid references public.accounts (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  interest_category_id uuid references public.categories (id) on delete set null,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  calc text not null default 'fisso' check (calc in ('fisso', 'rata', 'carta')),
  day smallint not null check (day between 1 and 31),            -- 31 = ultimo giorno del mese
  every_months smallint not null default 1 check (every_months between 1 and 12),
  next_date date not null,
  until_month text check (until_month ~ '^\d{4}-\d{2}$'),          -- ultimo mese compreso, 'AAAA-MM'
  check_mode boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check ((kind = 'giroconto') = (to_account_id is not null))
);
create index recurring_owner_idx on public.recurring (owner);
create index recurring_account_idx on public.recurring (account_id);
create index recurring_to_account_idx on public.recurring (to_account_id);
create index recurring_category_idx on public.recurring (category_id);
create index recurring_interest_category_idx on public.recurring (interest_category_id);

alter table public.recurring enable row level security;
revoke all on public.recurring from anon;
create policy "proprietario" on public.recurring for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

alter table public.transactions
  add column recurring_id uuid references public.recurring (id) on delete set null,
  add column to_check boolean not null default false;
create index transactions_recurring_idx on public.transactions (recurring_id);

-- Suggerimenti di ricorrenti che l'utente ha scartato ("Ignora").
alter table public.user_settings add column ignored_suggestions text[] not null default '{}';

-- Data della prossima volta: `months` mesi dopo `d`, nel giorno `day` (o l'ultimo del mese se è più corto).
create function public.recurring_date_after(d date, day smallint, months smallint)
returns date language sql immutable set search_path = '' as $$
  select (date_trunc('month', d) + make_interval(months => months))::date
    + (least(day::int, extract(day from (date_trunc('month', d) + make_interval(months => months + 1) - interval '1 day'))::int) - 1)
$$;

-- Inserisce i movimenti ricorrenti arrivati al loro giorno (oggi a Roma o prima). Restituisce quanti ne ha inseriti.
-- Gira ogni mattina da solo e anche quando si apre l'app. Con i permessi di chi la chiama:
-- dall'app vede solo le regole del proprietario.
create function public.genera_ricorrenti()
returns integer language plpgsql set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Rome')::date;
  r public.recurring%rowtype;
  acc public.accounts%rowtype;
  d date;
  m_from date;
  m_to date;
  amt numeric(12, 2);
  li numeric;
  lr numeric;
  int_amt numeric(12, 2);
  purchases numeric;
  plan numeric;
  fee numeric;
  own_costs boolean;
  prev text;
  dup boolean;
  n integer := 0;
begin
  for r in select * from public.recurring where active and next_date <= today order by next_date for update loop
    d := r.next_date;
    while d <= today and (r.until_month is null or to_char(d, 'YYYY-MM') <= r.until_month) loop
      m_from := date_trunc('month', d)::date;
      m_to := (date_trunc('month', d) + interval '1 month - 1 day')::date;

      -- Se in quel mese c'è già (inserito a mano o già generato), non si inserisce di nuovo.
      if r.kind = 'giroconto' then
        select exists (select 1 from public.transactions t where t.kind = 'giroconto' and t.account_id = r.account_id
          and t.to_account_id = r.to_account_id and t.date between m_from and m_to
          and (r.calc <> 'fisso' or t.recurring_id = r.id or t.amount = r.amount or r.check_mode)) into dup;
      else
        select exists (select 1 from public.transactions t where t.date between m_from and m_to and (t.recurring_id = r.id
          or (t.kind = r.kind and t.account_id = r.account_id and t.category_id is not distinct from r.category_id
              and (t.amount = r.amount or r.check_mode)))) into dup;
      end if;

      if not dup then
        amt := r.amount;
        if r.calc = 'carta' then
          select * into acc from public.accounts where id = r.to_account_id;
          prev := to_char(d - interval '1 month', 'YYYY-MM');
          own_costs := coalesce(acc.plan_amount, 0) > 0 or coalesce(acc.statement_fee, 0) > 0;
          select coalesce(sum(t.amount), 0) into purchases
            from public.transactions t
            left join public.categories c on c.id = t.category_id
            left join public.categories p on p.id = c.parent_id
           where t.kind = 'spesa' and t.account_id = r.to_account_id and to_char(t.date, 'YYYY-MM') = prev
             and not (own_costs and lower(trim(coalesce(p.name, c.name, ''))) = 'costi finanziari');
          plan := case when coalesce(acc.plan_amount, 0) > 0 and prev <= coalesce(acc.plan_until, '9999-12') then acc.plan_amount else 0 end;
          fee := case when purchases + plan > 77.47 then coalesce(acc.statement_fee, 0) else 0 end;
          amt := purchases + plan + fee;
        end if;

        if amt > 0 then
          insert into public.transactions (owner, kind, date, amount, account_id, to_account_id, category_id, note, planned, recurring_id, to_check)
          values (r.owner, r.kind, d, amt, r.account_id, r.to_account_id, case when r.kind = 'giroconto' then null else r.category_id end,
                  r.name, false, r.id, r.check_mode);
          n := n + 1;
        end if;

        -- Rata: anche gli interessi, come spesa sul finanziamento. Quelli dell'ultima rata meno il calo dovuto
        -- al capitale restituito; senza storia, dal debito che resta e dal tasso.
        if r.calc = 'rata' and r.interest_category_id is not null then
          select * into acc from public.accounts where id = r.to_account_id;
          select t.amount into li from public.transactions t where t.kind = 'spesa' and t.account_id = r.to_account_id
             and t.category_id = r.interest_category_id and t.date < d order by t.date desc limit 1;
          select t.amount into lr from public.transactions t where t.kind = 'giroconto' and t.to_account_id = r.to_account_id
             and t.date < d order by t.date desc limit 1;
          if li is not null and lr is not null then
            int_amt := round(li - greatest(lr - li, 0) * coalesce(acc.tan, 0) / 1200, 2);
          else
            select round(greatest(-b.balance, 0) * coalesce(acc.tan, 0) / 1200, 2) into int_amt from public.account_balances b where b.id = acc.id;
          end if;
          if int_amt > 0 then
            insert into public.transactions (owner, kind, date, amount, account_id, category_id, note, planned, recurring_id, to_check)
            values (r.owner, 'spesa', d, int_amt, r.to_account_id, r.interest_category_id, 'Interessi ' || acc.name, false, r.id, r.check_mode);
            n := n + 1;
          end if;
        end if;
      end if;

      d := public.recurring_date_after(d, r.day, r.every_months);
    end loop;
    update public.recurring set next_date = d where id = r.id;
  end loop;
  return n;
end
$$;

revoke all on function public.genera_ricorrenti() from public, anon;
grant execute on function public.genera_ricorrenti() to authenticated;
