import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'
import { buildCard, cardForm, cardProblem } from '../lib/cards.js'
import { updateAccount } from '../lib/data.js'
import { accountVisual } from '../lib/visual.js'

/**
 * Scheda con i dati di una carta che servono al flusso di cassa: chiusura dell'estratto conto,
 * giorno di addebito e, per le carte che si pagano a saldo, piano a rate e bollo.
 */
export default function CardSettings({ account, onClose, onSaved }) {
  const [f, setF] = useState(() => cardForm(account))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const saldo = !(Number(account.tan) > 0)
  const v = accountVisual(account)
  const set = (patch) => { setF((o) => ({ ...o, ...patch })); setErr(null) }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  async function save(e) {
    e.preventDefault()
    if (busy) return
    const problem = cardProblem(f)
    if (problem) { setErr(problem + '.'); return }
    setBusy(true); setErr(null)
    try {
      onSaved(await updateAccount(account.id, buildCard(f)))
    } catch (e2) {
      setErr(`Non sono riuscito a salvare: ${e2?.message || 'errore sconosciuto'}.`)
      setBusy(false)
    }
  }

  const day = (key, label) => (
    <span className="ce-money cs-day">giorno<input type="text" inputMode="numeric" maxLength={2} aria-label={label} placeholder="–" value={f[key]} onChange={(e) => set({ [key]: e.target.value.replace(/\D/g, '') })} /></span>
  )
  const money = (key, label) => (
    <span className="ce-money"><input type="text" inputMode="decimal" aria-label={label} placeholder="Nessuno" value={f[key]} onChange={(e) => set({ [key]: e.target.value })} />€</span>
  )

  return createPortal(
    <div className="ce-wrap" role="dialog" aria-modal="true" aria-label={`Carta ${account.name}`}>
      <div className="ce-scrim" onClick={onClose} />
      <form className="ce" onSubmit={save}>
        <div className="mv-grab" />
        <div className="ce-head">
          <span className={`chip sm ${v.chip}`} aria-hidden="true"><Icon name={v.icon} size={17} /></span>
          <h2>{account.name}</h2>
          <button type="button" className="hb sm" aria-label="Chiudi" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="ce-body">
          <div className="sb">Servono al flusso di cassa per sapere quando e quanto la carta addebita sul conto.</div>
          <label className="ce-row"><span className="cs-l">Chiusura dell'estratto conto<small>31 vuol dire fine mese</small></span>{day('statementDay', "Giorno di chiusura dell'estratto conto")}</label>
          <label className="ce-row"><span className="cs-l">Addebito sul conto</span>{day('debitDay', 'Giorno di addebito sul conto')}</label>
          {saldo ? (
            <>
              <div className="lbl cs-sec">Piano a rate sulla carta</div>
              <label className="ce-row"><span className="cs-l">Rata al mese<small>commissione compresa</small></span>{money('planAmount', 'Rata al mese del piano')}</label>
              <label className="ce-row"><span className="cs-l">Ultimo estratto conto con la rata</span><input className="cs-month" type="month" aria-label="Ultimo estratto conto con la rata" value={f.planUntil} onChange={(e) => set({ planUntil: e.target.value })} /></label>
              <div className="lbl cs-sec">Costi fissi</div>
              <label className="ce-row"><span className="cs-l">Bollo sull'estratto conto<small>solo sopra 77,47 €</small></span>{money('fee', "Bollo sull'estratto conto")}</label>
            </>
          ) : (
            <div className="sb">Quanto rimborsare ogni mese lo scegli nella pagina Flusso di cassa.</div>
          )}
        </div>
        {err && <div className="mv-hint err ce-err" role="alert"><Icon name="alert" size={15} /><span>{err}</span></div>}
        <div className="ce-foot">
          <button type="submit" className="btn ce-save" disabled={busy}><Icon name="check" size={18} />{busy ? 'Salvo…' : 'Salva'}</button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
