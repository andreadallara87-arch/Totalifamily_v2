export const DONUT_COLORS = ['#F472B6', '#FF9D47', '#A98BFF', '#4ADE9F', '#60A5FA', '#8A8A96']

export default function Donut({ parts, size = 140, children }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  let acc = 0
  const gap = parts.length > 1 ? 0.8 : 0
  const stops = parts.map((p, i) => {
    const a = (acc / total) * 100
    acc += p.value
    const b = (acc / total) * 100
    const end = Math.max(a, b - gap)
    return `${p.color} ${a.toFixed(2)}% ${end.toFixed(2)}%, transparent ${end.toFixed(2)}% ${b.toFixed(2)}%`
  })
  const bg = parts.length ? `conic-gradient(${stops.join(', ')})` : 'var(--track)'
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <div className="donut" style={{ width: size, height: size, background: bg }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  )
}
