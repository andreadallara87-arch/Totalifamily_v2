import { CAT_ICONS } from '../lib/catIcons.js'

const SIZES = { xs: 15, sm: 17, '': 20, lg: 24 }

export function CatIcon({ name, size = 20 }) {
  return <svg className="ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: CAT_ICONS[name] || CAT_ICONS.ellipsis }} />
}

/** Icona colorata di una categoria: colore della categoria principale, icona della sottocategoria se c'è. */
export default function CatChip({ cat, root, size = '' }) {
  const tint = root?.tint || cat?.tint || 'none'
  return (
    <span className={`chip ${size} c-${tint}`} aria-hidden="true">
      <CatIcon name={cat?.symbol || root?.symbol} size={SIZES[size]} />
    </span>
  )
}
