// Formattazione italiana di importi e date.
const nf2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })
const nf0 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0, useGrouping: 'always' })
const MINUS = '−'

/** "−9.445,83 €" (decimals) oppure "−9.446 €" */
export function euro(value, { decimals = true, sign = false } = {}) {
  const v = Number(value) || 0
  const abs = Math.abs(v)
  const body = decimals ? nf2.format(abs) : nf0.format(Math.round(abs))
  const s = v < 0 && body !== '0' && body !== '0,00' ? MINUS : sign && v > 0 ? '+' : ''
  return `${s}${body} €`
}

/** Divide l'importo in parte intera e decimali per lo stile con decimali piccoli. */
export function euroParts(value, { sign = false } = {}) {
  const full = euro(value, { sign })
  const m = full.match(/^(.*),(\d\d) €$/)
  return m ? { int: m[1], dec: ',' + m[2] } : { int: full.replace(' €', ''), dec: '' }
}

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const DAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']

const parts = (iso) => iso.split('-').map(Number)
export const monthName = (m) => MONTHS[m - 1]
export const monthShort = (m) => MONTHS_SHORT[m - 1]

export function dayLong(iso) {
  const [y, m, d] = parts(iso)
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const s = `${DAYS[wd]} ${d} ${MONTHS[m - 1]}`
  return s.charAt(0).toUpperCase() + s.slice(1)
}
export function dayMonth(iso) {
  const [, m, d] = parts(iso)
  return `${d} ${MONTHS[m - 1]}`
}
export function dayShort(iso) {
  const [, m, d] = parts(iso)
  return `${d} ${MONTHS_SHORT[m - 1]}`
}
export function monthYear(ym) {
  const [y, m] = ym.split('-').map(Number)
  const s = `${MONTHS[m - 1]} ${y}`
  return s.charAt(0).toUpperCase() + s.slice(1)
}
export function monthShortYear(ym) {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS_SHORT[m - 1]} ${y}`
}
export function relativeDay(iso, today) {
  if (iso === today) return 'Oggi'
  const diff = Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000)
  if (diff === 1) return 'Domani'
  if (diff === -1) return 'Ieri'
  return dayMonth(iso)
}
export function percent(v) {
  return `${Math.round(v * 100)}%`
}
