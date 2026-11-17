import { test } from 'node:test'
import assert from 'node:assert/strict'
import { debtChanges, firstFullMonth, monthlyFlows, netWorthSeries, topCategories, trendMonths } from './trend.js'

const today = '2026-11-16'
const accounts = [
  { id: 'A', name: 'Conto', kind: 'conto', start_date: '2026-08-29', initial_balance: -3000 },
  { id: 'M', name: 'Mutuo', kind: 'finanziamento', start_date: '2026-08-29', initial_balance: -100000 },
  { id: 'S', name: 'Satispay', kind: 'conto', start_date: '2026-08-31', initial_balance: 20 },
]
const txs = [
  { kind: 'entrata', date: '2026-11-27', amount: 2880, account_id: 'A', category_id: 'st' },
  { kind: 'spesa', date: '2026-11-03', amount: 50, account_id: 'A', category_id: 'x' },
  { kind: 'giroconto', date: '2026-10-31', amount: 650, account_id: 'A', to_account_id: 'M' },
  { kind: 'spesa', date: '2026-10-31', amount: 170, account_id: 'M', category_id: 'i' },
  { kind: 'entrata', date: '2026-10-27', amount: 2800, account_id: 'A', category_id: 'st' },
  { kind: 'spesa', date: '2026-09-10', amount: 1000, account_id: 'A', category_id: 'x' },
  { kind: 'spesa', date: '2026-08-30', amount: 200, account_id: 'A', category_id: 'x' },
]

test('agosto ha solo 3 giorni: si parte da settembre', () => {
  assert.equal(firstFullMonth(accounts, today), '2026-09')
  assert.deepEqual(trendMonths(accounts, today), ['2026-09', '2026-10', '2026-11'])
})

test('entrate e spese per mese, senza giroconti né movimenti futuri', () => {
  const f = monthlyFlows({ txs, months: ['2026-09', '2026-10', '2026-11'], today })
  assert.deepEqual(f.map((x) => [x.inn, x.out, x.net]), [[0, 1000, -1000], [2800, 170, 2630], [0, 50, -50]])
  assert.equal(f[2].partial, true)
})

test('il patrimonio cambia di quanto è rimasto ogni mese', () => {
  const months = ['2026-09', '2026-10', '2026-11']
  const w = netWorthSeries({ accounts, txs, months, today })
  assert.equal(w[0].net, -103180)
  assert.equal(w[1].net, -104180)
  assert.equal(w[2].net, -101550)
  assert.equal(w[3].net, -101600)
  assert.equal(w[3].have, 20)
  const d = debtChanges(accounts, w)
  assert.deepEqual(d.map((x) => [x.id, x.change]), [['M', 480], ['A', 1100]])
})

test('categorie che pesano di più', () => {
  const catsById = new Map([['x', { id: 'x', name: 'X' }], ['i', { id: 'i', name: 'I' }]])
  const t = topCategories({ txs, catsById, month: '2026-10', today })
  assert.deepEqual(t.map((x) => x.id), ['i'])
})

test('i beni si sommano al patrimonio', () => {
  const w = netWorthSeries({ accounts, txs, months: ['2026-09'], today, assets: [{ name: 'Casa', value: 200000 }, { name: 'Auto', value: '9000' }] })
  assert.equal(w[1].goods, 209000)
  assert.equal(w[1].net, -104180 + 209000)
})
