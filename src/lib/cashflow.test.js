import test from 'node:test'
import assert from 'node:assert/strict'
import { cardStatements, cashAccountIds, cashflow, classify, instalments, paceEstimate, recurringPatterns, spendingSplit } from './cashflow.js'

const accounts = [
  { id: 'c', name: 'Conto', kind: 'conto', start_date: '2026-09-01', initial_balance: 100, overdraft: 500 },
  { id: 's', name: 'Satispay', kind: 'conto', start_date: '2026-09-01', initial_balance: 0, overdraft: 0 },
  { id: 'r', name: 'Rotativo', kind: 'conto', start_date: '2026-09-01', initial_balance: -1000, overdraft: 0 },
  { id: 'k', name: 'Carta', kind: 'carta_revolv', start_date: '2026-09-01', initial_balance: -200, overdraft: 0, tan: 14.9, payment_account_id: 'c' },
  { id: 'n', name: 'Saldo', kind: 'carta_revolv', start_date: '2026-09-01', initial_balance: -500, overdraft: 0, tan: null, instalment_day: 15, payment_account_id: 'c', plan_amount: 88.26, plan_until: '2026-12', statement_fee: 2 },
  { id: 'l', name: 'Prestito', kind: 'finanziamento', start_date: '2026-09-01', initial_balance: -10000, instalment: 300, instalment_day: 5, auto_instalment: true, tan: 3, last_instalment: null },
]
const categories = [
  { id: 'stip', parent_id: null, kind: 'entrata', name: 'Stipendio' },
  { id: 'cibo', parent_id: null, kind: 'spesa', name: 'Cibo' },
  { id: 'super', parent_id: 'cibo', kind: 'spesa', name: 'Supermercato' },
]
let n = 0
const tx = (kind, date, amount, account_id, extra = {}) => ({ id: `t${++n}`, kind, date, amount, account_id, to_account_id: null, category_id: null, planned: false, ...extra })
const txs = [
  tx('entrata', '2026-09-27', 2000, 'c', { category_id: 'stip' }),
  tx('entrata', '2026-10-27', 2000, 'c', { category_id: 'stip' }),
  tx('entrata', '2026-11-27', 2000, 'c', { category_id: 'stip', planned: true }),
  tx('spesa', '2026-09-12', 1000, 'c', { category_id: 'super' }),
  tx('spesa', '2026-10-12', 800, 'c', { category_id: 'super' }),
  tx('spesa', '2026-11-03', 100, 'c', { category_id: 'cibo' }),
  tx('spesa', '2026-10-10', 50, 'k', { category_id: 'cibo' }),
  tx('giroconto', '2026-09-15', 300, 'c', { to_account_id: 'k' }),
  tx('giroconto', '2026-10-15', 200, 'c', { to_account_id: 'k' }),
  tx('giroconto', '2026-09-05', 300, 'c', { to_account_id: 'l' }),
  tx('giroconto', '2026-10-05', 300, 'c', { to_account_id: 'l' }),
  tx('giroconto', '2026-11-05', 300, 'c', { to_account_id: 'l' }),
  tx('spesa', '2026-09-05', 25, 'l'),
  tx('spesa', '2026-10-05', 24, 'l'),
  tx('spesa', '2026-11-05', 24, 'l'),
  tx('giroconto', '2026-10-01', 50, 'c', { to_account_id: 's' }),
  tx('giroconto', '2026-10-20', 90, 'c', { to_account_id: 'r' }),
  tx('spesa', '2026-10-20', 300, 'n', { category_id: 'cibo' }),
  tx('spesa', '2026-11-02', 120, 'n', { category_id: 'cibo' }),
  tx('giroconto', '2026-10-15', 400, 'c', { to_account_id: 'n' }),
]
const today = '2026-11-10'
const ctx = { accounts, txs, today, cash: cashAccountIds(accounts, txs), accById: new Map(accounts.map((a) => [a.id, a])), catsById: new Map(categories.map((c) => [c.id, c])) }

test('conti: un conto in rosso che riceve solo giroconti conta come debito', () => {
  assert.deepEqual([...ctx.cash].sort(), ['c', 's'])
  const by = (i) => classify(txs[i], ctx)
  assert.equal(by(6), null) // spesa con la carta
  assert.equal(by(15), null) // giroconto tra conti
  assert.equal(by(12), null) // interessi sul prestito
  assert.equal(by(7).group, 'carte')
  assert.equal(by(9).group, 'rate')
  assert.equal(by(16).group, 'debiti')
  assert.equal(by(0).line, 'entrata:stip')
  assert.equal(by(3).line, 'spese')
})

test('ricorrenti: almeno due mesi su tre, importo e giorno dell\'ultima volta, rate escluse', () => {
  const p = recurringPatterns(ctx)
  assert.deepEqual(p.map((x) => [x.line, x.amount, x.day]), [['verso:k', 200, 15], ['entrata:stip', 2000, 27]])
})

test('ritmo di spesa: ultimi 30 giorni, divisi tra conti e carte', () => {
  const e = paceEstimate(ctx)
  assert.deepEqual([e.from, e.to, e.days], ['2026-10-12', '2026-11-10', 30])
  assert.equal(e.cash, 900)
  assert.deepEqual(e.cards.map((c) => [c.name, c.saldo, c.monthly]), [['Saldo', true, 420]])
  assert.equal(e.all, 1320)
})

test('carta a saldo: acquisti del mese prima, piano a rate finché dura, bollo', () => {
  const s = cardStatements(ctx, '2027-02-28', new Map([['n', 300]]))
  assert.deepEqual(s.map((i) => [i.date, i.amount, i.card.of, i.card.purchases, i.card.plan, i.card.fee]), [
    ['2026-11-15', 390.26, '2026-10', 300, 88.26, 2],
    ['2026-12-15', 410.26, '2026-11', 320, 88.26, 2],
    ['2027-01-15', 390.26, '2026-12', 300, 88.26, 2],
    ['2027-02-15', 302, '2027-01', 300, 0, 2],
  ])
})

test('rate: niente nel mese già pagato, interessi dell\'ultimo mese', () => {
  const r = instalments(ctx, '2027-01-31')
  assert.deepEqual(r.map((i) => [i.date, i.amount, i.interest, i.capital]), [['2026-12-05', 300, 24, 276], ['2027-01-05', 300, 24, 276]])
})

test('mesi reali e previsti, saldi e serie giornaliera', () => {
  const r = cashflow({ accounts, categories, txs, today })
  assert.equal(r.months[0].month, '2026-09')
  assert.equal(r.months.at(-1).month, '2027-05')
  const oct = r.months.find((m) => m.month === '2026-10')
  assert.equal(oct.status, 'reale')
  assert.equal(oct.in, 2000)
  assert.equal(oct.out, 1790)
  assert.equal(oct.start, 500)
  assert.equal(oct.end, 710)
  const rata = oct.lines.find((l) => l.group === 'rate')
  assert.deepEqual([rata.interest, rata.capital], [24, 276])
  assert.equal(r.today, 310)
  const nov = r.months.find((m) => m.month === '2026-11')
  assert.equal(nov.status, 'in corso')
  const spese = nov.lines.find((l) => l.line === 'spese')
  assert.deepEqual([spese.real, spese.expected], [100, 600])
  assert.deepEqual(nov.lines.find((l) => l.line === 'verso:n').card, { of: '2026-10', purchases: 300, plan: 88.26, fee: 2 })
  assert.deepEqual(nov.lines.find((l) => l.line === 'verso:k').dates, ['2026-11-15'])
  assert.equal(nov.lines.find((l) => l.line === 'entrata:stip').expected, 2000)
  assert.equal(nov.end, 310 - 600 - 200 - 390.26 + 2000)
  assert.deepEqual(r.typical.debts, [{ label: 'Rate dei finanziamenti', amount: 300 }, { label: 'Piano a rate Saldo e bollo', amount: 90.26 }])
  assert.equal(r.typical.left, 2000 - 390.26)
  assert.equal(r.typical.spend, 1320)
  assert.equal(r.typical.diff, r.typical.onAccounts + r.typical.onCards)
  assert.deepEqual(r.trend, [{ month: '2026-09', total: 1000 }, { month: '2026-10', total: 1150 }])
  assert.equal(r.limit, -500)
  assert.ok(r.series.find((p) => p.date === '2026-11-11').forecast)
  assert.ok(!r.series.find((p) => p.date === today).forecast)
})

test('oltre il fido: con più spese si va sotto e non si rientra', () => {
  assert.deepEqual(cashflow({ accounts, categories, txs, today, spending: 0 }).over, [])
  const r = cashflow({ accounts, categories, txs, today, spending: 5000 })
  assert.ok(r.over.length >= 1)
  assert.equal(r.over.at(-1).back, null)
  assert.ok(r.low.value < -500)
})

test('spese del mese divise per dove sono state pagate', () => {
  assert.deepEqual(spendingSplit({ accounts, txs, today, month: '2026-10' }), { total: 1174, cash: 800, cards: 350, interest: 24, other: 0 })
})
