import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyFilters, byMonth, emptyFilters, filtersFromQuery, filtersToQuery, periodRange, summarize } from './filters.js'

const today = '2026-11-16'
const categories = [
  { id: 'r', parent_id: null, kind: 'spesa', name: 'Ristoranti e bar' },
  { id: 'b', parent_id: 'r', kind: 'spesa', name: 'Bar' },
  { id: 'c', parent_id: null, kind: 'spesa', name: 'Casa' },
  { id: 's', parent_id: null, kind: 'entrata', name: 'Stipendio' },
]
const accounts = [{ id: 'A', name: 'Conto ordinario' }, { id: 'N', name: 'Nexi' }]
const txs = [
  { id: 1, kind: 'spesa', date: '2026-11-10', amount: 2.6, account_id: 'A', category_id: 'b', note: '' },
  { id: 2, kind: 'giroconto', date: '2026-11-05', amount: 100, account_id: 'A', to_account_id: 'N', category_id: null, note: 'Rata' },
  { id: 3, kind: 'spesa', date: '2026-10-20', amount: 30, account_id: 'N', category_id: 'r', note: 'Pizza Vito' },
  { id: 4, kind: 'entrata', date: '2026-10-27', amount: 2880, account_id: 'A', category_id: 's', note: '' },
  { id: 5, kind: 'spesa', date: '2026-09-02', amount: 40.5, account_id: 'A', category_id: 'c', note: 'Caffè' },
]
const ctx = { categories, accounts, today }
const ids = (f) => applyFilters(txs, f, ctx).map((t) => t.id)

test('il mese mostra solo quel mese', () => {
  assert.deepEqual(ids(emptyFilters(today)), [1, 2])
  assert.deepEqual(ids({ ...emptyFilters(today), period: 'tutto' }), [1, 2, 3, 4, 5])
})

test('la categoria principale comprende le sottocategorie', () => {
  assert.deepEqual(ids({ ...emptyFilters(today), period: 'tutto', cats: ['r'] }), [1, 3])
  assert.deepEqual(ids({ ...emptyFilters(today), period: 'tutto', cats: ['b'] }), [1])
})

test('il conto vale anche come destinazione dei giroconti', () => {
  assert.deepEqual(ids({ ...emptyFilters(today), period: 'tutto', accounts: ['N'] }), [2, 3])
  const s = summarize(applyFilters(txs, { ...emptyFilters(today), period: 'tutto', accounts: ['N'] }, ctx), { accounts: ['N'] })
  assert.equal(s.out, 30)
  assert.equal(s.moved, 100)
})

test('il testo cerca note, categorie e importi, senza accenti', () => {
  assert.deepEqual(ids({ ...emptyFilters(today), period: 'tutto', q: 'vito' }), [3])
  assert.deepEqual(ids({ ...emptyFilters(today), period: 'tutto', q: 'caffe' }), [5])
  assert.deepEqual(ids({ ...emptyFilters(today), period: 'tutto', q: '40,5' }), [5])
  assert.deepEqual(ids({ ...emptyFilters(today), period: 'tutto', q: 'ristoranti' }), [1, 3])
})

test('periodi', () => {
  assert.deepEqual(periodRange({ ...emptyFilters(today), period: '3mesi' }, today).from, '2026-09-01')
  assert.deepEqual(periodRange({ ...emptyFilters(today), period: 'anno' }, today).to, '2026-12-31')
  assert.deepEqual(ids({ ...emptyFilters(today), period: 'date', from: '2026-10-01', to: '2026-10-31' }), [3, 4])
})

test('mese per mese riempie i mesi vuoti', () => {
  const m = byMonth(applyFilters(txs, { ...emptyFilters(today), period: 'tutto', kind: 'spesa' }, ctx), today)
  assert.deepEqual(m.map((x) => [x.month, x.out]), [['2026-09', 40.5], ['2026-10', 30], ['2026-11', 2.6]])
})

test('i filtri passano dall’indirizzo', () => {
  const f = filtersFromQuery('mese=2026-10&tipo=spesa&cat=r', today)
  assert.equal(f.month, '2026-10')
  assert.equal(f.kind, 'spesa')
  assert.deepEqual(f.cats, ['r'])
  assert.deepEqual(filtersFromQuery(filtersToQuery(f), today), f)
})
