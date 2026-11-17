import { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import Money from '../components/Money.jsx'
import CatChip from '../components/CatChip.jsx'
import PairBars from '../components/PairBars.jsx'
import TrendLine from '../components/TrendLine.jsx'
import { addMonths, ym } from '../lib/calc.js'
import { euro, monthName, monthShort, monthYear } from '../lib/format.js'
import { accountVisual } from '../lib/visual.js'
import { saveAssets } from '../lib/data.js'
import { debtChanges, monthlyFlows, netWorthSeries, topCategories, trendMonths } from '../lib/trend.js'

const mNum = (m) => Number(m.slice(5, 7))
const RANGES = [[6, '6 mesi'], [12, '12 mesi'], [120, 'Tutto']]

/** Casa, auto e altri beni: nome e valore stimato, modificabili. */
function Assets({ assets, onAssets, showToast }) {
  const [ed, setEd] = useState(null)
  const [busy, setBusy] = useState(false)
  async function save(list, msg) {
    setBusy(true)
    try {
      await saveAssets(list)
      onAssets(list)
      setEd(null)
      showToast(msg)
    } catch (e) {
      showToast(`Non sono riuscito a salvarlo: ${e?.message || 'errore sconosciuto'}.`)
    } finally {
      setBusy(false)
    }
  }
  function submit(e) {
    e.preventDefault()
    const value = Number(String(ed.value).replace(/\./g, '').replace(',', '.'))
    const name = ed.name.trim()
    if (!name || !(value > 0)) return
    const row = { id: ed.id || `${Date.now()}`, name, kind: ed.kind, value: Math.round(value * 100) / 100 }
    const list = ed.id ? assets.map((a) => (a.id === ed.id ? row : a)) : [...assets, row]
    save(list, `${name}: ${euro(row.value, { decimals: false })} nel patrimonio.`)
  }
  const kinds = [['casa', 'Casa', 'home'], ['auto', 'Auto', 'car'], ['altro', 'Altro', 'piggy']]
  const iconOf = (k) => (kinds.find((x) => x[0] === k) || kinds[2])[2]
  return (
    <div className="an-assets">
      <div className="flbl">Beni<span className="mute" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>valore stimato</span></div>
      {assets.map((a) => (
        <button key={a.id} type="button" className="row tap" onClick={() => setEd({ ...a, value: String(a.value).replace('.', ',') })}>
          <div className="chip c-verde"><Icon name={iconOf(a.kind)} /></div>
          <div className="txt"><div className="nm">{a.name}</div><div className="sb">tocca per cambiare il valore</div></div>
          <Money className="am pos" value={a.value} />
        </button>
      ))}
      {!ed && (
        <div className="an-add">
          {kinds.filter(([k]) => k === 'altro' || !assets.some((a) => a.kind === k)).map(([k, l, ic]) => (
            <button key={k} type="button" className="btn small ghost" onClick={() => setEd({ kind: k, name: k === 'altro' ? '' : l, value: '' })}><Icon name="plus" size={16} />{k === 'altro' ? 'Altro bene' : l}</button>
          ))}
        </div>
      )}
      {ed && (
        <form className="an-edit" onSubmit={submit}>
          <input aria-label="Nome" placeholder="Nome" value={ed.name} onChange={(e) => setEd({ ...ed, name: e.target.value })} />
          <label className="an-val"><input aria-label="Valore" inputMode="decimal" placeholder="Valore" value={ed.value} autoFocus onChange={(e) => setEd({ ...ed, value: e.target.value })} /> €</label>
          <div className="an-eacts">
            {ed.id && <button type="button" className="hb" aria-label="Togli" disabled={busy} onClick={() => save(assets.filter((a) => a.id !== ed.id), `${ed.name} tolto dal patrimonio.`)}><Icon name="trash" /></button>}
            <button type="button" className="btn small ghost" onClick={() => setEd(null)}>Annulla</button>
            <button type="submit" className="btn small" disabled={busy}>Salva</button>
          </div>
        </form>
      )}
    </div>
  )
}

export default function Andamento({ data, today, go, onAssets, showToast }) {
  const { accounts, categories, txs } = data
  const assets = useMemo(() => (Array.isArray(data.settings?.assets) ? data.settings.assets : []), [data.settings])
  const [range, setRange] = useState(12)
  const months = useMemo(() => trendMonths(accounts, today, range), [accounts, today, range])
  const flows = useMemo(() => monthlyFlows({ txs, months, today }), [txs, months, today])
  const worth = useMemo(() => netWorthSeries({ accounts, txs, months, today, assets }), [accounts, txs, months, today, assets])
  const debts = useMemo(() => debtChanges(accounts, worth), [accounts, worth])
  const catsById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const [sel, setSel] = useState(ym(today))
  const m = months.includes(sel) ? sel : months[months.length - 1]
  const cur = flows.find((x) => x.month === m)
  const tops = useMemo(() => topCategories({ txs, catsById, month: m, today }), [txs, catsById, m, today])

  const full = flows.filter((x) => !x.partial)
  const avg = (k) => (full.length ? full.reduce((s, x) => s + x[k], 0) / full.length : 0)
  const now = worth[worth.length - 1]
  const start = worth[0]
  const wPoint = worth.find((p) => p.key === m)
  const wPrev = wPoint ? worth[worth.indexOf(wPoint) - 1] : null
  const debtDown = start && now ? Math.round((now.owe - start.owe) * 100) / 100 : 0
  const startLabel = start ? `fine ${monthName(mNum(start.month))}` : ''
  const linkMov = (q) => { window.location.hash = `/movimenti?${q}`; window.scrollTo(0, 0) }

  if (!months.length || !cur) return <section className="card pad"><div className="empty">Ancora nessun mese completo da mostrare</div></section>

  const points = worth.map((p) => ({ key: p.key, value: p.net, label: p.key === 'start' ? `Fine ${monthName(mNum(p.month))}` : p.month === ym(today) ? 'Oggi' : `Fine ${monthName(mNum(p.month))}`, short: p.key === 'start' ? 'inizio' : monthShort(mNum(p.month)) }))

  return (
    <>
      <section className="card pad">
        <div className="chead">
          <div>
            <h2 className="h">Entrate e spese</h2>
            <div className="sb">Mese per mese, su tutti i conti e carte. I giroconti non contano.</div>
          </div>
          {months.length >= 6 && (
            <div className="segs">{RANGES.map(([n, l]) => <button key={n} type="button" className={range === n ? 'seg on' : 'seg'} onClick={() => setRange(n)}>{l}</button>)}</div>
          )}
        </div>
        <div className="an-flow">
          <div className="an-chart">
            <div className="an-legend">
              <span><i className="inn" />Entrate</span><span><i className="out" />Spese</span><span className="mute">sotto: quanto è rimasto</span>
            </div>
            <PairBars items={flows} selected={m} onSelect={setSel} height={210} />
            {cur.partial && <div className="sb" style={{ marginTop: 8 }}>* {monthName(mNum(m))} è in corso: conta fino a oggi, le entrate che devono ancora arrivare non ci sono.</div>}
            {full.length > 0 && (
              <div className="an-avg">
                <div><span>Entrate medie</span><b className="pos">{euro(avg('inn'), { decimals: false })}</b></div>
                <div><span>Spese medie</span><b>{euro(avg('out'), { decimals: false })}</b></div>
                <div><span>Rimasto in media</span><b className={avg('net') >= 0 ? 'pos' : 'warn'}>{euro(avg('net'), { decimals: false, sign: true })}</b></div>
                <div className="sb">al mese, sui {full.length === 1 ? 'mese completo' : `${full.length} mesi completi`}</div>
              </div>
            )}
          </div>
          <div className="an-month">
            <div className="an-mhead">
              <button type="button" className="hb" aria-label="Mese precedente" disabled={m <= months[0]} onClick={() => setSel(addMonths(m, -1))}><Icon name="left" /></button>
              <b>{monthYear(m)}</b>
              <button type="button" className="hb" aria-label="Mese successivo" disabled={m >= months[months.length - 1]} onClick={() => setSel(addMonths(m, 1))}><Icon name="right" /></button>
            </div>
            <div className="an-kv"><span><i className="dot inn" />Entrate</span><Money value={cur.inn} className="pos" /></div>
            <div className="an-kv"><span><i className="dot out" />Spese</span><Money value={cur.out} /></div>
            <div className={`an-res ${cur.net >= 0 ? 'good' : 'bad'}`}>
              <span>{cur.net >= 0 ? (cur.partial ? 'Finora ti sono rimasti' : 'Ti sono rimasti') : cur.partial ? 'Finora hai speso di più' : 'Hai speso di più'}</span>
              <Money value={Math.abs(cur.net)} />
            </div>
            {tops.length > 0 && (
              <>
                <div className="flbl">Dove sono andate le spese</div>
                {tops.map((t) => {
                  const c = catsById.get(t.id)
                  return (
                    <button key={t.id} type="button" className="row tap an-top" onClick={() => linkMov(`mese=${m}&tipo=spesa&cat=${t.id}`)}>
                      {c ? <CatChip root={c} size="sm" /> : <span className="chip sm c-none"><Icon name="grid" size={17} /></span>}
                      <div className="txt"><div className="nm">{c ? c.name : 'Senza categoria'}</div><div className="cbar"><i style={{ width: `${t.share * 100}%` }} /></div></div>
                      <div className="am"><Money value={t.total} /><span className="delta">{Math.round(t.share * 100)}%</span></div>
                    </button>
                  )
                })}
              </>
            )}
            <div className="an-links">
              <button type="button" className="btn small ghost" onClick={() => linkMov(`mese=${m}`)}><Icon name="list" size={18} />Movimenti del mese</button>
              <a className="btn small ghost" href="#/categorie" onClick={(e) => { e.preventDefault(); go('categorie') }}><Icon name="pie" size={18} />Per categoria</a>
            </div>
          </div>
        </div>
      </section>

      <div className="grid g-worth">
        <section className="card pad">
          <h2 className="h">Patrimonio netto</h2>
          <div className="sb">{assets.length ? 'I tuoi beni e quello che hai sui conti, meno quello che devi (mutuo, prestiti, carte, fido usato).' : "Quello che hai sui conti meno quello che devi (mutuo, prestiti, carte, fido usato). Aggiungi qui sotto il valore della casa."}</div>
          <div className="an-big">
            <Money className="cbig" value={wPoint ? wPoint.net : now.net} />
            {wPoint && wPrev && (
              <span className={`pill ${wPoint.net - wPrev.net >= 0 ? 'pos' : 'warn'}`} style={{ marginTop: 8 }}>
                {euro(wPoint.net - wPrev.net, { sign: true, decimals: false })} in {monthName(mNum(m))}
              </span>
            )}
          </div>
          <div className="sb" style={{ marginBottom: 10 }}>{wPoint && wPoint.month === ym(today) ? 'Oggi' : `A fine ${monthName(mNum(m))}`}: {assets.length ? <>beni per <b style={{ color: 'var(--ink)' }}>{euro((wPoint || now).goods, { decimals: false })}</b>, </> : 'hai '}<b style={{ color: 'var(--ink)' }}>{euro(wPoint ? wPoint.have : now.have)}</b> sui conti e devi <b style={{ color: 'var(--ink)' }}>{euro(Math.abs(wPoint ? wPoint.owe : now.owe))}</b></div>
          <TrendLine points={points} selected={m} onSelect={(k) => k !== 'start' && setSel(k)} />
          <div className="sb" style={{ marginTop: 12 }}>Ogni mese il patrimonio sale o scende di quanto ti è rimasto (entrate meno spese).</div>
          <Assets assets={assets} onAssets={onAssets} showToast={showToast} />
        </section>
        <section className="card pad">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <h2 className="h">Debiti</h2>
            <span className="sb">da {startLabel} a oggi</span>
          </div>
          <div className={`an-res ${debtDown >= 0 ? 'good' : 'bad'}`} style={{ marginTop: 10 }}>
            <span>{debtDown >= 0 ? 'Debiti scesi di' : 'Debiti saliti di'}</span>
            <Money value={Math.abs(debtDown)} />
          </div>
          {debts.map((d) => {
            const a = accounts.find((x) => x.id === d.id)
            const v = accountVisual(a)
            const better = d.change >= 0
            return (
              <div key={d.id} className="row an-debt">
                <div className={`chip ${v.chip}`}><Icon name={v.icon} /></div>
                <div className="txt"><div className="nm">{d.name}</div><div className="sb">era {euro(Math.abs(d.from), { decimals: false })}</div></div>
                <div className="am">
                  <Money value={Math.abs(d.to)} />
                  <span className={`delta ${Math.abs(d.change) < 1 ? '' : better ? 'good' : 'bad'}`}>{Math.abs(d.change) < 1 ? 'uguale' : `${better ? '−' : '+'}${euro(Math.abs(d.change), { decimals: false })}`}</span>
                </div>
              </div>
            )
          })}
        </section>
      </div>
    </>
  )
}
