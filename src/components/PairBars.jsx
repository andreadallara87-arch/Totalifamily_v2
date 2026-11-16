import { euro, monthShort } from '../lib/format.js'

const mNum = (m) => Number(m.slice(5, 7))
const short = (v) => {
  const a = Math.abs(v)
  return a >= 10000 ? `${Math.round(a / 1000)}k` : a >= 1000 ? `${(a / 1000).toFixed(1).replace('.', ',')}k` : String(Math.round(a))
}

/**
 * Colonne mese per mese: entrate (verdi) accanto alle spese (colore d'accento).
 * Sotto ogni mese la differenza. Toccando un mese lo si sceglie.
 */
export default function PairBars({ items, selected, onSelect, show = 'both', height = 190, net = true }) {
  const max = Math.max(1, ...items.map((i) => Math.max(show !== 'out' ? i.inn : 0, show !== 'inn' ? i.out : 0)))
  const h = (v) => `${v ? Math.max(2, (v / max) * 100) : 0}%`
  return (
    <div className={`pbars${selected ? '' : ' all'}`} style={{ height }}>
      {items.map((i) => {
        const on = i.month === selected
        const d = Math.round((i.inn - i.out) * 100) / 100
        const label = `${monthShort(mNum(i.month))} ${i.month.slice(0, 4)}: entrate ${euro(i.inn)}, spese ${euro(i.out)}`
        return (
          <button key={i.month} type="button" className={`pbar${on ? ' on' : ''}`} aria-pressed={on} aria-label={label} onClick={() => onSelect && onSelect(i.month)}>
            <span className="cols">
              {show !== 'out' && <i className="inn" style={{ height: h(i.inn) }}><em>{i.inn ? short(i.inn) : ''}</em></i>}
              {show !== 'inn' && <i className="out" style={{ height: h(i.out) }}><em>{i.out ? short(i.out) : ''}</em></i>}
            </span>
            <span className="l">{monthShort(mNum(i.month))}{i.partial ? '*' : ''}</span>
            {net && show === 'both' && <span className={`n ${d >= 0 ? 'pos' : 'warn'}`}>{d >= 0 ? '+' : '−'}{short(d)}</span>}
          </button>
        )
      })}
    </div>
  )
}
