-- Categorie create e modificate dall'app.
-- Una categoria si può eliminare solo se nessun movimento la usa e non ha sottocategorie:
-- prima i movimenti perdevano la categoria (set null) e le sottocategorie sparivano a cascata.
-- "no action" invece di "restrict": il controllo avviene a fine istruzione, così l'eventuale
-- cancellazione dell'intero account (owner on delete cascade) continua a funzionare.
alter table public.transactions
  drop constraint transactions_category_id_fkey,
  add constraint transactions_category_id_fkey foreign key (category_id) references public.categories (id) on delete no action;

alter table public.categories
  drop constraint categories_parent_id_fkey,
  add constraint categories_parent_id_fkey foreign key (parent_id) references public.categories (id) on delete no action;

-- Il nome non può essere vuoto.
alter table public.categories
  add constraint categories_name_not_blank check (length(btrim(name)) > 0);
