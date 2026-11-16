# Totalifamily

App personale per le finanze di casa: PWA (React + Vite) con dati su Supabase, pubblicata su Vercel.

## Sviluppo

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # test dei calcoli (saldi, impegni, finanziamenti)
npm run build
```

La chiave pubblica di Supabase è già nel codice (`src/lib/supabase.js`); si può sovrascrivere con
`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Database

- `supabase/migrations/`: schema, regole di accesso (RLS) e blocco a utente unico. Il primo account
  registrato diventa il proprietario e prende in carico i dati importati; ogni registrazione
  successiva viene rifiutata dal database.
- `supabase/import/`: script dell'import dal backup della vecchia app. Il backup completo è conservato
  intatto nella tabella `imports` (colonna `raw`) e ogni riga importata tiene l'originale nella colonna
  `legacy`. `02_verifica.sql` confronta conteggi, campi e saldi e salva il resoconto mostrato in
  Impostazioni.
- Il file di backup non va mai messo nel repository (`.gitignore` lo esclude).

## Impostazioni da fare una volta su Supabase

1. Authentication → URL Configuration: Site URL e Redirect URLs con l'indirizzo dell'app su Vercel.
2. Authentication → Passkeys: attivare, con RP ID uguale al dominio dell'app (senza `https://`)
   e origine `https://<dominio>`. Cambiare l'RP ID in seguito invalida le passkey già registrate.
