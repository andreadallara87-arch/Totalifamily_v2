-- Carte: piano a rate sulla carta e bollo dell'estratto conto.
-- Servono alla pagina "Flusso di cassa" per sapere quanto addebiterà una carta che si paga a saldo:
-- gli acquisti del mese prima, più la rata fissa di un eventuale piano a rate e il bollo.
-- La chiusura dell'estratto conto (statement_day) e il giorno di addebito (instalment_day) esistono già.
alter table public.accounts
  add column plan_amount numeric(12, 2) check (plan_amount >= 0),                   -- rata mensile del piano a rate
  add column plan_until text check (plan_until ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),     -- ultimo estratto conto con la rata, 'AAAA-MM'
  add column statement_fee numeric(8, 2) check (statement_fee >= 0);                -- bollo su ogni estratto conto
