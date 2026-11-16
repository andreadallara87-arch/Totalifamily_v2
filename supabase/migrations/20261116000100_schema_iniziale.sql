-- Totalifamily: schema iniziale (conti, categorie, movimenti, impostazioni, import)
-- App personale a utente singolo: il primo utente registrato diventa proprietario,
-- ogni altra registrazione viene rifiutata dal database.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Proprietario unico dell'app ------------------------------------------------
create table private.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  claimed_at timestamptz not null default now()
);

-- Conti, carte e finanziamenti ----------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users (id) on delete cascade default auth.uid(),
  legacy_id text,
  name text not null,
  kind text not null check (kind in ('conto', 'carta_revolv', 'finanziamento')),
  start_date date,
  initial_balance numeric(14, 2) not null default 0,
  overdraft numeric(14, 2) not null default 0,       -- fido
  credit_limit numeric(14, 2) not null default 0,    -- plafond
  tan numeric(6, 3),
  instalment numeric(12, 2),                          -- rata
  instalment_day smallint check (instalment_day between 1 and 31),
  auto_instalment boolean not null default false,
  payment_account_id uuid references public.accounts (id) on delete set null,
  long_term boolean,
  last_instalment text,                               -- 'AAAA-MM'
  statement_day smallint check (statement_day between 1 and 31), -- chiusura
  excluded boolean not null default false,
  archived boolean not null default false,
  sort_order integer not null default 0,
  legacy jsonb,                                       -- oggetto originale del backup
  created_at timestamptz not null default now(),
  unique (owner, legacy_id)
);
create index accounts_owner_idx on public.accounts (owner);
create index accounts_payment_account_idx on public.accounts (payment_account_id);

-- Categorie (con sottocategorie) --------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users (id) on delete cascade default auth.uid(),
  legacy_id text,
  parent_id uuid references public.categories (id) on delete cascade,
  kind text not null check (kind in ('spesa', 'entrata')),
  name text not null,
  icon text,
  budget numeric(12, 2),
  sort_order integer not null default 0,
  legacy jsonb,
  created_at timestamptz not null default now(),
  unique (owner, legacy_id)
);
create index categories_owner_idx on public.categories (owner);
create index categories_parent_idx on public.categories (parent_id);

-- Movimenti ------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users (id) on delete cascade default auth.uid(),
  legacy_id text,
  kind text not null check (kind in ('spesa', 'entrata', 'giroconto')),
  date date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  account_id uuid not null references public.accounts (id) on delete restrict,
  to_account_id uuid references public.accounts (id) on delete restrict,
  category_id uuid references public.categories (id) on delete set null,
  note text not null default '',
  planned boolean not null default false,             -- previsto
  created_at timestamptz not null default now(),
  legacy jsonb,
  unique (owner, legacy_id),
  check ((kind = 'giroconto') = (to_account_id is not null))
);
create index transactions_owner_date_idx on public.transactions (owner, date desc);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_to_account_idx on public.transactions (to_account_id);
create index transactions_category_idx on public.transactions (category_id);

-- Impostazioni personali (tema, colore, conto principale) --------------------
create table public.user_settings (
  owner uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  theme text not null default 'scuro' check (theme in ('scuro', 'chiaro')),
  accent text not null default 'blu'
    check (accent in ('blu', 'lime', 'viola', 'arancio', 'rosa', 'menta', 'oro', 'neutro')),
  main_account_id uuid references public.accounts (id) on delete set null,
  legacy jsonb,
  updated_at timestamptz not null default now()
);
create index user_settings_main_account_idx on public.user_settings (main_account_id);

-- Storico degli import (con il file originale integrale) ---------------------
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  owner uuid references auth.users (id) on delete cascade default auth.uid(),
  source text not null,
  imported_at timestamptz not null default now(),
  raw jsonb not null,
  report jsonb
);
create index imports_owner_idx on public.imports (owner);

-- Sicurezza: ogni riga è visibile solo al proprietario ------------------------
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.user_settings enable row level security;
alter table public.imports enable row level security;

revoke all on public.accounts, public.categories, public.transactions,
  public.user_settings, public.imports from anon;

create policy "proprietario" on public.accounts for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "proprietario" on public.categories for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "proprietario" on public.transactions for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "proprietario" on public.user_settings for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));
create policy "proprietario: lettura" on public.imports for select to authenticated
  using (owner = (select auth.uid()));

-- Saldi alla data di oggi (Europe/Rome), esclusi i movimenti futuri ------------
create view public.account_balances with (security_invoker = true) as
select
  a.id,
  a.owner,
  a.initial_balance + coalesce(sum(
    case
      when t.kind = 'entrata' and t.account_id = a.id then t.amount
      when t.kind in ('spesa', 'giroconto') and t.account_id = a.id then -t.amount
      when t.kind = 'giroconto' and t.to_account_id = a.id then t.amount
      else 0
    end), 0)::numeric(14, 2) as balance
from public.accounts a
left join public.transactions t
  on (t.account_id = a.id or t.to_account_id = a.id)
 and t.date <= (now() at time zone 'Europe/Rome')::date
group by a.id;

-- Il primo utente diventa proprietario e riceve i dati importati --------------
create function private.claim_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from private.app_owner) then
    raise exception 'Totalifamily è personale: la registrazione è chiusa';
  end if;
  insert into private.app_owner (user_id) values (new.id);
  update public.accounts set owner = new.id where owner is null;
  update public.categories set owner = new.id where owner is null;
  update public.transactions set owner = new.id where owner is null;
  update public.imports set owner = new.id where owner is null;
  insert into public.user_settings (owner, main_account_id, legacy)
  select new.id,
         (select a.id from public.accounts a where a.owner = new.id and a.kind = 'conto'
          order by a.sort_order limit 1),
         (select i.raw -> 'settings' from public.imports i where i.owner = new.id
          order by i.imported_at desc limit 1)
  on conflict (owner) do nothing;
  return new;
end;
$$;
revoke execute on function private.claim_owner() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.claim_owner();
