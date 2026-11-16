import { useEffect, useMemo, useRef, useState } from 'react'
import { euro, dayShort } from '../lib/format.js'

function useWidth() {
  const ref = useRef(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver((e) => setW(Math.floor(e[0].contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

// Curva monotona (nessun "rimbalzo" sopra o sotto i valori reali).
function monotonePath(pts) {
  const n = pts.length
  if (n === 0) return ''
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`
  const dx = [], dy = [], m = []
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); dy.push(pts[i + 1][1] - pts[i][1]); m.push(dy[i] / dx[i]) }
  const t = [m[0]]
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2)
  t.push(m[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i] }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += ` C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + t[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - t[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`
  }
  return d
}

function niceStep(range) {
  const steps = [50, 100, 200, 250, 500, 1000, 1500, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000]
  return steps.find((s) => range / s <= 3) || 200000
}

export default function BalanceChart({ series, limit, height = 180 }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)

  const g = useMemo(() => {
    if (!width || series.length === 0) return null
    const vals = series.map((p) => p.value)
    let lo = Math.min(...vals), hi = Math.max(...vals)
    if (limit !== null && limit !== undefined) lo = Math.min(lo, limit)
    const span = Math.max(hi - lo, 100)
    lo -= span * 0.06
    hi += span * 0.1
    const step = niceStep(hi - lo)
    const ticks = []
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v)
    const padR = 6
    const X = (i) => (series.length === 1 ? width / 2 : (i / (series.length - 1)) * (width - padR))
    const Y = (v) => ((hi - v) / (hi - lo)) * height
    const pts = series.map((p, i) => [X(i), Y(p.value)])
    const line = monotonePath(pts)
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`
    return { X, Y, pts, line, area, ticks: ticks.filter((v) => limit === undefined || limit === null || Math.abs(Y(v) - Y(limit)) > 14) }
  }, [series, limit, width, height])

  const n = series.length
  const last = n ? series[n - 1] : null
  const labels = n > 3 ? [0, Math.round((n - 1) / 3), Math.round(((n - 1) * 2) / 3), n - 1] : series.map((_, i) => i)

  function onMove(e) {
    if (!g) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left
    const i = Math.max(0, Math.min(n - 1, Math.round((x / (width - 6)) * (n - 1))))
    setHover(i)
  }

  const hp = g && hover !== null ? g.pts[hover] : null
  return (
    <div>
      <div ref={ref} style={{ position: 'relative', height, touchAction: 'pan-y' }} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {g && (
          <>
            {g.ticks.map((v) => (
              <div key={v}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: g.Y(v), borderTop: '1px dashed var(--grid)' }} />
                <div style={{ position: 'absolute', left: 0, top: g.Y(v) - 17, fontSize: 12, color: 'var(--mute)' }}>{euro(v, { decimals: false })}</div>
              </div>
            ))}
            {limit !== null && limit !== undefined && (
              <>
                <div style={{ position: 'absolute', left: 0, right: 0, top: g.Y(limit), borderTop: '1px dashed var(--warnline)' }} />
                <div style={{ position: 'absolute', right: 0, top: g.Y(limit) + 3, fontSize: 12, lineHeight: '14px', color: 'var(--warn)' }}>limite del fido {euro(limit, { decimals: false })}</div>
              </>
            )}
            <svg width={width} height={height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden="true">
              <defs>
                <linearGradient id="tf-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style={{ stopColor: 'rgb(var(--rgb))', stopOpacity: 'var(--aa)' }} />
                  <stop offset="0.94" style={{ stopColor: 'rgb(var(--rgb))', stopOpacity: 0 }} />
                </linearGradient>
              </defs>
              <path d={g.area} fill="url(#tf-area)" />
            </svg>
            <svg width={width} height={height} style={{ position: 'absolute', inset: 0, overflow: 'visible', filter: 'drop-shadow(0 0 6px rgba(var(--rgb), var(--lg)))' }} aria-hidden="true">
              <path d={g.line} fill="none" style={{ stroke: 'var(--acct)' }} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div style={{ position: 'absolute', left: g.pts[n - 1][0] - 6, top: g.pts[n - 1][1] - 6, width: 12, height: 12, borderRadius: '50%', background: 'var(--acct)', boxShadow: '0 0 0 5px rgba(var(--rgb), .28), 0 0 14px rgba(var(--rgb), var(--lg))' }} />
            {hp ? (
              <>
                <div style={{ position: 'absolute', left: hp[0], top: 0, bottom: 0, borderLeft: '1px solid var(--grid)' }} />
                <div style={{ position: 'absolute', left: hp[0] - 5, top: hp[1] - 5, width: 10, height: 10, borderRadius: '50%', background: 'var(--cardsolid)', border: '2px solid var(--acct)' }} />
                <div className="tip" style={{ left: Math.min(Math.max(hp[0] - 60, 0), width - 120), top: Math.max(hp[1] - 58, 0), width: 120 }}>
                  <b>{euro(series[hover].value)}</b>
                  <small>{dayShort(series[hover].date)}</small>
                </div>
              </>
            ) : (
              last && (
                <div className="tip" style={{ right: 14, top: Math.max(g.pts[n - 1][1] - 58, 0) }}>
                  <b>{euro(last.value)}</b>
                  <small>Adesso</small>
                </div>
              )
            )}
          </>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, lineHeight: '18px', color: 'var(--mute)' }}>
        {labels.map((i) => (
          <span key={i}>{i === n - 1 ? 'Oggi' : dayShort(series[i].date)}</span>
        ))}
      </div>
    </div>
  )
}
