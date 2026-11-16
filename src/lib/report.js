// Calcoli della pagina "Categorie": quanto si spende (o si incassa) per categoria e sottocategoria, mese per mese.
import { addMonths, cents, fromCents, lastDayOfMonth, rootCategory, ym } from './calc.js'

const pad = (n) => String(n).padStart(2, '0')

/** Giorni da considerare per un mese: tutto il mese, oppure fino a oggi se è il mese in corso. */
export function monthRange(month, today) {
  const last = `${month}-${pad(lastDayOfMonth(month))}`
  return { from: `${month}-01`, to: month === ym(today) ? today : last }
}

/** Periodo con cui confrontare: il mese prima, fermo allo stesso giorno se il mese è quello in corso. */
export function previousRange(month, today) {
  const prev = addMonths(month, -1)
  if (month !== ym(today)) return monthRange(prev, today)
  const day = Math.min(Number(today.slice(8, 10)), lastDayOfMonth(prev))
  return { from: `${prev}-01`, to: `${prev}-${pad(day)}` }
}

/** Mesi da mostrare: dal primo con movimenti di quel tipo fino al mese in corso, al massimo `max`. */
export function monthsWithData(txs, kind, today, max = 12) {
  const now = ym(today)
  let first = now
  for (const t of txs) if (t.kind === kind && t.date <= today && ym(t.date) < first) first = ym(t.date)
  const out = []
  for (let m = now; m >= first && out.length < max; m = addMonths(m, -1)) out.unshift(m)
  return out
}

/** Totali per categoria principale e sottocategoria in un periodo. I movimenti futuri non contano. */
export function categoryReport({ txs, catsById, kind, from, to }) {
  const roots = new Map()
  let total = 0
  for (const t of txs) {
    if (t.kind !== kind || t.date < from || t.date > to) continue
    const c = catsById.get(t.category_id)
    const root = rootCategory(catsById, t.category_id)
    const rid = root ? root.id : 'senza'
    const sid = c && root && c.id !== root.id ? c.id : rid
    const v = cents(t.amount)
    const r = roots.get(rid) || { id: rid, c: 0, count: 0, subs: new Map() }
    r.c += v
    r.count += 1
    const s = r.subs.get(sid) || { id: sid, c: 0, count: 0 }
    s.c += v
    s.count += 1
    r.subs.set(sid, s)
    roots.set(rid, r)
    total += v
  }
  const rows = [...roots.values()]
    .map((r) => ({
      id: r.id,
      total: fromCents(r.c),
      count: r.count,
      share: total ? r.c / total : 0,
      subs: [...r.subs.values()].map((s) => ({ id: s.id, total: fromCents(s.c), count: s.count, share: r.c ? s.c / r.c : 0 })).sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.total - a.total)
  return { total: fromCents(total), rows }
}

/** Totale di ogni mese, per tutte le categorie o solo per una categoria principale. */
export function monthlyTotals({ txs, catsById, kind, months, today, rootId = null }) {
  const sums = new Map(months.map((m) => [m, 0]))
  for (const t of txs) {
    if (t.kind !== kind || t.date > today) continue
    const m = ym(t.date)
    if (!sums.has(m)) continue
    if (rootId) {
      const root = rootCategory(catsById, t.category_id)
      if ((root ? root.id : 'senza') !== rootId) continue
    }
    sums.set(m, sums.get(m) + cents(t.amount))
  }
  return months.map((m) => ({ month: m, total: fromCents(sums.get(m)) }))
}

/** Quanto del budget mensile è stato usato (null se la categoria non ha un budget). */
export function budgetUse(total, budget) {
  const b = Number(budget) || 0
  if (b <= 0) return null
  return { budget: b, ratio: total / b, over: Math.round((total - b) * 100) / 100 }
}
