import test from 'node:test'
import assert from 'node:assert/strict'
import { cardStatements, cashAccountIds, cashflow, classify, instalments, paceEstimate, recurringPatterns, spendingSplit, statementPeriod } from './cashflow.js'

const accounts = [
  { id: 'c', name: 'Conto', kind: 'conto', start_date: '2026-09-01', initial_balance: 100, overdraft: 500 },
  { id: 's', name: 'Satispay', kind: 'conto', start_date: '2026-09-01', initial_balance: 0, overdraft: 0 },
  { id: 'r', name: 'Rotativo', kind: 'conto', start_date: '2026-09-01', initial_balance: -1000, overdraft: 0 },
  { id: 'k', name: 'Carta', kind: 'carta_revolv', start_date: '2026-09-01', initial_balance: -200, overdraft: 0, tan: 14.9, payment_account_id: 'c', statement_day: 5 },
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

test('carta a saldo: acquisti del mese prima già fatti, piano a rate finché dura, bollo', () => {
  const s = cardStatements(ctx, '2027-02-28')
  assert.deepEqual(s.map((i) => [i.date, i.amount, i.card.of, i.card.purchases, i.card.plan, i.card.fee]), [
    ['2026-11-15', 390.26, '2026-10', 300, 88.26, 2],
    ['2026-12-15', 210.26, '2026-11', 120, 88.26, 2],
    ['2027-01-15', 90.26, '2026-12', 0, 88.26, 2],
  ])
})

test('carta a saldo: commissioni e bollo inseriti come spesa non si contano due volte', () => {
  const cats = [...categories, { id: 'fin', parent_id: null, kind: 'spesa', name: 'Costi finanziari' }, { id: 'comm', parent_id: 'fin', kind: 'spesa', name: 'Commissioni bancarie' }]
  const withCosts = [...txs, tx('spesa', '2026-10-31', 10.2, 'n', { category_id: 'comm' }), tx('spesa', '2026-10-31', 10.2, 'k', { category_id: 'comm' })]
  const c2 = { ...ctx, txs: withCosts, catsById: new Map(cats.map((c) => [c.id, c])) }
  assert.deepEqual(cardStatements(c2, '2026-11-30').map((i) => [i.amount, i.card.purchases]), [[390.26, 300]])
  // Senza rata né bollo la commissione è una spesa come le altre.
  const plain = accounts.map((a) => (a.id === 'n' ? { ...a, plan_amount: null, statement_fee: null } : a))
  assert.deepEqual(cardStatements({ ...c2, accounts: plain }, '2026-11-30').map((i) => i.amount), [310.2])
})

test('rate: niente nel mese già pagato, interessi dell\'ultimo mese', () => {
  const r = instalments(ctx, '2027-01-31')
  assert.deepEqual(r.map((i) => [i.date, i.amount, i.interest, i.capital]), [['2026-12-05', 300, 24, 276], ['2027-01-05', 300, 24, 276]])
})

test('mesi reali e in corso: entrate e uscite dei conti, saldi di inizio e fine mese', () => {
  const r = cashflow({ accounts, categories, txs, today })
  assert.deepEqual(r.months.map((m) => [m.month, m.status]), [['2026-09', 'reale'], ['2026-10', 'reale'], ['2026-11', 'in corso']])
  const oct = r.months.find((m) => m.month === '2026-10')
  assert.deepEqual([oct.in, oct.out, oct.start, oct.end], [2000, 1790, 500, 710])
  const rata = oct.lines.find((l) => l.group === 'rate')
  assert.deepEqual([rata.interest, rata.capital], [24, 276])
  assert.equal(r.today, 310)
  assert.equal(r.limit, -500)
  // Il mese in corso arriva a fine mese con gli impegni già noti, senza stimare altre spese.
  const nov = r.months.find((m) => m.month === '2026-11')
  const spese = nov.lines.find((l) => l.line === 'spese')
  assert.deepEqual([spese.real, spese.expected], [100, 0])
  assert.deepEqual(nov.lines.find((l) => l.line === 'verso:n').card, { of: '2026-10', purchases: 300, plan: 88.26, fee: 2 })
  assert.deepEqual(nov.lines.find((l) => l.line === 'verso:k').dates, ['2026-11-15'])
  assert.equal(nov.lines.find((l) => l.line === 'entrata:stip').expected, 2000)
  assert.equal(nov.end, 1719.74)
})

test('dentro il fido: quanto si può ancora spendere con i soli impegni certi', () => {
  const r = cashflow({ accounts, categories, txs, today })
  assert.equal(r.budget.available, 810)
  assert.deepEqual(r.budget.windows, [
    { from: '2026-11-11', until: '2026-11-15', amount: 219.74 },
    { from: '2026-11-16', until: '2026-12-15', amount: 1289.74 },
  ])
  assert.deepEqual(r.budget.steps, [{ from: '2026-11-10', amount: 219.74 }])
  assert.equal(r.budget.short, null)
  assert.deepEqual(r.items.slice(0, 4).map((i) => [i.date, i.label, i.dir, i.amount, i.after]), [
    ['2026-11-15', 'Carta Saldo', 'out', 390.26, 419.74],
    ['2026-11-15', 'Carta Carta', 'out', 200, 219.74],
    ['2026-11-27', 'Stipendio', 'in', 2000, 2219.74],
    ['2026-12-05', 'Rata Prestito', 'out', 300, 1919.74],
  ])
  assert.deepEqual(r.cards.map((c) => [c.name, c.saldo, c.debt, c.monthly, c.next.map((x) => [x.date, x.amount])]), [
    ['Carta', false, -250, 0, [['2026-11-15', 200], ['2026-12-15', 200]]],
    ['Saldo', true, 520, 420, [['2026-11-15', 390.26], ['2026-12-15', 210.26]]],
  ])
})

test('dentro il fido: una spesa di oggi pesa sui giorni dopo, quindi contano i tempi', () => {
  const more = [...txs, tx('spesa', '2026-11-12', 700, 'c', { planned: true }), tx('entrata', '2026-11-13', 1000, 'c', { planned: true })]
  const r = cashflow({ accounts, categories, txs: more, today })
  assert.deepEqual(r.budget.steps, [{ from: '2026-11-10', amount: 110 }, { from: '2026-11-13', amount: 519.74 }])
  assert.equal(r.budget.windows[0].amount, 519.74)
})

test('dentro il fido: se gli impegni certi non ci stanno, dice da quando e quanto manca', () => {
  const noFido = accounts.map((a) => (a.id === 'c' ? { ...a, overdraft: 0 } : a))
  const r = cashflow({ accounts: noFido, categories, txs, today })
  assert.equal(r.budget.available, 310)
  assert.deepEqual(r.budget.short, { date: '2026-11-15', amount: 280.26 })
  assert.deepEqual(r.budget.windows.map((w) => w.amount), [-280.26, 1009.48])
})

test('estratto conto di una carta: dal giorno dopo la chiusura precedente all\'ultima chiusura prima dell\'addebito', () => {
  assert.deepEqual(statementPeriod({ statement_day: 16 }, '2026-11-29'), { from: '2026-10-17', to: '2026-11-16' })
  assert.deepEqual(statementPeriod({ statement_day: 16 }, '2026-11-10'), { from: '2026-09-17', to: '2026-10-16' })
  assert.deepEqual(statementPeriod({ statement_day: 31 }, '2027-03-05'), { from: '2027-02-01', to: '2027-02-28' })
  assert.equal(statementPeriod({}, '2026-11-29'), null)
})

test('carta con interessi: speso nell\'estratto conto e di quanto cambia il debito con il rimborso', () => {
  const more = [...txs, tx('entrata', '2026-10-20', 20, 'k')]
  const view = (r) => r.cards[0].next.map((n) => [n.date, n.amount, n.statement, n.debtChange])
  const usual = cashflow({ accounts, categories, txs: more, today })
  assert.deepEqual(view(usual), [
    ['2026-11-15', 200, { from: '2026-10-06', to: '2026-11-05', spent: 50, refunds: 20, net: 30, state: 'chiuso' }, -170],
    ['2026-12-15', 200, { from: '2026-11-06', to: '2026-12-05', spent: 0, refunds: 0, net: 0, state: 'aperto' }, -200],
  ])
  assert.equal(usual.cards[1].next[0].statement, undefined) // la carta a saldo non ha un rimborso da scegliere
  // Con il giorno di addebito indicato sulla carta, il rimborso è previsto quel giorno.
  const day20 = accounts.map((a) => (a.id === 'k' ? { ...a, instalment_day: 20 } : a))
  assert.deepEqual(cashflow({ accounts: day20, categories, txs: more, today }).cards[0].next.map((n) => n.date), ['2026-11-20', '2026-12-20'])

  // Rimborso scelto per novembre: cambia l'addebito, il disponibile e quanto resta, non il mese dopo.
  const r = cashflow({ accounts, categories, txs: more, today, payments: { k: { '2026-11': 300 } } })
  assert.deepEqual(view(r).map((n) => [n[1], n[3]]), [[300, -270], [200, -200]])
  assert.deepEqual([r.cards[0].next[0].usual, r.cards[0].next[0].saved, r.cards[0].next[0].chosen], [200, null, true])
  assert.deepEqual(r.items.slice(0, 2).map((i) => [i.label, i.amount, i.after]), [['Carta Saldo', 390.26, 419.74], ['Carta Carta', 300, 119.74]])
  assert.deepEqual(r.budget.windows.map((w) => w.amount), [119.74, 1289.74])
})

test('carta con interessi: il rimborso già inserito vale al posto di quello dell\'ultima volta, e si può provarne un altro', () => {
  const more = [...txs, tx('giroconto', '2026-11-15', 250, 'c', { to_account_id: 'k', planned: true })]
  const saved = cashflow({ accounts, categories, txs: more, today }).cards[0].next
  assert.deepEqual(saved.map((n) => [n.date, n.source, n.amount, n.saved, n.usual, n.fromId, !!n.chosen]), [
    ['2026-11-15', 'inserito', 250, 250, 200, 'c', false],
    ['2026-12-15', 'ricorrente', 200, null, 200, 'c', false],
  ])
  assert.equal(saved[0].txId, more.at(-1).id)
  const trying = cashflow({ accounts, categories, txs: more, today, payments: { k: { '2026-11': 300 } } }).cards[0].next[0]
  assert.deepEqual([trying.amount, trying.saved, trying.usual, trying.chosen, trying.debtChange], [300, 250, 200, true, -250])
})

test('spese del mese divise per dove sono state pagate', () => {
  assert.deepEqual(spendingSplit({ accounts, txs, today, month: '2026-10' }), { total: 1174, cash: 800, cards: 350, interest: 24, other: 0 })
})
