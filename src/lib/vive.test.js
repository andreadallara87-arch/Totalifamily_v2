import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_LIMIT, financialRootId, liveByMonth, liveMonth, spendingLimit } from './vive.js'

const categories = [
  { id: 'fin', parent_id: null, kind: 'spesa', name: 'Costi finanziari' },
  { id: 'int', parent_id: 'fin', kind: 'spesa', name: 'Interessi' },
  { id: 'ali', parent_id: null, kind: 'spesa', name: 'Spesa alimentare' },
]
const tx = (date, amount, category_id, kind = 'spesa') => ({ kind, date, amount, category_id })
const txs = [
  tx('2026-11-02', 100, 'ali'),
  tx('2026-11-05', 50.5, 'int'),
  tx('2026-11-10', 200, null),
  tx('2026-11-25', 999, 'ali'), // futura: non conta
  tx('2026-11-03', 3000, null, 'entrata'),
  tx('2026-10-10', 300, 'ali'),
  tx('2026-10-20', 80, 'ali'),
]

test('trova Costi finanziari tra le categorie principali', () => {
  assert.equal(financialRootId(categories), 'fin')
  assert.equal(financialRootId([]), null)
})

test('limite: quello scelto, altrimenti 1.750', () => {
  assert.equal(spendingLimit({ spending_limit: '1500' }), 1500)
  assert.equal(spendingLimit(null), DEFAULT_LIMIT)
})

test('spese vive del mese: senza costi finanziari, senza entrate e movimenti futuri', () => {
  const l = liveMonth({ txs, categories, today: '2026-11-18', limit: 1000 })
  assert.equal(l.spent, 300)
  assert.equal(l.financial, 50.5)
  assert.equal(l.left, 700)
  assert.equal(l.daysLeft, 13)
  assert.equal(l.perDay, 53.84)
  assert.equal(l.prevSameDay, 300)
})

test('oltre il limite: resto negativo, niente al giorno', () => {
  const l = liveMonth({ txs, categories, today: '2026-11-18', limit: 250 })
  assert.equal(l.left, -50)
  assert.equal(l.perDay, 0)
})

test('mese per mese', () => {
  const r = liveByMonth({ txs, categories, months: ['2026-10', '2026-11'], today: '2026-11-18' })
  assert.deepEqual(r.map((x) => [x.live, x.financial, x.partial]), [[380, 0, false], [300, 50.5, true]])
})
