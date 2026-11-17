import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { dropIndex, hideBlock, moveBlock, showBlock, visibleBlocks } from '../lib/homeLayout.js'

const HOLD_MS = 500
const SLOP = 10
const GAP = 10

/**
 * Home del telefono: i riquadri nell'ordine scelto. Tenendo premuto su un riquadro si entra in modifica,
 * come sulla schermata dell'iPhone: i riquadri tremano, hanno la X in alto a destra e si spostano trascinandoli.
 */
export default function PhoneHome({ blocks, meta, layout, onLayout, top }) {
  const [editing, setEditing] = useState(false)
  const [drag, setDrag] = useState(null)
  const [settle, setSettle] = useState(false)
  const hold = useRef(null)
  const swallowClick = useRef(false)
  const listRef = useRef(null)

  const vis = visibleBlocks(layout)

  const startEdit = () => {
    setEditing(true)
    try { navigator.vibrate?.(15) } catch { /* non disponibile */ }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Pressione lunga su un riquadro: annullata se il dito si muove (sta scorrendo la pagina).
  const holdDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const x = e.clientX
    const y = e.clientY
    clearTimeout(hold.current?.t)
    hold.current = { x, y, t: setTimeout(() => { swallowClick.current = true; hold.current = null; startEdit() }, HOLD_MS) }
  }
  const holdMove = (e) => {
    const h = hold.current
    if (h && (Math.abs(e.clientX - h.x) > SLOP || Math.abs(e.clientY - h.y) > SLOP)) { clearTimeout(h.t); hold.current = null }
  }
  const holdEnd = () => { if (hold.current) { clearTimeout(hold.current.t); hold.current = null } }
  // Lasciando il dito dopo la pressione lunga non si deve aprire la riga sotto il dito.
  const clickCapture = (e) => {
    if (swallowClick.current) { e.preventDefault(); e.stopPropagation(); swallowClick.current = false }
  }
  useEffect(() => () => clearTimeout(hold.current?.t), [])

  // Trascinamento in modifica.
  const dragDown = (e, id, from) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const slot = e.currentTarget.offsetHeight + GAP
    setDrag({ id, from, y0: e.clientY, dy: 0, slot, pid: e.pointerId })
  }
  const dragMove = (e) => {
    if (!drag || e.pointerId !== drag.pid) return
    setDrag({ ...drag, dy: e.clientY - drag.y0 })
  }
  const dragEnd = (e) => {
    if (!drag || e.pointerId !== drag.pid) return
    const to = dropIndex(drag.from, drag.dy, drag.slot, vis.length)
    setSettle(true)
    setDrag(null)
    if (to !== drag.from) onLayout(moveBlock(layout, drag.id, to))
    requestAnimationFrame(() => requestAnimationFrame(() => setSettle(false)))
  }
  const target = drag ? dropIndex(drag.from, drag.dy, drag.slot, vis.length) : -1
  const shift = (i) => {
    if (!drag) return 0
    if (i === drag.from) return drag.dy
    if (drag.from < target && i > drag.from && i <= target) return -drag.slot
    if (drag.from > target && i >= target && i < drag.from) return drag.slot
    return 0
  }

  if (editing) {
    return (
      <div className="hedit">
        <div className="hedit-top">
          <div style={{ minWidth: 0 }}>
            <h2 className="h">Modifica la Home</h2>
            <div className="sb">Trascina i riquadri per spostarli, tocca la X per toglierli</div>
          </div>
          <button type="button" className="btn small" onClick={() => setEditing(false)}>Fine</button>
        </div>
        <div className={`hedit-list${drag ? ' dragging' : ''}${settle ? ' settle' : ''}`} ref={listRef}>
          {vis.length === 0 && <div className="empty">Nessun riquadro nella Home. Rimettili da qui sotto.</div>}
          {vis.map((id, i) => {
            const m = meta[id]
            const lifted = drag?.id === id
            return (
              <div
                key={id}
                className={`card htile${lifted ? ' lifted' : ''}`}
                style={{ transform: `translateY(${shift(i)}px)${lifted ? ' scale(1.03)' : ''}`, animationDelay: `${(i % 3) * -0.09}s` }}
                onPointerDown={(e) => dragDown(e, id, i)}
                onPointerMove={dragMove}
                onPointerUp={dragEnd}
                onPointerCancel={dragEnd}
                onContextMenu={(e) => e.preventDefault()}
              >
                <div className={`chip ${m.chip}`}><Icon name={m.icon} /></div>
                <div className="txt"><div className="nm">{m.title}</div><div className="sb">{m.sub}</div></div>
                <Icon name="list" size={20} style={{ color: 'var(--mute)', flex: 'none' }} />
                <button
                  type="button"
                  className="hx"
                  aria-label={`Togli ${m.title} dalla Home`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onLayout(hideBlock(layout, id))}
                >
                  <Icon name="close" size={14} style={{ strokeWidth: 3 }} />
                </button>
              </div>
            )
          })}
        </div>
        {layout.hidden.length > 0 && (
          <section className="card pad">
            <h2 className="h">Riquadri tolti</h2>
            <div className="sb" style={{ marginBottom: 4 }}>Tocca + per rimetterli in fondo alla Home</div>
            {layout.order.filter((id) => layout.hidden.includes(id)).map((id) => {
              const m = meta[id]
              return (
                <div className="row" key={id}>
                  <div className={`chip ${m.chip}`}><Icon name={m.icon} /></div>
                  <div className="txt" style={{ flex: 1 }}><div className="nm">{m.title}</div><div className="sb">{m.sub}</div></div>
                  <button type="button" className="hadd" aria-label={`Rimetti ${m.title}`} onClick={() => onLayout(showBlock(layout, id))}><Icon name="plus" size={18} /></button>
                </div>
              )
            })}
          </section>
        )}
      </div>
    )
  }

  return (
    <>
      {top}
      {vis.map((id) => (
        <div
          key={id}
          className="hblk"
          onPointerDown={holdDown}
          onPointerMove={holdMove}
          onPointerUp={holdEnd}
          onPointerCancel={holdEnd}
          onPointerLeave={holdEnd}
          onClickCapture={clickCapture}
          onContextMenu={(e) => e.preventDefault()}
        >
          {blocks[id]}
        </div>
      ))}
      <button type="button" className="hedit-open" onClick={startEdit}><Icon name="grid" size={16} />Modifica la Home</button>
    </>
  )
}
