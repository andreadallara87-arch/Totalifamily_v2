import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'
import { CatIcon } from './CatChip.jsx'
import { CAT_ICONS, TINTS } from '../lib/catIcons.js'
import { buildCategory, categoryProblem, deleteCheck } from '../lib/categories.js'
import { deleteCategory, saveCategory } from '../lib/data.js'

const ICON_NAMES = Object.keys(CAT_ICONS)
const TINT_LABELS = { blu: 'Blu', verde: 'Verde', rosso: 'Rosso', viola: 'Viola', rosa: 'Rosa', giallo: 'Giallo', teal: 'Verde acqua', arancio: 'Arancio', none: 'Grigio' }
const budgetText = (v) => (v ? String(v).replace('.', ',') : '')

/**
 * Scheda per creare o modificare una categoria o sottocategoria.
 * cat: categoria esistente da modificare; preset: { kind, parentId } per una nuova.
 * allowKind: mostra la scelta Spesa/Entrata (solo dove ha senso, per esempio in Impostazioni).
 */
export default function CategoryEditor({ data, cat = null, preset = {}, allowKind = false, onClose, onSaved, onDeleted }) {
  const { categories, txs } = data
  const parentOf = (id) => categories.find((c) => c.id === id) || null
  const hasSubs = cat ? categories.some((c) => c.parent_id === cat.id) : false

  const [name, setName] = useState(cat?.name || '')
  const [kind, setKind] = useState(cat?.kind || preset.kind || 'spesa')
  const [parentId, setParentId] = useState(cat ? cat.parent_id || null : preset.parentId || null)
  const [symbol, setSymbol] = useState(cat?.symbol || (preset.parentId ? parentOf(preset.parentId)?.symbol : null) || 'tag')
  const [tint, setTint] = useState(() => {
    if (cat?.tint) return cat.tint
    const used = new Map(TINTS.map((t) => [t, 0]))
    for (const c of categories) if (!c.parent_id && used.has(c.tint)) used.set(c.tint, used.get(c.tint) + 1)
    return TINTS.filter((t) => t !== 'none').sort((a, b) => used.get(a) - used.get(b))[0]
  })
  const [budget, setBudget] = useState(budgetText(cat?.budget))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const nameRef = useRef(null)

  const parent = parentId ? parentOf(parentId) : null
  const k = parent ? parent.kind : kind
  const isRoot = !parent
  const shownTint = parent ? parent.tint || 'none' : tint
  const roots = useMemo(() => categories.filter((c) => !c.parent_id && c.kind === k && c.id !== cat?.id).sort((a, b) => a.name.localeCompare(b.name, 'it')), [categories, k, cat])
  const title = cat ? (cat.parent_id ? 'Modifica sottocategoria' : 'Modifica categoria') : parent ? `Nuova sottocategoria di ${parent.name}` : 'Nuova categoria'
  // Una nuova sottocategoria aperta da una categoria resta lì; per il resto si può scegliere dove metterla.
  const showParent = !hasSubs && !(!cat && preset.parentId)

  useEffect(() => {
    // Questa scheda può aprirsi sopra la schermata del movimento: i tasti non devono arrivare al tastierino dietro.
    function onKey(e) {
      e.stopPropagation()
      if (e.key === 'Escape') { e.preventDefault(); if (confirm) setConfirm(false); else onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey, true); document.body.style.overflow = prev }
  })
  useEffect(() => { if (!cat && window.matchMedia('(min-width: 861px)').matches) nameRef.current?.focus() }, [cat])

  async function save(e) {
    e?.preventDefault()
    if (busy) return
    const problem = categoryProblem({ id: cat?.id, name, kind: k, parentId, categories })
    if (problem) { setErr(problem + '.'); return }
    setBusy(true); setErr(null)
    try {
      const row = buildCategory({ id: cat?.id, name, kind: k, parentId, symbol, tint, budget, categories })
      onSaved(await saveCategory(cat?.id || null, row), !cat)
    } catch (e2) {
      setErr(`Non sono riuscito a salvare: ${e2?.message || 'errore sconosciuto'}.`)
      setBusy(false)
    }
  }
  function askDelete() {
    const check = deleteCheck(cat, categories, txs)
    if (!check.ok) { setErr(check.reason); return }
    setErr(null); setConfirm(true)
  }
  async function remove() {
    setBusy(true); setErr(null)
    try {
      await deleteCategory(cat.id)
      onDeleted(cat.id)
    } catch (e2) {
      setErr(`Non sono riuscito a eliminarla: ${e2?.message || 'errore sconosciuto'}.`)
      setBusy(false); setConfirm(false)
    }
  }

  return createPortal(
    <div className="ce-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="ce-scrim" onClick={onClose} />
      <form className="ce" onSubmit={save}>
        <div className="mv-grab" />
        <div className="ce-head">
          <h2>{title}</h2>
          <button type="button" className="hb sm" aria-label="Chiudi" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="ce-body">
          <div className="ce-name">
            <span className={`chip lg c-${shownTint}`} aria-hidden="true"><CatIcon name={symbol} size={24} /></span>
            <input ref={nameRef} type="text" aria-label="Nome" placeholder={parent ? 'Nome della sottocategoria' : 'Nome della categoria'} value={name} maxLength={40} autoComplete="off" enterKeyHint="done" onChange={(e) => { setName(e.target.value); setErr(null) }} />
          </div>

          {allowKind && !cat && !preset.parentId && (
            <div className="ce-row">
              <span className="lbl">Tipo</span>
              <div className="segs">
                {[['spesa', 'Spesa'], ['entrata', 'Entrata']].map(([v, l]) => <button key={v} type="button" className={kind === v ? 'seg on' : 'seg'} aria-pressed={kind === v} onClick={() => { setKind(v); setParentId(null) }}>{l}</button>)}
              </div>
            </div>
          )}

          {showParent && (
            <label className="ce-row">
              <span className="lbl">Dentro a</span>
              <select value={parentId || ''} onChange={(e) => { setParentId(e.target.value || null); setErr(null) }}>
                <option value="">Nessuna (categoria principale)</option>
                {roots.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          )}

          {isRoot ? (
            <div>
              <div className="lbl">Colore</div>
              <div className="ce-tints">
                {TINTS.map((t) => (
                  <button key={t} type="button" className={`ce-tint c-${t}${tint === t ? ' on' : ''}`} aria-label={TINT_LABELS[t]} aria-pressed={tint === t} title={TINT_LABELS[t]} onClick={() => setTint(t)}>
                    {tint === t && <Icon name="check" size={16} />}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="sb">Il colore è quello di {parent.name}.</div>
          )}

          <div>
            <div className="lbl">Icona</div>
            <div className="ce-icons">
              {ICON_NAMES.map((n) => (
                <button key={n} type="button" className={`ce-ic${symbol === n ? ` on c-${shownTint}` : ''}`} aria-label={n} aria-pressed={symbol === n} onClick={() => setSymbol(n)}>
                  <CatIcon name={n} size={20} />
                </button>
              ))}
            </div>
          </div>

          {k === 'spesa' && (
            <label className="ce-row">
              <span className="lbl">Budget al mese</span>
              <span className="ce-money"><input type="text" inputMode="decimal" placeholder="Nessuno" value={budget} onChange={(e) => setBudget(e.target.value)} />€</span>
            </label>
          )}
        </div>

        {err && <div className="mv-hint err ce-err" role="alert"><Icon name="alert" size={15} /><span>{err}</span></div>}
        {confirm ? (
          <div className="ce-foot">
            <span className="ce-q">Eliminare {cat.name}?</span>
            <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>Annulla</button>
            <button type="button" className="mv-danger ce-dbtn" disabled={busy} onClick={remove}><Icon name="trash" size={18} />{busy ? 'Elimino…' : 'Elimina'}</button>
          </div>
        ) : (
          <div className="ce-foot">
            {cat && <button type="button" className="hb ce-trash" aria-label="Elimina la categoria" title="Elimina" onClick={askDelete}><Icon name="trash" /></button>}
            <button type="submit" className="btn ce-save" disabled={busy}><Icon name="check" size={18} />{busy ? 'Salvo…' : cat ? 'Salva le modifiche' : 'Crea'}</button>
          </div>
        )}
      </form>
    </div>,
    document.body,
  )
}
