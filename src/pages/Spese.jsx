import { useEffect, useState } from 'react'
import Andamento from './Andamento.jsx'
import Categorie from './Categorie.jsx'

const VIEWS = [
  ['vive', 'Mese per mese'],
  ['categorie', 'Per categoria'],
]

// Vista scelta dall'indirizzo: il vecchio indirizzo #/categorie porta alla vista per categoria.
function viewFromHash() {
  const h = window.location.hash
  if (h.startsWith('#/categorie')) return 'categorie'
  const v = new URLSearchParams(h.split('?')[1] || '').get('vista')
  return VIEWS.some(([id]) => id === v) ? v : 'vive'
}

/** Spese: le spese vive mese per mese contro il limite, oppure per categoria con i budget. */
export default function Spese(props) {
  const [view, setView] = useState(viewFromHash)
  useEffect(() => {
    const on = () => setView(viewFromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const pick = (id) => { window.location.hash = id === 'vive' ? '/spese' : `/spese?vista=${id}` }
  return (
    <>
      <div className="segs an-tabs" role="tablist" aria-label="Vista">
        {VIEWS.map(([id, l]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? 'seg on' : 'seg'} onClick={() => pick(id)}>{l}</button>
        ))}
      </div>
      {view === 'vive' && <Andamento part="vive" {...props} />}
      {view === 'categorie' && <Categorie {...props} />}
    </>
  )
}
