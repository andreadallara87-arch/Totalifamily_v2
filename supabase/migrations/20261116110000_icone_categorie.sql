-- Icone e colori delle categorie.
-- Le emoji originali restano nella colonna "icon" e nella copia "legacy": qui si aggiungono solo due colonne nuove.
-- symbol: nome dell'icona a linea (set Lucide, licenza ISC) mostrata dall'app.
-- tint: colore della categoria principale; le sottocategorie usano quello della loro categoria.
alter table public.categories
  add column if not exists symbol text,
  add column if not exists tint text check (tint in ('rosa', 'verde', 'blu', 'viola', 'teal', 'arancio', 'giallo', 'rosso', 'none'));

update public.categories c
set symbol = m.symbol, tint = m.tint
from (values
  ('entrata', 'Altre entrate', 'circle-plus', 'none'),
  ('entrata', 'Stipendio', 'briefcase', 'verde'),
  ('entrata', 'Interessi attivi', 'trending-up', 'teal'),
  ('entrata', 'Rimborsi', 'undo-2', 'blu'),
  ('entrata', 'Vendite', 'tag', 'arancio'),
  ('entrata', 'Entrate straordinarie', 'star', 'giallo'),
  ('entrata', 'Conto comune', 'users-round', 'viola'),
  ('entrata', 'Bonus e sussidi', 'gift', 'rosa'),
  ('spesa', 'Casa', 'house', 'blu'),
  ('spesa', 'Spesa alimentare', 'shopping-cart', 'verde'),
  ('spesa', 'Salute', 'heart-pulse', 'rosso'),
  ('spesa', 'Costi finanziari', 'landmark', 'viola'),
  ('spesa', 'Famiglia', 'users', 'rosa'),
  ('spesa', 'Altro', 'ellipsis', 'none'),
  ('spesa', 'Tempo libero', 'clapperboard', 'giallo'),
  ('spesa', 'Trasporti', 'car', 'teal'),
  ('spesa', 'Ristoranti e bar', 'utensils', 'arancio'),
  ('spesa', 'Sport e hobby', 'bike', 'blu'),
  ('spesa', 'Straordinarie', 'zap', 'rosso'),
  ('spesa', 'Viaggi e vacanze', 'plane', 'viola')
) as m(kind, name, symbol, tint)
where c.parent_id is null and c.kind = m.kind and c.name = m.name;

update public.categories c
set symbol = m.symbol
from public.categories p, (values
  ('spesa', 'Casa', 'Acqua', 'droplet'),
  ('spesa', 'Casa', 'Luce', 'lightbulb'),
  ('spesa', 'Casa', 'Gas', 'flame'),
  ('spesa', 'Casa', 'Condominio e riscaldamento', 'heater'),
  ('spesa', 'Casa', 'Internet e telefono', 'wifi'),
  ('spesa', 'Casa', 'Manutenzione', 'wrench'),
  ('spesa', 'Casa', 'Lavanderia', 'washing-machine'),
  ('spesa', 'Casa', 'Arredamento e elettrodomestici', 'sofa'),
  ('spesa', 'Spesa alimentare', 'Bevande', 'wine'),
  ('spesa', 'Spesa alimentare', 'Macelleria/Panetteria', 'croissant'),
  ('spesa', 'Spesa alimentare', 'Supermercato', 'shopping-basket'),
  ('spesa', 'Salute', 'Dentista', 'smile'),
  ('spesa', 'Salute', 'Farmacia', 'pill'),
  ('spesa', 'Salute', 'Visite', 'stethoscope'),
  ('spesa', 'Salute', 'Occhiali e lenti', 'glasses'),
  ('spesa', 'Salute', 'Terapie e cure', 'syringe'),
  ('spesa', 'Costi finanziari', 'Interessi passivi', 'percent'),
  ('spesa', 'Costi finanziari', 'Commissioni bancarie', 'hand-coins'),
  ('spesa', 'Costi finanziari', 'Assicurazioni', 'shield-check'),
  ('spesa', 'Costi finanziari', 'Imposte e tasse', 'receipt'),
  ('spesa', 'Famiglia', 'Regali', 'gift'),
  ('spesa', 'Famiglia', 'Scuola', 'graduation-cap'),
  ('spesa', 'Famiglia', 'Abbigliamento', 'shirt'),
  ('spesa', 'Famiglia', 'Animali', 'paw-print'),
  ('spesa', 'Famiglia', 'Parrucchiere', 'scissors'),
  ('spesa', 'Famiglia', 'Giochi e svago dei figli', 'puzzle'),
  ('spesa', 'Famiglia', 'Attività dei figli', 'medal'),
  ('spesa', 'Famiglia', 'Bellezza', 'sparkles'),
  ('spesa', 'Tempo libero', 'Abbonamenti', 'tv'),
  ('spesa', 'Tempo libero', 'Libri', 'book-open'),
  ('spesa', 'Tempo libero', 'Tabacchi', 'cigarette'),
  ('spesa', 'Tempo libero', 'Cinema e eventi', 'ticket'),
  ('spesa', 'Tempo libero', 'Uscite e svago', 'party-popper'),
  ('spesa', 'Trasporti', 'Carburante', 'fuel'),
  ('spesa', 'Trasporti', 'Pedaggi e parcheggi', 'circle-parking'),
  ('spesa', 'Trasporti', 'Bollo', 'stamp'),
  ('spesa', 'Trasporti', 'Assicurazione auto', 'shield'),
  ('spesa', 'Trasporti', 'Mezzi pubblici', 'bus'),
  ('spesa', 'Trasporti', 'Officina', 'wrench'),
  ('spesa', 'Trasporti', 'Lavaggio', 'spray-can'),
  ('spesa', 'Trasporti', 'Multe', 'triangle-alert'),
  ('spesa', 'Ristoranti e bar', 'Ristoranti', 'utensils-crossed'),
  ('spesa', 'Ristoranti e bar', 'Bar', 'coffee'),
  ('spesa', 'Ristoranti e bar', 'Pranzo lavoro', 'sandwich'),
  ('spesa', 'Ristoranti e bar', 'Asporto e delivery', 'package'),
  ('spesa', 'Sport e hobby', 'Sport', 'dumbbell'),
  ('spesa', 'Sport e hobby', 'Bici', 'bike'),
  ('spesa', 'Sport e hobby', 'Fotografia', 'camera'),
  ('spesa', 'Sport e hobby', 'Altri hobby', 'palette'),
  ('spesa', 'Straordinarie', 'Spese una tantum', 'badge-euro'),
  ('spesa', 'Straordinarie', 'Spese impreviste', 'triangle-alert'),
  ('spesa', 'Viaggi e vacanze', 'Spese in viaggio', 'luggage'),
  ('spesa', 'Viaggi e vacanze', 'Treni e voli', 'train-front'),
  ('spesa', 'Viaggi e vacanze', 'Alloggio', 'bed-double'),
  ('spesa', 'Viaggi e vacanze', 'Escursioni e biglietti', 'mountain')
) as m(kind, parent, name, symbol)
where c.parent_id = p.id and p.kind = m.kind and p.name = m.parent and c.name = m.name;
