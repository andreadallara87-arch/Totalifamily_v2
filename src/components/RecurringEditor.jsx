import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'
import { buildRule, calcFor, cardDebit, estimate, lastTimes, ruleForm, ruleProblem } from '../lib/recurring.js'
import { deleteRecurring, saveRecurring, updateAccount } from '../lib/data.js'
import { dayShort, euro, monthName } from '../lib/format.js'

const KINDS = [['spesa', 'Spesa'], ['entrata', 'Entrata'], ['giroconto', 'Giroconto']]
const EVERY = [[1, 'Ogni mese'], [2, 'Ogni 2 mesi'], [3, 'Ogni 3 mesi'], [4, 'Ogni 4 mesi'], [6, 'Ogni 6 mesi'], [12, 'Ogni anno']]
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)
const HELP = {
  auto: 'Entra da solo nel suo giorno con questo importo. In Movimenti lo riconosci dal segno "ricorrente".',
  check: "Entra nel suo giorno con l'importo dell'ultima volta e in Home ti chiede di confermarlo o correggerlo.",
}

/**
 * Scheda di una regola ricorrente: nuova (rule null, eventualmente da un suggerimento `seed`) o da modificare.
 * onSaved(rule, account?) riceve la regola salvata e, per rate e carte, il conto aggiornato.
 */
export default function RecurringEditor({ data, today, rule = null, seed = null, onClose, onSaved, onDeleted }) {
  const { accounts, categories, txs } = data
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const catsById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const [f, setF] = useState(() => ruleForm(rule, today, seed))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const set = (patch) => { setF((o) => ({ ...o, ...patch })); setErr(null) }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); if (confirm) setConfirm(false); else onClose() }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose, confirm])

  const live = accounts.filter((a) => !a.archived)
  const toAcc = accById.get(f.toAccountId)
  const calc = calcFor(f.kind, toAcc)
  const cats = useMemo(() => {
    const roots = categories.filter((c) => !c.parent_id && c.kind === (f.kind === 'entrata' ? 'entrata' : 'spesa')).sort((a, b) => a.name.localeCompare(b.name, 'it'))
    return roots.map((r) => ({ root: r, subs: categories.filter((c) => c.parent_id === r.id).sort((a, b) => a.name.localeCompare(b.name, 'it')) }))
  }, [categories, f.kind])

  // Anteprima con i dati del modulo: interessi della rata, addebito della carta, ultime volte.
  const draft = useMemo(() => ({ ...buildRule({ ...f, amount: f.amount || '0' }, { accById, categories }), id: rule?.id || null, active: true }), [f, accById, categories, rule])
  const est = useMemo(() => (calc === 'fisso' ? null : estimate(draft, { accById, catsById, txs })), [calc, draft, accById, catsById, txs])
  const card = calc === 'carta' && toAcc ? cardDebit(toAcc, txs, catsById, f.next) : null
  const past = useMemo(() => lastTimes(draft, txs), [draft, txs])

  async function save(e) {
    e.preventDefault()
    if (busy) return
    const problem = ruleProblem(f, accById)
    if (problem) { setErr(problem + '.'); return }
    setBusy(true); setErr(null)
    try {
      const row = buildRule(f, { accById, categories })
      const saved = await saveRecurring(rule?.id || null, rule ? row : { ...row, active: true, sort_order: data.recurring.length + 1 })
      // Le previsioni di rate e carte leggono importo e giorno dal finanziamento o dalla carta: restano allineati.
      let acc = null
      if (calc === 'rata') acc = await updateAccount(row.to_account_id, { instalment: row.amount, instalment_day: row.day, auto_instalment: saved.active })
      else if (calc === 'carta') acc = await updateAccount(row.to_account_id, { instalment_day: row.day })
      onSaved(saved, acc, !rule)
    } catch (e2) {
      setErr(`Non sono riuscito a salvare: ${e2?.message || 'errore sconosciuto'}.`)
      setBusy(false)
    }
  }
  async function toggle() {
    setBusy(true); setErr(null)
    try {
      const saved = await saveRecurring(rule.id, { active: !rule.active })
      let acc = null
      if (rule.calc === 'rata') acc = await updateAccount(rule.to_account_id, { auto_instalment: saved.active })
      onSaved(saved, acc, false)
    } catch (e2) {
      setErr(`Non sono riuscito a salvare: ${e2?.message || 'errore sconosciuto'}.`)
      setBusy(false)
    }
  }
  async function remove() {
    setBusy(true); setErr(null)
    try {
      await deleteRecurring(rule.id)
      onDeleted(rule)
    } catch (e2) {
      setErr(`Non sono riuscito a eliminarla: ${e2?.message || 'errore sconosciuto'}.`)
      setBusy(false)
    }
  }

  const accSelect = (key, label, exclude) => (
    <label className="ce-row">
      <span className="lbl">{label}</span>
      <select value={f[key]} onChange={(e) => set({ [key]: e.target.value })} aria-label={label}>
        <option value="">Scegli…</option>
        {live.filter((a) => a.id !== exclude).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </label>
  )

  return createPortal(
    <div className="ce-wrap" role="dialog" aria-modal="true" aria-label={rule ? rule.name : 'Nuovo movimento ricorrente'}>
      <div className="ce-scrim" onClick={onClose} />
      <form className="ce" onSubmit={save}>
        <div className="mv-grab" />
        <div className="ce-head">
          <h2>{rule ? 'Movimento ricorrente' : 'Nuovo movimento ricorrente'}</h2>
          <button type="button" className="hb sm" aria-label="Chiudi" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="ce-body">
          {rule && !rule.active && <div className="mv-hint"><Icon name="alert" size={15} /><span>Sospeso: non viene inserito finché non lo riattivi.</span></div>}
          <div className="segs rc-kinds" role="tablist" aria-label="Tipo">
            {KINDS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={f.kind === k} className={f.kind === k ? 'seg on' : 'seg'} onClick={() => set({ kind: k, categoryId: '' })}>{l}</button>)}
          </div>
          <div className="ce-name"><input type="text" aria-label="Nome" placeholder="Nome, per esempio Palestra" value={f.name} onChange={(e) => set({ name: e.target.value })} /></div>

          {accSelect('accountId', f.kind === 'giroconto' ? 'Dal conto' : f.kind === 'entrata' ? 'Sul conto' : 'Conto o carta')}
          {f.kind === 'giroconto' ? accSelect('toAccountId', 'Verso', f.accountId) : (
            <label className="ce-row">
              <span className="lbl">Categoria</span>
              <select value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })} aria-label="Categoria">
                <option value="">Scegli…</option>
                {cats.map(({ root, subs }) => (
                  <optgroup key={root.id} label={root.name}>
                    <option value={root.id}>{root.name}</option>
                    {subs.map((s) => <option key={s.id} value={s.id}>{root.name} › {s.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          )}

          {calc === 'carta' ? (
            <div className="rc-calc">
              <div className="kv"><span>Importo</span><b>dall'estratto conto</b></div>
              {card && (
                <>
                  <div className="kv"><span className="mute">Acquisti di {monthName(Number(card.of.slice(5)))}{card.of >= today.slice(0, 7) ? ' (finora)' : ''}</span><span>{euro(card.purchases)}</span></div>
                  {card.plan > 0 && <div className="kv"><span className="mute">Rata del piano</span><span>{euro(card.plan)}</span></div>}
                  {card.fee > 0 && <div className="kv"><span className="mute">Bollo</span><span>{euro(card.fee)}</span></div>}
                  <div className="kv rc-tot"><span>Addebito del {dayShort(f.next)}</span><b>{euro(card.amount)}</b></div>
                </>
              )}
            </div>
          ) : (
            <label className="ce-row">
              <span className="lbl">{calc === 'rata' ? 'Rata' : f.check ? "Importo (l'ultima volta)" : 'Importo'}</span>
              <span className="ce-money"><input type="text" inputMode="decimal" aria-label="Importo" placeholder="0,00" value={f.amount} onChange={(e) => set({ amount: e.target.value })} />€</span>
            </label>
          )}
          {calc === 'rata' && est && (
            <div className="rc-calc">
              <div className="kv"><span>Interessi previsti, come spesa su {toAcc?.name}</span><b>{euro(est.interest)}</b></div>
              <div className="sb">Calano un po' ogni mese{est.lastInterest ? `: l'ultima volta erano ${euro(est.lastInterest)}` : ''}. Se la banca addebita importi diversi, correggi il movimento.</div>
            </div>
          )}

          <label className="ce-row">
            <span className="lbl">Giorno</span>
            <select value={f.day} aria-label="Giorno" onChange={(e) => set({ day: e.target.value })}>
              {DAYS.map((d) => <option key={d} value={d}>{d === 31 ? 'Ultimo giorno del mese' : `Il ${d}`}</option>)}
            </select>
          </label>
          <label className="ce-row">
            <span className="lbl">Ripeti</span>
            <select value={f.every} aria-label="Ripeti" onChange={(e) => set({ every: e.target.value })}>
              {EVERY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="ce-row">
            <span className="lbl">Prossima volta</span>
            <input className="cs-month" type="date" aria-label="Prossima volta" min={today} value={f.next} onChange={(e) => set({ next: e.target.value })} />
          </label>
          <label className="ce-row">
            <span className="lbl">Fino a<small className="rc-small"> (vuoto: sempre)</small></span>
            <input className="cs-month" type="month" aria-label="Ultimo mese" value={f.until} onChange={(e) => set({ until: e.target.value })} />
          </label>

          <div>
            <div className="lbl">Quando arriva il giorno</div>
            <div className="segs rc-kinds" role="tablist" aria-label="Quando arriva il giorno">
              <button type="button" role="tab" aria-selected={!f.check} className={!f.check ? 'seg on' : 'seg'} onClick={() => set({ check: false })}>Inseriscilo e basta</button>
              <button type="button" role="tab" aria-selected={f.check} className={f.check ? 'seg on' : 'seg'} onClick={() => set({ check: true })}>Chiedimi di controllarlo</button>
            </div>
            <div className="sb" style={{ marginTop: 8 }}>{f.check ? HELP.check : HELP.auto}</div>
          </div>

          {past.length > 0 && (
            <div>
              <div className="lbl">Le ultime volte</div>
              {past.map((t) => <div className="kv rc-past" key={t.id}><span>{dayShort(t.date)} {t.date.slice(0, 4)}</span><b>{euro(t.amount)}</b></div>)}
            </div>
          )}
        </div>

        {err && <div className="mv-hint err ce-err" role="alert"><Icon name="alert" size={15} /><span>{err}</span></div>}
        {confirm ? (
          <div className="ce-foot">
            <span className="ce-q">Eliminare la regola? I movimenti già inseriti restano.</span>
            <button type="button" className="btn ghost" onClick={() => setConfirm(false)}>Annulla</button>
            <button type="button" className="mv-danger ce-dbtn" disabled={busy} onClick={remove}><Icon name="trash" size={18} />{busy ? 'Elimino…' : 'Elimina'}</button>
          </div>
        ) : (
          <div className="ce-foot">
            {rule && <button type="button" className="hb ce-trash" aria-label="Elimina la regola" title="Elimina" onClick={() => setConfirm(true)}><Icon name="trash" /></button>}
            {rule && <button type="button" className="btn ghost" disabled={busy} onClick={toggle}>{rule.active ? 'Sospendi' : 'Riattiva'}</button>}
            <button type="submit" className="btn ce-save" disabled={busy}><Icon name="check" size={18} />{busy ? 'Salvo…' : rule ? 'Salva' : 'Crea'}</button>
          </div>
        )}
      </form>
    </div>,
    document.body,
  )
}
