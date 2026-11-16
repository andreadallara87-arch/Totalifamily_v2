import { euroParts } from '../lib/format.js'

/** Importo con decimali piccoli: 554,17 € */
export default function Money({ value, sign = false, className, style }) {
  const p = euroParts(value, { sign })
  return (
    <span className={className} style={style}>
      {p.int}
      <span className="dec">{p.dec}</span> €
    </span>
  )
}
