// Calcoli della pagina "Andamento": entrate, spese e patrimonio netto mese per mese.
import { addMonths, balancesAt, cents, fromCents, lastDayOfMonth, rootCategory, ym } from './calc.js'

const pad = (n) => String(n).padStart(2, '0')
const monthEnd = (m) => `${m}-${pad(lastDayOfMonth(m))}`

/**
 * Primo mese completo coperto dai dati: il mese in cui iniziano i conti se partono il giorno 1,
 * altrimenti il mese dopo (agosto 2026 ha solo gli ultimi 3 giorni e falserebbe i confronti).
 */
export function firstFullMonth(accounts, today) {
  const starts = accounts.map((a) => a.start_date).filter(Boolean).sort()
  if (!starts.length) return ym(today)
  const s = starts[0]
  return s.slice(8, 10) === '01' ? ym(s) : addMonths(ym(s), 1)
}

/** Mesi da mostrare, dal primo completo fino al mese in corso, al massimo `max` (gli ultimi). */
export function trendMonths(accounts, today, max = 12) {
  const first = firstFullMonth(accounts, today)
  const out = []
  for (let m = ym(today); m >= first && out.length < max; m = addMonths(m, -1)) out.unshift(m)
  return out
}

/** Conti che contano nel patrimonio: tutti tranne quelli esclusi o archiviati. */
const counted = (accounts) => accounts.filter((a) => !a.excluded && !a.archived)

/**
 * Entrate e spese di ogni mese (i movimenti futuri non contano).
 * La differenza è anche quanto è cambiato il patrimonio netto: i giroconti spostano soldi tra conti tuoi.
 */
export function monthlyFlows({ txs, months, today }) {
  const sums = new Map(months.map((m) => [m, { inn: 0, out: 0 }]))
  for (const t of txs) {
    if (t.date > today || t.kind === 'giroconto') continue
    const s = sums.get(ym(t.date))
    if (!s) continue
    if (t.kind === 'entrata') s.inn += cents(t.amount)
    else s.out += cents(t.amount)
  }
  return months.map((m) => {
    const s = sums.get(m)
    return { month: m, inn: fromCents(s.inn), out: fromCents(s.out), net: fromCents(s.inn - s.out), partial: m === ym(today) }
  })
}

/**
 * Patrimonio netto a fine mese (o a oggi per il mese in corso), con il punto di partenza prima del primo mese.
 * "Hai" = somma dei saldi positivi, "Devi" = somma dei saldi negativi (mutuo, prestiti, carte, fido usato).
 */
export function netWorthSeries({ accounts, txs, months, today }) {
  const accs = counted(accounts)
  if (!months.length) return []
  const points = [{ key: 'start', month: addMonths(months[0], -1), date: monthEnd(addMonths(months[0], -1)) }]
  for (const m of months) points.push({ key: m, month: m, date: m === ym(today) ? today : monthEnd(m) })
  return points.map((p) => {
    const bal = balancesAt(accs, txs, p.date)
    let have = 0, owe = 0
    const byAcc = {}
    for (const a of accs) {
      const v = bal.get(a.id)
      byAcc[a.id] = fromCents(v)
      if (v > 0) have += v
      else owe += v
    }
    return { ...p, have: fromCents(have), owe: fromCents(owe), net: fromCents(have + owe), byAcc }
  })
}

/** Debiti conto per conto: quanto era all'inizio e quanto è ora (solo i conti con saldo negativo). */
export function debtChanges(accounts, series) {
  if (series.length < 2) return []
  const first = series[0].byAcc
  const last = series[series.length - 1].byAcc
  return counted(accounts)
    .filter((a) => (first[a.id] ?? 0) < 0 || (last[a.id] ?? 0) < 0)
    .map((a) => ({ id: a.id, name: a.name, kind: a.kind, from: first[a.id] ?? 0, to: last[a.id] ?? 0, change: Math.round(((last[a.id] ?? 0) - (first[a.id] ?? 0)) * 100) / 100 }))
    .sort((x, y) => x.to - y.to)
}

/** Le categorie principali che pesano di più nelle spese di un mese. */
export function topCategories({ txs, catsById, month, today, kind = 'spesa', limit = 4 }) {
  const tot = new Map()
  let all = 0
  for (const t of txs) {
    if (t.kind !== kind || t.date > today || ym(t.date) !== month) continue
    const r = rootCategory(catsById, t.category_id)
    const id = r ? r.id : 'senza'
    tot.set(id, (tot.get(id) || 0) + cents(t.amount))
    all += cents(t.amount)
  }
  return [...tot.entries()]
    .map(([id, c]) => ({ id, total: fromCents(c), share: all ? c / all : 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
}
