import test from 'node:test'
import assert from 'node:assert/strict'
import { budgetUse, categoryReport, monthlyTotals, monthRange, monthsWithData, previousRange } from './report.js'

const cats = [
  { id: 'casa', parent_id: null }, { id: 'luce', parent_id: 'casa' }, { id: 'gas', parent_id: 'casa' },
  { id: 'bar', parent_id: null }, { id: 'stip', parent_id: null },
]
const catsById = new Map(cats.map((c) => [c.id, c]))
const txs = [
  { kind: 'spesa', date: '2026-11-20', amount: 999, category_id: 'luce' },
  { kind: 'spesa', date: '2026-11-10', amount: 40, category_id: 'luce' },
  { kind: 'spesa', date: '2026-11-09', amount: 10.1, category_id: 'gas' },
  { kind: 'spesa', date: '2026-11-08', amount: 5, category_id: 'casa' },
  { kind: 'spesa', date: '2026-11-07', amount: 2.2, category_id: 'bar' },
  { kind: 'spesa', date: '2026-11-06', amount: 1.3, category_id: null },
  { kind: 'entrata', date: '2026-11-05', amount: 2000, category_id: 'stip' },
  { kind: 'giroconto', date: '2026-11-04', amount: 500, category_id: null },
  { kind: 'spesa', date: '2026-10-25', amount: 30, category_id: 'luce' },
  { kind: 'spesa', date: '2026-10-12', amount: 7, category_id: 'bar' },
  { kind: 'spesa', date: '2026-09-03', amount: 11, category_id: 'bar' },
]
const today = '2026-11-16'

test('periodi: mese in corso fino a oggi, confronto allo stesso giorno', () => {
  assert.deepEqual(monthRange('2026-11', today), { from: '2026-11-01', to: '2026-11-16' })
  assert.deepEqual(monthRange('2026-10', today), { from: '2026-10-01', to: '2026-10-31' })
  assert.deepEqual(previousRange('2026-11', today), { from: '2026-10-01', to: '2026-10-16' })
  assert.deepEqual(previousRange('2026-10', today), { from: '2026-09-01', to: '2026-09-30' })
  assert.deepEqual(previousRange('2026-03', '2026-03-31'), { from: '2026-02-01', to: '2026-02-28' })
  assert.deepEqual(monthsWithData(txs, 'spesa', today), ['2026-09', '2026-10', '2026-11'])
  assert.deepEqual(monthsWithData(txs, 'spesa', today, 2), ['2026-10', '2026-11'])
  assert.deepEqual(monthsWithData(txs, 'entrata', today), ['2026-11'])
})

test('totali per categoria e sottocategoria, senza movimenti futuri né giroconti', () => {
  const r = categoryReport({ txs, catsById, kind: 'spesa', ...monthRange('2026-11', today) })
  assert.equal(r.total, 58.6)
  assert.deepEqual(r.rows.map((x) => [x.id, x.total, x.count]), [['casa', 55.1, 3], ['bar', 2.2, 1], ['senza', 1.3, 1]])
  assert.deepEqual(r.rows[0].subs.map((s) => [s.id, s.total]), [['luce', 40], ['gas', 10.1], ['casa', 5]])
  assert.ok(Math.abs(r.rows[0].share - 55.1 / 58.6) < 1e-9)
  assert.equal(categoryReport({ txs, catsById, kind: 'entrata', ...monthRange('2026-11', today) }).total, 2000)
})

test('mese per mese e budget', () => {
  const months = ['2026-09', '2026-10', '2026-11']
  assert.deepEqual(monthlyTotals({ txs, catsById, kind: 'spesa', months, today }).map((m) => m.total), [11, 37, 58.6])
  assert.deepEqual(monthlyTotals({ txs, catsById, kind: 'spesa', months, today, rootId: 'casa' }).map((m) => m.total), [0, 30, 55.1])
  assert.equal(budgetUse(10, null), null)
  assert.deepEqual(budgetUse(45, 30), { budget: 30, ratio: 1.5, over: 15 })
})
