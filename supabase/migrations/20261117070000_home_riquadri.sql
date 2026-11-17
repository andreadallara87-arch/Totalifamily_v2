-- Ordine e riquadri nascosti della Home sul telefono, uguali su ogni dispositivo.
-- Esempio: {"order": ["saldo", "arrivo", "grafico", "conti", "spese", "finanziamenti"], "hidden": ["finanziamenti"]}
alter table public.user_settings
  add column if not exists home_layout jsonb
  check (home_layout is null or jsonb_typeof(home_layout) = 'object');
