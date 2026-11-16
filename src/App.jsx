import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './components/Icon.jsx'
import Home from './pages/Home.jsx'
import Movimenti from './pages/Movimenti.jsx'
import Categorie from './pages/Categorie.jsx'
import Flusso from './pages/Flusso.jsx'
import Conti from './pages/Conti.jsx'
import Impostazioni, { AppearancePicker } from './pages/Impostazioni.jsx'
import Login from './pages/Login.jsx'
import NewMovement from './components/NewMovement.jsx'
import CardSettings from './components/CardSettings.jsx'
import { supabase } from './lib/supabase.js'
import { loadAll, restoreTransaction, saveAppearance } from './lib/data.js'
import { apply, readLocal } from './lib/appearance.js'
import { todayRome } from './lib/calc.js'
import { insertByDate, replaceTx } from './lib/entry.js'
import { upsertCategory } from './lib/categories.js'
import { dayLong } from './lib/format.js'

const PAGES = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'movimenti', label: 'Movimenti', icon: 'list' },
  { id: 'categorie', label: 'Categorie', icon: 'pie', desktopOnly: true },
  { id: 'flusso', label: 'Flusso di cassa', icon: 'trend', desktopOnly: true },
  { id: 'conti', label: 'Conti e carte', short: 'Conti', icon: 'card' },
  { id: 'impostazioni', label: 'Impostazioni', icon: 'settings' },
]
const TABS = PAGES.filter((p) => !p.desktopOnly)
const TITLES = { movimenti: 'Movimenti', categorie: 'Spese per categoria', flusso: 'Flusso di cassa', conti: 'Conti e carte', impostazioni: 'Impostazioni' }

const routeFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  return PAGES.some((p) => p.id === id) ? id : 'home'
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('it-IT', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Rome' }).format(new Date()))
  return h < 5 ? 'Buonanotte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [recovery, setRecovery] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(routeFromHash())
  const [look, setLookState] = useState(readLocal())
  const [sheet, setSheet] = useState(false)
  const [toast, setToast] = useState(null)
  const [entry, setEntry] = useState(null)
  const [cardEd, setCardEd] = useState(null)
  const toastTimer = useRef(null)
  const today = todayRome()

  useEffect(() => { apply(look) }, [look])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: d }) => setSession(d.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
    })
    const onHash = () => setPage(routeFromHash())
    // Il tasto "indietro" del telefono chiude la schermata del nuovo movimento invece di uscire dall'app.
    const onPop = () => setEntry(null)
    window.addEventListener('hashchange', onHash)
    window.addEventListener('popstate', onPop)
    return () => { sub.subscription.unsubscribe(); window.removeEventListener('hashchange', onHash); window.removeEventListener('popstate', onPop) }
  }, [])

  const userId = session?.user?.id
  useEffect(() => {
    if (!userId) { setData(null); return }
    let alive = true
    loadAll()
      .then((d) => {
        if (!alive) return
        setData(d)
        if (d.settings) setLookState({ theme: d.settings.theme, accent: d.settings.accent })
      })
      .catch((e) => alive && setError(e.message || String(e)))
    return () => { alive = false }
  }, [userId])

  const setLook = useCallback((patch) => {
    setLookState((cur) => {
      const next = { ...cur, ...patch }
      saveAppearance(next)
      return next
    })
  }, [])

  const go = (id) => { window.location.hash = id === 'home' ? '/' : `/${id}`; setSheet(false); window.scrollTo(0, 0) }
  const showToast = (text, action = null) => {
    setToast({ text, action })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), action ? 7000 : 3500)
  }
  const openEntry = (next) => {
    if (!data || entry) return
    setSheet(false)
    setEntry(next)
    window.history.pushState({ nuovo: true }, '')
  }
  const openNew = (kind = 'spesa') => openEntry({ kind })
  const openEdit = (tx) => openEntry({ kind: tx.kind, tx })
  const closeNew = () => {
    if (window.history.state?.nuovo) window.history.back()
    else setEntry(null)
  }
  const onSaved = (row, message) => {
    const edited = !!entry?.tx
    setData((d) => ({ ...d, txs: edited ? replaceTx(d.txs, row) : insertByDate(d.txs, row) }))
    closeNew()
    showToast(message)
  }
  // Movimento salvato da una pagina (non dalla schermata del nuovo movimento): per esempio il rimborso di una carta.
  const onTxSaved = (row, message, edited) => {
    setData((d) => ({ ...d, txs: edited ? replaceTx(d.txs, row) : insertByDate(d.txs, row) }))
    showToast(message)
  }
  const onAccountSaved = (acc) => {
    setData((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === acc.id ? acc : a)) }))
    setCardEd(null)
    showToast(`Dati di ${acc.name} salvati.`)
  }
  const onCategorySaved = (cat, created) => {
    setData((d) => ({ ...d, categories: upsertCategory(d.categories, cat) }))
    showToast(created ? `Categoria ${cat.name} creata.` : 'Categoria salvata.')
  }
  const onCategoryDeleted = (id) => {
    setData((d) => ({ ...d, categories: d.categories.filter((c) => c.id !== id) }))
    showToast('Categoria eliminata.')
  }
  const onDeleted = (full) => {
    setData((d) => ({ ...d, txs: d.txs.filter((t) => t.id !== full.id) }))
    closeNew()
    showToast('Movimento eliminato.', {
      label: 'Annulla',
      run: async () => {
        setToast(null)
        try {
          const row = await restoreTransaction(full)
          setData((d) => ({ ...d, txs: insertByDate(d.txs.filter((t) => t.id !== row.id), row) }))
          showToast('Movimento ripristinato.')
        } catch (e) {
          showToast(`Non sono riuscito a ripristinarlo: ${e?.message || 'errore sconosciuto'}.`)
        }
      },
    })
  }

  if (session === undefined) return null
  if (!session || recovery) return <Login recovery={recovery} onRecovered={() => setRecovery(false)} />

  const name = session.user.user_metadata?.name || ''
  const initial = (name || session.user.email || '?').charAt(0).toUpperCase()

  let content
  if (error) content = <section className="card pad"><h2 className="h">Non riesco a leggere i dati</h2><div className="sb">{error}</div></section>
  else if (!data) content = <section className="card pad"><div className="sb">Carico i tuoi dati…</div></section>
  else if (page === 'movimenti') content = <Movimenti data={data} today={today} onEdit={openEdit} />
  else if (page === 'categorie') content = <Categorie data={data} today={today} onEdit={openEdit} />
  else if (page === 'flusso') content = <Flusso data={data} today={today} onTxSaved={onTxSaved} onDeleted={onDeleted} onEditCard={setCardEd} />
  else if (page === 'conti') content = <Conti data={data} today={today} onEditCard={setCardEd} />
  else if (page === 'impostazioni') content = <Impostazioni data={data} session={session} look={look} setLook={setLook} onCategorySaved={onCategorySaved} onCategoryDeleted={onCategoryDeleted} />
  else content = <Home data={data} today={today} go={go} onNew={openNew} onEdit={openEdit} />

  return (
    <>
      <div className="glow a" /><div className="glow b" />
      <div className="shell">
        <aside className="card side">
          <div className="brand"><div className="logo">T</div><div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>Totalifamily</div></div>
          {PAGES.map((p) => (
            <a key={p.id} className={`navi${page === p.id ? ' on' : ''}`} href={p.id === 'home' ? '#/' : `#/${p.id}`} aria-current={page === p.id ? 'page' : undefined}>
              <Icon name={p.icon} />{p.label}
            </a>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 8px 4px' }}>
            <div className="avatar">{initial}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, lineHeight: '18px' }}>{name || 'Il mio account'}</div>
              <a href="#/impostazioni" className="sb" style={{ textDecoration: 'none' }}>Impostazioni</a>
            </div>
          </div>
        </aside>

        <main className="main">
          <header className="top">
            <div style={{ flex: 1, minWidth: 220 }}>
              <h1>{page === 'home' ? `${greeting()}${name ? `, ${name}` : ''}` : TITLES[page]}</h1>
              <div className="mute" style={{ fontSize: 14, lineHeight: '20px' }}>{dayLong(today)}</div>
            </div>
            <div className="card" style={{ height: 44, borderRadius: 22, display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px' }}>
              <button type="button" className={`seg${look.theme === 'scuro' ? ' on' : ''}`} style={{ width: 34, height: 32, borderRadius: 16, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Tema scuro" aria-pressed={look.theme === 'scuro'} onClick={() => setLook({ theme: 'scuro' })}><Icon name="moon" size={18} /></button>
              <button type="button" className={`seg${look.theme === 'chiaro' ? ' on' : ''}`} style={{ width: 34, height: 32, borderRadius: 16, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Tema chiaro" aria-pressed={look.theme === 'chiaro'} onClick={() => setLook({ theme: 'chiaro' })}><Icon name="sun" size={18} /></button>
              <div style={{ position: 'relative' }}>
                <button type="button" className="seg" style={{ height: 32, borderRadius: 16, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px' }} aria-expanded={sheet} onClick={() => setSheet(!sheet)}>
                  <span className="palette-dot" />Colore
                </button>
                {sheet && <div className="sheet"><AppearancePicker look={look} setLook={setLook} /></div>}
              </div>
            </div>
            <button type="button" className="btn" style={{ height: 44, borderRadius: 22, padding: '0 20px 0 14px' }} disabled={!data} onClick={() => openNew('spesa')}><Icon name="plus" />Nuovo movimento</button>
          </header>

          <header className="mtop">
            <div className="avatar" style={{ width: 40, height: 40 }}>{initial}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, lineHeight: '16px', color: 'var(--mute)' }}>{dayLong(today)}</div>
              <div style={{ fontSize: 17, lineHeight: '22px', fontWeight: 700 }}>{page === 'home' ? `Ciao${name ? `, ${name}` : ''}` : TITLES[page]}</div>
            </div>
            <button type="button" className="hb" aria-label={look.theme === 'scuro' ? 'Passa al tema chiaro' : 'Passa al tema scuro'} onClick={() => setLook({ theme: look.theme === 'scuro' ? 'chiaro' : 'scuro' })}>
              <Icon name={look.theme === 'scuro' ? 'sun' : 'moon'} />
            </button>
            <button type="button" className="hb" aria-label="Scegli il colore" aria-expanded={sheet} onClick={() => setSheet(!sheet)}><span className="palette-dot" /></button>
            {sheet && <div className="sheet mob-sheet"><div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Aspetto</div><AppearancePicker look={look} setLook={setLook} /></div>}
          </header>

          {content}
        </main>
      </div>

      <nav className="tabbar" aria-label="Sezioni">
        {TABS.slice(0, 2).map((p) => (
          <a key={p.id} className={`tab${page === p.id ? ' on' : ''}`} href={p.id === 'home' ? '#/' : `#/${p.id}`}><Icon name={p.icon} />{p.short || p.label}</a>
        ))}
        <button type="button" className="fab" aria-label="Nuovo movimento" disabled={!data} onClick={() => openNew('spesa')}><Icon name="plus" size={24} style={{ strokeWidth: 2.4 }} /></button>
        {TABS.slice(2).map((p) => (
          <a key={p.id} className={`tab${page === p.id ? ' on' : ''}`} href={`#/${p.id}`}><Icon name={p.icon} />{p.short || p.label}</a>
        ))}
      </nav>
      {entry && data && <NewMovement key={entry.tx?.id || 'nuovo'} data={data} today={today} initialKind={entry.kind} tx={entry.tx} onClose={closeNew} onSaved={onSaved} onDeleted={onDeleted} onCategorySaved={onCategorySaved} />}
      {cardEd && data && <CardSettings key={cardEd.id} account={cardEd} onClose={() => setCardEd(null)} onSaved={onAccountSaved} />}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.action && <button type="button" className="toast-act" onClick={toast.action.run}>{toast.action.label}</button>}
        </div>
      )}
    </>
  )
}
