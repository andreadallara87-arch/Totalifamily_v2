// Calcoli su conti e movimenti. Tutti gli importi sono gestiti in centesimi (interi).
export const cents = (x) => Math.round((Number(x) || 0) * 100)
export const fromCents = (c) => c / 100

export function todayRome(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(d)
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000)
}
export const ym = (iso) => iso.slice(0, 7)
export function addMonths(ymStr, n) {
  const [y, m] = ymStr.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
export function lastDayOfMonth(ymStr) {
  const [y, m] = ymStr.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
export function dateInMonth(ymStr, day) {
  return `${ymStr}-${String(Math.min(day, lastDayOfMonth(ymStr))).padStart(2, '0')}`
}

/** Effetto in centesimi di un movimento sul conto indicato. */
export function effect(tx, accountId) {
  const a = cents(tx.amount)
  let d = 0
  if (tx.account_id === accountId) d += tx.kind === 'entrata' ? a : -a
  if (tx.kind === 'giroconto' && tx.to_account_id === accountId) d += a
  return d
}

/** Saldi (in centesimi) di tutti i conti alla fine del giorno indicato. I movimenti successivi sono esclusi. */
export function balancesAt(accounts, txs, dateIso) {
  const out = new Map(accounts.map((a) => [a.id, cents(a.initial_balance)]))
  for (const t of txs) {
    if (t.date > dateIso) continue
    if (out.has(t.account_id)) out.set(t.account_id, out.get(t.account_id) + (t.kind === 'entrata' ? cents(t.amount) : -cents(t.amount)))
    if (t.kind === 'giroconto' && out.has(t.to_account_id)) out.set(t.to_account_id, out.get(t.to_account_id) + cents(t.amount))
  }
  return out
}

/** Saldo di fine giornata di un conto per ogni giorno da `from` a `to` compresi. */
export function dailySeries(account, txs, from, to) {
  const start = account.start_date && account.start_date > from ? account.start_date : from
  let bal = cents(account.initial_balance)
  const byDay = new Map()
  for (const t of txs) {
    const d = effect(t, account.id)
    if (!d) continue
    if (t.date < start) bal += d
    else if (t.date <= to) byDay.set(t.date, (byDay.get(t.date) || 0) + d)
  }
  const out = []
  for (let day = start; day <= to; day = addDays(day, 1)) {
    bal += byDay.get(day) || 0
    out.push({ date: day, value: fromCents(bal) })
  }
  return out
}

/** Prossima scadenza di rata di un finanziamento, dopo `today`. */
export function nextInstalmentDate(acc, today) {
  if (!acc.instalment_day) return null
  let m = ym(today)
  for (let i = 0; i < 24; i++, m = addMonths(m, 1)) {
    if (acc.last_instalment && m <= acc.last_instalment) continue
    const due = dateInMonth(m, acc.instalment_day)
    if (due > today) return due
  }
  return null
}

/** Movimenti attesi nei prossimi giorni: movimenti già registrati con data futura e rate automatiche. */
export function upcoming({ accounts, txs, today, days = 31 }) {
  const until = addDays(today, days)
  const items = txs
    .filter((t) => t.date > today && t.date <= until)
    .map((t) => ({ key: t.id, date: t.date, kind: t.kind, amount: Number(t.amount), account_id: t.account_id, to_account_id: t.to_account_id, category_id: t.category_id, note: t.note, source: 'movimento' }))
  for (const a of accounts) {
    if (a.kind !== 'finanziamento' || !a.auto_instalment || !Number(a.instalment) || a.archived) continue
    const due = nextInstalmentDate(a, today)
    if (!due || due > until) continue
    const already = items.some((i) => i.kind === 'giroconto' && i.to_account_id === a.id && ym(i.date) === ym(due))
    if (already) continue
    items.push({ key: `rata-${a.id}-${due}`, date: due, kind: 'giroconto', amount: Number(a.instalment), account_id: a.payment_account_id, to_account_id: a.id, category_id: null, note: `Rata ${a.name}`, source: 'rata' })
  }
  return items.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
}

/** Proiezione del saldo del conto principale sugli impegni attesi: primo giorno oltre il fido. */
export function overdraftRisk(account, balanceToday, items) {
  if (!account) return null
  const limit = -cents(account.overdraft)
  let bal = cents(balanceToday)
  for (const it of items) {
    bal += effect(it, account.id)
    if (bal < limit) return { date: it.date, over: fromCents(limit - bal), item: it }
  }
  return null
}

/** Categoria principale (risale al genitore). */
export function rootCategory(catsById, id) {
  let c = catsById.get(id)
  while (c && c.parent_id && catsById.get(c.parent_id)) c = catsById.get(c.parent_id)
  return c || null
}

/** Spese per categoria principale tra due date comprese. */
export function spendingByCategory(txs, catsById, from, to) {
  const tot = new Map()
  let total = 0
  for (const t of txs) {
    if (t.kind !== 'spesa' || t.date < from || t.date > to) continue
    const root = rootCategory(catsById, t.category_id)
    const key = root ? root.id : 'senza'
    const c = cents(t.amount)
    tot.set(key, (tot.get(key) || 0) + c)
    total += c
  }
  const rows = [...tot.entries()].map(([id, c]) => {
    const cat = catsById.get(id)
    return { id, name: cat ? cat.name : 'Senza categoria', icon: cat ? cat.icon : '', total: fromCents(c) }
  })
  rows.sort((a, b) => b.total - a.total)
  return { rows, total: fromCents(total) }
}

/** Mesi residui e fine stimata di un finanziamento (ammortamento a rata costante). */
export function loanEnd(residual, tan, instalment, today) {
  const P = Number(residual)
  const R = Number(instalment)
  if (!(P > 0) || !(R > 0)) return null
  const r = (Number(tan) || 0) / 1200
  let n
  if (r === 0) n = Math.ceil(P / R)
  else {
    if (r * P >= R) return null
    n = Math.ceil(-Math.log(1 - (r * P) / R) / Math.log(1 + r))
  }
  return { months: n, end: addMonths(ym(today), n) }
}
