import { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import Money from '../components/Money.jsx'
import CatChip from '../components/CatChip.jsx'
import useWide from '../lib/useWide.js'
import { addMonths, rootCategory, ym } from '../lib/calc.js'
import { dayShort, euro, monthName, monthShort, monthYear } from '../lib/format.js'
import { budgetUse, categoryReport, monthlyTotals, monthRange, monthsWithData, previousRange } from '../lib/report.js'

const KINDS = [['spesa', 'Spese'], ['entrata', 'Entrate']]
const mNum = (m) => Number(m.slice(5, 7))

/** Colonne mese per mese; toccando una colonna si passa a quel mese. */
function MonthBars({ items, selected, onSelect, small = false }) {
  const max = Math.max(...items.map((i) => i.total), 1)
  return (
    <div className={`mbars${small ? ' small' : ''}`}>
      {items.map((i) => {
        const on = i.month === selected
        return (
          <button key={i.month} type="button" className={`mbar${on ? ' on' : ''}`} aria-pressed={on} aria-label={`${monthName(mNum(i.month))} ${i.month.slice(0, 4)}: ${euro(i.total)}`} onClick={() => onSelect(i.month)}>
            <span className="v">{i.total ? euro(i.total, { decimals: false }) : '–'}</span>
            <span className="b"><i style={{ height: `${i.total ? Math.max(3, (i.total / max) * 100) : 0}%` }} /></span>
            <span className="l">{monthShort(mNum(i.month))}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Differenza col mese prima: verde se va meglio (meno spese o più entrate). */
function Delta({ now, before, kind, label }) {
  const d = Math.round((now - before) * 100) / 100
  if (Math.abs(d) < 1) return <span className="delta">come a {label}</span>
  const good = kind === 'spesa' ? d < 0 : d > 0
  return <span className={`delta ${good ? 'good' : 'bad'}`}>{d > 0 ? '+' : '−'}{euro(Math.abs(d), { decimals: false })} su {label}</span>
}

export default function Categorie({ data, today, onEdit }) {
  const wide = useWide()
  const { categories, txs, accounts } = data
  const [kind, setKind] = useState('spesa')
  const [month, setMonth] = useState(ym(today))
  const [open, setOpen] = useState(null)
  const [sub, setSub] = useState(null)

  const catsById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const months = useMemo(() => monthsWithData(txs, kind, today), [txs, kind, today])
  const m = months.includes(month) ? month : months[months.length - 1]
  const current = m === ym(today)
  const prevLabel = monthShort(mNum(addMonths(m, -1)))

  const rep = useMemo(() => categoryReport({ txs, catsById, kind, ...monthRange(m, today) }), [txs, catsById, kind, m, today])
  const prev = useMemo(() => categoryReport({ txs, catsById, kind, ...previousRange(m, today) }), [txs, catsById, kind, m, today])
  const prevById = useMemo(() => new Map(prev.rows.map((r) => [r.id, r])), [prev])
  const trend = useMemo(() => monthlyTotals({ txs, catsById, kind, months, today }), [txs, catsById, kind, months, today])

  const selId = open && rep.rows.some((r) => r.id === open) ? open : wide ? rep.rows[0]?.id : null
  const sel = selId ? rep.rows.find((r) => r.id === selId) : null
  const maxRow = rep.rows[0]?.total || 1
  const verb = kind === 'spesa' ? 'spesi' : 'incassati'
  const diff = rep.total - prev.total

  function choose(id) {
    setSub(null)
    setOpen(!wide && open === id ? null : id)
  }
  function changeMonth(next) {
    setMonth(next)
    setSub(null)
  }
  function changeKind(k) {
    setKind(k)
    setOpen(null)
    setSub(null)
  }

  const catName = (id) => (id === 'senza' ? 'Senza categoria' : catsById.get(id)?.name || 'Categoria')
  const chip = (id, size) => (id === 'senza' ? <span className={`chip ${size || ''} c-none`}><Icon name="grid" size={size === 'sm' ? 17 : 20} /></span> : <CatChip root={catsById.get(id)} size={size} />)
  const budgetLine = (total, cat) => {
    const b = kind === 'spesa' && cat ? budgetUse(total, cat.budget) : null
    if (!b) return null
    return b.ratio > 1
      ? <span className="warn">oltre il budget di {euro(b.over, { decimals: false })}</span>
      : <span>{Math.round(b.ratio * 100)}% del budget di {euro(b.budget, { decimals: false })}</span>
  }

  function detail(row) {
    const root = catsById.get(row.id)
    const rootTrend = monthlyTotals({ txs, catsById, kind, months, today, rootId: row.id })
    const { from, to } = monthRange(m, today)
    const list = txs.filter((t) => {
      if (t.kind !== kind || t.date < from || t.date > to) return false
      const r = rootCategory(catsById, t.category_id)
      if ((r ? r.id : 'senza') !== row.id) return false
      if (!sub) return true
      return sub === row.id ? !t.category_id || t.category_id === row.id : t.category_id === sub
    })
    const showSubs = row.subs.length > 1 || (row.subs[0] && row.subs[0].id !== row.id)
    return (
      <div className="cdet">
        {months.length > 1 && (
          <>
            <div className="lbl">Mese per mese</div>
            <MonthBars items={rootTrend} selected={m} onSelect={changeMonth} small />
          </>
        )}
        {showSubs && (
          <>
            <div className="lbl">Sottocategorie</div>
            {row.subs.map((s) => {
              const c = s.id === row.id ? null : catsById.get(s.id)
              const on = sub === s.id
              return (
                <button key={s.id} type="button" className={`row tap csub${on ? ' on' : ''}`} aria-pressed={on} onClick={() => setSub(on ? null : s.id)}>
                  {c ? <CatChip cat={c} root={root} size="sm" /> : chip(row.id, 'sm')}
                  <div className="txt">
                    <div className="nm">{c ? c.name : 'Senza dettaglio'}</div>
                    <div className="cbar"><i style={{ width: `${s.share * 100}%` }} /></div>
                    <div className="sb">{s.count} {s.count === 1 ? 'movimento' : 'movimenti'}{c && budgetLine(s.total, c) ? <> · {budgetLine(s.total, c)}</> : null}</div>
                  </div>
                  <div className="am"><Money value={s.total} /></div>
                </button>
              )
            })}
          </>
        )}
        <div className="lbl">{sub ? `Movimenti di ${sub === row.id ? 'senza dettaglio' : catName(sub)}` : 'Movimenti'}{sub && <button type="button" className="lnk" onClick={() => setSub(null)}>Mostra tutti</button>}</div>
        {list.map((t) => {
          const c = catsById.get(t.category_id)
          return (
            <button key={t.id} type="button" className="row tap cmov" onClick={() => onEdit(t)}>
              <span className="d">{dayShort(t.date)}</span>
              <div className="txt"><div className="nm">{t.note || c?.name || catName(row.id)}</div><div className="sb">{[t.note && c ? c.name : null, accById.get(t.account_id)?.name].filter(Boolean).join(' · ')}</div></div>
              <div className="am" style={kind === 'entrata' ? { color: 'var(--pos)' } : undefined}>{euro(t.amount)}</div>
            </button>
          )
        })}
      </div>
    )
  }

  const head = (
    <section className="card pad">
      <div className="chead">
        <div className="mnav">
          <button type="button" className="hb" aria-label="Mese precedente" disabled={!months.length || m <= months[0]} onClick={() => changeMonth(addMonths(m, -1))}><Icon name="left" /></button>
          <h2 className="h">{monthYear(m)}</h2>
          <button type="button" className="hb" aria-label="Mese successivo" disabled={current} onClick={() => changeMonth(addMonths(m, 1))}><Icon name="right" /></button>
        </div>
        <div className="segs" role="tablist" aria-label="Tipo">
          {KINDS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'seg on' : 'seg'} onClick={() => changeKind(k)}>{l}</button>)}
        </div>
      </div>
      <div className="csum">
        <div className="ctot">
          <Money className="cbig" value={rep.total} style={kind === 'entrata' ? { color: 'var(--pos)' } : undefined} />
          <div className="sb">{verb} {current ? `fino al ${Number(today.slice(8, 10))} ${monthName(mNum(m))}` : `a ${monthName(mNum(m))}`}, su tutti i conti e carte</div>
          {prev.total > 0 && (
            <div className="pill" style={{ marginTop: 10 }}>
              {Math.abs(diff) < 1 ? `Come a ${monthName(mNum(addMonths(m, -1)))}` : `${euro(Math.abs(diff), { decimals: false })} in ${diff > 0 ? 'più' : 'meno'} di ${monthName(mNum(addMonths(m, -1)))}`}{current ? ', allo stesso giorno' : ''}
            </div>
          )}
        </div>
        {months.length > 1 && <MonthBars items={trend} selected={m} onSelect={changeMonth} />}
      </div>
    </section>
  )

  const rows = rep.rows.map((r) => {
    const cat = catsById.get(r.id)
    const on = selId === r.id
    const p = prevById.get(r.id)
    return (
      <div key={r.id} className={`crow${on ? ' on' : ''}`}>
        <button type="button" className="row tap" aria-expanded={wide ? undefined : on} aria-pressed={wide ? on : undefined} onClick={() => choose(r.id)}>
          {chip(r.id)}
          <div className="txt">
            <div className="nm">{catName(r.id)}</div>
            <div className="cbar"><i style={{ width: `${(r.total / maxRow) * 100}%` }} /></div>
            <div className="sb">{Math.round(r.share * 100)}% · {r.count} {r.count === 1 ? 'movimento' : 'movimenti'}{budgetLine(r.total, cat) ? <> · {budgetLine(r.total, cat)}</> : null}</div>
          </div>
          <div className="am">
            <Money value={r.total} />
            <Delta now={r.total} before={p ? p.total : 0} kind={kind} label={prevLabel} />
          </div>
          {!wide && <Icon name="chevdown" size={18} className={`cchev${on ? ' up' : ''}`} />}
        </button>
        {!wide && on && detail(r)}
      </div>
    )
  })

  return (
    <>
      {head}
      {rep.rows.length === 0 ? (
        <section className="card pad"><div className="empty">Nessun{kind === 'spesa' ? 'a spesa' : "'entrata"} in questo mese</div></section>
      ) : wide ? (
        <div className="grid g-cat">
          <section className="card pad"><h2 className="h" style={{ marginBottom: 6 }}>Categorie</h2>{rows}</section>
          {sel && (
            <section className="card pad">
              <div className="cdhead">
                {chip(sel.id, 'lg')}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 className="h">{catName(sel.id)}</h2>
                  <div className="sb">{Math.round(sel.share * 100)}% di quanto hai {verb === 'spesi' ? 'speso' : 'incassato'} a {monthName(mNum(m))}</div>
                </div>
                <Money className="cdtot" value={sel.total} />
              </div>
              {detail(sel)}
            </section>
          )}
        </div>
      ) : (
        <section className="card pad">{rows}</section>
      )}
    </>
  )
}
