import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { supabase } from '../lib/supabase.js'
import { markPasskeyUsed, passkeyUsedHere } from '../lib/lock.js'

function friendly(error) {
  const m = `${error?.code || ''} ${error?.message || ''}`
  if (/invalid_credentials|Invalid login/i.test(m)) return 'Password non corretta.'
  if (/webauthn_credential_not_found/i.test(m)) return 'Face ID non è attivo su questo dispositivo: sblocca con la password e attivalo da Impostazioni.'
  if (/passkey_disabled/i.test(m)) return 'Face ID e impronta non sono attivi: sblocca con la password.'
  if (/abort|cancel|NotAllowed/i.test(`${error?.name} ${m}`)) return 'Operazione annullata.'
  if (/rate limit/i.test(m)) return 'Troppi tentativi: riprova tra qualche minuto.'
  return error?.message || 'Qualcosa non ha funzionato.'
}

// Schermata di blocco: i dati restano nascosti finché non si sblocca con Face ID/impronta o con la password.
export default function Lock({ session, onUnlock }) {
  const email = session.user.email || ''
  const name = session.user.user_metadata?.name || ''
  const passkeys = typeof window !== 'undefined' && !!window.PublicKeyCredential
  const [pw, setPw] = useState('')
  const [showPw, setShowPw] = useState(!passkeys)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const tried = useRef(false)

  async function passkey(auto) {
    setBusy(true); setMsg(null)
    try {
      const { data, error } = await supabase.auth.signInWithPasskey()
      if (error) throw error
      if (data?.user?.id && data.user.id !== session.user.id) throw new Error('Questo Face ID appartiene a un altro account.')
      markPasskeyUsed()
      onUnlock()
    } catch (e) {
      // Se il tentativo automatico non parte (il telefono a volte vuole un tocco), resta il pulsante, senza errori.
      if (!auto) setMsg(friendly(e))
    } finally { setBusy(false) }
  }

  useEffect(() => {
    if (tried.current || !passkeys || !passkeyUsedHere()) return
    tried.current = true
    passkey(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function onPassword(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw })
      if (error) throw error
      onUnlock()
    } catch (err) { setMsg(friendly(err)) } finally { setBusy(false) }
  }

  return (
    <div className="auth">
      <div className="glow a" /><div className="glow b" />
      <div className="card">
        <div className="brand" style={{ padding: 0 }}>
          <div className="logo">T</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Totalifamily</div>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, letterSpacing: '-0.02em' }}>{name ? `Ciao ${name}` : 'App bloccata'}</h1>
          <div className="sb">Sblocca per vedere le tue finanze.</div>
        </div>
        {passkeys && (
          <button type="button" className="btn full" disabled={busy} onClick={() => passkey(false)}><Icon name="face" size={20} />Sblocca con Face ID o impronta</button>
        )}
        {showPw ? (
          <form onSubmit={onPassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {passkeys && <div className="divider">oppure con la password</div>}
            <input type="email" autoComplete="username" value={email} readOnly hidden />
            <div className="field"><label htmlFor="lockpw">Password</label><input id="lockpw" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <button type="submit" className={passkeys ? 'btn ghost full' : 'btn full'} disabled={busy}>Sblocca</button>
          </form>
        ) : (
          <button type="button" className="linkbtn" onClick={() => { setShowPw(true); setMsg(null) }}>Usa la password</button>
        )}
        {msg && <div className="err" role="alert">{msg}</div>}
        <button type="button" className="linkbtn" style={{ color: 'var(--mute)' }} onClick={() => supabase.auth.signOut()}>Esci da questo dispositivo</button>
      </div>
    </div>
  )
}
