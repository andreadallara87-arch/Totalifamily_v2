import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../components/Icon.jsx'
import CatChip from '../components/CatChip.jsx'
import Money from '../components/Money.jsx'
import PairBars from '../components/PairBars.jsx'
import useWide from '../lib/useWide.js'
import { addMonths, rootCategory, ym } from '../lib/calc.js'
import { dayLong, euro } from '../lib/format.js'
import { accountVisual, kindVisual } from '../lib/visual.js'
import { KINDS, PERIODS, activeCount, applyFilters, byMonth, emptyFilters, filtersFromQuery, periodRange, summarize } from '../lib/filters.js'

const queryOf = () => window.location.hash.split('?')[1] || ''

/** Pannello dei filtri: uguale sul computer (colonna a sinistra) e sul telefono (foglio dal basso). */
function FilterPanel({ f, set, accounts, categories, minMonth, maxMonth, today }) {
  const [openRoot, setOpenRoot] = useState(null)
  const roots = useMemo(() => {
    const kinds = f.kind === 'entrata' ? ['entrata'] : f.kind === 'spesa' ? ['spesa'] : ['spesa', 'entrata']
    return kinds.map((k) => ({ kind: k, list: categories.filter((c) => !c.parent_id && c.kind === k) }))
  }, [categories, f.kind])
  const subsOf = (id) => categories.filter((c) => c.parent_id === id)
  const toggle = (key, id) => set({ [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] })
  const toggleRoot = (r) => {
    const subs = subsOf(r.id).map((s) => s.id)
    const without = f.cats.filter((x) => x !== r.id && !subs.includes(x))
    set({ cats: f.cats.includes(r.id) ? without : [...without, r.id] })
  }
  const toggleSub = (r, s) => {
    // Scegliendo una sottocategoria, la principale smette di valere "tutta".
    const base = f.cats.filter((x) => x !== r.id)
    set({ cats: base.includes(s.id) ? base.filter((x) => x !== s.id) : [...base, s.id] })
  }
  const visibleAccounts = accounts.filter((a) => !a.archived)

  return (
    <div className="fpanel">
      <div className="flbl">Periodo</div>
      <div className="segs fsegs">
        {PERIODS.map((p) => <button key={p.id} type="button" className={f.period === p.id ? 'seg on' : 'seg'} onClick={() => set({ period: p.id })}>{p.label}</button>)}
      </div>
      {(f.period === 'mese' || f.period === 'anno') && (
        <div className="fmonth">
          <button type="button" className="hb" aria-label="Indietro" disabled={f.period === 'mese' ? f.month <= minMonth : f.month.slice(0, 4) <= minMonth.slice(0, 4)} onClick={() => set({ month: f.period === 'mese' ? addMonths(f.month, -1) : addMonths(f.month, -12) })}><Icon name="left" /></button>
          <b>{periodRange(f, today).label}</b>
          <button type="button" className="hb" aria-label="Avanti" disabled={f.period === 'mese' ? f.month >= maxMonth : f.month.slice(0, 4) >= maxMonth.slice(0, 4)} onClick={() => set({ month: f.period === 'mese' ? addMonths(f.month, 1) : addMonths(f.month, 12) })}><Icon name="right" /></button>
        </div>
      )}
      {f.period === 'date' && (
        <div className="fdates">
          <label><span>Dal</span><input type="date" value={f.from} max={f.to || undefined} onChange={(e) => set({ from: e.target.value })} /></label>
          <label><span>Al</span><input type="date" value={f.to} min={f.from || undefined} onChange={(e) => set({ to: e.target.value })} /></label>
        </div>
      )}

      <div className="flbl">Tipo</div>
      <div className="segs fsegs">
        {KINDS.map((k) => <button key={k.id} type="button" className={f.kind === k.id ? 'seg on' : 'seg'} onClick={() => set({ kind: k.id })}>{k.label}</button>)}
      </div>

      <div className="flbl">Conti e carte{f.accounts.length > 0 && <button type="button" className="lnk" onClick={() => set({ accounts: [] })}>Tutti</button>}</div>
      <div className="fchips">
        {visibleAccounts.map((a) => {
          const on = f.accounts.includes(a.id)
          const v = accountVisual(a)
          return (
            <button key={a.id} type="button" className={`fchip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggle('accounts', a.id)}>
              <span className={`chip xs ${v.chip}`}><Icon name={v.icon} size={14} /></span>{a.name}
            </button>
          )
        })}
      </div>

      {f.kind !== 'giroconto' && (
        <>
          <div className="flbl">Categorie{f.cats.length > 0 && <button type="button" className="lnk" onClick={() => set({ cats: [] })}>Tutte</button>}</div>
          {roots.map((g) => (
            <div key={g.kind} className="fcats">
              {roots.length > 1 && <div className="fkind">{g.kind === 'spesa' ? 'Spese' : 'Entrate'}</div>}
              {g.list.map((r) => {
                const subs = subsOf(r.id)
                const on = f.cats.includes(r.id)
                const someSub = subs.some((s) => f.cats.includes(s.id))
                const open = openRoot === r.id || someSub
                return (
                  <div key={r.id} className={`fcat${open ? ' open' : ''}`}>
                    <div className="fcat-row">
                      <button type="button" className={`fcat-main${on ? ' on' : ''}${someSub ? ' part' : ''}`} aria-pressed={on} onClick={() => toggleRoot(r)}>
                        <CatChip root={r} size="xs" />
                        <span className="nm">{r.name}</span>
                        <span className="tick">{on ? <Icon name="check" size={16} /> : someSub ? <i /> : null}</span>
                      </button>
                      {subs.length > 0 && (
                        <button type="button" className="fcat-x" aria-label={`Sottocategorie di ${r.name}`} aria-expanded={open} onClick={() => setOpenRoot(openRoot === r.id ? null : r.id)}>
                          <Icon name="chevdown" size={16} className={open ? 'up' : ''} />
                        </button>
                      )}
                    </div>
                    {open && subs.length > 0 && (
                      <div className="fsubs">
                        {subs.map((s) => {
                          const sOn = on || f.cats.includes(s.id)
                          return (
                            <button key={s.id} type="button" className={`fsub${sOn ? ' on' : ''}`} aria-pressed={sOn} onClick={() => toggleSub(r, s)}>
                              <CatChip cat={s} root={r} size="xs" />{s.name}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

export default function Movimenti({ data, today, onEdit }) {
  const wide = useWide()
  const { accounts, categories, txs } = data
  const [f, setF] = useState(() => filtersFromQuery(queryOf(), today))
  const [sheet, setSheet] = useState(false)
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }))

  // Arrivando da un collegamento (per esempio da Andamento) i filtri seguono l'indirizzo.
  useEffect(() => {
    const on = () => { if (window.location.hash.startsWith('#/movimenti')) setF(filtersFromQuery(queryOf(), today)) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [today])

  const catsById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const rows = useMemo(() => applyFilters(txs, f, { categories, accounts, today }), [txs, f, categories, accounts, today])
  const sum = useMemo(() => summarize(rows, f), [rows, f])
  const months = useMemo(() => byMonth(rows, today), [rows, today])
  const range = periodRange(f, today)
  // Se la ricerca non trova nulla nel periodo, propone di cercare in tutto.
  const elsewhere = useMemo(() => {
    if (rows.length || !f.q || f.period === 'tutto') return 0
    return applyFilters(txs, { ...f, period: 'tutto' }, { categories, accounts, today }).length
  }, [rows, f, txs, categories, accounts, today])

  const days = []
  for (const t of rows) {
    if (!days.length || days[days.length - 1].date !== t.date) days.push({ date: t.date, items: [] })
    days[days.length - 1].items.push(t)
  }

  const minMonth = txs.length ? ym(txs[txs.length - 1].date) : ym(today)
  const maxMonth = txs.length ? ym(txs[0].date) : ym(today)
  const nActive = activeCount(f)
  const reset = () => setF({ ...emptyFilters(today), month: f.month, period: f.period, from: f.from, to: f.to })

  // Filtri attivi in forma di etichette togliibili (sul telefono sotto la ricerca).
  const pills = [
    ...(f.kind !== 'tutti' ? [{ key: 'k', label: KINDS.find((k) => k.id === f.kind).label, off: () => set({ kind: 'tutti' }) }] : []),
    ...f.accounts.map((id) => ({ key: id, label: accById.get(id)?.name || 'Conto', off: () => set({ accounts: f.accounts.filter((x) => x !== id) }) })),
    ...f.cats.map((id) => {
      const c = catsById.get(id)
      const r = rootCategory(catsById, id)
      return { key: id, label: c ? (r && r.id !== c.id ? `${r.name} › ${c.name}` : c.name) : 'Categoria', cat: c, root: r, off: () => set({ cats: f.cats.filter((x) => x !== id) }) }
    }),
  ]

  // Con solo categorie di spesa (o solo di entrata) scelte, il tipo è quello.
  const catKinds = new Set(f.cats.map((id) => catsById.get(id)?.kind).filter(Boolean))
  const kind = f.kind !== 'tutti' || catKinds.size !== 1 ? f.kind : [...catKinds][0]
  const showOut = kind !== 'entrata'
  const showIn = kind !== 'spesa'
  const panel = <FilterPanel f={f} set={set} accounts={accounts} categories={categories} minMonth={minMonth} maxMonth={maxMonth} today={today} />

  const list = (
    <section className="card pad mlist">
      <div className="mhead">
        {!wide && f.period === 'mese' ? (
          <div className="mnav">
            <button type="button" className="hb" aria-label="Mese precedente" disabled={f.month <= minMonth} onClick={() => set({ month: addMonths(f.month, -1) })}><Icon name="left" /></button>
            <h2 className="h">{range.label}</h2>
            <button type="button" className="hb" aria-label="Mese successivo" disabled={f.month >= maxMonth} onClick={() => set({ month: addMonths(f.month, 1) })}><Icon name="right" /></button>
          </div>
        ) : (
          <h2 className="h">{range.label}</h2>
        )}
        {!wide && (
          <button type="button" className={`fbtn${nActive ? ' on' : ''}`} onClick={() => setSheet(true)}>
            <Icon name="filter" size={18} />Filtri{nActive ? <span className="fnum">{nActive}</span> : null}
          </button>
        )}
      </div>
      <label className="search" style={{ marginTop: 14 }}>
        <Icon name="search" size={18} />
        <input type="search" placeholder="Cerca nota, categoria, conto, importo" value={f.q} onChange={(e) => set({ q: e.target.value })} />
      </label>
      {pills.length > 0 && (
        <div className="fpills">
          {pills.map((p) => (
            <button key={p.key} type="button" className="fpill" onClick={p.off} aria-label={`Togli filtro ${p.label}`}>
              {p.cat && <CatChip cat={p.cat} root={p.root} size="xs" />}{p.label}<Icon name="close" size={14} />
            </button>
          ))}
          <button type="button" className="lnk" onClick={reset}>Azzera</button>
        </div>
      )}

      <div className="msum">
        <div><span>Movimenti</span><b>{sum.count}</b></div>
        {showOut && <div><span>Spese</span><b><Money value={sum.out} /></b></div>}
        {showIn && <div><span>Entrate</span><b className="pos"><Money value={sum.inn} /></b></div>}
        {kind === 'tutti' && <div><span>Differenza</span><b className={sum.net >= 0 ? 'pos' : 'warn'}><Money value={sum.net} sign /></b></div>}
        {f.accounts.length > 0 && Math.abs(sum.moved) >= 0.01 && <div><span>Giroconti</span><b><Money value={sum.moved} sign /></b></div>}
      </div>

      {months.length > 1 && f.kind !== 'giroconto' && (
        <div className="mchart">
          <div className="flbl" style={{ marginTop: 0 }}>Mese per mese<span className="mute" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>tocca un mese per vederlo</span></div>
          <PairBars items={months} show={showOut && showIn ? 'both' : showOut ? 'out' : 'inn'} net={false} height={120} onSelect={(m) => set({ period: 'mese', month: m })} />
        </div>
      )}

      {days.length === 0 && (
        <div className="empty">
          Nessun movimento
          {elsewhere > 0 && <div style={{ marginTop: 10 }}><button type="button" className="btn small ghost" onClick={() => set({ period: 'tutto' })}>Cerca in tutto il periodo ({elsewhere})</button></div>}
        </div>
      )}
      {days.map((d) => (
        <div key={d.date}>
          <div className="list-day">{dayLong(d.date)}{f.period !== 'mese' ? ` ${d.date.slice(0, 4)}` : ''}{d.date > today ? ' · in arrivo' : ''}</div>
          {d.items.map((t) => {
            const c = catsById.get(t.category_id)
            const root = rootCategory(catsById, t.category_id)
            const kv = kindVisual(t.kind)
            const acc = accById.get(t.account_id)?.name
            const title = t.kind === 'giroconto' ? `${acc} → ${accById.get(t.to_account_id)?.name}` : t.note || c?.name || (t.kind === 'entrata' ? 'Entrata' : 'Spesa')
            const sub = t.kind === 'giroconto' ? t.note || 'Giroconto' : [root && c && root.id !== c.id ? `${root.name} › ${c.name}` : c?.name, acc].filter(Boolean).join(' · ')
            const sign = t.kind === 'entrata' ? 1 : t.kind === 'spesa' ? -1 : 0
            return (
              <button type="button" className="row tap" key={t.id} onClick={() => onEdit(t)}>
                {c && t.kind !== 'giroconto' ? <CatChip cat={c} root={root} /> : <div className={`chip ${kv.chip}`}><Icon name={kv.icon} /></div>}
                <div className="txt"><div className="nm">{title}{t.planned ? <span className="badge">previsto</span> : null}{t.to_check ? <span className="badge chk">da controllare</span> : t.recurring_id ? <span className="badge">ricorrente</span> : null}</div><div className="sb">{sub}</div></div>
                <div className="am" style={sign > 0 ? { color: 'var(--pos)' } : sign === 0 ? { color: 'var(--mute)' } : undefined}>{euro(sign === 0 ? t.amount : sign * t.amount, { sign: sign > 0 })}</div>
              </button>
            )
          })}
        </div>
      ))}
    </section>
  )

  if (wide) {
    return (
      <div className="grid g-mov">
        <aside className="card pad fside">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="h">Filtri</h2>
            {(nActive > 0 || f.q) && <button type="button" className="lnk" onClick={() => { reset(); set({ q: '' }) }}>Azzera</button>}
          </div>
          {panel}
        </aside>
        {list}
      </div>
    )
  }
  return (
    <>
      {list}
      {sheet && createPortal(
        <div className="ce-wrap" role="dialog" aria-modal="true" aria-label="Filtri">
          <div className="ce-scrim" onClick={() => setSheet(false)} />
          <div className="ce">
            <div className="ce-head">
              <h2>Filtri</h2>
              {nActive > 0 && <button type="button" className="lnk" onClick={reset}>Azzera</button>}
              <button type="button" className="hb" aria-label="Chiudi" onClick={() => setSheet(false)}><Icon name="close" /></button>
            </div>
            <div className="ce-body">{panel}</div>
            <button type="button" className="btn full" onClick={() => setSheet(false)}>Mostra {sum.count} moviment{sum.count === 1 ? 'o' : 'i'}</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

