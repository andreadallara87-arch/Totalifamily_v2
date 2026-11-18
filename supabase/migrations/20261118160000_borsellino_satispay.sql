-- Borsellini (Satispay): conti che si ricaricano dal conto principale e da cui si paga.
-- Il loro saldo non conta nel disponibile del flusso di cassa; le ricariche invece sì, come uscite dal conto.
-- Il flusso prevede le ricariche del mese con la media degli ultimi mesi, oppure con la cifra scelta (wallet_monthly).
alter table public.accounts
  add column wallet boolean not null default false,
  add column wallet_monthly numeric(10, 2) check (wallet_monthly >= 0);   -- ricariche al mese scelte; vuoto = media

update public.accounts set wallet = true where kind = 'conto' and name in ('Satispay', 'Risparmi Satispay');
