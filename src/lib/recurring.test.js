import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRule, calcFor, cardDebit, dateAfter, doneInMonth, firstDateAfter, matchesRule, nextInterest, occurrences, parseAmount, ruleForm, ruleItems, ruleProblem, suggestions } from './recurring.js'
import { cashflow } from './cashflow.js'

const accounts = [
  { id: 'co', name: 'Conto', kind: 'conto', start_date: '2026-08-01', initial_balance: 100, overdraft: 1000 },
  { id: 'auto', name: 'Auto', kind: 'finanziamento', initial_balance: -8000, tan: 2.1, instalment: 237.95, instalment_day: 5, auto_instalment: true },
  { id: 'nexi', name: 'Nexi', kind: 'carta_revolv', initial_balance: 0, tan: null, instalment_day: 15, payment_account_id: 'co', plan_amount: 88.26, plan_until: '2027-12', statement_fee: 2 },
  { id: 'amex', name: 'Amex', kind: 'carta_revolv', initial_balance: -1000, tan: 14.89, payment_account_id: 'co' },
]
const categories = [
  { id: 'fin', parent_id: null, kind: 'spesa', name: 'Costi finanziari' },
  { id: 'int', parent_id: 'fin', kind: 'spesa', name: 'Interessi passivi' },
  { id: 'comm', parent_id: 'fin', kind: 'spesa', name: 'Commissioni bancarie' },
  { id: 'casa', parent_id: null, kind: 'spesa', name: 'Casa' },
  { id: 'tel', parent_id: 'casa', kind: 'spesa', name: 'Internet e telefono' },
  { id: 'caffe', parent_id: null, kind: 'spesa', name: 'Bevande' },
  { id: 'stip', parent_id: null, kind: 'entrata', name: 'Stipendio' },
]
const catsById = new Map(categories.map((c) => [c.id, c]))
let n = 0
const tx = (kind, date, amount, account_id, extra = {}) => ({ id: `t${++n}`, kind, date, amount, account_id, to_account_id: null, category_id: null, note: '', planned: false, recurring_id: null, to_check: false, ...extra })
const txs = [
  tx('giroconto', '2026-10-05', 239.09, 'co', { to_account_id: 'auto' }),
  tx('spesa', '2026-10-05', 14.52, 'auto', { category_id: 'int' }),
  tx('giroconto', '2026-11-05', 237.95, 'co', { to_account_id: 'auto' }),
  tx('spesa', '2026-11-05', 14.12, 'auto', { category_id: 'int' }),
  tx('spesa', '2026-10-02', 9.99, 'co', { category_id: 'tel' }),
  tx('spesa', '2026-11-04', 9.99, 'co', { category_id: 'tel' }),
  tx('spesa', '2026-11-13', 23.98, 'co', { category_id: 'tel' }),
  tx('spesa', '2026-09-23', 25, 'co', { category_id: 'caffe', note: 'caffe' }),
  tx('spesa', '2026-10-29', 25, 'co', { category_id: 'caffe', note: 'caffe' }),
  tx('spesa', '2026-11-03', 400, 'nexi', { category_id: 'casa' }),
  tx('spesa', '2026-11-10', 118.80, 'nexi', { category_id: 'casa' }),
  tx('spesa', '2026-10-31', 10.20, 'nexi', { category_id: 'comm' }),
  tx('entrata', '2026-10-27', 2885.42, 'co', { category_id: 'stip' }),
  tx('entrata', '2026-11-27', 2880, 'co', { category_id: 'stip', planned: true }),
]
const rule = (x) => ({ id: x.id || 'r', name: 'Regola', every_months: 1, until_month: null, check_mode: false, active: true, to_account_id: null, category_id: null, interest_category_id: null, calc: 'fisso', ...x })

test('date: giorno fisso e ultimo del mese', () => {
  assert.equal(dateAfter('2026-11-30', 31), '2026-12-31')
  assert.equal(dateAfter('2027-01-31', 31), '2027-02-28')
  assert.equal(dateAfter('2026-12-15', 15, 12), '2027-12-15')
  assert.equal(firstDateAfter(5, '2026-11-16'), '2026-12-05')
  assert.equal(firstDateAfter(27, '2026-11-16'), '2026-11-27')
  assert.equal(firstDateAfter(16, '2026-11-16'), '2026-12-16')
})

test('occorrenze fino alla fine indicata', () => {
  const r = rule({ day: 31, next_date: '2026-11-30', until_month: '2027-01' })
  assert.deepEqual(occurrences(r, '2026-11-16', '2027-06-30'), ['2026-11-30', '2026-12-31', '2027-01-31'])
  assert.deepEqual(occurrences({ ...r, active: false }, '2026-11-16', '2027-06-30'), [])
})

test('interessi della prossima rata come nel database', () => {
  const r = rule({ calc: 'rata', kind: 'giroconto', account_id: 'co', to_account_id: 'auto', interest_category_id: 'int', amount: 237.95, day: 5, next_date: '2026-12-05' })
  assert.equal(nextInterest(r, accounts[1], txs).amount, 13.73)
})

test('addebito della carta a saldo: acquisti del mese prima, piano e bollo, senza le commissioni inserite', () => {
  const d = cardDebit(accounts[2], txs, catsById, '2026-12-15')
  assert.equal(d.purchases, 518.8)
  assert.equal(d.amount, 609.06)
})

test('un movimento già inserito nel mese vale come quello della regola', () => {
  const tel = rule({ kind: 'spesa', account_id: 'co', category_id: 'tel', amount: 9.99, day: 2, next_date: '2026-12-02' })
  const net = rule({ id: 'n2', kind: 'spesa', account_id: 'co', category_id: 'tel', amount: 23.98, day: 14, next_date: '2026-12-14' })
  assert.equal(doneInMonth(tel, txs, '2026-11-02'), true)
  assert.equal(doneInMonth(net, txs, '2026-11-14'), true)
  assert.equal(doneInMonth(tel, txs, '2026-12-02'), false)
  const stip = rule({ kind: 'entrata', account_id: 'co', category_id: 'stip', amount: 2885.42, check_mode: true, day: 27, next_date: '2026-11-27' })
  assert.equal(matchesRule(txs[13], stip), true)
})

test('ruleItems per In arrivo salta i mesi già coperti', () => {
  const stip = rule({ kind: 'entrata', account_id: 'co', category_id: 'stip', amount: 2880, check_mode: true, day: 27, next_date: '2026-11-27' })
  const items = ruleItems([stip], txs, '2026-11-16', '2026-12-31')
  assert.deepEqual(items.map((i) => i.date), ['2026-12-27'])
})

test('suggerimenti: stesso importo in due mesi, non coperti da regole', () => {
  const data = { accounts, categories, txs }
  const s = suggestions(data, [], '2026-11-16')
  assert.ok(s.some((x) => x.name === 'Caffe' && x.amount === 25))
  // In "Internet e telefono" ci sono anche altri importi: non è sicuro che sia fisso.
  assert.ok(!s.some((x) => x.category_id === 'tel'))
  const caffe = rule({ kind: 'spesa', account_id: 'co', category_id: 'caffe', amount: 25, day: 29, next_date: '2026-11-29' })
  assert.ok(!suggestions(data, [caffe], '2026-11-16').some((x) => x.category_id === 'caffe'))
  assert.ok(!suggestions(data, [], '2026-11-16', [s[0].key]).some((x) => x.key === s[0].key))
})

test('flusso di cassa: le spese fisse ricorrenti entrano nelle previsioni una volta sola', () => {
  const tel = rule({ kind: 'spesa', account_id: 'co', category_id: 'tel', amount: 9.99, day: 2, next_date: '2026-12-02' })
  const stip = rule({ id: 's', kind: 'entrata', account_id: 'co', category_id: 'stip', amount: 2880, check_mode: true, day: 27, next_date: '2026-11-27' })
  const today = '2026-11-16'
  const without = cashflow({ accounts, categories, txs, today })
  const withRules = cashflow({ accounts, categories, txs, today, rules: [tel, stip] })
  const telItems = withRules.items.filter((i) => i.ruleId === 'r')
  assert.deepEqual(telItems.map((i) => i.date), ['2026-12-02', '2027-01-02', '2027-02-02'])
  assert.equal(telItems[0].label, 'Regola')
  // Lo stipendio di novembre è già inserito: la regola aggiunge solo i mesi dopo.
  assert.deepEqual(without.items.filter((i) => i.group === 'entrate').map((i) => i.date), ['2026-11-27'])
  assert.deepEqual(withRules.items.filter((i) => i.group === 'entrate').map((i) => i.date), ['2026-11-27', '2026-12-27', '2027-01-27', '2027-02-27'])
  // Con lo stipendio già ricorrente da solo (settembre e ottobre), la regola non lo conta una seconda volta.
  const more = [...txs, tx('entrata', '2026-09-25', 2885.38, 'co', { category_id: 'stip' })]
  assert.equal(cashflow({ accounts, categories, txs: more, today, rules: [stip] }).items.filter((i) => i.group === 'entrate').length, 4)
})

test('modulo: calcolo dal conto di arrivo, controlli e riga da salvare', () => {
  const accById = new Map(accounts.map((a) => [a.id, a]))
  assert.equal(calcFor('giroconto', accounts[1]), 'rata')
  assert.equal(calcFor('giroconto', accounts[2]), 'carta')
  assert.equal(calcFor('giroconto', accounts[3]), 'fisso')
  assert.equal(parseAmount('1.234,50'), 1234.5)
  const f = { ...ruleForm(null, '2026-11-16'), name: 'Rata Auto', kind: 'giroconto', accountId: 'co', toAccountId: 'auto', amount: '237,95', day: '5', next: '2026-12-05' }
  assert.equal(ruleProblem(f, accById), null)
  const row = buildRule(f, { accById, categories })
  assert.equal(row.calc, 'rata')
  assert.equal(row.interest_category_id, 'int')
  assert.equal(row.amount, 237.95)
  assert.equal(ruleProblem({ ...f, amount: '' }, accById), "Scrivi l'importo")
  assert.equal(ruleProblem({ ...f, toAccountId: 'nexi', amount: '' }, accById), null)
})
