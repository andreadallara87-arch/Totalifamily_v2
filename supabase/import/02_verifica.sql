-- Verifica dell'import: conteggi, corrispondenza 1:1 con il file originale, campi mappati e saldi.
-- Il risultato viene salvato in public.imports.report e mostrato nell'app (Impostazioni).
with i as (select * from public.imports where source = 'backup-libroconti-2026-11-15.json'),
src_acc as (select e from i, jsonb_array_elements(i.raw->'accounts') e),
src_cat as (select e from i, jsonb_array_elements(i.raw->'cats') e),
src_tx  as (select e from i, jsonb_array_elements(i.raw->'txs') e),
r as (
  select jsonb_build_object(
    'conteggi', jsonb_build_object(
      'conti', jsonb_build_array((select count(*) from src_acc), (select count(*) from public.accounts)),
      'categorie', jsonb_build_array((select count(*) from src_cat), (select count(*) from public.categories)),
      'movimenti', jsonb_build_array((select count(*) from src_tx), (select count(*) from public.transactions))),
    'originali_mancanti', jsonb_build_object(
      'conti', (select count(*) from src_acc s where not exists (select 1 from public.accounts a where a.legacy = s.e)),
      'categorie', (select count(*) from src_cat s where not exists (select 1 from public.categories c where c.legacy = s.e)),
      'movimenti', (select count(*) from src_tx s where not exists (select 1 from public.transactions t where t.legacy = s.e))),
    'campi_diversi', (select count(*) from public.transactions t
        left join public.accounts a on a.id = t.account_id
        left join public.accounts d on d.id = t.to_account_id
        left join public.categories c on c.id = t.category_id
      where t.amount <> (t.legacy->>'importo')::numeric
         or t.date <> (t.legacy->>'data')::date
         or t.kind <> t.legacy->>'tipo'
         or a.legacy_id is distinct from t.legacy->>'contoId'
         or d.legacy_id is distinct from nullif(t.legacy->>'contoDestId', '')
         or c.legacy_id is distinct from nullif(t.legacy->>'catId', '')
         or t.note <> t.legacy->>'note'
         or t.planned <> coalesce((t.legacy->>'previsto')::boolean, false)),
    'totali', jsonb_build_object(
      'spesa', (select sum(amount) from public.transactions where kind = 'spesa'),
      'entrata', (select sum(amount) from public.transactions where kind = 'entrata'),
      'giroconto', (select sum(amount) from public.transactions where kind = 'giroconto')),
    'saldi_al', (now() at time zone 'Europe/Rome')::date,
    'saldi', (select jsonb_object_agg(a.name, b.balance order by a.sort_order)
                from public.accounts a join public.account_balances b on b.id = a.id),
    'movimenti_futuri', (select count(*) from public.transactions
                          where date > (now() at time zone 'Europe/Rome')::date)
  ) as report
)
update public.imports set report = r.report from r
where imports.id = (select id from i)
returning imports.report;
