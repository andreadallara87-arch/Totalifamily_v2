import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import CatChip from '../components/CatChip.jsx'
import CategoryEditor from '../components/CategoryEditor.jsx'
import { supabase } from '../lib/supabase.js'
import { ACCENTS } from '../lib/appearance.js'
import { euro } from '../lib/format.js'

export function AppearancePicker({ look, setLook }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Tema</span>
        <div className="segs">
          <button type="button" className={look.theme === 'scuro' ? 'seg on' : 'seg'} onClick={() => setLook({ theme: 'scuro' })}>Scuro</button>
          <button type="button" className={look.theme === 'chiaro' ? 'seg on' : 'seg'} onClick={() => setLook({ theme: 'chiaro' })}>Chiaro</button>
        </div>
      </div>
      <div className="sb" style={{ margin: '12px 0 10px' }}>Colore</div>
      <div className="swatches">
        {ACCENTS.map((a) => (
          <button key={a.id} type="button" aria-label={a.label} aria-pressed={look.accent === a.id} title={a.label}
            className={`sw${look.accent === a.id ? ' on' : ''}`} style={{ background: look.theme === 'chiaro' ? a.chiaro : a.scuro }}
            onClick={() => setLook({ accent: a.id })} />
        ))}
      </div>
    </>
  )
}

function passkeyMessage(error) {
  const code = error?.code || error?.error_code || ''
  if (code === 'passkey_disabled') return 'Face ID e impronta non sono ancora attivi sul server: va acceso una volta nelle impostazioni di Supabase.'
  if (code === 'webauthn_credential_exists') return 'Questo dispositivo è già registrato.'
  if (/abort|cancel|NotAllowed/i.test(`${error?.name} ${error?.message}`)) return 'Operazione annullata.'
  return error?.message || 'Operazione non riuscita.'
}

function Passkeys() {
  const [list, setList] = useState(null)
  const [msg, setMsg] = useState(null)
  const supported = typeof window !== 'undefined' && !!window.PublicKeyCredential

  async function refresh() {
    const { data, error } = await supabase.auth.passkey.list()
    if (error) { setList([]); if (error.code === 'passkey_disabled') setMsg({ err: passkeyMessage(error) }); return }
    setList(data || [])
  }
  useEffect(() => { refresh() }, [])

  async function add() {
    setMsg(null)
    const { error } = await supabase.auth.registerPasskey()
    if (error) setMsg({ err: passkeyMessage(error) })
    else { setMsg({ ok: 'Fatto: da ora puoi entrare con Face ID o impronta su questo dispositivo.' }); refresh() }
  }
  async function remove(id) {
    const { error } = await supabase.auth.passkey.delete({ passkeyId: id })
    if (error) setMsg({ err: passkeyMessage(error) })
    refresh()
  }

  return (
    <>
      <div className="sb" style={{ marginBottom: 6 }}>Entra senza password con Face ID, impronta o il PIN del dispositivo.</div>
      {list && list.map((p) => (
        <div className="row" key={p.id}>
          <div className="chip c-verde"><Icon name="face" /></div>
          <div className="txt"><div className="nm">{p.friendly_name || 'Dispositivo'}</div><div className="sb">Aggiunto il {new Date(p.created_at).toLocaleDateString('it-IT')}{p.last_used_at ? `, ultimo uso ${new Date(p.last_used_at).toLocaleDateString('it-IT')}` : ''}</div></div>
          <button type="button" className="hb" aria-label="Rimuovi" onClick={() => remove(p.id)} style={{ marginLeft: 'auto' }}><Icon name="trash" size={18} /></button>
        </div>
      ))}
      {supported ? (
        <button type="button" className="btn small" style={{ marginTop: 10 }} onClick={add}><Icon name="face" size={18} />Attiva su questo dispositivo</button>
      ) : (
        <div className="sb">Questo browser non supporta Face ID o impronta.</div>
      )}
      {msg?.err && <div className="err" style={{ marginTop: 10 }}>{msg.err}</div>}
      {msg?.ok && <div className="ok" style={{ marginTop: 10 }}>{msg.ok}</div>}
    </>
  )
}

function ChangePassword() {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState(null)
  async function save(e) {
    e.preventDefault()
    if (pw.length < 8) return setMsg({ err: 'Usa almeno 8 caratteri.' })
    const { error } = await supabase.auth.updateUser({ password: pw })
    setMsg(error ? { err: error.message } : { ok: 'Password aggiornata.' })
    if (!error) setPw('')
  }
  return (
    <form onSubmit={save} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
      <div className="field" style={{ flex: 1, minWidth: 200 }}>
        <label htmlFor="np">Nuova password</label>
        <input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>
      <button className="btn ghost" type="submit" style={{ height: 50 }}>Cambia</button>
      {msg?.err && <div className="err" style={{ width: '100%' }}>{msg.err}</div>}
      {msg?.ok && <div className="ok" style={{ width: '100%' }}>{msg.ok}</div>}
    </form>
  )
}

function ImportReport({ imp }) {
  const r = imp.report
  if (!r) return null
  const lost = Object.values(r.originali_mancanti || {}).reduce((s, v) => s + v, 0) + (r.campi_diversi || 0)
  return (
    <>
      <div className="row">
        <div className={`chip ${lost === 0 ? 'c-verde' : 'c-rosso'}`}><Icon name={lost === 0 ? 'check' : 'alert'} /></div>
        <div className="txt">
          <div className="nm">{lost === 0 ? 'Nessun dato perso' : 'Da controllare'}</div>
          <div className="sb" style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{imp.source}, importato il {new Date(imp.imported_at).toLocaleDateString('it-IT')}</div>
        </div>
      </div>
      <table className="table" style={{ marginTop: 6 }}>
        <tbody>
          {Object.entries(r.conteggi || {}).map(([k, [src, db]]) => (
            <tr key={k}><td className="mute">{k.charAt(0).toUpperCase() + k.slice(1)} nel backup / nell'app</td><td>{src} / {db}</td></tr>
          ))}
          <tr><td className="mute">Voci originali conservate identiche</td><td>{lost === 0 ? 'tutte' : `mancano ${lost}`}</td></tr>
        </tbody>
      </table>
      <div className="sb" style={{ margin: '14px 0 4px' }}>Saldi verificati al {String(r.saldi_al).split('-').reverse().join('/')}</div>
      <table className="table">
        <tbody>
          {Object.entries(r.saldi || {}).map(([k, v]) => (<tr key={k}><td>{k}</td><td>{euro(v)}</td></tr>))}
        </tbody>
      </table>
    </>
  )
}

function CategoriesCard({ data, onCategorySaved, onCategoryDeleted }) {
  const [kind, setKind] = useState('spesa')
  const [ed, setEd] = useState(null)
  const { categories, txs } = data
  const used = new Map()
  for (const t of txs) if (t.category_id) used.set(t.category_id, (used.get(t.category_id) || 0) + 1)
  const roots = categories.filter((c) => !c.parent_id && c.kind === kind).sort((a, b) => a.sort_order - b.sort_order)
  const subsOf = (id) => categories.filter((c) => c.parent_id === id).sort((a, b) => a.sort_order - b.sort_order)
  return (
    <section className="card pad" style={{ gridColumn: '1 / -1' }}>
      <div className="cm-head">
        <div>
          <h2 className="h">Categorie</h2>
          <div className="sb">Tocca una categoria o una sottocategoria per rinominarla, cambiarne icona, colore o budget.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="segs">
            {[['spesa', 'Spese'], ['entrata', 'Entrate']].map(([k, l]) => <button key={k} type="button" className={kind === k ? 'seg on' : 'seg'} aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
          </div>
          <button type="button" className="btn small" onClick={() => setEd({ preset: { kind } })}><Icon name="plus" size={18} />Nuova categoria</button>
        </div>
      </div>
      <div className="cm-grid">
        {roots.map((r) => {
          const subs = subsOf(r.id)
          const n = (used.get(r.id) || 0) + subs.reduce((s, x) => s + (used.get(x.id) || 0), 0)
          return (
            <div className="cm-root" key={r.id}>
              <button type="button" className="cm-rbtn" onClick={() => setEd({ cat: r })}>
                <CatChip root={r} size="sm" />
                <span className="txt"><span className="nm" style={{ display: 'block' }}>{r.name}</span><span className="sb">{n} {n === 1 ? 'movimento' : 'movimenti'}{r.budget ? `, budget ${euro(r.budget, { decimals: false })}` : ''}</span></span>
                <Icon name="pen" size={16} className="pen" />
              </button>
              <div className="cm-subs">
                {subs.map((x) => (
                  <button key={x.id} type="button" className="cm-sub" onClick={() => setEd({ cat: x })}><CatChip cat={x} root={r} size="xs" />{x.name}</button>
                ))}
                <button type="button" className="cm-sub add" onClick={() => setEd({ preset: { kind, parentId: r.id } })}><Icon name="plus" size={16} />Aggiungi</button>
              </div>
            </div>
          )
        })}
      </div>
      {ed && (
        <CategoryEditor
          data={data}
          cat={ed.cat || null}
          preset={ed.preset || {}}
          allowKind
          onClose={() => setEd(null)}
          onSaved={(c, created) => { onCategorySaved(c, created); setEd(null); if (created) setKind(c.kind) }}
          onDeleted={(id) => { onCategoryDeleted(id); setEd(null) }}
        />
      )}
    </section>
  )
}

export default function Impostazioni({ data, session, look, setLook, onCategorySaved, onCategoryDeleted }) {
  const email = session?.user?.email
  return (
    <div className="grid g-row2">
      <CategoriesCard data={data} onCategorySaved={onCategorySaved} onCategoryDeleted={onCategoryDeleted} />
      <section className="card pad">
        <h2 className="h" style={{ marginBottom: 8 }}>Aspetto</h2>
        <AppearancePicker look={look} setLook={setLook} />
      </section>
      <section className="card pad">
        <h2 className="h">Accesso</h2>
        <div className="sb" style={{ marginBottom: 12 }}>{email}</div>
        <div style={{ fontWeight: 600, marginBottom: 2 }}>Face ID e impronta</div>
        <Passkeys />
        <div style={{ fontWeight: 600, margin: '22px 0 0' }}>Password</div>
        <ChangePassword />
        <button type="button" className="btn ghost full" style={{ marginTop: 22 }} onClick={() => supabase.auth.signOut()}><Icon name="logout" size={18} />Esci</button>
      </section>
      <section className="card pad loans">
        <h2 className="h">Dati importati</h2>
        {data.imports.length === 0 && <div className="sb">Nessun import.</div>}
        {data.imports.map((imp) => <ImportReport key={imp.id} imp={imp} />)}
      </section>
    </div>
  )
}
