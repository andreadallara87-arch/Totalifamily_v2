import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import { supabase } from '../lib/supabase.js'

function friendly(error) {
  const m = `${error?.code || ''} ${error?.message || ''}`
  if (/invalid_credentials|Invalid login/i.test(m)) return 'Email o password non corrette.'
  if (/email_not_confirmed|not confirmed/i.test(m)) return "Conferma prima l'indirizzo: ti è arrivata un'email con il link."
  if (/Database error saving new user|unexpected_failure/i.test(m)) return 'La registrazione è chiusa: Totalifamily ha già il suo proprietario.'
  if (/passkey_disabled/i.test(m)) return 'Face ID e impronta non sono ancora attivi: entra con la password.'
  if (/webauthn_credential_not_found/i.test(m)) return 'Questo dispositivo non è registrato: entra con la password e attivalo da Impostazioni.'
  if (/abort|cancel|NotAllowed/i.test(`${error?.name} ${m}`)) return 'Operazione annullata.'
  if (/weak_password|at least/i.test(m)) return 'Password troppo debole: usa almeno 8 caratteri.'
  if (/rate limit|over_email_send_rate_limit/i.test(m)) return 'Troppi tentativi: riprova tra qualche minuto.'
  return error?.message || 'Qualcosa non ha funzionato.'
}

export default function Login({ recovery, onRecovered }) {
  const [mode, setMode] = useState(recovery ? 'newpass' : 'login')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const passkeys = typeof window !== 'undefined' && !!window.PublicKeyCredential
  const here = window.location.origin + window.location.pathname

  async function run(fn) {
    setBusy(true); setMsg(null)
    try { await fn() } catch (e) { setMsg({ err: friendly(e) }) } finally { setBusy(false) }
  }

  const onPasskey = () => run(async () => {
    const { error } = await supabase.auth.signInWithPasskey()
    if (error) throw error
  })
  const onLogin = (e) => { e.preventDefault(); run(async () => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
    if (error) throw error
  }) }
  const onSignup = (e) => { e.preventDefault(); run(async () => {
    if (pw.length < 8) throw new Error('Usa una password di almeno 8 caratteri.')
    if (pw !== pw2) throw new Error('Le due password non coincidono.')
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { data: { name: name.trim() }, emailRedirectTo: here } })
    if (error) throw error
    if (!data.session) setMsg({ ok: `Ti ho mandato un'email a ${email.trim()}: apri il link per confermare, poi entra qui con la password.` })
  }) }
  const onReset = (e) => { e.preventDefault(); run(async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: here })
    if (error) throw error
    setMsg({ ok: "Se l'indirizzo è giusto, ti è arrivata un'email con il link per scegliere una nuova password." })
  }) }
  const onNewPass = (e) => { e.preventDefault(); run(async () => {
    if (pw.length < 8) throw new Error('Usa una password di almeno 8 caratteri.')
    if (pw !== pw2) throw new Error('Le due password non coincidono.')
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) throw error
    onRecovered?.()
  }) }

  return (
    <div className="auth">
      <div className="glow a" /><div className="glow b" />
      <div className="card">
        <div className="brand" style={{ padding: 0 }}>
          <div className="logo">T</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Totalifamily</div>
        </div>

        {mode === 'login' && (
          <>
            <div><h1 style={{ margin: 0, fontSize: 26, letterSpacing: '-0.02em' }}>Bentornato</h1><div className="sb">Le tue finanze, al sicuro.</div></div>
            {passkeys && (
              <button type="button" className="btn full" disabled={busy} onClick={onPasskey}><Icon name="face" size={20} />Entra con Face ID o impronta</button>
            )}
            {passkeys && <div className="divider">oppure con la password</div>}
            <form onSubmit={onLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field"><label htmlFor="em">Email</label><input id="em" type="email" autoComplete="username webauthn" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
              <button type="submit" className={passkeys ? 'btn ghost full' : 'btn full'} disabled={busy}>Entra</button>
            </form>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" className="linkbtn" onClick={() => { setMode('reset'); setMsg(null) }}>Password dimenticata?</button>
              <button type="button" className="linkbtn" onClick={() => { setMode('signup'); setMsg(null) }}>Primo accesso</button>
            </div>
          </>
        )}

        {mode === 'signup' && (
          <form onSubmit={onSignup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><h1 style={{ margin: 0, fontSize: 24 }}>Crea il tuo accesso</h1><div className="sb">Si fa una volta sola: dopo, la registrazione si chiude e i tuoi dati importati diventano tuoi.</div></div>
            <div className="field"><label htmlFor="nm">Nome</label><input id="nm" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="field"><label htmlFor="em2">Email</label><input id="em2" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label htmlFor="p1">Password</label><input id="p1" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div className="field"><label htmlFor="p2">Ripeti la password</label><input id="p2" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
            <button type="submit" className="btn full" disabled={busy}>Crea accesso</button>
            <button type="button" className="linkbtn" onClick={() => { setMode('login'); setMsg(null) }}>Ho già un accesso</button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={onReset} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><h1 style={{ margin: 0, fontSize: 24 }}>Nuova password</h1><div className="sb">Ti mando un link per sceglierne una nuova.</div></div>
            <div className="field"><label htmlFor="em3">Email</label><input id="em3" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <button type="submit" className="btn full" disabled={busy}>Invia il link</button>
            <button type="button" className="linkbtn" onClick={() => { setMode('login'); setMsg(null) }}>Torna all'accesso</button>
          </form>
        )}

        {mode === 'newpass' && (
          <form onSubmit={onNewPass} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div><h1 style={{ margin: 0, fontSize: 24 }}>Scegli la nuova password</h1></div>
            <div className="field"><label htmlFor="p3">Nuova password</label><input id="p3" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
            <div className="field"><label htmlFor="p4">Ripeti la password</label><input id="p4" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
            <button type="submit" className="btn full" disabled={busy}>Salva</button>
          </form>
        )}

        {msg?.err && <div className="err" role="alert">{msg.err}</div>}
        {msg?.ok && <div className="ok" role="status">{msg.ok}</div>}
      </div>
    </div>
  )
}
