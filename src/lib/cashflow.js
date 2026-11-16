// Flusso di cassa: quanto entra ed esce davvero dai conti, mese per mese, e previsione dei mesi seguenti.
// I "conti" sono i conti correnti e simili. Carte, finanziamenti e debiti come un prestito rotativo stanno fuori:
// una spesa con la carta esce dai conti solo quando paghi la carta, una rata esce intera (capitale e interessi).
import { addDays, addMonths, cents, dateInMonth, fromCents, lastDayOfMonth, rootCategory, ym } from './calc.js'

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
    return { dir: 'out', group: outGroup(acc), line: `verso:${t.to_account_id}`, accountId: t.to_account_id, pattern: `g|${t.account_id}|${t.to_account_id}` }
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
 * Movimenti che si ripetono: entrate e giroconti che negli ultimi tre mesi (questo compreso)
 * ci sono stati in almeno due mesi diversi. Importo e giorno sono quelli dell'ultima volta.
 * Le rate dei finanziamenti con rata automatica sono escluse: le prevede `instalments`.
 */
export function recurringPatterns(ctx) {
  const cur = ym(ctx.today)
  const months = new Set([addMonths(cur, -2), addMonths(cur, -1), cur])
  const by = new Map()
  for (const t of ctx.txs) {
    const m = ym(t.date)
    if (!months.has(m)) continue
    const c = classify(t, ctx)
    if (!c || c.group === 'spese') continue
    if (c.group === 'rate' && isAutoLoan(ctx.accById.get(c.accountId))) continue
    let p = by.get(c.pattern)
    if (!p) by.set(c.pattern, (p = { ...c, months: new Map(), last: null }))
    p.months.set(m, (p.months.get(m) || 0) + cents(t.amount))
    if (!p.last || t.date > p.last) p.last = t.date
  }
  const out = []
  for (const p of by.values()) {
    if (p.months.size < 2) continue
    const lastMonth = ym(p.last)
    out.push({ pattern: p.pattern, dir: p.dir, group: p.group, line: p.line, rootId: p.rootId || null, accountId: p.accountId || null, amount: fromCents(p.months.get(lastMonth)), day: day(p.last), last: p.last, count: p.months.size })
  }
  return out.sort((a, b) => a.day - b.day)
}

/** Spese pagate dai conti in un mese stimate dalla media degli ultimi mesi completi (al massimo tre). */
export function spendingEstimate(ctx) {
  const cur = ym(ctx.today)
  const first = firstFullMonth(ctx)
  const base = []
  for (let m = addMonths(cur, -1); m >= first && base.length < 3; m = addMonths(m, -1)) base.unshift(m)
  const tot = new Map(base.map((m) => [m, 0]))
  let soFar = 0
  for (const t of ctx.txs) {
    if (t.kind !== 'spesa' || !ctx.cash.has(t.account_id) || t.date > ctx.today) continue
    const m = ym(t.date)
    if (tot.has(m)) tot.set(m, tot.get(m) + cents(t.amount))
    else if (m === cur) soFar += cents(t.amount)
  }
  if (!base.length) {
    // Nessun mese completo: si allunga quanto speso finora in questo mese.
    const d = day(ctx.today)
    return { monthly: fromCents(Math.round((soFar / d) * lastDayOfMonth(cur))), months: [], byMonth: [] }
  }
  const sum = [...tot.values()].reduce((s, v) => s + v, 0)
  return { monthly: fromCents(Math.round(sum / base.length)), months: base, byMonth: base.map((m) => ({ month: m, total: fromCents(tot.get(m)) })) }
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

/** Tutto quello che si prevede da domani a `until`: movimenti già inseriti, rate, ricorrenti. Le spese stimate sono a parte. */
export function expectedItems(ctx, until) {
  const { txs, today } = ctx
  const items = []
  const seen = new Set()
  for (const t of txs) {
    const c = classify(t, ctx)
    if (!c) continue
    seen.add(`${c.pattern || c.line}|${ym(t.date)}`)
    if (t.date <= today || t.date > until) continue
    items.push({ date: t.date, dir: c.dir, group: c.group, line: c.line, rootId: c.rootId || null, accountId: c.accountId || null, amount: Number(t.amount), source: 'inserito', txId: t.id })
  }
  items.push(...instalments(ctx, until))
  for (const p of recurringPatterns(ctx)) {
    for (let m = ym(today); m <= ym(until); m = addMonths(m, 1)) {
      if (seen.has(`${p.pattern}|${m}`)) continue
      let date = dateInMonth(m, p.day)
      if (date <= today) date = addDays(today, 1)
      if (ym(date) !== m || date > until) continue
      items.push({ date, dir: p.dir, group: p.group, line: p.line, rootId: p.rootId, accountId: p.accountId, amount: p.amount, source: 'ricorrente' })
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
    l = { line: it.line, dir: it.dir, group: it.group, rootId: it.rootId || null, accountId: it.accountId || null, real: 0, expected: 0, interest: 0, capital: 0, count: 0, dates: [], sources: new Set() }
    mo.lines.set(it.line, l)
  }
  const c = cents(it.amount)
  l[part] += c
  l.count += 1
  if (it.date) l.dates.push(it.date)
  if (it.source) l.sources.add(it.source)
  if (it.interest !== undefined) { l.interest += cents(it.interest); l.capital += cents(it.capital) }
  if (it.dir === 'in') mo.in += c
  else mo.out += c
}

/**
 * Flusso di cassa completo.
 * Restituisce i mesi (passati reali, quello in corso, quelli previsti), la serie giornaliera del saldo dei conti
 * e il primo momento in cui si prevede di andare oltre il fido.
 */
export function cashflow({ accounts, categories, txs, today, ahead = 6, back = 3, spending = null }) {
  const ctx = context({ accounts, categories, txs, today })
  const cur = ym(today)
  const firstMonth = [addMonths(cur, -back), firstFullMonth(ctx)].sort()[1]
  const lastMonth = addMonths(cur, ahead)
  const until = endOf(lastMonth)
  const estimate = spendingEstimate(ctx)
  const monthlyEst = spending ?? estimate.monthly
  const expected = expectedItems(ctx, until)
  const interest = interestByMonth(ctx)

  // Spese stimate: la media mensile divisa sui giorni che mancano, tolte le spese già inserite con data futura.
  const futureSpese = new Map()
  for (const it of expected) if (it.group === 'spese') futureSpese.set(ym(it.date), (futureSpese.get(ym(it.date)) || 0) + cents(it.amount))
  const dailyEst = new Map()
  const estByMonth = new Map()
  for (let m = cur; m <= lastMonth; m = addMonths(m, 1)) {
    const dim = lastDayOfMonth(m)
    const from = m === cur ? day(today) + 1 : 1
    const daysLeft = dim - from + 1
    if (daysLeft <= 0) continue
    const total = Math.max(0, Math.round((cents(monthlyEst) * daysLeft) / dim) - (futureSpese.get(m) || 0))
    estByMonth.set(m, total)
    dailyEst.set(m, { per: total / daysLeft, from })
  }

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
  for (const [m, total] of estByMonth) {
    const mo = byMonth.get(m)
    if (mo && total > 0) addToMonth(mo, { dir: 'out', group: 'spese', line: 'spese', amount: fromCents(total), source: 'stima' }, 'expected')
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

  // Serie giornaliera e saldi di fine mese.
  const series = []
  const limit = -accounts.filter((a) => ctx.cash.has(a.id)).reduce((s, a) => s + cents(a.overdraft), 0)
  let monthStart = bal
  let todayBal = null
  const over = []
  let low = null
  for (let d = startDay; d <= until; d = addDays(d, 1)) {
    bal += effects.get(d) || 0
    const est = d > today ? dailyEst.get(ym(d)) : null
    if (est) bal -= est.per
    const v = Math.round(bal)
    series.push({ date: d, value: fromCents(v), forecast: d > today })
    if (d === today) todayBal = v
    if (d >= today) {
      if (!low || v < low.value) low = { date: d, value: v }
      // Periodi oltre il fido: dal primo giorno sotto il limite al giorno in cui si rientra (null se non si rientra).
      const ep = over[over.length - 1]
      if (limit < 0 && v < limit) {
        if (!ep || ep.back) over.push({ date: d, back: null, max: limit - v })
        else ep.max = Math.max(ep.max, limit - v)
      } else if (ep && !ep.back) ep.back = d
    }
    if (d === endOf(ym(d))) {
      const mo = byMonth.get(ym(d))
      mo.start = fromCents(monthStart)
      mo.end = fromCents(v)
      monthStart = v
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

  const out = months.map((mo) => {
    const lines = [...mo.lines.values()].map((l) => ({
      line: l.line, dir: l.dir, group: l.group, rootId: l.rootId, accountId: l.accountId, label: ctxNames(l),
      amount: fromCents(l.real + l.expected), real: fromCents(l.real), expected: fromCents(l.expected),
      interest: l.group === 'rate' ? fromCents(l.interest) : null, capital: l.group === 'rate' ? fromCents(l.capital) : null,
      count: l.count, dates: l.dates.sort(), sources: [...l.sources],
    }))
    lines.sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || b.amount - a.amount)
    return { month: mo.month, status: mo.status, in: fromCents(mo.in), out: fromCents(mo.out), net: fromCents(mo.in - mo.out), start: mo.start, end: mo.end, lines }
  })

  return {
    cashIds: [...ctx.cash],
    today: fromCents(todayBal ?? 0),
    limit: limit < 0 ? fromCents(limit) : null,
    months: out,
    series,
    over: over.map((e) => ({ date: e.date, back: e.back, max: fromCents(e.max) })),
    low: low ? { date: low.date, value: fromCents(low.value) } : null,
    estimate,
    recurring: recurringPatterns(ctx).map((p) => ({ ...p, label: ctxNames(p) })),
    loans: accounts.filter(isAutoLoan).map((a) => ({ id: a.id, name: a.name, amount: Number(a.instalment), day: a.instalment_day })),
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
