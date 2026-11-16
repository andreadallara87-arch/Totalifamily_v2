// Regole per creare, modificare ed eliminare categorie e sottocategorie.

const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ')

/** Cosa manca o non va per salvare, oppure null. */
export function categoryProblem({ id = null, name, kind, parentId = null, categories }) {
  const n = norm(name)
  if (!n) return 'Scrivi il nome'
  if (n.length > 40) return 'Il nome è troppo lungo'
  const parent = parentId ? categories.find((c) => c.id === parentId) : null
  const k = parent ? parent.kind : kind
  const twin = categories.find((c) => c.id !== id && c.kind === k && (c.parent_id || null) === (parentId || null) && norm(c.name).toLowerCase() === n.toLowerCase())
  if (twin) return parent ? `In ${parent.name} c'è già ${twin.name}` : `La categoria ${twin.name} esiste già`
  return null
}

/** Importo del budget scritto a mano ("120,50" → 120.5), null se vuoto o non valido. */
export function parseBudget(text) {
  let t = String(text || '').trim().replace(/[€\s]/g, '')
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '')
  const v = Number.parseFloat(t)
  return Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null
}

/** Riga per la tabella categories. Le sottocategorie prendono tipo dalla categoria principale e non hanno un colore proprio. */
export function buildCategory({ id = null, name, kind, parentId = null, symbol, tint, budget, categories }) {
  const parent = parentId ? categories.find((c) => c.id === parentId) : null
  const row = {
    name: norm(name),
    kind: parent ? parent.kind : kind,
    parent_id: parent ? parent.id : null,
    symbol: symbol || 'ellipsis',
    tint: parent ? null : tint || 'none',
    budget: (parent ? parent.kind : kind) === 'spesa' ? parseBudget(budget) : null,
  }
  const old = id ? categories.find((c) => c.id === id) : null
  if (!old || (old.parent_id || null) !== row.parent_id) {
    const siblings = categories.filter((c) => c.id !== id && c.kind === row.kind && (c.parent_id || null) === row.parent_id)
    row.sort_order = siblings.reduce((m, c) => Math.max(m, Number(c.sort_order) || 0), -1) + 1
  }
  return row
}

/** Si può eliminare solo una categoria senza sottocategorie e senza movimenti, così nessun dato si perde. */
export function deleteCheck(cat, categories, txs) {
  const subs = categories.filter((c) => c.parent_id === cat.id).length
  if (subs) return { ok: false, reason: `Ha ${subs} ${subs === 1 ? 'sottocategoria' : 'sottocategorie'}: eliminale o spostale prima.` }
  const used = txs.filter((t) => t.category_id === cat.id).length
  if (used) return { ok: false, reason: `La usano ${used} ${used === 1 ? 'movimento' : 'movimenti'}: per eliminarla, spostali prima in un'altra categoria.` }
  return { ok: true, reason: null }
}

/** Inserisce o sostituisce una categoria nell'elenco caricato dall'app. */
export function upsertCategory(categories, cat) {
  return categories.some((c) => c.id === cat.id) ? categories.map((c) => (c.id === cat.id ? cat : c)) : [...categories, cat]
}
