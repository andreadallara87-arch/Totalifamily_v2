-- Ogni mattina (alle 6 a Roma d'inverno, alle 7 d'estate) inserisce i movimenti ricorrenti del giorno,
-- anche se nessuno apre l'app. Da applicare dopo il rilascio della pagina dei ricorrenti.
create extension if not exists pg_cron;
select cron.schedule('genera-ricorrenti', '0 5 * * *', $$select public.genera_ricorrenti()$$);
