// "Spese vive": tutte le spese tranne la categoria Costi finanziari (interessi, commissioni, bolli).
// È l'unico numero da tenere d'occhio ogni mese, confrontato con un limite che si può cambiare.
import { addMonths, cents, fromCents, lastDayOfMonth, rootCategory, ym } from './calc.js'

export const DEFAULT_LIMIT = 1750
const FIN = 'costi finanziari'
const pad = (n) => String(n).padStart(2, '0')

/** Id della categoria principale "Costi finanziari" (o null se non c'è). */
export function financialRootId(categories) {
  const c = categories.find((x) => !x.parent_id && x.kind !== 'entrata' && x.name.trim().toLowerCase() === FIN)
  return c ? c.id : null
}

/** Il limite scelto, o quello di partenza. */
export function spendingLimit(settings) {
  const v = Number(settings?.spending_limit)
  return v > 0 ? v : DEFAULT_LIMIT
}

/** Somme in centesimi di un periodo: spese vive e costi finanziari. I movimenti futuri non contano. */
function sums(txs, catsById, finId, from, to, today) {
  let live = 0
  let fin = 0
  for (const t of txs) {
    if (t.kind !== 'spesa' || t.date < from || t.date > to || t.date > today) continue
    const r = rootCategory(catsById, t.category_id)
    if (finId && r && r.id === finId) fin += cents(t.amount)
    else live += cents(t.amount)
  }
  return { live, fin }
}

/**
 * Spese vive del mese in corso (fino a oggi) confrontate con il limite, più lo stesso giorno del mese prima.
 * `left`: quanto resta fino a fine mese; `perDay`: quanto al giorno da domani (oggi compreso se non è finito).
 */
export function liveMonth({ txs, categories, today, limit }) {
  const catsById = new Map(categories.map((c) => [c.id, c]))
  const finId = financialRootId(categories)
  const month = ym(today)
  const day = Number(today.slice(8, 10))
  const last = lastDayOfMonth(month)
  const cur = sums(txs, catsById, finId, `${month}-01`, `${month}-${pad(last)}`, today)
  const prevM = addMonths(month, -1)
  const prev = sums(txs, catsById, finId, `${prevM}-01`, `${prevM}-${pad(Math.min(day, lastDayOfMonth(prevM)))}`, today)
  const left = cents(limit) - cur.live
  const daysLeft = last - day + 1
  return {
    month,
    finId,
    limit,
    spent: fromCents(cur.live),
    financial: fromCents(cur.fin),
    left: fromCents(left),
    share: limit > 0 ? cur.live / cents(limit) : 0,
    daysLeft,
    perDay: left > 0 ? fromCents(Math.floor(left / daysLeft)) : 0,
    // Dove saresti oggi spendendo il limite in parti uguali ogni giorno.
    pace: fromCents(Math.round((cents(limit) * day) / last)),
    prevMonth: prevM,
    prevSameDay: fromCents(prev.live),
  }
}

/** Spese vive mese per mese (il mese in corso fino a oggi), con i costi finanziari a parte. */
export function liveByMonth({ txs, categories, months, today }) {
  const catsById = new Map(categories.map((c) => [c.id, c]))
  const finId = financialRootId(categories)
  return months.map((m) => {
    const s = sums(txs, catsById, finId, `${m}-01`, `${m}-${pad(lastDayOfMonth(m))}`, today)
    return { month: m, live: fromCents(s.live), financial: fromCents(s.fin), partial: m === ym(today) }
  })
}

/** Categorie principali delle spese vive di un mese, dalla più pesante. */
export function liveCategories({ txs, categories, month, today }) {
  const catsById = new Map(categories.map((c) => [c.id, c]))
  const finId = financialRootId(categories)
  const tot = new Map()
  let all = 0
  for (const t of txs) {
    if (t.kind !== 'spesa' || t.date > today || ym(t.date) !== month) continue
    const r = rootCategory(catsById, t.category_id)
    if (finId && r && r.id === finId) continue
    const id = r ? r.id : 'senza'
    tot.set(id, (tot.get(id) || 0) + cents(t.amount))
    all += cents(t.amount)
  }
  return [...tot.entries()].map(([id, c]) => ({ id, total: fromCents(c), share: all ? c / all : 0 })).sort((a, b) => b.total - a.total)
}
