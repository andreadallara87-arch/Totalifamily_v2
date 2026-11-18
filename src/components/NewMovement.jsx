import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon.jsx'
import CatChip from './CatChip.jsx'
import CategoryEditor from './CategoryEditor.jsx'
import { addDays, addMonths, balancesAt, fromCents } from '../lib/calc.js'
import { euro } from '../lib/format.js'
import { accountVisual } from '../lib/visual.js'
import useWide from '../lib/useWide.js'
import { addTransaction, deleteTransaction, updateTransaction } from '../lib/data.js'
import { amountValue, buildTransaction, formFromTx, frequentCategories, frequentPairs, missingField, pressKey, savedMessage, usualAccount } from '../lib/entry.js'

const KINDS = [['spesa', 'Spesa'], ['entrata', 'Entrata'], ['giroconto', 'Giroconto']]
const GROUPS = [['conto', 'Conti'], ['carta_revolv', 'Carte'], ['finanziamento', 'Finanziamenti']]
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del']
const WD = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
const WDL = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']
const MS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const ML = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const nf2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })
const nf0 = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0, useGrouping: 'always' })
const dt = (s) => new Date(`${s}T00:00:00Z`)
const daysFrom = (a, b) => Math.round((dt(a) - dt(b)) / 864e5)

function dateShort(s, today) {
  const d = dt(s), k = daysFrom(s, today)
  const base = `${d.getUTCDate()} ${MS[d.getUTCMonth()]}` + (s.slice(0, 4) !== today.slice(0, 4) ? ` ${s.slice(0, 4)}` : '')
  if (k === 0) return `Oggi, ${base}`
  if (k === -1) return `Ieri, ${base}`
  if (k === 1) return `Domani, ${base}`
  return `${WD[d.getUTCDay()]} ${base}`
}
export function dateWords(s, today) {
  const d = dt(s), k = daysFrom(s, today)
  if (k === 0) return 'oggi'
  if (k === -1) return 'ieri'
  if (k === 1) return 'domani'
  return `${WDL[d.getUTCDay()]} ${d.getUTCDate()} ${ML[d.getUTCMonth()]}`
}

function AccChip({ a, size = '' }) {
  const v = accountVisual(a)
  return <span className={`chip ${size} ${v.chip}`} aria-hidden="true"><Icon name={v.icon} size={size === 'sm' ? 17 : 20} /></span>
}

/** Schermata per inserire un movimento nuovo o, se riceve `tx`, per modificarlo o eliminarlo. */
export default function NewMovement({ data, today, initialKind = 'spesa', tx = null, preset = null, onClose, onSaved, onDeleted, onCategorySaved }) {
  const wide = useWide()
  const editing = !!tx
  const { accounts, categories, txs, settings } = data

  const ctx = useMemo(() => {
    // Un conto archiviato resta visibile solo se è quello del movimento che si sta modificando.
    const accs = accounts.filter((a) => !a.archived || (tx && (a.id === tx.account_id || a.id === tx.to_account_id)))
    const accById = new Map(accs.map((a) => [a.id, a]))
    const catById = new Map(categories.map((c) => [c.id, c]))
    const isOther = (c) => c.symbol === 'ellipsis' || c.symbol === 'circle-plus'
    const roots = (kind) => categories.filter((c) => !c.parent_id && c.kind === kind).sort((a, b) => isOther(a) - isOther(b) || a.sort_order - b.sort_order)
    const subsOf = (id) => categories.filter((c) => c.parent_id === id).sort((a, b) => a.sort_order - b.sort_order)
    const rootOf = (id) => { const c = catById.get(id); return c && c.parent_id ? catById.get(c.parent_id) : c }
    const bal = balancesAt(accounts, txs, today)
    const mainId = accById.has(settings?.main_account_id) ? settings.main_account_id : accs.find((a) => a.kind === 'conto')?.id
    return { accs, accById, catById, roots, subsOf, rootOf, balance: (id) => fromCents(bal.get(id) || 0), mainId }
  }, [accounts, categories, txs, settings, today, tx])
  const { accs, accById, catById, roots, subsOf, rootOf, balance, mainId } = ctx

  const fresh = () => ({ amount: '', cat: null, acc: mainId, accTouched: false, suggested: false, from: mainId, to: null, date: today, note: '', oneOff: !!preset?.oneOff })
  const [kind, setKind] = useState(tx ? tx.kind : initialKind)
  const [f, setF] = useState(() => (tx ? { ...formFromTx(tx, mainId), oneOff: !!tx.one_off } : fresh()))
  const [ui, setUi] = useState(() => ({ sheet: null, sheetRoot: null, q: '', calMonth: today.slice(0, 7), deskRoot: (tx?.category_id && rootOf(tx.category_id)?.id) || null }))
  const [busy, setBusy] = useState(false)
  const [ed, setEd] = useState(null)
  const [err, setErr] = useState(null)
  const up = (p) => setF((o) => ({ ...o, ...(typeof p === 'function' ? p(o) : p) }))
  const ui2 = (p) => setUi((o) => ({ ...o, ...(typeof p === 'function' ? p(o) : p) }))

  const freq = useMemo(() => frequentCategories({ txs, accounts, kind, today }).filter((id) => catById.has(id)), [txs, accounts, kind, today, catById])
  const pairs = useMemo(() => frequentPairs({ txs, accounts, today }).filter(([a, b]) => accById.has(a) && accById.has(b)), [txs, accounts, today, accById])
  const deskRoot = ui.deskRoot && catById.has(ui.deskRoot) ? catById.get(ui.deskRoot) : (freq[0] && rootOf(freq[0])) || roots('spesa')[0]
  const miss = missingField({ kind, amount: f.amount, categoryId: f.cat, toAccountId: f.to })

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  function pickCat(id) {
    const u = usualAccount(txs, id)
    up((o) => (o.accTouched ? { cat: id } : { cat: id, acc: u && accById.has(u) ? u : mainId, suggested: !!(u && accById.has(u) && u !== mainId) }))
    ui2({ sheet: null, sheetRoot: null, q: '', deskRoot: rootOf(id)?.id })
    setErr(null)
  }
  // Categoria appena creata dalla schermata: la sceglie subito.
  function created(cat, isNew) {
    onCategorySaved(cat, isNew)
    setEd(null)
    up((o) => ({ cat: cat.id, suggested: false, acc: o.suggested ? mainId : o.acc }))
    ui2({ sheet: null, sheetRoot: null, q: '', deskRoot: cat.parent_id || cat.id })
    setErr(null)
  }
  function pickAcc(which, id) {
    if (which === 'acc') up({ acc: id, accTouched: true, suggested: false })
    else if (which === 'from') up((o) => ({ from: id, to: o.to === id ? null : o.to }))
    else up({ to: id })
    ui2({ sheet: null })
  }
  function changeKind(k) {
    if (k === kind) return
    setKind(k)
    up((o) => ({ cat: null, suggested: false, acc: o.suggested ? mainId : o.acc }))
    ui2({ sheet: null, q: '' })
    setErr(null)
  }
  function open(sheet) {
    ui2((o) => ({ sheet, q: '', calMonth: sheet === 'date' ? f.date.slice(0, 7) : o.calMonth, sheetRoot: sheet === 'cat' && f.cat && catById.get(f.cat)?.parent_id ? catById.get(f.cat).parent_id : null }))
  }
  const press = (k) => { up((o) => ({ amount: pressKey(o.amount, k) })); setErr(null) }

  async function save() {
    if (busy) return
    if (miss) { setErr(miss.replace(/^Scrivi/, 'Prima scrivi').replace(/^Scegli/, 'Prima scegli') + '.'); return }
    setBusy(true); setErr(null)
    try {
      const row = buildTransaction({ kind, amount: f.amount, date: f.date, accountId: f.acc, fromAccountId: f.from, toAccountId: f.to, categoryId: f.cat, note: f.note, today, oneOff: f.oneOff })
      const saved = editing ? await updateTransaction(tx.id, row) : await addTransaction(row)
      onSaved(saved, editing ? 'Modifiche salvate.' : savedMessage(kind, saved.amount, f.date, today))
    } catch (e) {
      setErr(`Non sono riuscito a salvare: ${e?.message || 'errore sconosciuto'}. Riprova.`)
      setBusy(false)
    }
  }
  async function remove() {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      onDeleted(await deleteTransaction(tx.id))
    } catch (e) {
      setErr(`Non sono riuscito a eliminarlo: ${e?.message || 'errore sconosciuto'}. Riprova.`)
      setBusy(false)
    }
  }

  useEffect(() => {
    function onKey(e) {
      const inField = e.target.tagName === 'INPUT'
      if (e.key === 'Escape') {
        e.preventDefault()
        if (ui.sheet) ui2({ sheet: null })
        else if (inField) e.target.blur()
        else onClose()
        return
      }
      if (inField || e.metaKey || e.ctrlKey || e.altKey || ui.sheet) return
      // Invio su un pulsante lo preme (per chi naviga con Tab); altrimenti salva.
      if (e.key === 'Enter' && e.target.tagName === 'BUTTON') return
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === ',' || e.key === '.') press(',')
      else if (e.key === 'Backspace') press('del')
      else if (e.key === 'Enter') save()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // pezzi comuni ----------------------------------------------------------
  const has = f.amount !== ''
  const [int, dec] = f.amount.split(',')
  const amountEl = (
    <div className={`mv-amount${kind === 'entrata' && has ? ' pos' : ''}${has ? '' : ' empty'}`} aria-live="polite">
      <span className="sg">{has ? (kind === 'spesa' ? '−' : kind === 'entrata' ? '+' : '') : ''}</span>
      {has ? nf0.format(Number(int || '0')) : '0'}{f.amount.includes(',') ? `,${dec || ''}` : ''}
      <i className="mv-caret" />
      <span className="ghost">{f.amount.includes(',') ? '0'.repeat(2 - (dec || '').length) : ',00'}</span>
      <span className="cur">€</span>
    </div>
  )
  const segs = (
    <div className="mv-segs" role="tablist" aria-label="Tipo di movimento">
      {KINDS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={kind === k} className={`seg${kind === k ? ' on' : ''}`} onClick={() => changeKind(k)}>{l}</button>)}
    </div>
  )
  const catLabel = (id) => { const c = catById.get(id); const r = rootOf(id); return { c, r, parent: r && c && r.id !== c.id ? r.name : null } }

  const freqEl = (wrap) => kind === 'giroconto' ? (pairs.length > 0 && (
    <div className="mv-freqwrap">
      <div className="lbl">Frequenti</div>
      <div className={`mv-freq${wrap ? ' wrap' : ''}`}>
        {pairs.map(([a, b]) => (
          <button key={`${a}|${b}`} type="button" className={`mv-fchip pair${f.from === a && f.to === b ? ' on' : ''}`} onClick={() => up({ from: a, to: b })}>
            {accById.get(a).name} <Icon name="arrow" size={14} /> {accById.get(b).name}
          </button>
        ))}
      </div>
    </div>
  )) : (freq.length > 0 && (
    <div className="mv-freqwrap">
      <div className="lbl">Le più usate</div>
      <div className={`mv-freq${wrap ? ' wrap' : ''}`}>
        {freq.map((id) => { const { c, r } = catLabel(id); return (
          <button key={id} type="button" className={`mv-fchip${f.cat === id ? ' on' : ''}`} onClick={() => pickCat(id)}><CatChip cat={c} root={r} size="xs" />{c.name}</button>
        ) })}
      </div>
    </div>
  ))

  const pills = (
    <div className="mv-pills">
      {kind !== 'giroconto' && accById.get(f.acc) && (
        <button type="button" className="mv-pill" onClick={() => open('acc')}>
          <AccChip a={accById.get(f.acc)} size="sm" />
          <span className="txt"><span className="lb">Conto</span><span className="vl">{accById.get(f.acc).name}</span></span>
          <Icon name="chevdown" size={16} />
        </button>
      )}
      <button type="button" className="mv-pill" onClick={() => open('date')}>
        <span className="chip sm c-acc"><Icon name="calendar" size={17} /></span>
        <span className="txt"><span className="lb">Data</span><span className="vl">{dateShort(f.date, today)}</span></span>
        <Icon name="chevdown" size={16} />
      </button>
    </div>
  )
  const hints = (
    <>
      {f.suggested && kind !== 'giroconto' && f.cat && accById.get(f.acc) && (
        <div className="mv-hint"><Icon name="spark" size={15} /><span>Conto proposto: per {catById.get(f.cat)?.name} di solito usi {accById.get(f.acc).name}.</span></div>
      )}
      {f.date > today && <div className="mv-hint"><Icon name="calendar" size={15} /><span>Data futura: il movimento comparirà in "In arrivo" e conterà nel saldo da quel giorno.</span></div>}
      {(f.oneOff || f.date > today) && kind !== 'giroconto' && (
        <button type="button" className={`mv-hint mv-oneoff${f.oneOff ? ' on' : ''}`} aria-pressed={f.oneOff} onClick={() => up((o) => ({ oneOff: !o.oneOff }))}>
          <Icon name={f.oneOff ? 'check' : 'spark'} size={15} />
          <span>{f.oneOff ? 'Una tantum: si aggiunge alle previsioni e non prende il posto dello stipendio o di altri movimenti che si ripetono. Tocca per togliere.' : 'È una tantum, come la tredicesima o i regali di Natale? Tocca qui: si aggiunge alle previsioni senza prendere il posto dello stipendio.'}</span>
        </button>
      )}
      {err && <div className="mv-hint err" role="alert"><Icon name="alert" size={15} /><span>{err}</span></div>}
    </>
  )
  const noteEl = (
    <label className="mv-note">
      <span className="chip sm c-none"><Icon name="pen" size={16} /></span>
      <input id="mv-nota" type="text" placeholder="Nota (facoltativa)" value={f.note} autoComplete="off" enterKeyHint="done" onChange={(e) => up({ note: e.target.value })} />
    </label>
  )
  const lbl = { spesa: 'spesa', entrata: 'entrata', giroconto: 'giroconto' }[kind]
  const padEl = (
    <>
      <div className="mv-pad">
        {KEYS.map((k) => k === 'del'
          ? <button key={k} type="button" className="mv-key fn" aria-label="Cancella l'ultima cifra" onClick={() => press('del')}><Icon name="backspace" size={24} /></button>
          : <button key={k} type="button" className="mv-key" onClick={() => press(k)}>{k}</button>)}
      </div>
      <button type="button" className={`mv-save${miss ? ' off' : ''}`} aria-disabled={!!miss} disabled={busy} onClick={save}>
        {busy ? 'Salvo…' : miss || <><Icon name="check" size={20} />{editing ? 'Salva le modifiche' : `Salva ${lbl} di ${nf2.format(amountValue(f.amount))} €`}</>}
      </button>
    </>
  )

  // fogli -----------------------------------------------------------------
  const accList = (which) => {
    const sel = which === 'acc' ? f.acc : which === 'from' ? f.from : f.to
    return GROUPS.map(([k, l]) => {
      const list = accs.filter((a) => a.kind === k)
      if (!list.length) return null
      return (
        <div key={k}>
          <div className="lbl mv-glbl">{l}</div>
          {list.map((a) => (
            <button key={a.id} type="button" className={`mv-row${sel === a.id ? ' on' : ''}`} disabled={which === 'to' && a.id === f.from} onClick={() => pickAcc(which, a.id)}>
              <AccChip a={a} />
              <span className="txt"><span className="nm">{a.name}</span></span>
              <span className="bal">{euro(balance(a.id))}</span>
              {sel === a.id && <span className="ck"><Icon name="check" /></span>}
            </button>
          ))}
        </div>
      )
    })
  }
  const needle = ui.q.trim().toLowerCase()
  const results = () => {
    const hits = []
    for (const r of roots(kind)) {
      if (r.name.toLowerCase().includes(needle)) hits.push(r.id)
      for (const s of subsOf(r.id)) if (s.name.toLowerCase().includes(needle)) hits.push(s.id)
    }
    if (!hits.length) return <div className="mv-empty">Nessuna categoria con "{ui.q.trim()}"</div>
    return (
      <div className="mv-rlist">
        {hits.slice(0, 30).map((id) => { const { c, r, parent } = catLabel(id); return (
          <button key={id} type="button" className={`mv-row${f.cat === id ? ' on' : ''}`} onClick={() => pickCat(id)}>
            <CatChip cat={c} root={r} size="sm" />
            <span className="txt"><span className="nm">{c.name}</span><span className="sb">{parent || 'Categoria'}</span></span>
            {f.cat === id && <span className="ck"><Icon name="check" /></span>}
          </button>
        ) })}
      </div>
    )
  }
  const searchEl = (
    <label className="mv-search"><Icon name="search" size={18} /><input id="mv-cerca" type="search" placeholder="Cerca, per esempio bar o farmacia" value={ui.q} autoComplete="off" enterKeyHint="search" onChange={(e) => ui2({ q: e.target.value })} /></label>
  )

  function sheetContent() {
    if (ui.sheet === 'cat') {
      if (ui.sheetRoot && !needle) {
        const r = catById.get(ui.sheetRoot)
        return {
          back: true,
          title: <><CatChip root={r} size="sm" /><span className="nm" style={{ fontSize: 18, fontWeight: 700 }}>{r.name}</span></>,
          body: (
            <div className="mv-rlist">
              <button type="button" className={`mv-row${f.cat === r.id ? ' on' : ''}`} onClick={() => pickCat(r.id)}>
                <CatChip root={r} size="sm" /><span className="txt"><span className="nm" style={{ color: 'var(--mute)', fontWeight: 500 }}>Tutta la categoria, senza dettaglio</span></span>
                {f.cat === r.id && <span className="ck"><Icon name="check" /></span>}
              </button>
              {subsOf(r.id).map((s) => (
                <button key={s.id} type="button" className={`mv-row${f.cat === s.id ? ' on' : ''}`} onClick={() => pickCat(s.id)}>
                  <CatChip cat={s} root={r} size="sm" /><span className="txt"><span className="nm">{s.name}</span></span>
                  {f.cat === s.id && <span className="ck"><Icon name="check" /></span>}
                </button>
              ))}
              <button type="button" className="mv-row add" onClick={() => setEd({ kind, parentId: r.id })}>
                <span className="chip sm"><Icon name="plus" size={18} /></span><span className="txt"><span className="nm">Nuova sottocategoria</span></span>
              </button>
            </div>
          ),
        }
      }
      const selRoot = f.cat && rootOf(f.cat)?.id
      return {
        title: 'Categoria',
        body: <>{searchEl}{needle ? results() : (
          <div className="mv-tiles">
            {roots(kind).map((r) => { const n = subsOf(r.id).length; return (
              <button key={r.id} type="button" className={`mv-tile${selRoot === r.id ? ' on' : ''}`} onClick={() => (n ? ui2({ sheetRoot: r.id, q: '' }) : pickCat(r.id))}>
                <CatChip root={r} size="lg" /><span className="tn">{r.name}</span>{n > 0 && <span className="tc">{n}</span>}
              </button>
            ) })}
            <button type="button" className="mv-tile add" onClick={() => setEd({ kind })}><span className="chip lg"><Icon name="plus" size={24} /></span><span className="tn">Nuova categoria</span></button>
          </div>
        )}</>,
      }
    }
    if (ui.sheet === 'date') {
      const [y, m] = ui.calMonth.split('-').map(Number)
      const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7
      const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
      const cells = []
      for (let i = 0; i < 42; i++) {
        const n = i - lead + 1
        if (n < 1 || n > days) { cells.push(<span key={i} className="mv-day out" />); continue }
        const s = `${ui.calMonth}-${String(n).padStart(2, '0')}`
        cells.push(<button key={i} type="button" className={`mv-day${s === today ? ' today' : ''}${s === f.date ? ' sel' : ''}`} aria-label={dateWords(s, today)} aria-pressed={s === f.date} onClick={() => { up({ date: s }); ui2({ sheet: null }) }}>{n}</button>)
      }
      const quick = [[today, 'Oggi'], [addDays(today, -1), 'Ieri'], [addDays(today, -2), "L'altro ieri"]]
      return {
        title: 'Data',
        body: (
          <>
            <div className="mv-quick">{quick.map(([s, l]) => <button key={l} type="button" className={`mv-fchip${f.date === s ? ' on' : ''}`} onClick={() => { up({ date: s }); ui2({ sheet: null }) }}>{l}</button>)}</div>
            <div className="mv-mnav">
              <button type="button" className="hb sm" aria-label="Mese precedente" onClick={() => ui2((o) => ({ calMonth: addMonths(o.calMonth, -1) }))}><Icon name="left" size={18} /></button>
              <b>{ML[m - 1].charAt(0).toUpperCase() + ML[m - 1].slice(1)} {y}</b>
              <button type="button" className="hb sm" aria-label="Mese successivo" onClick={() => ui2((o) => ({ calMonth: addMonths(o.calMonth, 1) }))}><Icon name="right" size={18} /></button>
            </div>
            <div className="mv-cal">{['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d, i) => <span key={i} className="mv-wd">{d}</span>)}{cells}</div>
            <div className="mv-calnote">Se non tocchi la data, il movimento è di oggi. Un giorno futuro lo mette tra quelli in arrivo.</div>
          </>
        ),
      }
    }
    if (ui.sheet === 'del') {
      const c = tx.category_id && catById.get(tx.category_id)
      const what = tx.kind === 'giroconto' ? `Giroconto ${accById.get(tx.account_id)?.name || ''} → ${accById.get(tx.to_account_id)?.name || ''}` : tx.note || c?.name || (tx.kind === 'entrata' ? 'Entrata' : 'Spesa')
      return {
        title: 'Eliminare il movimento?',
        body: (
          <>
            <div className="mv-delrow">
              <span className="txt"><span className="nm">{what}</span><span className="sb">{dateShort(tx.date, today)}</span></span>
              <b>{nf2.format(tx.amount)} €</b>
            </div>
            <div className="mv-calnote">Subito dopo potrai ancora annullare l'eliminazione.</div>
            {err && <div className="mv-hint err" role="alert"><Icon name="alert" size={15} /><span>{err}</span></div>}
            <div className="mv-delbtns">
              <button type="button" className="mv-fchip" onClick={() => ui2({ sheet: null })}>Annulla</button>
              <button type="button" className="mv-danger" disabled={busy} onClick={remove}><Icon name="trash" size={18} />{busy ? 'Elimino…' : 'Elimina'}</button>
            </div>
          </>
        ),
      }
    }
    return { title: { acc: 'Conto', from: 'Da quale conto', to: 'Verso quale conto' }[ui.sheet], body: accList(ui.sheet) }
  }
  let sheetEl = null
  if (ui.sheet) {
    const s = sheetContent()
    sheetEl = (
      <>
        <div className="mv-scrim" onClick={() => ui2({ sheet: null })} />
        <div className={`mv-sheet${ui.sheet === 'del' ? ' small' : ''}`} role={ui.sheet === 'del' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-label={typeof s.title === 'string' ? s.title : 'Categoria'}>
          <div className="mv-grab" />
          <div className="mv-shead">
            {s.back && <button type="button" className="hb sm" aria-label="Tutte le categorie" onClick={() => ui2({ sheetRoot: null })}><Icon name="left" size={18} /></button>}
            <h2>{s.title}</h2>
            <button type="button" className="hb sm" aria-label="Chiudi" onClick={() => ui2({ sheet: null })}><Icon name="close" size={18} /></button>
          </div>
          <div className="mv-sbody">{s.body}</div>
        </div>
      </>
    )
  }

  const edEl = ed && <CategoryEditor data={data} preset={ed} onClose={() => setEd(null)} onSaved={created} onDeleted={() => setEd(null)} />

  // telefono ----------------------------------------------------------------
  if (!wide) {
    const c = f.cat && catLabel(f.cat)
    const n = roots(kind), nSubs = n.reduce((s, r) => s + subsOf(r.id).length, 0)
    const from = accById.get(f.from), to = f.to && accById.get(f.to)
    return (
      <div className="mv mv-phone" role="dialog" aria-modal="true" aria-label={editing ? 'Modifica movimento' : 'Nuovo movimento'}>
        <div className="mv-glow" />
        <header className="mv-top">
          <button type="button" className="hb" aria-label="Chiudi senza salvare" onClick={onClose}><Icon name="close" /></button>
          {segs}
          {editing
            ? <button type="button" className="hb mv-trash" aria-label="Elimina il movimento" onClick={() => open('del')}><Icon name="trash" /></button>
            : <span style={{ width: 40, flex: 'none' }} />}
        </header>
        <div className="mv-scroll">
          {editing && <div className="mv-editlbl">Modifica movimento</div>}
          {amountEl}
          {kind === 'giroconto' ? (
            <div className="mv-xfer">
              <button type="button" className="mv-field" onClick={() => open('from')}>
                {from && <AccChip a={from} />}<span className="txt"><span className="sb">Da</span><span className="nm">{from?.name}</span></span><Icon name="right" size={18} />
              </button>
              <button type="button" className={`mv-field${to ? '' : ' empty'}`} onClick={() => open('to')}>
                {to ? <AccChip a={to} /> : <span className="chip c-acc"><Icon name="bank" /></span>}
                <span className="txt"><span className="sb">A</span><span className="nm">{to ? to.name : 'Scegli il conto'}</span></span><Icon name="right" size={18} />
              </button>
              {to && <button type="button" className="mv-swap" aria-label="Inverti i due conti" onClick={() => up((o) => ({ from: o.to, to: o.from }))}><Icon name="swapv" size={18} /></button>}
            </div>
          ) : (
            <button type="button" className={`mv-field${c ? '' : ' empty'}`} onClick={() => open('cat')}>
              {c ? <CatChip cat={c.c} root={c.r} /> : <span className="chip c-acc"><Icon name="grid" /></span>}
              <span className="txt">
                <span className="nm">{c ? c.c.name : 'Scegli la categoria'}</span>
                <span className="sb">{c ? c.parent || 'Categoria' : `${n.length} categorie${nSubs ? `, ${nSubs} sottocategorie` : ''}`}</span>
              </span>
              <Icon name="right" size={18} />
            </button>
          )}
          {freqEl(false)}
          {pills}
          {hints}
          {noteEl}
        </div>
        <div className="mv-bottom">{padEl}</div>
        {sheetEl}
        {edEl}
      </div>
    )
  }

  // computer ------------------------------------------------------------------
  let right
  if (kind === 'giroconto') {
    const col = (which, title) => (
      <div className="mv-xcol">
        <div className="mv-subt">{title}</div>
        {GROUPS.flatMap(([k]) => accs.filter((a) => a.kind === k)).map((a) => {
          const sel = (which === 'from' ? f.from : f.to) === a.id
          return (
            <button key={a.id} type="button" className={`mv-row${sel ? ' on' : ''}`} disabled={which === 'to' && a.id === f.from} onClick={() => pickAcc(which, a.id)}>
              <AccChip a={a} size="sm" /><span className="txt"><span className="nm" style={{ fontSize: 15 }}>{a.name}</span></span><span className="bal">{euro(balance(a.id))}</span>
            </button>
          )
        })}
      </div>
    )
    right = <><div className="mv-rhead"><h2>Da quale conto a quale</h2></div>{freqEl(true)}<div className="mv-xcols">{col('from', 'Da')}{col('to', 'A')}</div></>
  } else {
    let main
    if (needle) main = <div className="mv-subs">{results()}</div>
    else if (roots(kind).every((r) => subsOf(r.id).length === 0)) {
      main = (
        <div className="mv-dtiles">
          {roots(kind).map((r) => <button key={r.id} type="button" className={`mv-tile${f.cat === r.id ? ' on' : ''}`} onClick={() => pickCat(r.id)}><CatChip root={r} size="lg" /><span className="tn">{r.name}</span></button>)}
          <button type="button" className="mv-tile add" onClick={() => setEd({ kind })}><span className="chip lg"><Icon name="plus" size={24} /></span><span className="tn">Nuova categoria</span></button>
        </div>
      )
    } else {
      const r = deskRoot && deskRoot.kind === kind ? deskRoot : roots(kind)[0]
      const selRoot = f.cat && rootOf(f.cat)?.id
      const subs = subsOf(r.id)
      main = (
        <div className="mv-two">
          <div className="mv-roots">
            {roots(kind).map((x) => { const n = subsOf(x.id).length; return (
              <button key={x.id} type="button" className={`mv-rrow${x.id === r.id ? ' on' : ''}`} onClick={() => (n ? ui2({ deskRoot: x.id }) : pickCat(x.id))}>
                <CatChip root={x} size="sm" /><span>{x.name}</span>{selRoot === x.id && <span className="mark" aria-label="scelta" />}{n > 0 && <span className="cnt">{n}</span>}
              </button>
            ) })}
            <button type="button" className="mv-rrow add" onClick={() => setEd({ kind })}><span className="chip sm c-acc"><Icon name="plus" size={18} /></span><span>Nuova categoria</span></button>
          </div>
          <div className="mv-subs">
            <div className="mv-subt"><CatChip root={r} size="sm" />{r.name}</div>
            <button type="button" className={`mv-srow all${f.cat === r.id ? ' on' : ''}`} onClick={() => pickCat(r.id)}>
              <CatChip root={r} size="xs" /><span className="sn">{subs.length ? 'Tutta la categoria, senza dettaglio' : 'Usa questa categoria'}</span>{f.cat === r.id && <Icon name="check" size={18} />}
            </button>
            {subs.map((s) => (
              <button key={s.id} type="button" className={`mv-srow${f.cat === s.id ? ' on' : ''}`} onClick={() => pickCat(s.id)}>
                <CatChip cat={s} root={r} size="xs" /><span className="sn">{s.name}</span>{f.cat === s.id && <Icon name="check" size={18} />}
              </button>
            ))}
            <button type="button" className="mv-srow add" onClick={() => setEd({ kind, parentId: r.id })}><span className="chip xs c-acc"><Icon name="plus" size={15} /></span><span className="sn">Nuova sottocategoria</span></button>
          </div>
        </div>
      )
    }
    right = <><div className="mv-rhead"><h2>Categoria</h2>{searchEl}</div>{freqEl(true)}{main}</>
  }

  return (
    <div className="mv mv-desk" role="dialog" aria-modal="true" aria-label={editing ? 'Modifica movimento' : 'Nuovo movimento'}>
      <div className="mv-backdrop" onClick={onClose} />
      <div className="mv-modal">
        <div className="mv-left">
          <div className="mv-lhead">
            <div><h1>{editing ? 'Modifica movimento' : 'Nuovo movimento'}</h1><div className="sb" style={{ whiteSpace: 'normal' }}>Puoi scrivere anche con la tastiera: Invio salva, Esc chiude.</div></div>
            {editing && <button type="button" className="hb mv-trash" aria-label="Elimina il movimento" title="Elimina il movimento" onClick={() => open('del')}><Icon name="trash" /></button>}
          </div>
          {segs}
          {amountEl}
          {pills}
          {hints}
          {noteEl}
          {padEl}
        </div>
        <div className="mv-right">{right}</div>
        <button type="button" className="hb mv-close" aria-label="Chiudi senza salvare" onClick={onClose}><Icon name="close" /></button>
        {sheetEl}
        {edEl}
      </div>
    </div>
  )
}
