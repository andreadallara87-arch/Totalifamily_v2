import { useEffect, useMemo, useRef, useState } from 'react'
import { euro } from '../lib/format.js'

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

const short = (v) => {
  const a = Math.abs(v)
  const s = a >= 1000 ? `${(a / 1000).toLocaleString('it-IT', { maximumFractionDigits: a >= 100000 ? 0 : 1 })}k` : String(Math.round(a))
  return `${v < 0 ? '−' : ''}${s}`
}

/**
 * Linea luminosa di pochi punti (uno per mese) con etichette sotto.
 * points: [{ key, label, value }]. Il punto scelto mostra il valore.
 */
export default function TrendLine({ points, selected, onSelect, height = 170 }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const g = useMemo(() => {
    if (!width || !points.length) return null
    const vals = points.map((p) => p.value)
    let lo = Math.min(...vals), hi = Math.max(...vals)
    const span = Math.max(hi - lo, 200)
    lo -= span * 0.35
    hi += span * 0.35
    const padX = 28
    const X = (i) => (points.length === 1 ? width / 2 : padX + (i / (points.length - 1)) * (width - padX * 2))
    const Y = (v) => 8 + ((hi - v) / (hi - lo)) * (height - 16)
    const pts = points.map((p, i) => [X(i), Y(p.value)])
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
    const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${height} L${pts[0][0].toFixed(1)},${height} Z`
    return { pts, line, area }
  }, [points, width, height])

  const active = hover ?? points.findIndex((p) => p.key === selected)
  const ap = g && active >= 0 ? g.pts[active] : null
  return (
    <div className="tline">
      <div ref={ref} style={{ position: 'relative', height }} onPointerLeave={() => setHover(null)}>
        {g && (
          <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
            <defs>
              <linearGradient id="tl-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--acc)" stopOpacity="var(--aa)" />
                <stop offset="1" stopColor="var(--acc)" stopOpacity="0" />
              </linearGradient>
              <filter id="tl-glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
            </defs>
            <path d={g.area} fill="url(#tl-fill)" />
            <path d={g.line} fill="none" stroke="var(--acc)" strokeWidth="6" strokeOpacity="var(--lg)" filter="url(#tl-glow)" />
            <path d={g.line} fill="none" stroke="var(--acc)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {g.pts.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={i === active ? 6 : 3.5} fill={i === active ? 'var(--acc)' : 'var(--cardsolid)'} stroke="var(--acc)" strokeWidth="2" />
            ))}
          </svg>
        )}
        {g && g.pts.map((p, i) => (
          <button
            key={points[i].key}
            type="button"
            className="tl-hit"
            style={{ left: p[0] - 24, width: 48 }}
            aria-label={`${points[i].label}: ${euro(points[i].value)}`}
            onPointerEnter={() => setHover(i)}
            onClick={() => onSelect && onSelect(points[i].key)}
          />
        ))}
        {ap && (
          <div className="tip" style={{ left: Math.min(Math.max(ap[0] - 60, 0), width - 120), top: Math.max(ap[1] - 56, -6), width: 120 }}>
            <b>{euro(points[active].value, { decimals: false })}</b>
            <small>{points[active].label}</small>
          </div>
        )}
      </div>
      {g && (
        <div style={{ position: 'relative', height: 18, marginTop: 8 }}>
          {g.pts.map((p, i) => (
            <span key={points[i].key} className={`tl-lab${i === active ? ' on' : ''}`} style={{ left: p[0] }}>{points[i].short || short(points[i].value)}</span>
          ))}
        </div>
      )}
    </div>
  )
}
