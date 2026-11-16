// Icona e colore per conti, movimenti e categorie (stile della grafica approvata).
const has = (s, w) => (s || '').toLowerCase().includes(w)

export function accountVisual(a) {
  if (a.kind === 'finanziamento') {
    if (Number(a.tan) >= 10) return { icon: 'percent', chip: 'c-rosso' }
    if (has(a.name, 'mutuo')) return { icon: 'home', chip: 'c-viola' }
    if (has(a.name, 'auto')) return { icon: 'car', chip: 'c-teal' }
    return { icon: 'bank', chip: 'c-blu' }
  }
  if (a.kind === 'carta_revolv') return { icon: 'card', chip: a.sort_order % 2 ? 'c-arancio' : 'c-rosa' }
  if (has(a.name, 'risparm')) return { icon: 'piggy', chip: 'c-verde' }
  if (has(a.name, 'satispay')) return { icon: 'phone', chip: 'c-giallo' }
  if (has(a.name, 'comune')) return { icon: 'people', chip: 'c-viola' }
  if (has(a.name, 'rotativ')) return { icon: 'rotate', chip: 'c-teal' }
  return { icon: 'bank', chip: 'c-blu' }
}

export function kindVisual(kind) {
  if (kind === 'entrata') return { icon: 'up', chip: 'c-verde' }
  if (kind === 'giroconto') return { icon: 'swap', chip: 'c-blu' }
  return { icon: 'down', chip: 'c-rosso' }
}

const CHIPS = ['c-rosa', 'c-arancio', 'c-viola', 'c-verde', 'c-blu', 'c-teal', 'c-giallo', 'c-rosso']
export function categoryChip(root) {
  if (!root) return 'c-blu'
  let h = 0
  for (const ch of root.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return CHIPS[h % CHIPS.length]
}

export function accountSubtitle(a, balance) {
  if (a.kind === 'conto' && Number(a.overdraft) > 0) {
    return balance < 0 ? `Fido usato al ${Math.round((-balance / a.overdraft) * 100)}%` : `Fido di ${Math.round(a.overdraft).toLocaleString('it-IT')} €`
  }
  if (a.kind === 'carta_revolv' && Number(a.credit_limit) > 0) {
    return `${Math.round((Math.max(0, -balance) / a.credit_limit) * 100)}% del plafond`
  }
  if (a.kind === 'carta_revolv') return 'Carta'
  if (a.kind === 'finanziamento') return 'Finanziamento'
  return 'Conto'
}
