-- Limite al mese delle spese vive (tutte le spese tranne Costi finanziari). Vuoto = 1.750 €.
alter table public.user_settings
  add column if not exists spending_limit numeric(12,2)
  check (spending_limit is null or spending_limit > 0);
