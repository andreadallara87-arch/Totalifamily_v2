// Ordine e riquadri nascosti della Home sul telefono, salvati per utente (uguali su ogni dispositivo).
export const HOME_BLOCKS = ['mese', 'saldo', 'grafico', 'arrivo', 'conti', 'spese', 'finanziamenti']
const KEY = 'tf-home'

/** Rende valido un layout letto dal database o dal dispositivo: niente doppioni o nomi sconosciuti, i riquadri nuovi in fondo. */
export function normalizeLayout(raw) {
  const ok = (id) => HOME_BLOCKS.includes(id)
  const order = []
  for (const id of Array.isArray(raw?.order) ? raw.order : []) if (ok(id) && !order.includes(id)) order.push(id)
  // "mese" (spese vive) è arrivato dopo: chi aveva già un ordine salvato lo trova in cima, gli altri nuovi in fondo.
  if (order.length && !order.includes('mese')) order.unshift('mese')
  for (const id of HOME_BLOCKS) if (!order.includes(id)) order.push(id)
  const hidden = HOME_BLOCKS.filter((id) => Array.isArray(raw?.hidden) && raw.hidden.includes(id))
  return { order, hidden }
}

/** I riquadri da mostrare, nell'ordine scelto. */
export const visibleBlocks = (layout) => layout.order.filter((id) => !layout.hidden.includes(id))

/** Sposta il riquadro "id" alla posizione "to" tra quelli visibili. */
export function moveBlock(layout, id, to) {
  const vis = visibleBlocks(layout).filter((x) => x !== id)
  const at = Math.max(0, Math.min(to, vis.length))
  vis.splice(at, 0, id)
  // I nascosti restano dove erano nell'ordine completo, così tornano lì se li rimetti.
  const order = []
  let v = 0
  for (const x of layout.order) order.push(layout.hidden.includes(x) ? x : vis[v++])
  return { ...layout, order }
}

export const hideBlock = (layout, id) => (layout.hidden.includes(id) ? layout : { ...layout, hidden: [...layout.hidden, id] })

/** Rimette un riquadro nascosto: torna in fondo alla Home. */
export function showBlock(layout, id) {
  if (!layout.hidden.includes(id)) return layout
  return { order: [...layout.order.filter((x) => x !== id), id], hidden: layout.hidden.filter((x) => x !== id) }
}

/** Posizione d'arrivo durante il trascinamento: quante "caselle" (altezza + spazio) si è spostato il dito. */
export function dropIndex(from, dy, slot, count) {
  if (!slot) return from
  return Math.max(0, Math.min(count - 1, from + Math.round(dy / slot)))
}

export function readLocalLayout() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}
export function writeLocalLayout(layout) {
  try { localStorage.setItem(KEY, JSON.stringify(layout)) } catch { /* non disponibile */ }
}
