import { useState } from 'react'
import Icon from './Icon.jsx'
import { euro, dayMonth, monthName } from '../lib/format.js'
import { lastDayOfMonth } from '../lib/calc.js'

const whole = (v) => euro(v, { decimals: false })

/** Limite delle spese vive: si cambia con meno e più (50 € alla volta) o scrivendolo. */
export function LimitEditor({ value, onSave, onCancel, busy }) {
  const [v, setV] = useState(String(value))
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'))
  const ok = n > 0 && Number.isFinite(n)
  const step = (d) => setV(String(Math.max(50, (Math.round((ok ? n : value) / 50) + d) * 50)))
  return (
    <form className="vv-edit" onSubmit={(e) => { e.preventDefault(); if (ok) onSave(Math.round(n)) }}>
      <div className="sb">Limite al mese per le spese vive</div>
      <div className="vv-edit-row">
        <div className="fl-pay" role="group" aria-label="Limite al mese">
          <button type="button" aria-label="50 € in meno" onClick={() => step(-1)}>−</button>
          <label><input type="text" inputMode="numeric" aria-label="Limite al mese" style={{ width: `${Math.max(4, v.length) + 0.4}ch` }} value={v} autoFocus onChange={(e) => setV(e.target.value)} /><span>€</span></label>
          <button type="button" aria-label="50 € in più" onClick={() => step(1)}>+</button>
        </div>
        <button type="button" className="btn small ghost" onClick={onCancel}>Annulla</button>
        <button type="submit" className="btn small" disabled={!ok || busy}>Salva</button>
      </div>
    </form>
  )
}

/**
 * Riquadro principale della Home: le spese vive del mese contro il limite.
 * `flow` (solo sul telefono): fino a quando e quanto si può ancora spendere col conto, dalla pagina Flusso di cassa.
 */
export default function LiveCard({ live, flow, go, onLimit, wide }) {
  const [ed, setEd] = useState(false)
  const [busy, setBusy] = useState(false)
  const mName = monthName(Number(live.month.slice(5, 7)))
  const over = live.left < 0
  const lastDay = lastDayOfMonth(live.month)
  const fill = Math.min(1, live.share)
  const tone = over ? 'over' : live.share >= 0.85 ? 'near' : ''

  async function save(v) {
    setBusy(true)
    try { await onLimit(v); setEd(false) } finally { setBusy(false) }
  }

  return (
    <section className={`card vv${wide ? ' wide' : ''}`}>
      <div className="vv-main">
        <div className="vv-head">
          <span className="mute">Spese vive di {mName}</span>
          {!ed && <button type="button" className="hb vv-pen" aria-label="Cambia il limite" title="Cambia il limite" onClick={() => setEd(true)}><Icon name="pen" size={16} /></button>}
        </div>
        <div className="vv-num">
          <span className={`vv-big${over ? ' warn' : ''}`}>{whole(live.spent)}</span>
          <span className="vv-of">di {whole(live.limit)}</span>
        </div>
        <div className={`vv-track ${tone}`}><i style={{ width: `${fill * 100}%` }} /></div>
        {ed ? (
          <LimitEditor value={live.limit} busy={busy} onSave={save} onCancel={() => setEd(false)} />
        ) : (
          <div className="vv-lead">
            {over
              ? <>Hai superato il limite di <b className="warn">{whole(-live.left)}</b>.</>
              : <>Ti restano <b>{whole(live.left)}</b> fino al {lastDay} {mName}{live.perDay > 0 ? <>, circa {whole(live.perDay)} al giorno</> : ''}.</>}
          </div>
        )}
        <div className="sb vv-note">Tutte le spese, su conti e carte, tranne interessi e commissioni ({whole(live.financial)} a parte).</div>
      </div>
      {flow && (
        <a className="vv-flow" href="#/flusso" onClick={(e) => { e.preventDefault(); go('flusso') }}>
          <span className={`chip ${flow.short ? 'c-rosso' : 'c-blu'}`}><Icon name={flow.short ? 'alert' : 'trend'} /></span>
          <span className="txt">
            {flow.short ? (
              <><span className="nm">Mancano {whole(flow.short.amount)} per restare nel fido</span><span className="sb">dal {dayMonth(flow.short.date)}, con gli impegni già certi</span></>
            ) : (
              <><span className="nm">Fino al {dayMonth(flow.windows[0].until)} puoi spendere {whole(Math.max(0, flow.windows[0].amount))}</span><span className="sb">flusso di cassa: stipendio, rate e carte già calcolati</span></>
            )}
          </span>
          <Icon name="right" size={18} style={{ color: 'var(--mute)', flex: 'none' }} />
        </a>
      )}
    </section>
  )
}
