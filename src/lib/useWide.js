import { useEffect, useState } from 'react'

const QUERY = '(min-width: 861px)'

/** true sullo schermo del computer, false sul telefono (stesso limite di 860px dei fogli di stile). */
export default function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}
