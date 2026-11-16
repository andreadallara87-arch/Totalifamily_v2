import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCategory, categoryProblem, deleteCheck, parseBudget, upsertCategory } from './categories.js'

const cats = [
  { id: 'casa', parent_id: null, kind: 'spesa', name: 'Casa', sort_order: 0, tint: 'blu' },
  { id: 'luce', parent_id: 'casa', kind: 'spesa', name: 'Luce', sort_order: 0 },
  { id: 'gas', parent_id: 'casa', kind: 'spesa', name: 'Gas', sort_order: 4 },
  { id: 'bar', parent_id: null, kind: 'spesa', name: 'Bar', sort_order: 3 },
  { id: 'stip', parent_id: null, kind: 'entrata', name: 'Stipendio', sort_order: 0 },
]

test('nome obbligatorio e senza doppioni nello stesso livello', () => {
  assert.equal(categoryProblem({ name: '  ', kind: 'spesa', categories: cats }), 'Scrivi il nome')
  assert.equal(categoryProblem({ name: 'casa ', kind: 'spesa', categories: cats }), 'La categoria Casa esiste già')
  assert.equal(categoryProblem({ name: 'Casa', kind: 'entrata', categories: cats }), null)
  assert.equal(categoryProblem({ name: 'LUCE', parentId: 'casa', categories: cats }), "In Casa c'è già Luce")
  assert.equal(categoryProblem({ name: 'Luce', categories: cats, kind: 'spesa' }), null)
  assert.equal(categoryProblem({ id: 'luce', name: 'Luce', parentId: 'casa', categories: cats }), null)
  assert.equal(categoryProblem({ name: 'x'.repeat(41), kind: 'spesa', categories: cats }), 'Il nome è troppo lungo')
})

test('riga da salvare: sottocategoria eredita il tipo, ordine in fondo, budget solo per le spese', () => {
  assert.equal(parseBudget('1.200,50'), 1200.5)
  assert.equal(parseBudget('12.5'), 12.5)
  assert.equal(parseBudget('1.200'), 1200)
  assert.equal(parseBudget('80 €'), 80)
  assert.equal(parseBudget('0'), null)
  assert.equal(parseBudget(''), null)
  const sub = buildCategory({ name: ' Acqua  minerale ', kind: 'entrata', parentId: 'casa', symbol: 'droplet', tint: 'rosso', budget: '30', categories: cats })
  assert.deepEqual(sub, { name: 'Acqua minerale', kind: 'spesa', parent_id: 'casa', symbol: 'droplet', tint: null, budget: 30, sort_order: 5 })
  const root = buildCategory({ name: 'Regali ricevuti', kind: 'entrata', symbol: 'gift', tint: 'rosa', budget: '50', categories: cats })
  assert.deepEqual(root, { name: 'Regali ricevuti', kind: 'entrata', parent_id: null, symbol: 'gift', tint: 'rosa', budget: null, sort_order: 1 })
  const renamed = buildCategory({ id: 'gas', name: 'Gas e luce', parentId: 'casa', symbol: 'flame', budget: '', categories: cats })
  assert.equal(renamed.sort_order, undefined)
  const moved = buildCategory({ id: 'gas', name: 'Gas', parentId: 'bar', symbol: 'flame', categories: cats })
  assert.equal(moved.parent_id, 'bar'); assert.equal(moved.sort_order, 0)
})

test('eliminazione solo senza sottocategorie e senza movimenti', () => {
  const txs = [{ category_id: 'luce' }, { category_id: 'luce' }]
  assert.deepEqual(deleteCheck(cats[0], cats, txs), { ok: false, reason: 'Ha 2 sottocategorie: eliminale o spostale prima.' })
  assert.equal(deleteCheck(cats[1], cats, txs).ok, false)
  assert.match(deleteCheck(cats[1], cats, txs).reason, /La usano 2 movimenti/)
  assert.deepEqual(deleteCheck(cats[2], cats, txs), { ok: true, reason: null })
  assert.deepEqual(upsertCategory(cats, { id: 'gas', name: 'Gas 2' }).map((c) => c.name), ['Casa', 'Luce', 'Gas 2', 'Bar', 'Stipendio'])
  assert.equal(upsertCategory(cats, { id: 'nuova', name: 'N' }).length, 6)
})
