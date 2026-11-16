import { useMemo, useState } from 'react'
import { euro, dayShort, monthShort } from '../lib/format.js'
import { monotonePath, niceStep, useWidth } from './BalanceChart.jsx'

/**
 * Saldo dei conti giorno per giorno: linea piena fino a oggi, tratteggiata dopo (previsione).
 * La fascia sotto il limite del fido è colorata.
 */
export default function FlowChart({ series, limit, today, height = 220 }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const n = series.length
  const ti = Math.max(0, series.findIndex((p) => p.date === today))

  const g = useMemo(() => {
    if (!width || n === 0) return null
    const vals = series.map((p) => p.value)
    let lo = Math.min(...vals), hi = Math.max(...vals)
    if (limit !== null && limit !== undefined) { lo = Math.min(lo, limit); hi = Math.max(hi, limit) }
    const span = Math.max(hi - lo, 100)
    lo -= span * 0.08
    hi += span * 0.12
    const step = niceStep(hi - lo)
    const ticks = []
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v)
    const X = (i) => (n === 1 ? width / 2 : (i / (n - 1)) * (width - 4))
    const Y = (v) => ((hi - v) / (hi - lo)) * height
    const pts = series.map((p, i) => [X(i), Y(p.value)])
    const past = monotonePath(pts.slice(0, ti + 1))
    const future = monotonePath(pts.slice(ti))
    const area = `${past} L${pts[ti][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`
    const months = []
    series.forEach((p, i) => { if (p.date.endsWith('-01')) months.push({ i, x: X(i), m: Number(p.date.slice(5, 7)), y: p.date.slice(0, 4) }) })
    const near = (v) => limit !== null && limit !== undefined && Math.abs(Y(v) - Y(limit)) < 16
    return { X, Y, pts, past, future, area, months, ticks: ticks.filter((v) => !near(v)) }
  }, [series, limit, width, height, n, ti])

  function onMove(e) {
    if (!g) return
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / (width - 4)) * (n - 1))))
    setHover(i)
  }

  const every = g && width < 520 && g.months.length > 7 ? 2 : 1
  const hp = g && hover !== null ? g.pts[hover] : null
  const hv = hover !== null ? series[hover] : null
  return (
    <div className="flc">
      <div ref={ref} style={{ position: 'relative', height, touchAction: 'pan-y' }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        {g && (
          <>
            {limit !== null && limit !== undefined && (
              <div className="flc-over" style={{ top: g.Y(limit) }} />
            )}
            {g.ticks.map((v) => (
              <div key={v}>
                <div className="flc-grid" style={{ top: g.Y(v) }} />
                <div className="flc-tick" style={{ top: g.Y(v) - 17 }}>{euro(v, { decimals: false })}</div>
              </div>
            ))}
            {limit !== null && limit !== undefined && (
              <>
                <div className="flc-limit" style={{ top: g.Y(limit) }} />
                <div className="flc-limit-l" style={{ top: g.Y(limit) + 3 }}>limite del fido {euro(limit, { decimals: false })}</div>
              </>
            )}
            <div className="flc-today" style={{ left: g.pts[ti][0] }}><span>Oggi</span></div>
            <svg width={width} height={height} className="flc-svg" aria-hidden="true">
              <defs>
                <linearGradient id="tf-flow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style={{ stopColor: 'rgb(var(--rgb))', stopOpacity: 'var(--aa)' }} />
                  <stop offset="0.94" style={{ stopColor: 'rgb(var(--rgb))', stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              <path d={g.area} fill="url(#tf-flow)" />
              <path d={g.future} fill="none" className="flc-future" strokeWidth="2.4" strokeDasharray="2 6" strokeLinecap="round" />
            </svg>
            <svg width={width} height={height} className="flc-svg glow" aria-hidden="true">
              <path d={g.past} fill="none" style={{ stroke: 'var(--acct)' }} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="flc-dot" style={{ left: g.pts[ti][0] - 6, top: g.pts[ti][1] - 6 }} />
            {hp && hv && (
              <>
                <div className="flc-cursor" style={{ left: hp[0] }} />
                <div className="flc-hdot" style={{ left: hp[0] - 5, top: hp[1] - 5 }} />
                <div className="tip" style={{ left: Math.min(Math.max(hp[0] - 70, 0), width - 140), top: Math.max(hp[1] - 62, 0), width: 140 }}>
                  <b className={limit !== null && hv.value < limit ? 'warn' : undefined}>{euro(hv.value, { decimals: false })}</b>
                  <small>{dayShort(hv.date)}{hv.forecast ? ' · previsto' : ''}</small>
                </div>
              </>
            )}
          </>
        )}
      </div>
      <div className="flc-x" aria-hidden="true">
        {g && g.months.map((mo, k) => (k % every === 0 ? <span key={mo.i} style={{ left: mo.x }}>{monthShort(mo.m)}{mo.m === 1 ? ` ${mo.y}` : ''}</span> : null))}
      </div>
    </div>
  )
}
