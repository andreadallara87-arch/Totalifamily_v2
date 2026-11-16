// Filtri della pagina Movimenti: periodo, tipo, conti, categorie e testo.
import { addMonths, cents, fromCents, lastDayOfMonth, rootCategory, ym } from './calc.js'
import { monthYear } from './format.js'

const pad = (n) => String(n).padStart(2, '0')

export const PERIODS = [
  { id: 'mese', label: 'Mese' },
  { id: '3mesi', label: '3 mesi' },
  { id: 'anno', label: 'Anno' },
  { id: 'tutto', label: 'Tutto' },
  { id: 'date', label: 'Date' },
]

export const KINDS = [
  { id: 'tutti', label: 'Tutti' },
  { id: 'spesa', label: 'Spese' },
  { id: 'entrata', label: 'Entrate' },
  { id: 'giroconto', label: 'Giroconti' },
]

export function emptyFilters(today) {
  return { period: 'mese', month: ym(today), from: '', to: '', kind: 'tutti', accounts: [], cats: [], q: '' }
}

const fmt = (iso) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}/${iso.slice(2, 4)}`

/** Date di inizio e fine del periodo scelto (null = senza limite) e la sua descrizione. */
export function periodRange(f, today) {
  const now = ym(today)
  if (f.period === 'mese') return { from: `${f.month}-01`, to: `${f.month}-${pad(lastDayOfMonth(f.month))}`, label: monthYear(f.month) }
  if (f.period === '3mesi') {
    const start = addMonths(now, -2)
    return { from: `${start}-01`, to: `${now}-${pad(lastDayOfMonth(now))}`, label: `${monthYear(start).split(' ')[0]} – ${monthYear(now)}` }
  }
  if (f.period === 'anno') {
    const y = f.month.slice(0, 4)
    return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Anno ${y}` }
  }
  if (f.period === 'date') {
    const from = f.from || null
    const to = f.to || null
    const label = from && to ? `Dal ${fmt(from)} al ${fmt(to)}` : from ? `Dal ${fmt(from)}` : to ? `Fino al ${fmt(to)}` : 'Tutte le date'
    return { from, to, label }
  }
  return { from: null, to: null, label: 'Tutti i movimenti' }
}

/** Insieme delle categorie scelte, con le sottocategorie di ogni categoria principale scelta. */
export function expandCats(categories, ids) {
  const set = new Set(ids)
  for (const c of categories) if (c.parent_id && set.has(c.parent_id)) set.add(c.id)
  return set
}

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Testo su cui cerca: nota, categoria e categoria principale, conti, importo (con virgola e con punto). */
function haystack(t, catsById, accById) {
  const c = catsById.get(t.category_id)
  const r = rootCategory(catsById, t.category_id)
  const a = Number(t.amount).toFixed(2)
  return norm([t.note, c?.name, r?.name, accById.get(t.account_id)?.name, accById.get(t.to_account_id)?.name, a, a.replace('.', ','), String(t.amount).replace('.', ',')].join(' '))
}

/** Movimenti che passano tutti i filtri, nell'ordine in cui arrivano (dal più recente). */
export function applyFilters(txs, f, { categories, accounts, today }) {
  const catsById = new Map(categories.map((c) => [c.id, c]))
  const accById = new Map(accounts.map((a) => [a.id, a]))
  const { from, to } = periodRange(f, today)
  const cats = f.cats.length ? expandCats(categories, f.cats) : null
  const accs = f.accounts.length ? new Set(f.accounts) : null
  const words = norm(f.q).split(/\s+/).filter(Boolean)
  return txs.filter((t) => {
    if (from && t.date < from) return false
    if (to && t.date > to) return false
    if (f.kind !== 'tutti' && t.kind !== f.kind) return false
    if (accs && !accs.has(t.account_id) && !accs.has(t.to_account_id)) return false
    if (cats && !cats.has(t.category_id)) return false
    if (words.length) {
      const h = haystack(t, catsById, accById)
      if (!words.every((w) => h.includes(w))) return false
    }
    return true
  })
}

/** Totali dei movimenti filtrati. Se il filtro è su alcuni conti, i giroconti contano come entrate o uscite di quei conti. */
export function summarize(rows, f) {
  const accs = f.accounts.length ? new Set(f.accounts) : null
  let out = 0, inn = 0, moved = 0
  for (const t of rows) {
    const c = cents(t.amount)
    if (t.kind === 'spesa') out += c
    else if (t.kind === 'entrata') inn += c
    else if (accs) {
      const fromIn = accs.has(t.account_id), toIn = accs.has(t.to_account_id)
      if (fromIn && !toIn) moved -= c
      if (toIn && !fromIn) moved += c
    }
  }
  return { count: rows.length, out: fromCents(out), inn: fromCents(inn), moved: fromCents(moved), net: fromCents(inn - out) }
}

/** Totale mese per mese dei movimenti filtrati (spese e entrate), dal primo all'ultimo mese con movimenti. */
export function byMonth(rows, today) {
  if (!rows.length) return []
  const map = new Map()
  for (const t of rows) {
    if (t.kind === 'giroconto') continue
    const m = ym(t.date)
    const s = map.get(m) || { out: 0, inn: 0 }
    if (t.kind === 'spesa') s.out += cents(t.amount)
    else s.inn += cents(t.amount)
    map.set(m, s)
  }
  if (!map.size) return []
  const keys = [...map.keys()].sort()
  const out = []
  for (let m = keys[0]; m <= keys[keys.length - 1]; m = addMonths(m, 1)) {
    const s = map.get(m) || { out: 0, inn: 0 }
    out.push({ month: m, out: fromCents(s.out), inn: fromCents(s.inn), partial: m === ym(today) })
  }
  return out
}

/** Quanti filtri oltre a periodo e testo sono attivi (per il pallino sul pulsante "Filtri"). */
export const activeCount = (f) => f.accounts.length + f.cats.length + (f.kind !== 'tutti' ? 1 : 0)

/** Filtri letti dall'indirizzo, per esempio #/movimenti?mese=2026-10&tipo=spesa&cat=… */
export function filtersFromQuery(query, today) {
  const f = emptyFilters(today)
  const p = new URLSearchParams(query || '')
  if (/^\d{4}-\d{2}$/.test(p.get('mese') || '')) f.month = p.get('mese')
  if (PERIODS.some((x) => x.id === p.get('periodo'))) f.period = p.get('periodo')
  if (KINDS.some((x) => x.id === p.get('tipo'))) f.kind = p.get('tipo')
  f.cats = p.getAll('cat')
  f.accounts = p.getAll('conto')
  f.q = p.get('q') || ''
  return f
}

export function filtersToQuery(f) {
  const p = new URLSearchParams()
  if (f.period !== 'mese') p.set('periodo', f.period)
  p.set('mese', f.month)
  if (f.kind !== 'tutti') p.set('tipo', f.kind)
  for (const c of f.cats) p.append('cat', c)
  for (const a of f.accounts) p.append('conto', a)
  if (f.q) p.set('q', f.q)
  return p.toString()
}
