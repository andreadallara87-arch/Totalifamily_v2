-- Beni che contano nel patrimonio netto (casa, auto...): nome e valore stimato.
-- Esempio: [{"id": "casa", "name": "Casa", "kind": "casa", "value": 250000}]
alter table public.user_settings
  add column if not exists assets jsonb not null default '[]'::jsonb
  check (jsonb_typeof(assets) = 'array');
