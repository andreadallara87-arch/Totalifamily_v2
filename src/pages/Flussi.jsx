import { useEffect, useState } from 'react'
import Flusso from './Flusso.jsx'
import Andamento from './Andamento.jsx'
import Categorie from './Categorie.jsx'

const VIEWS = [
  ['flusso', 'Flusso di cassa'],
  ['vive', 'Spese vive'],
  ['categorie', 'Per categoria'],
]

// Vista scelta dall'indirizzo: i vecchi indirizzi (#/flusso, #/andamento, #/categorie) portano alla vista giusta.
function viewFromHash() {
  const h = window.location.hash
  if (h.startsWith('#/andamento')) return 'vive'
  if (h.startsWith('#/categorie')) return 'categorie'
  const v = new URLSearchParams(h.split('?')[1] || '').get('vista')
  return VIEWS.some(([id]) => id === v) ? v : 'flusso'
}

/** Flussi e report: flusso di cassa, spese vive mese per mese e spese per categoria. */
export default function Flussi(props) {
  const [view, setView] = useState(viewFromHash)
  useEffect(() => {
    const on = () => setView(viewFromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const pick = (id) => { window.location.hash = id === 'flusso' ? '/flussi' : `/flussi?vista=${id}` }
  return (
    <>
      <div className="segs an-tabs" role="tablist" aria-label="Vista">
        {VIEWS.map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? 'seg on' : 'seg'} onClick={() => pick(id)}>{l}</button>
        ))}
      </div>
      {view === 'flusso' && <Flusso {...props} />}
      {view === 'vive' && <Andamento part="vive" {...props} />}
      {view === 'categorie' && <Categorie {...props} />}
    </>
  )
}
