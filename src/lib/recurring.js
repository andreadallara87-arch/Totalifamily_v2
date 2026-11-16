// Movimenti ricorrenti: regole che il database usa per inserire da solo un movimento nel suo giorno
// (funzione `genera_ricorrenti`, ogni mattina e quando si apre l'app). Qui c'è quello che serve all'app per
// mostrarle, prevederle e modificarle. I calcoli di rata e carta sono gli stessi della funzione nel database.
import { addDays, addMonths, cents, dateInMonth, fromCents, rootCategory, ym } from './calc.js'

const isCard = (a) => !!a && a.kind === 'carta_revolv'
const isSaldoCard = (a) => isCard(a) && !a.archived && !(Number(a.tan) > 0)

/** Come si calcola l'importo: dal tipo di conto di arrivo. */
export function calcFor(kind, toAcc) {
  if (kind !== 'giroconto' || !toAcc) return 'fisso'
  if (toAcc.kind === 'finanziamento') return 'rata'
  if (isSaldoCard(toAcc)) return 'carta'
  return 'fisso'
}

/** La data `every` mesi dopo `iso`, nel giorno `day` (o l'ultimo del mese, se è più corto). */
export const dateAfter = (iso, day, every = 1) => dateInMonth(addMonths(ym(iso), every), day)

/** Prima data nel giorno `day` dopo `today`. */
export function firstDateAfter(day, today) {
  const d = dateInMonth(ym(today), day)
  return d > today ? d : dateAfter(today, day, 1)
}

const withinUntil = (r, d) => !r.until_month || ym(d) <= r.until_month

/** Date in cui la regola inserirà il movimento, dopo `from` e fino a `until` compresi. */
export function occurrences(r, from, until) {
  const out = []
  if (!r.active) return out
  for (let d = r.next_date, i = 0; d <= until && withinUntil(r, d) && i < 400; d = dateAfter(d, r.day, r.every_months || 1), i++) {
    if (d > from) out.push(d)
  }
  return out
}

/** Un movimento già presente vale come quello della regola (stesso controllo della funzione nel database). */
export function matchesRule(t, r) {
  const same = cents(t.amount) === cents(r.amount)
  if (r.kind === 'giroconto') {
    return t.kind === 'giroconto' && t.account_id === r.account_id && t.to_account_id === r.to_account_id &&
      (r.calc !== 'fisso' || t.recurring_id === r.id || same || r.check_mode)
  }
  if (t.recurring_id === r.id) return true
  return t.kind === r.kind && t.account_id === r.account_id && (t.category_id || null) === (r.category_id || null) && (same || r.check_mode)
}

/** C'è già un movimento della regola nel mese di `date`. */
export const doneInMonth = (r, txs, date) => txs.some((t) => ym(t.date) === ym(date) && matchesRule(t, r))

const isFinanceCost = (catsById, id) => (rootCategory(catsById, id)?.name || '').trim().toLowerCase() === 'costi finanziari'

/** Addebito di una carta a saldo il giorno `date`: acquisti del mese prima, rata del piano, bollo. */
export function cardDebit(card, txs, catsById, date) {
  const prev = addMonths(ym(date), -1)
  const own = Number(card.plan_amount) > 0 || Number(card.statement_fee) > 0
  let purchases = 0
  for (const t of txs) {
    if (t.kind === 'spesa' && t.account_id === card.id && ym(t.date) === prev && !(own && isFinanceCost(catsById, t.category_id))) purchases += cents(t.amount)
  }
  const plan = Number(card.plan_amount) > 0 && prev <= (card.plan_until || '9999-12') ? cents(card.plan_amount) : 0
  const fee = purchases + plan > 7747 ? cents(card.statement_fee) : 0
  return { of: prev, purchases: fromCents(purchases), plan: fromCents(plan), fee: fromCents(fee), amount: fromCents(purchases + plan + fee) }
}

/** Interessi della prossima rata: quelli dell'ultima meno il calo dovuto al capitale restituito; senza storia, dal debito. */
export function nextInterest(r, loan, txs, residual = null) {
  const before = (t) => !r.next_date || t.date < r.next_date
  const last = (pred) => txs.filter((t) => pred(t) && before(t)).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  const li = last((t) => t.kind === 'spesa' && t.account_id === loan.id && (!r.interest_category_id || t.category_id === r.interest_category_id))
  const lr = last((t) => t.kind === 'giroconto' && t.to_account_id === loan.id)
  const tan = Number(loan.tan) || 0
  if (li && lr) return { amount: fromCents(Math.round(cents(li.amount) - Math.max(0, cents(lr.amount) - cents(li.amount)) * tan / 1200)), last: Number(li.amount) }
  if (residual != null) return { amount: fromCents(Math.round(Math.max(0, residual) * 100 * tan / 1200)), last: null }
  return { amount: 0, last: null }
}

/** Importo previsto della prossima volta, con il dettaglio per rata e carta. */
export function estimate(r, { accById, catsById, txs }) {
  if (r.calc === 'carta') {
    const card = accById.get(r.to_account_id)
    return card ? { amount: cardDebit(card, txs, catsById, r.next_date).amount, card: cardDebit(card, txs, catsById, r.next_date) } : { amount: 0 }
  }
  if (r.calc === 'rata') {
    const loan = accById.get(r.to_account_id)
    const i = loan && r.interest_category_id ? nextInterest(r, loan, txs) : { amount: 0, last: null }
    return { amount: Number(r.amount), interest: i.amount, lastInterest: i.last }
  }
  return { amount: Number(r.amount) }
}

/** Le ultime volte che c'è stato (giroconti per le rate, non gli interessi). */
export function lastTimes(r, txs, n = 3) {
  return txs.filter((t) => matchesRule(t, r) && (r.calc !== 'rata' || t.kind === 'giroconto')).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, n)
}

/** Gruppo in cui mostrarla. */
export function groupOf(r, accById, catsById) {
  if (r.calc === 'rata') return 'rate'
  if (r.calc === 'carta' || (r.kind === 'giroconto' && isCard(accById.get(r.to_account_id)))) return 'carte'
  if (r.kind === 'spesa' && isCard(accById.get(r.account_id)) && isFinanceCost(catsById, r.category_id)) return 'carte'
  if (r.kind === 'entrata') return 'entrate'
  if (r.kind === 'giroconto') return 'giro'
  return 'fisse'
}

export const GROUPS = [
  { id: 'rate', label: 'Rate dei finanziamenti', note: 'Ogni rata inserisce il giroconto e gli interessi come spesa, calcolati sul debito che resta.' },
  { id: 'carte', label: 'Carte' },
  { id: 'entrate', label: 'Entrate' },
  { id: 'giro', label: 'Giroconti' },
  { id: 'fisse', label: 'Spese fisse' },
]

/** "Ogni mese il 5", "Ogni 3 mesi l'ultimo giorno". */
export function every(r) {
  const n = Number(r.every_months) || 1
  const when = Number(r.day) >= 31 ? "l'ultimo giorno" : `il ${r.day}`
  return `${n === 1 ? 'Ogni mese' : n === 12 ? 'Ogni anno' : `Ogni ${n} mesi`} ${when}`
}

/** Movimenti delle regole con importo fisso da domani a `until`, se nel loro mese non ci sono già. */
export function ruleItems(rules, txs, today, until) {
  const out = []
  for (const r of rules) {
    if (!r.active || r.calc !== 'fisso') continue
    for (const date of occurrences(r, today, until)) {
      if (doneInMonth(r, txs, date)) continue
      out.push({ key: `ric-${r.id}-${date}`, date, kind: r.kind, amount: Number(r.amount), account_id: r.account_id, to_account_id: r.to_account_id, category_id: r.category_id, note: r.name, source: 'ricorrente', ruleId: r.id })
    }
  }
  return out
}

/**
 * Movimenti che si sono ripetuti con lo stesso importo in almeno due degli ultimi tre mesi e che nessuna regola copre.
 * Le rate e le carte sono escluse: hanno le loro regole. `ignored`: chiavi scartate con "Ignora".
 */
export function suggestions({ accounts, categories, txs }, rules, today, ignored = []) {
  const accById = new Map(accounts.map((a) => [a.id, a]))
  const catsById = new Map(categories.map((c) => [c.id, c]))
  const months = new Set([addMonths(ym(today), -2), addMonths(ym(today), -1), ym(today)])
  const by = new Map()
  const bucket = new Map() // movimenti dello stesso tipo, conto e categoria, qualunque importo
  const bkey = (t) => [t.kind, t.account_id, t.to_account_id || '', t.category_id || ''].join('|')
  for (const t of txs) {
    if (t.date > today || !months.has(ym(t.date)) || t.recurring_id) continue
    const to = accById.get(t.to_account_id)
    if (t.kind === 'giroconto' && (to?.kind === 'finanziamento' || isCard(to))) continue
    if (accById.get(t.account_id)?.kind === 'finanziamento') continue
    bucket.set(bkey(t), (bucket.get(bkey(t)) || 0) + 1)
    const key = [t.kind, t.account_id, t.to_account_id || '', t.category_id || '', cents(t.amount)].join('|')
    let g = by.get(key)
    if (!g) by.set(key, (g = { key, kind: t.kind, account_id: t.account_id, to_account_id: t.to_account_id || null, category_id: t.category_id || null, amount: Number(t.amount), months: new Set(), dates: [], note: '' }))
    g.months.add(ym(t.date))
    g.dates.push(t.date)
    if (t.note) g.note = t.note
  }
  const out = []
  for (const g of by.values()) {
    if (g.months.size < 2 || ignored.includes(g.key)) continue
    if (rules.some((r) => matchesRule({ ...g, date: today, recurring_id: null }, r))) continue
    // Una sola volta al mese e nient'altro in quella categoria: altrimenti è una spesa frequente che a volte costa uguale.
    if (g.dates.length > g.months.size || bucket.get(bkey(g)) > g.dates.length) continue
    g.dates.sort()
    const cat = catsById.get(g.category_id)
    const name = g.note ? g.note.charAt(0).toUpperCase() + g.note.slice(1) : g.kind === 'giroconto' ? `Giroconto verso ${accById.get(g.to_account_id)?.name || ''}` : cat?.name || 'Movimento'
    out.push({ key: g.key, kind: g.kind, account_id: g.account_id, to_account_id: g.to_account_id, category_id: g.category_id, amount: g.amount, dates: g.dates, day: Number(g.dates[g.dates.length - 1].slice(8, 10)), name })
  }
  return out.sort((a, b) => b.amount - a.amount)
}

/** Dati del modulo per una regola (nuova se `r` è null, eventualmente da un suggerimento `seed`). */
export function ruleForm(r, today, seed = null) {
  const s = r || seed || {}
  const day = s.day || Number(addDays(today, 1).slice(8, 10))
  return {
    name: s.name || '',
    kind: s.kind || 'spesa',
    accountId: s.account_id || '',
    toAccountId: s.to_account_id || '',
    categoryId: s.category_id || '',
    amount: s.amount ? String(Number(s.amount).toFixed(2)).replace('.', ',') : '',
    day: String(Math.min(31, day)),
    every: String(s.every_months || 1),
    next: r?.next_date || firstDateAfter(day, today),
    until: s.until_month || '',
    check: !!s.check_mode,
  }
}

export function parseAmount(text) {
  const t = String(text || '').trim().replace(/\s|€/g, '')
  if (!t) return null
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const v = Number(norm)
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN
}

/** Cosa manca o non va nel modulo, oppure null. */
export function ruleProblem(f, accById) {
  if (!f.name.trim()) return 'Scrivi un nome'
  if (!f.accountId) return 'Scegli il conto'
  if (f.kind === 'giroconto') {
    if (!f.toAccountId) return 'Scegli il conto di arrivo'
    if (f.toAccountId === f.accountId) return 'I due conti devono essere diversi'
  } else if (!f.categoryId) return 'Scegli la categoria'
  const calc = calcFor(f.kind, accById.get(f.toAccountId))
  const v = parseAmount(f.amount)
  if (calc !== 'carta' && !(v > 0)) return "Scrivi l'importo"
  if (!f.next) return 'Scegli la data della prossima volta'
  if (f.until && f.until < ym(f.next)) return 'La fine viene prima della prossima volta'
  return null
}

/** Riga da salvare nel database. */
export function buildRule(f, { accById, categories }) {
  const calc = calcFor(f.kind, accById.get(f.toAccountId))
  const interest = categories.find((c) => c.kind === 'spesa' && c.name.trim().toLowerCase() === 'interessi passivi')
  return {
    name: f.name.trim(),
    kind: f.kind,
    account_id: f.accountId,
    to_account_id: f.kind === 'giroconto' ? f.toAccountId : null,
    category_id: f.kind === 'giroconto' ? null : f.categoryId,
    interest_category_id: calc === 'rata' ? interest?.id || null : null,
    amount: calc === 'carta' ? 0 : parseAmount(f.amount),
    calc,
    day: Math.min(31, Math.max(1, Number(f.day) || 1)),
    every_months: Math.min(12, Math.max(1, Number(f.every) || 1)),
    next_date: f.next,
    until_month: f.until || null,
    check_mode: !!f.check,
  }
}
