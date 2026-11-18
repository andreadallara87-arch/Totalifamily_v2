-- Movimenti "una tantum" (tredicesima, spese di Natale, regali): si aggiungono alle previsioni
-- senza prendere il posto di un movimento che si ripete (per esempio la tredicesima non è lo stipendio di dicembre).
alter table public.transactions add column one_off boolean not null default false;

-- Il giro dei movimenti ricorrenti non conta una una tantum come il movimento della regola di quel mese.
CREATE OR REPLACE FUNCTION public.genera_ricorrenti()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

      if r.kind = 'giroconto' then
        select exists (select 1 from public.transactions t where t.kind = 'giroconto' and t.account_id = r.account_id
          and t.to_account_id = r.to_account_id and t.date between m_from and m_to and not t.one_off
          and (r.calc <> 'fisso' or t.recurring_id = r.id or t.amount = r.amount or r.check_mode)) into dup;
      else
        select exists (select 1 from public.transactions t where t.date between m_from and m_to and not t.one_off and (t.recurring_id = r.id
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
$function$;
