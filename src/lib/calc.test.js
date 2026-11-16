import { test } from 'node:test'
import assert from 'node:assert/strict'
import { balancesAt, dailySeries, nextInstalmentDate, upcoming, loanEnd, spendingByCategory, addMonths, dateInMonth } from './calc.js'

const acc = [
  { id: 'c', kind: 'conto', initial_balance: -100, overdraft: 1000, start_date: '2026-01-01' },
  { id: 'l', kind: 'finanziamento', initial_balance: -5000, auto_instalment: true, instalment: 200, instalment_day: 31, last_instalment: '2026-10', payment_account_id: 'c' },
]
const txs = [
  { id: '1', kind: 'spesa', date: '2026-11-01', amount: 10.1, account_id: 'c' },
  { id: '2', kind: 'entrata', date: '2026-11-02', amount: 20.2, account_id: 'c' },
  { id: '3', kind: 'giroconto', date: '2026-11-03', amount: 100, account_id: 'c', to_account_id: 'l' },
  { id: '4', kind: 'entrata', date: '2026-11-27', amount: 2880, account_id: 'c' },
]

test('i saldi escludono i movimenti futuri e non hanno errori di arrotondamento', () => {
  const b = balancesAt(acc, txs, '2026-11-16')
  assert.equal(b.get('c'), -18990)
  assert.equal(b.get('l'), -490000)
})

test('serie giornaliera', () => {
  const s = dailySeries(acc[0], txs, '2026-11-01', '2026-11-03')
  assert.deepEqual(s.map((x) => x.value), [-110.1, -89.9, -189.9])
})

test('date di rata e fine mese', () => {
  assert.equal(dateInMonth('2026-11', 31), '2026-11-30')
  assert.equal(nextInstalmentDate(acc[1], '2026-11-16'), '2026-11-30')
  assert.equal(nextInstalmentDate({ ...acc[1], instalment_day: 5, last_instalment: '2026-11' }, '2026-11-16'), '2026-12-05')
  assert.equal(addMonths('2026-11', 2), '2027-01')
})

test('impegni attesi e rischio fido', () => {
  const items = upcoming({ accounts: acc, txs, today: '2026-11-16' })
  assert.deepEqual(items.map((i) => i.date), ['2026-11-27', '2026-11-30'])
})

test('fine stimata di un finanziamento', () => {
  const e = loanEnd(109100.5, 2.15, 653, '2026-11-16')
  assert.ok(e.months > 190 && e.months < 205)
  assert.equal(loanEnd(1000, 0, 100, '2026-11-16').months, 10)
})

test('spese per categoria principale', () => {
  const cats = new Map([['p', { id: 'p', name: 'Casa' }], ['s', { id: 's', name: 'Luce', parent_id: 'p' }]])
  const r = spendingByCategory([{ kind: 'spesa', date: '2026-11-02', amount: 5, category_id: 's' }, { kind: 'spesa', date: '2026-11-03', amount: 1.5, category_id: 'p' }], cats, '2026-11-01', '2026-11-30')
  assert.equal(r.rows[0].name, 'Casa')
  assert.equal(r.total, 6.5)
})
