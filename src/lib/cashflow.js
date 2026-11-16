// Flusso di cassa: quanto entra ed esce davvero dai conti, mese per mese, e cosa uscirà nelle prossime settimane
// con gli impegni che si conoscono già. Nessuna spesa stimata: il fido è un limite che non si supera, quindi
// quello che conta è quanto resta disponibile, giorno per giorno, restandoci dentro.
// I "conti" sono i conti correnti e simili. Carte, finanziamenti e debiti come un prestito rotativo stanno fuori:
// una spesa con la carta esce dai conti solo quando paghi la carta, una rata esce intera (capitale e interessi).
import { addDays, addMonths, balancesAt, cents, dateInMonth, daysBetween, fromCents, rootCategory, ym } from './calc.js'

const endOf = (m) => dateInMonth(m, 31)
const day = (iso) => Number(iso.slice(8, 10))
const sortByDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)

/**
 * Conti che contano come soldi disponibili. Un conto in rosso dall'inizio che riceve solo giroconti
 * (per esempio un prestito rotativo che stai restituendo) conta come debito, non come conto.
 */
export function cashAccountIds(accounts, txs) {
  const used = new Set()
  for (const t of txs) if (t.kind !== 'giroconto') used.add(t.account_id)
  return new Set(accounts.filter((a) => a.kind === 'conto' && (cents(a.initial_balance) >= 0 || used.has(a.id))).map((a) => a.id))
}

function context({ accounts, categories, txs, today }) {
  const cash = cashAccountIds(accounts, txs)
  const accById = new Map(accounts.map((a) => [a.id, a]))
  const catsById = new Map(categories.map((c) => [c.id, c]))
  return { accounts, txs, today, cash, accById, catsById }
}

const outGroup = (acc) => (acc?.kind === 'finanziamento' ? 'rate' : acc?.kind === 'carta_revolv' ? 'carte' : 'debiti')
const isAutoLoan = (a) => a && a.kind === 'finanziamento' && a.auto_instalment && Number(a.instalment) > 0 && !a.archived
/** Carta "a saldo": senza interessi, ogni mese paghi tutto quello che hai speso il mese prima. */
export const isSaldoCard = (a) => !!a && a.kind === 'carta_revolv' && !a.archived && !(Number(a.tan) > 0)

/**
 * Estratto conto che si paga con l'addebito del giorno `date`, per una carta che chiude l'estratto
 * il giorno `statement_day`: dal giorno dopo la chiusura precedente fino all'ultima chiusura prima dell'addebito.
 */
export function statementPeriod(card, date) {
  const closing = Number(card?.statement_day)
  if (!closing) return null
  let m = ym(date)
  if (dateInMonth(m, closing) > date) m = addMonths(m, -1)
  return { from: addDays(dateInMonth(addMonths(m, -1), closing), 1), to: dateInMonth(m, closing) }
}

/** Quanto è stato messo sulla carta in un estratto conto: acquisti (interessi compresi, se inseriti) meno rimborsi. */
function statementTotals(ctx, card, period) {
  let spent = 0
  let refunds = 0
  for (const t of ctx.txs) {
    if (t.account_id !== card.id || t.date < period.from || t.date > period.to || t.date > ctx.today) continue
    if (t.kind === 'spesa') spent += cents(t.amount)
    else if (t.kind === 'entrata') refunds += cents(t.amount)
  }
  const state = ctx.today < period.from ? 'futuro' : ctx.today <= period.to ? 'aperto' : 'chiuso'
  return { ...period, spent: fromCents(spent), refunds: fromCents(refunds), net: fromCents(spent - refunds), state }
}

/**
 * Come un movimento cambia i soldi sui conti. null se non li tocca: spese con la carta, interessi
 * addebitati su un finanziamento, giroconti tra due conti.
 */
export function classify(t, ctx) {
  const { cash, accById, catsById } = ctx
  const from = cash.has(t.account_id)
  if (t.kind === 'spesa') return from ? { dir: 'out', group: 'spese', line: 'spese' } : null
  if (t.kind === 'entrata') {
    if (!from) return null
    const root = rootCategory(catsById, t.category_id)
    return { dir: 'in', group: 'entrate', line: `entrata:${root ? root.id : 'senza'}`, rootId: root ? root.id : null, pattern: `e|${t.account_id}|${root ? root.id : ''}` }
  }
  const to = cash.has(t.to_account_id)
  if (from === to) return null
  if (from) {
    const acc = accById.get(t.to_account_id)
    return { dir: 'out', group: outGroup(acc), line: `verso:${t.to_account_id}`, accountId: t.to_account_id, fromId: t.account_id, pattern: `g|${t.account_id}|${t.to_account_id}` }
  }
  return { dir: 'in', group: 'prelievi', line: `da:${t.account_id}`, accountId: t.account_id, pattern: `p|${t.account_id}|${t.to_account_id}` }
}

/** Primo mese completo con i dati (il mese in cui iniziano i conti, se iniziano il giorno 1). */
function firstFullMonth(ctx) {
  const starts = ctx.accounts.filter((a) => ctx.cash.has(a.id) && a.start_date).map((a) => a.start_date).sort()
  const first = starts[0] || ctx.txs.map((t) => t.date).sort()[0] || ctx.today
  return day(first) === 1 ? ym(first) : addMonths(ym(first), 1)
}

/** Interessi addebitati su ogni finanziamento, mese per mese (spese registrate sul finanziamento). */
function interestByMonth(ctx) {
  const out = new Map()
  for (const t of ctx.txs) {
    if (t.kind !== 'spesa' || t.date > ctx.today) continue
    const acc = ctx.accById.get(t.account_id)
    if (acc?.kind !== 'finanziamento') continue
    const k = `${t.account_id}|${ym(t.date)}`
    out.set(k, (out.get(k) || 0) + cents(t.amount))
  }
  return out
}

/**
 * Movimenti che si ripetono: entrate e giroconti che negli ultimi tre mesi (questo compreso, fino a oggi)
 * ci sono stati in almeno due mesi diversi. Importo e giorno sono quelli dell'ultima volta.
 * Le rate dei finanziamenti con rata automatica e le carte a saldo sono escluse: le prevedono `instalments` e `cardStatements`.
 */
export function recurringPatterns(ctx) {
  const cur = ym(ctx.today)
  const months = new Set([addMonths(cur, -2), addMonths(cur, -1), cur])
  const by = new Map()
  for (const t of ctx.txs) {
    const m = ym(t.date)
    if (!months.has(m) || t.date > ctx.today) continue
    const c = classify(t, ctx)
    if (!c || c.group === 'spese') continue
    if (c.group === 'rate' && isAutoLoan(ctx.accById.get(c.accountId))) continue
    if (c.group === 'carte' && isSaldoCard(ctx.accById.get(c.accountId))) continue
    let p = by.get(c.pattern)
    if (!p) by.set(c.pattern, (p = { ...c, months: new Map(), last: null }))
    p.months.set(m, (p.months.get(m) || 0) + cents(t.amount))
    if (!p.last || t.date > p.last) p.last = t.date
  }
  const out = []
  for (const p of by.values()) {
    if (p.months.size < 2) continue
    const lastMonth = ym(p.last)
    out.push({ pattern: p.pattern, dir: p.dir, group: p.group, line: p.line, rootId: p.rootId || null, accountId: p.accountId || null, fromId: p.fromId || null, amount: fromCents(p.months.get(lastMonth)), day: day(p.last), last: p.last, count: p.months.size })
  }
  return out.sort((a, b) => a.day - b.day)
}

/**
 * Quanto spendi in un mese al ritmo degli ultimi 30 giorni, diviso per dove paghi: dai conti e con ogni carta.
 * Gli interessi addebitati sui finanziamenti non contano: sono già dentro le rate.
 */
export function paceEstimate(ctx) {
  const { txs, today, cash, accById, accounts } = ctx
  const first = txs.reduce((m, t) => (t.date < m ? t.date : m), today)
  const days = Math.max(1, Math.min(30, daysBetween(first, today) + 1))
  const from = addDays(today, -(days - 1))
  let fromCash = 0
  const byCard = new Map()
  for (const t of txs) {
    if (t.kind !== 'spesa' || t.date < from || t.date > today) continue
    if (cash.has(t.account_id)) fromCash += cents(t.amount)
    else if (accById.get(t.account_id)?.kind === 'carta_revolv') byCard.set(t.account_id, (byCard.get(t.account_id) || 0) + cents(t.amount))
  }
  const month = (c) => Math.round((c * 30) / days)
  const cards = accounts.filter((a) => byCard.has(a.id)).map((a) => ({ id: a.id, name: a.name, saldo: isSaldoCard(a), monthly: fromCents(month(byCard.get(a.id))) }))
  const all = month(fromCash) + cards.reduce((s, c) => s + cents(c.monthly), 0)
  return { from, to: today, days, cash: fromCents(month(fromCash)), cards, all: fromCents(all) }
}

/** Rate previste dei finanziamenti con rata automatica, da domani fino a `until`. */
export function instalments(ctx, until) {
  const { accounts, txs, today } = ctx
  const interest = interestByMonth(ctx)
  const out = []
  for (const a of accounts) {
    if (!isAutoLoan(a)) continue
    let residual = -cents(a.initial_balance)
    for (const t of txs) {
      if (t.date > today) continue
      if (t.account_id === a.id) residual += t.kind === 'entrata' ? -cents(t.amount) : cents(t.amount)
      if (t.kind === 'giroconto' && t.to_account_id === a.id) residual -= cents(t.amount)
    }
    // Interessi: quelli dell'ultimo mese registrato, altrimenti dal tasso.
    const months = [...interest.keys()].filter((k) => k.startsWith(`${a.id}|`)).sort()
    const lastInt = months.length ? interest.get(months[months.length - 1]) : null
    const paidIn = new Set(txs.filter((t) => t.kind === 'giroconto' && t.to_account_id === a.id).map((t) => ym(t.date)))
    for (let m = ym(today); endOf(m) <= endOf(ym(until)) && residual > 0; m = addMonths(m, 1)) {
      if (a.last_instalment && m <= a.last_instalment) continue
      if (paidIn.has(m)) continue
      let date = dateInMonth(m, a.instalment_day || 1)
      if (date <= today) date = addDays(today, 1)
      if (ym(date) !== m || date > until) continue
      const int = lastInt ?? Math.round((residual * (Number(a.tan) || 0)) / 1200)
      const amount = Math.min(cents(a.instalment), residual + int)
      const capital = Math.max(0, amount - int)
      residual -= capital
      out.push({ date, dir: 'out', group: 'rate', line: `verso:${a.id}`, accountId: a.id, amount: fromCents(amount), interest: fromCents(Math.min(int, amount)), capital: fromCents(capital), source: 'rata' })
    }
  }
  return out
}

/** Spesa nella categoria "Costi finanziari" (o in una sua sottocategoria): commissioni, bolli, interessi. */
const isFinanceCost = (ctx, t) => (rootCategory(ctx.catsById, t.category_id)?.name || '').trim().toLowerCase() === 'costi finanziari'

/**
 * Addebiti previsti delle carte a saldo: gli acquisti del mese prima (quelli già fatti), più l'eventuale rata fissa
 * di un piano a rate sulla carta (`plan_amount` fino a `plan_until`) e il bollo dell'estratto conto (`statement_fee`).
 * Se la carta ha rata o bollo, le commissioni e il bollo inseriti come spesa sulla carta (in "Costi finanziari")
 * sono già dentro la rata e il bollo previsti, quindi non si contano una seconda volta.
 */
export function cardStatements(ctx, until) {
  const { accounts, txs, today, cash } = ctx
  const out = []
  for (const a of accounts) {
    if (!isSaldoCard(a) || !cash.has(a.payment_account_id)) continue
    const ownCosts = Number(a.plan_amount) > 0 || Number(a.statement_fee) > 0
    const bought = new Map()
    const paid = new Set()
    for (const t of txs) {
      if (t.kind === 'spesa' && t.account_id === a.id && !(ownCosts && isFinanceCost(ctx, t))) bought.set(ym(t.date), (bought.get(ym(t.date)) || 0) + cents(t.amount))
      if (t.kind === 'giroconto' && t.to_account_id === a.id) paid.add(ym(t.date))
    }
    for (let m = ym(today); m <= ym(until); m = addMonths(m, 1)) {
      if (paid.has(m)) continue
      let date = dateInMonth(m, a.instalment_day || 15)
      if (date <= today) date = addDays(today, 1)
      if (ym(date) !== m || date > until) continue
      const of = addMonths(m, -1)
      const purchases = bought.get(of) || 0
      const plan = Number(a.plan_amount) > 0 && of <= (a.plan_until || '9999-12') ? cents(a.plan_amount) : 0
      // Il bollo si paga solo sugli estratti conto sopra 77,47 €.
      const fee = purchases + plan > 7747 ? cents(a.statement_fee) : 0
      if (purchases + plan + fee <= 0) continue
      out.push({ date, dir: 'out', group: 'carte', line: `verso:${a.id}`, accountId: a.id, fromId: a.payment_account_id, amount: fromCents(purchases + plan + fee), source: 'carta', card: { of, purchases: fromCents(purchases), plan: fromCents(plan), fee: fromCents(fee) } })
    }
  }
  return out
}

/**
 * Tutto quello che si conosce già da domani a `until`: movimenti inseriti con data futura, rate, carte a saldo, ricorrenti.
 * `payments`: rimborso che si sta provando per una carta con interessi in un certo mese, `{ [idCarta]: { 'AAAA-MM': importo } }`,
 * al posto di quello già inserito o di quello dell'ultima volta.
 */
export function expectedItems(ctx, until, payments = null) {
  const { txs, today } = ctx
  const patterns = recurringPatterns(ctx)
  const usual = new Map(patterns.map((p) => [p.pattern, p.amount]))
  const revolving = (c) => c.group === 'carte' && !isSaldoCard(ctx.accById.get(c.accountId))
  const trying = new Set()
  // Il rimborso di una carta con interessi: quello di sempre (`usual`), quello inserito (`saved`) e quello che si sta provando.
  const repayment = (it, c, m, saved) => {
    if (!revolving(c)) return it
    const chosen = payments?.[c.accountId]?.[m]
    const out = { ...it, usual: usual.get(c.pattern) ?? null, saved }
    if (chosen === undefined || trying.has(`${c.accountId}|${m}`)) return out
    trying.add(`${c.accountId}|${m}`)
    return { ...out, amount: Math.max(0, Number(chosen) || 0), chosen: true }
  }
  const items = []
  const seen = new Set()
  for (const t of txs) {
    const c = classify(t, ctx)
    if (!c) continue
    seen.add(`${c.pattern || c.line}|${ym(t.date)}`)
    if (t.date <= today || t.date > until) continue
    const it = { date: t.date, dir: c.dir, group: c.group, line: c.line, rootId: c.rootId || null, accountId: c.accountId || null, fromId: c.fromId || null, amount: Number(t.amount), source: 'inserito', txId: t.id }
    items.push(repayment(it, c, ym(t.date), Number(t.amount)))
  }
  items.push(...instalments(ctx, until))
  items.push(...cardStatements(ctx, until))
  for (const p of patterns) {
    for (let m = ym(today); m <= ym(until); m = addMonths(m, 1)) {
      if (seen.has(`${p.pattern}|${m}`)) continue
      // Una carta addebita nel suo giorno, se è indicato; il resto nel giorno dell'ultima volta.
      let date = dateInMonth(m, (revolving(p) && ctx.accById.get(p.accountId)?.instalment_day) || p.day)
      if (date <= today) date = addDays(today, 1)
      if (ym(date) !== m || date > until) continue
      const it = { date, dir: p.dir, group: p.group, line: p.line, rootId: p.rootId, accountId: p.accountId, fromId: p.fromId, amount: p.amount, source: 'ricorrente' }
      items.push(repayment(it, p, m, null))
    }
  }
  return items.sort(sortByDate)
}

const GROUP_ORDER = { entrate: 0, prelievi: 1, spese: 2, carte: 3, rate: 4, debiti: 5 }

function emptyMonth(month, status) {
  return { month, status, lines: new Map(), in: 0, out: 0 }
}

function addToMonth(mo, it, part) {
  let l = mo.lines.get(it.line)
  if (!l) {
    l = { line: it.line, dir: it.dir, group: it.group, rootId: it.rootId || null, accountId: it.accountId || null, real: 0, expected: 0, interest: 0, capital: 0, card: null, count: 0, dates: [], sources: new Set() }
    mo.lines.set(it.line, l)
  }
  const c = cents(it.amount)
  l[part] += c
  l.count += 1
  if (it.date) l.dates.push(it.date)
  if (it.source) l.sources.add(it.source)
  if (it.interest !== undefined) { l.interest += cents(it.interest); l.capital += cents(it.capital) }
  if (it.card) l.card = it.card
  if (it.dir === 'in') mo.in += c
  else mo.out += c
}

/**
 * Flusso di cassa.
 * Restituisce i mesi passati e quello in corso (entrate e uscite dei conti), i prossimi movimenti con il disponibile
 * dopo ognuno, quanto si può ancora spendere restando dentro il fido e cosa addebiterà ogni carta.
 * `ahead`: per quanti mesi guardare avanti. `payments`: rimborsi delle carte che si stanno provando (vedi `expectedItems`).
 */
export function cashflow({ accounts, categories, txs, today, ahead = 3, back = 3, payments = null }) {
  const ctx = context({ accounts, categories, txs, today })
  const cur = ym(today)
  const firstMonth = [addMonths(cur, -back), firstFullMonth(ctx)].sort()[1]
  const lastMonth = addMonths(cur, ahead)
  const until = endOf(lastMonth)
  const pace = paceEstimate(ctx)
  const expected = expectedItems(ctx, until, payments)
  const interest = interestByMonth(ctx)

  // Mesi.
  const months = []
  const byMonth = new Map()
  for (let m = firstMonth; m <= lastMonth; m = addMonths(m, 1)) {
    const mo = emptyMonth(m, m < cur ? 'reale' : m === cur ? 'in corso' : 'previsto')
    months.push(mo)
    byMonth.set(m, mo)
  }
  for (const t of txs) {
    if (t.date > today) continue
    const mo = byMonth.get(ym(t.date))
    if (!mo) continue
    const c = classify(t, ctx)
    if (!c) continue
    const it = { ...c, date: t.date, amount: Number(t.amount), source: 'reale' }
    if (c.group === 'rate') {
      const k = `${c.accountId}|${ym(t.date)}`
      const int = Math.min(interest.get(k) || 0, cents(t.amount))
      interest.set(k, (interest.get(k) || 0) - int)
      it.interest = fromCents(int)
      it.capital = fromCents(cents(t.amount) - int)
    }
    addToMonth(mo, it, 'real')
  }
  for (const it of expected) {
    const mo = byMonth.get(ym(it.date))
    if (mo) addToMonth(mo, it, 'expected')
  }

  // Saldo dei conti all'inizio del primo mese mostrato.
  const startDay = `${firstMonth}-01`
  let bal = accounts.filter((a) => ctx.cash.has(a.id)).reduce((s, a) => s + cents(a.initial_balance), 0)
  const effects = new Map()
  for (const t of txs) {
    if (t.date > today) continue
    let d = 0
    if (ctx.cash.has(t.account_id)) d += t.kind === 'entrata' ? cents(t.amount) : -cents(t.amount)
    if (t.kind === 'giroconto' && ctx.cash.has(t.to_account_id)) d += cents(t.amount)
    if (!d) continue
    if (t.date < startDay) bal += d
    else effects.set(t.date, (effects.get(t.date) || 0) + d)
  }
  for (const it of expected) {
    const d = it.dir === 'in' ? cents(it.amount) : -cents(it.amount)
    effects.set(it.date, (effects.get(it.date) || 0) + d)
  }

  // Saldo dei conti giorno per giorno (da domani con i soli impegni già noti) e saldi di fine mese.
  const limit = -accounts.filter((a) => ctx.cash.has(a.id)).reduce((s, a) => s + cents(a.overdraft), 0)
  const future = []
  let monthStart = bal
  let todayBal = 0
  for (let d = startDay; d <= until; d = addDays(d, 1)) {
    bal += effects.get(d) || 0
    if (d === today) todayBal = bal
    if (d >= today) future.push({ date: d, margin: bal - limit })
    if (d === endOf(ym(d))) {
      const mo = byMonth.get(ym(d))
      mo.start = fromCents(monthStart)
      mo.end = fromCents(bal)
      monthStart = bal
    }
  }

  const ctxNames = (l) => {
    if (l.group === 'spese') return 'Spese pagate dai conti'
    if (l.group === 'entrate') return l.rootId ? ctx.catsById.get(l.rootId)?.name || 'Entrate' : 'Entrate senza categoria'
    const a = ctx.accById.get(l.accountId)
    if (l.group === 'prelievi') return `Presi da ${a?.name || 'altro conto'}`
    if (l.group === 'rate') return `Rata ${a?.name || ''}`.trim()
    if (l.group === 'carte') return `Carta ${a?.name || ''}`.trim()
    return a?.name || 'Debito'
  }

  const out = months.filter((mo) => mo.status !== 'previsto').map((mo) => {
    const lines = [...mo.lines.values()].map((l) => ({
      line: l.line, dir: l.dir, group: l.group, rootId: l.rootId, accountId: l.accountId, label: ctxNames(l),
      amount: fromCents(l.real + l.expected), real: fromCents(l.real), expected: fromCents(l.expected),
      interest: l.group === 'rate' ? fromCents(l.interest) : null, capital: l.group === 'rate' ? fromCents(l.capital) : null,
      card: l.card, count: l.count, dates: l.dates.sort(), sources: [...l.sources],
    }))
    lines.sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || b.amount - a.amount)
    return { month: mo.month, status: mo.status, in: fromCents(mo.in), out: fromCents(mo.out), net: fromCents(mo.in - mo.out), start: mo.start, end: mo.end, lines }
  })

  // Prossimi movimenti sul conto, con il disponibile (saldo più fido) dopo ognuno.
  const margin0 = todayBal - limit
  let running = margin0
  const items = expected.map((it) => {
    running += it.dir === 'in' ? cents(it.amount) : -cents(it.amount)
    return { ...it, label: ctxNames(it), after: fromCents(running) }
  })

  // Quanto si può ancora spendere senza superare il fido: per ogni giorno, il minimo del disponibile da lì in poi
  // (una spesa fatta oggi pesa su tutti i giorni seguenti).
  const env = new Array(future.length)
  for (let i = future.length - 1, m = Infinity; i >= 0; i--) { m = Math.min(m, future[i].margin); env[i] = m }
  const envAt = (d) => env[Math.max(0, future.findIndex((p) => p.date === d))]
  const debitDates = [...new Set(expected.filter((it) => it.source === 'carta').map((it) => it.date))].slice(0, 2)
  const ends = debitDates.length ? debitDates : [endOf(cur), endOf(addMonths(cur, 1))]
  const windows = ends.map((d, i) => ({ from: addDays(i ? ends[i - 1] : today, 1), until: d, amount: fromCents(envAt(d) - (i ? Math.max(0, envAt(ends[i - 1])) : 0)) }))
  const steps = []
  future.forEach((p, i) => {
    if (p.date > ends[0]) return
    if (!steps.length || env[i] !== cents(steps[steps.length - 1].amount)) steps.push({ from: p.date, amount: fromCents(env[i]) })
  })
  const shortAt = future.findIndex((p) => p.margin < 0)
  const budget = {
    available: fromCents(margin0),
    windows,
    steps,
    // Se gli impegni già noti da soli non stanno dentro il fido: da quando e quanto manca.
    short: shortAt < 0 ? null : { date: future[shortAt].date, amount: fromCents(-Math.min(...future.map((p) => p.margin))) },
  }

  // Carte: debito di oggi e prossimi addebiti sul conto.
  const balToday = balancesAt(accounts, txs, today)
  const cards = accounts.filter((a) => a.kind === 'carta_revolv' && !a.archived).map((a) => ({
    id: a.id,
    name: a.name,
    saldo: isSaldoCard(a),
    debt: fromCents(-(balToday.get(a.id) || 0)),
    monthly: pace.cards.find((c) => c.id === a.id)?.monthly || 0,
    statementDay: Number(a.statement_day) || null,
    next: items.filter((it) => it.group === 'carte' && it.accountId === a.id).slice(0, 2).map((it) => {
      const period = isSaldoCard(a) ? null : statementPeriod(a, it.date)
      if (!period) return it
      // Di quanto cambia il debito con questo rimborso: quello che hai messo sulla carta meno quello che rimborsi.
      const statement = statementTotals(ctx, a, period)
      return { ...it, statement, debtChange: fromCents(cents(statement.net) - cents(it.amount)) }
    }),
  }))

  return {
    cashIds: [...ctx.cash],
    today: fromCents(todayBal),
    limit: limit < 0 ? fromCents(limit) : null,
    months: out,
    paceDays: pace.days,
    items,
    budget,
    cards,
  }
}

/**
 * Perché le spese del mese non coincidono con le uscite dai conti: divide le spese per dove sono state pagate.
 */
export function spendingSplit({ accounts, txs, today, month }) {
  const cash = cashAccountIds(accounts, txs)
  const accById = new Map(accounts.map((a) => [a.id, a]))
  const r = { total: 0, cash: 0, cards: 0, interest: 0, other: 0 }
  for (const t of txs) {
    if (t.kind !== 'spesa' || ym(t.date) !== month || t.date > today) continue
    const c = cents(t.amount)
    const k = accById.get(t.account_id)?.kind
    r.total += c
    if (cash.has(t.account_id)) r.cash += c
    else if (k === 'carta_revolv') r.cards += c
    else if (k === 'finanziamento') r.interest += c
    else r.other += c
  }
  return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, fromCents(v)]))
}
