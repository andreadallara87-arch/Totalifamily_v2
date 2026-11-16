// Tema e colore d'accento: applicati a <html> e ricordati sul dispositivo per evitare sfarfallii.
export const ACCENTS = [
  { id: 'blu', label: 'Blu', scuro: '#4C8DFF', chiaro: '#2F6FEB' },
  { id: 'lime', label: 'Lime', scuro: '#B8F23E', chiaro: '#A3E635' },
  { id: 'viola', label: 'Viola', scuro: '#A98BFF', chiaro: '#7357F6' },
  { id: 'arancio', label: 'Arancio', scuro: '#FF9D47', chiaro: '#FF8A2B' },
  { id: 'rosa', label: 'Rosa', scuro: '#FF6FB5', chiaro: '#D9367F' },
  { id: 'menta', label: 'Menta', scuro: '#34D3B4', chiaro: '#2CCFAE' },
  { id: 'oro', label: 'Oro', scuro: '#F5C542', chiaro: '#F5C542' },
  { id: 'neutro', label: 'Bianco e nero', scuro: '#F4F4F5', chiaro: '#18181B' },
]
const KEY = 'tf-aspetto'

export function readLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { theme: v.theme === 'chiaro' ? 'chiaro' : 'scuro', accent: ACCENTS.some((a) => a.id === v.accent) ? v.accent : 'blu' }
  } catch {
    return { theme: 'scuro', accent: 'blu' }
  }
}

export function apply({ theme, accent }) {
  const el = document.documentElement
  el.className = `tf ${theme} ${accent}`
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'chiaro' ? '#F1F1F4' : '#09090B')
  try { localStorage.setItem(KEY, JSON.stringify({ theme, accent })) } catch { /* non disponibile */ }
}
