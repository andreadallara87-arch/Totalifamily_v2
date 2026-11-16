import { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import CatChip from '../components/CatChip.jsx'
import { addMonths, rootCategory, ym } from '../lib/calc.js'
import { dayLong, euro, monthYear } from '../lib/format.js'
import { kindVisual } from '../lib/visual.js'

const FILTERS = [
  { id: 'tutti', label: 'Tutti' },
  { id: 'spesa', label: 'Spese' },
  { id: 'entrata', label: 'Entrate' },
  { id: 'giroconto', label: 'Giroconti' },
]

export default function Movimenti({ data, today }) {
  const [month, setMonth] = useState(ym(today))
  const [filter, setFilter] = useState('tutti')
  const [q, setQ] = useState('')
  const { accounts, categories, txs } = data

  const view = useMemo(() => {
    const catsById = new Map(categories.map((c) => [c.id, c]))
    const accById = new Map(accounts.map((a) => [a.id, a]))
    const needle = q.trim().toLowerCase()
    const rows = txs.filter((t) => {
      if (!needle && ym(t.date) !== month) return false
      if (filter !== 'tutti' && t.kind !== filter) return false
      if (!needle) return true
      const c = catsById.get(t.category_id)
      const hay = [t.note, c?.name, rootCategory(catsById, t.category_id)?.name, accById.get(t.account_id)?.name, accById.get(t.to_account_id)?.name, String(t.amount).replace('.', ',')].join(' ').toLowerCase()
      return hay.includes(needle)
    })
    const days = []
    for (const t of rows) {
      if (!days.length || days[days.length - 1].date !== t.date) days.push({ date: t.date, items: [] })
      days[days.length - 1].items.push(t)
    }
    const out = rows.filter((t) => t.kind === 'spesa').reduce((s, t) => s + t.amount, 0)
    const inn = rows.filter((t) => t.kind === 'entrata').reduce((s, t) => s + t.amount, 0)
    return { days, out, inn, count: rows.length, catsById, accById }
  }, [txs, categories, accounts, month, filter, q])

  const minMonth = txs.length ? ym(txs[txs.length - 1].date) : month
  const maxMonth = txs.length ? ym(txs[0].date) : month

  return (
    <section className="card pad">
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" className="hb" aria-label="Mese precedente" disabled={month <= minMonth || !!q} onClick={() => setMonth(addMonths(month, -1))}><Icon name="left" /></button>
          <h2 className="h" style={{ minWidth: 150, textAlign: 'center' }}>{q ? 'Ricerca' : monthYear(month)}</h2>
          <button type="button" className="hb" aria-label="Mese successivo" disabled={month >= maxMonth || !!q} onClick={() => setMonth(addMonths(month, 1))}><Icon name="right" /></button>
        </div>
        <div className="segs">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={filter === f.id ? 'seg on' : 'seg'} onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </div>
      </div>
      <label className="search" style={{ marginTop: 14 }}>
        <Icon name="search" size={18} />
        <input type="search" placeholder="Cerca nota, categoria, conto, importo" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 16, rowGap: 4, marginTop: 12, fontSize: 13, whiteSpace: 'nowrap' }} className="mute">
        <span>{view.count} movimenti</span>
        <span>Spese <b style={{ color: 'var(--ink)' }}>{euro(view.out)}</b></span>
        <span>Entrate <b className="pos">{euro(view.inn)}</b></span>
      </div>
      {view.days.length === 0 && <div className="empty">Nessun movimento</div>}
      {view.days.map((d) => (
        <div key={d.date}>
          <div className="list-day">{dayLong(d.date)}{d.date > today ? ' · in arrivo' : ''}</div>
          {d.items.map((t) => {
            const c = view.catsById.get(t.category_id)
            const root = rootCategory(view.catsById, t.category_id)
            const kv = kindVisual(t.kind)
            const acc = view.accById.get(t.account_id)?.name
            const title = t.kind === 'giroconto' ? `${acc} → ${view.accById.get(t.to_account_id)?.name}` : t.note || c?.name || (t.kind === 'entrata' ? 'Entrata' : 'Spesa')
            const sub = t.kind === 'giroconto' ? t.note || 'Giroconto' : [root && c && root.id !== c.id ? `${root.name} › ${c.name}` : c?.name, acc].filter(Boolean).join(' · ')
            const sign = t.kind === 'entrata' ? 1 : t.kind === 'spesa' ? -1 : 0
            return (
              <div className="row" key={t.id}>
                {c && t.kind !== 'giroconto' ? <CatChip cat={c} root={root} /> : <div className={`chip ${kv.chip}`}><Icon name={kv.icon} /></div>}
                <div className="txt"><div className="nm">{title}{t.planned ? <span className="badge">previsto</span> : null}</div><div className="sb">{sub}</div></div>
                <div className="am" style={sign > 0 ? { color: 'var(--pos)' } : sign === 0 ? { color: 'var(--mute)' } : undefined}>{euro(sign === 0 ? t.amount : sign * t.amount, { sign: sign > 0 })}</div>
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}
