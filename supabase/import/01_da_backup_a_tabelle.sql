-- Ricostruisce conti, categorie e movimenti dal backup originale salvato in public.imports.
-- Ogni riga conserva l'oggetto originale in "legacy" e l'id originale in "legacy_id".
-- Le righe restano senza proprietario finché il primo utente si registra (vedi private.claim_owner).
do $$
declare
  imp uuid := (select id from public.imports where source = 'backup-libroconti-2026-11-15.json');
begin
  insert into public.accounts (owner, legacy_id, name, kind, start_date, initial_balance, overdraft,
    credit_limit, tan, instalment, instalment_day, auto_instalment, long_term, last_instalment,
    statement_day, excluded, archived, sort_order, legacy)
  select null, a->>'id', a->>'nome', a->>'tipo', nullif(a->>'dataInizio', '')::date,
    coalesce(nullif(a->>'saldoIniziale', '')::numeric, 0),
    coalesce(nullif(a->>'fido', '')::numeric, 0),
    coalesce(nullif(a->>'plafond', '')::numeric, 0),
    nullif(a->>'tan', '')::numeric,
    nullif(a->>'rata', '')::numeric,
    case when a->>'tipo' <> 'conto' then nullif(a->>'giornoRata', '')::smallint end,
    coalesce((a->>'autoRata')::boolean, false),
    case when jsonb_typeof(a->'lungoTermine') = 'boolean' then (a->>'lungoTermine')::boolean end,
    nullif(a->>'ultimaRata', ''),
    nullif(a->>'chiusura', '')::smallint,
    coalesce((a->>'escludi')::boolean, false),
    coalesce((a->>'archiviato')::boolean, false),
    x.n::int - 1, a
  from public.imports i, jsonb_array_elements(i.raw->'accounts') with ordinality as x(a, n)
  where i.id = imp;

  update public.accounts p
     set payment_account_id = q.id
    from public.accounts q
   where p.owner is null and q.owner is null
     and q.legacy_id = p.legacy->>'contoPagamento';

  insert into public.categories (owner, legacy_id, kind, name, icon, budget, sort_order, legacy)
  select null, c->>'id', c->>'tipo', c->>'nome', c->>'ic', nullif(c->>'budget', '')::numeric,
    x.n::int - 1, c
  from public.imports i, jsonb_array_elements(i.raw->'cats') with ordinality as x(c, n)
  where i.id = imp;

  update public.categories ch
     set parent_id = pa.id
    from public.categories pa
   where ch.owner is null and pa.owner is null
     and pa.legacy_id = ch.legacy->>'parentId';

  insert into public.transactions (owner, legacy_id, kind, date, amount, account_id, to_account_id,
    category_id, note, planned, created_at, legacy)
  select null, t->>'id', t->>'tipo', (t->>'data')::date, (t->>'importo')::numeric,
    a.id, d.id, c.id, coalesce(t->>'note', ''), coalesce((t->>'previsto')::boolean, false),
    to_timestamp((t->>'creato')::bigint / 1000.0), t
  from public.imports i
  cross join jsonb_array_elements(i.raw->'txs') as t
  join public.accounts a on a.owner is null and a.legacy_id = t->>'contoId'
  left join public.accounts d on d.owner is null and d.legacy_id = t->>'contoDestId'
  left join public.categories c on c.owner is null and c.legacy_id = t->>'catId'
  where i.id = imp;
end $$;
