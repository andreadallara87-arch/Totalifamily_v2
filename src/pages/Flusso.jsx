import { Fragment, useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import Money from '../components/Money.jsx'
import CatChip from '../components/CatChip.jsx'
import { daysBetween, ym } from '../lib/calc.js'
import { cashflow, spendingSplit } from '../lib/cashflow.js'
import { addTransaction, deleteTransaction, updateAccount, updateTransaction } from '../lib/data.js'
import { dayMonth, dayShort, euro, monthName, monthShort, monthYear } from '../lib/format.js'
import { accountVisual } from '../lib/visual.js'

const STATUS = { reale: 'Reale', 'in corso': 'In corso' }
const mNum = (m) => Number(m.slice(5, 7))
const mLabel = (m) => monthName(mNum(m))
const list = (arr) => (arr.length < 2 ? arr.join('') : `${arr.slice(0, -1).join(', ')} e ${arr[arr.length - 1]}`)
const whole = (v, sign = false) => euro(v, { decimals: false, sign })
// Importo senza decimali quando è tondo (600 €), altrimenti con i centesimi (656,93 €).
const round = (v) => (Number.isInteger(v) ? whole(v) : euro(v))
const signed = (dir, amount) => `${dir === 'in' ? '+' : '−'}${euro(amount).replace('−', '')}`

/** Colonne mese per mese: entrate e uscite affiancate. */
function MonthColumns({ months, selected, onSelect }) {
  const max = Math.max(...months.map((m) => Math.max(m.in, m.out)), 1)
  return (
    <div className="flm" role="tablist" aria-label="Mesi">
      {months.map((m) => {
        const on = m.month === selected
        return (
          <button key={m.month} type="button" role="tab" aria-selected={on} className={`flm-col${m.status === 'in corso' ? ' now' : ''}${on ? ' on' : ''}`} onClick={() => onSelect(m.month)} aria-label={`${monthYear(m.month)}: entrate ${euro(m.in)}, uscite ${euro(m.out)}`}>
            <span className={`flm-net ${m.net < 0 ? 'neg' : 'pos'}`}>{whole(m.net, true)}</span>
            <span className="flm-bars">
              <i className="in" style={{ height: `${(m.in / max) * 100}%` }} />
              <i className="out" style={{ height: `${(m.out / max) * 100}%` }} />
            </span>
            <span className="flm-l">{monthShort(mNum(m.month))}</span>
            <span className="flm-s">{m.status === 'in corso' ? 'in corso' : ''}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Importo che si può cambiare: meno e più a passi fissi, oppure scritto a mano. */
function AmountStepper({ value, onChange, label, step = 50 }) {
  const [text, setText] = useState(null)
  const set = (v) => onChange(Math.max(0, Math.round(v * 100) / 100))
  const typed = (raw) => {
    setText(raw)
    const v = Number(raw.replace(/\./g, '').replace(',', '.'))
    if (raw.trim() !== '' && Number.isFinite(v)) set(v)
  }
  const shown = text ?? String(value).replace('.', ',')
  return (
    <div className="fl-pay" role="group" aria-label={label}>
      <button type="button" aria-label={`${step} € in meno`} disabled={value <= 0} onClick={() => set((Math.ceil(value / step) - 1) * step)}>−</button>
      <label>
        <input type="text" inputMode="decimal" aria-label={label} style={{ width: `${Math.max(3, shown.length) + 0.4}ch` }} value={shown} onChange={(e) => typed(e.target.value)} onBlur={() => setText(null)} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
        <span>€</span>
      </label>
      <button type="button" aria-label={`${step} € in più`} onClick={() => set((Math.floor(value / step) + 1) * step)}>+</button>
    </div>
  )
}

export default function Flusso({ data, today, onTxSaved, onDeleted, onEditCard, onAccountSaved, onNew }) {
  const { accounts, categories, txs } = data
  const [month, setMonth] = useState(ym(today))
  const [more, setMore] = useState(false)
  // Rimborso che stai provando per le carte con interessi, mese per mese: { [idCarta]: { 'AAAA-MM': importo } }.
  // Finché non lo salvi resta solo qui: la pagina si ricalcola, ma tra i movimenti non cambia niente.
  const [pay, setPay] = useState({})
  const [saving, setSaving] = useState(null)
  // Previsione che stai cambiando in "Prossimi movimenti": { key, amount }.
  const [edit, setEdit] = useState(null)
  const [payErr, setPayErr] = useState(null)
  const setPayment = (cardId, m, amount) => setPay((p) => {
    const mine = { ...p[cardId] }
    if (amount === null) delete mine[m]
    else mine[m] = amount
    return { ...p, [cardId]: mine }
  })
  // Ricariche al mese dei borsellini (Satispay) che stai provando: { [idBorsellino]: importo }. Come i rimborsi, finché non salvi.
  const [wal, setWal] = useState({})
  const setWallet = (id, amount) => setWal((w) => {
    const next = { ...w }
    if (amount === null) delete next[id]
    else next[id] = amount
    return next
  })
  // Solo impegni già certi, tranne le ricariche dei borsellini (media degli ultimi mesi). Il fido è un limite che non si supera.
  const rules = data.recurring
  const r = useMemo(() => cashflow({ accounts, categories, txs, today, payments: pay, wallets: wal, rules }), [accounts, categories, txs, today, pay, wal, rules])
  const catsById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const b = r.budget
  const [w1, w2] = b.windows
  const saldoNames = r.cards.filter((c) => c.saldo).map((c) => c.name)
  const firstDue = r.cards.find((c) => c.saldo && c.next[0]?.card)?.next[0]
  const withCards = saldoNames.length ? `tra conto e ${list(saldoNames)}` : 'dal conto'
  const days = Math.max(1, daysBetween(today, w1.until))
  const cashNames = list(r.cashIds.map((id) => accById.get(id)?.name).filter(Boolean))

  const months = r.months
  const sel = months.find((m) => m.month === month) || months[months.length - 1]
  const idx = months.indexOf(sel)
  const split = spendingSplit({ accounts, txs, today, month: sel.month })

  const shown = r.items.filter((it) => it.date <= (more && w2 ? w2.until : w1.until))
  const maxAfter = Math.max(b.available, ...shown.map((it) => it.after), 1)

  const chipFor = (l) => {
    if (l.group === 'entrate') {
      const c = l.rootId && catsById.get(l.rootId)
      return c ? <CatChip root={c} /> : <span className="chip c-verde"><Icon name="up" /></span>
    }
    if (l.group === 'spese') return <span className="chip c-rosso"><Icon name="down" /></span>
    const a = accById.get(l.accountId)
    const v = a ? accountVisual(a) : { icon: 'bank', chip: 'c-blu' }
    return <span className={`chip ${v.chip}`}><Icon name={v.icon} /></span>
  }
  const cardParts = (c, soFar) => {
    const bits = []
    if (c.purchases > 0 || soFar) bits.push(`acquisti di ${mLabel(c.of)} ${euro(c.purchases)}`)
    if (c.plan) bits.push(`piano a rate ${euro(c.plan)}`)
    if (c.fee) bits.push(`bollo ${euro(c.fee)}`)
    return bits.join(' + ')
  }
  const itemSub = (it) => {
    if (it.card) return `${cardParts(it.card, true)} · finora`
    if (it.source === 'rata') return `capitale ${euro(it.capital)} · interessi ${euro(it.interest)}`
    if (it.chosen) return 'importo che stai provando'
    if (it.source === 'borsellino') return it.basis === 'prova' ? 'stima: cifra che stai provando' : it.basis === 'scelta' ? 'stima: cifra al mese che hai scelto' : 'stima: media degli ultimi mesi'
    if (it.ruleId) return 'movimento ricorrente'
    if (it.source === 'ricorrente') return 'come l’ultima volta'
    if (it.oneOff) return 'una tantum'
    return 'già inserito'
  }
  // Carta con interessi: cosa c'è nell'estratto conto e di quanto cambia il debito con il rimborso scelto.
  const statementText = (c, n) => {
    const st = n.statement
    const period = `Estratto conto dal ${dayMonth(st.from)} al ${dayMonth(st.to)}`
    if (st.state === 'futuro') return { head: `${period}: deve ancora iniziare. Il debito scende di quanto rimborsi, meno quello che spenderai con ${c.name} in quel periodo.`, res: null, tone: '' }
    const open = st.state === 'aperto' && st.to !== today
    const parts = st.refunds > 0 ? ` (acquisti ${euro(st.spent)} meno rimborsi ${euro(st.refunds)})` : ''
    const head = `${period}${st.to === today ? ', si chiude oggi' : open ? ', ancora aperto' : ''}: ${open ? 'finora ' : ''}hai speso ${euro(st.net)}${parts}.`
    const d = n.debtChange
    const verb = open ? ['salirebbe', 'scenderebbe', 'resterebbe'] : ['sale', 'scende', 'resta']
    const res = d > 0 ? `Rimborsando ${round(n.amount)} il debito ${verb[0]} di ${round(d)}` : d < 0 ? `Rimborsando ${round(n.amount)} il debito ${verb[1]} di ${round(-d)}` : `Rimborsando ${round(n.amount)} il debito ${verb[2]} uguale`
    return { head, res: `${res}${open ? `, meno quello che spendi ancora fino al ${dayMonth(st.to)}` : ''}.`, tone: d > 0 ? ' up' : d < 0 ? ' down' : '' }
  }
  // Salva il rimborso scelto come giroconto previsto verso la carta (o cambia quello già inserito).
  async function savePayment(c, n) {
    const key = `${c.id}|${n.date}`
    if (saving) return
    setSaving(key); setPayErr(null)
    try {
      const row = n.txId
        ? await updateTransaction(n.txId, { amount: n.amount })
        : await addTransaction({ kind: 'giroconto', date: n.date, amount: n.amount, account_id: n.fromId, to_account_id: c.id, category_id: null, note: '', planned: n.date > today })
      setPayment(c.id, ym(n.date), null)
      onTxSaved(row, `Rimborso ${c.name} di ${round(n.amount)} previsto per il ${dayMonth(n.date)}.`, !!n.txId)
    } catch (e) {
      setPayErr({ key, text: `Non sono riuscito a salvare: ${e?.message || 'errore sconosciuto'}. Riprova.` })
    }
    setSaving(null)
  }
  // Salva (o toglie, con null) la cifra al mese delle ricariche di un borsellino.
  async function saveWallet(w, amount) {
    const key = `w|${w.id}`
    if (saving) return
    setSaving(key); setPayErr(null)
    try {
      const acc = await updateAccount(w.id, { wallet_monthly: amount })
      setWallet(w.id, null)
      onAccountSaved?.(acc, amount === null ? `Ricariche ${w.name}: torno alla media di ${round(w.average)} al mese.` : `Ricariche ${w.name}: ${round(amount)} al mese.`)
    } catch (e) {
      setPayErr({ key, text: `Non sono riuscito a salvare: ${e?.message || 'errore sconosciuto'}. Riprova.` })
    }
    setSaving(null)
  }
  // Previsioni che si possono cambiare da qui: entrate, spese e giroconti che si ripetono o già inseriti.
  // Rate, carte e ricariche dei borsellini hanno il loro calcolo (le carte e Satispay si cambiano nei loro riquadri).
  const editable = (it) => !!it.tpl && ['entrate', 'prelievi', 'spese', 'debiti'].includes(it.group) && (it.source === 'ricorrente' || it.source === 'inserito')
  const itemKey = (it) => `${it.date}|${it.line}|${it.txId || it.ruleId || ''}`
  async function saveItem(it, amount) {
    const key = `i|${itemKey(it)}`
    if (saving) return
    setSaving(key); setPayErr(null)
    try {
      const row = it.txId
        ? await updateTransaction(it.txId, { amount })
        : await addTransaction({ ...it.tpl, date: it.date, amount, note: '', planned: it.date > today })
      setEdit(null)
      onTxSaved(row, `${it.label}: ${round(amount)} previsti per il ${dayMonth(it.date)}.`, !!it.txId)
    } catch (e) {
      setPayErr({ key, text: `Non sono riuscito a salvare: ${e?.message || 'errore sconosciuto'}. Riprova.` })
    }
    setSaving(null)
  }
  async function removeItem(it) {
    const key = `i|${itemKey(it)}`
    if (saving) return
    setSaving(key); setPayErr(null)
    try {
      const full = await deleteTransaction(it.txId)
      setEdit(null)
      onDeleted(full)
    } catch (e) {
      setPayErr({ key, text: `Non sono riuscito a toglierlo: ${e?.message || 'errore sconosciuto'}. Riprova.` })
    }
    setSaving(null)
  }
  async function removePayment(c, n) {
    const key = `${c.id}|${n.date}`
    if (saving) return
    setSaving(key); setPayErr(null)
    try {
      onDeleted(await deleteTransaction(n.txId))
    } catch (e) {
      setPayErr({ key, text: `Non sono riuscito a toglierlo: ${e?.message || 'errore sconosciuto'}. Riprova.` })
    }
    setSaving(null)
  }
  const lineSub = (l) => {
    const bits = []
    if (l.group === 'spese') return l.real && l.expected ? `${euro(l.real)} già spesi, ${euro(l.expected)} già inseriti` : `${l.count} ${l.count === 1 ? 'movimento' : 'movimenti'}`
    if (l.group === 'rate') bits.push(`capitale ${euro(l.capital)} · interessi ${euro(l.interest)}`)
    if (l.group === 'debiti') bits.push('rimborso')
    if (l.group === 'carte') bits.push('pagamento della carta')
    if (l.group === 'borsellino') bits.push(l.expected > 0 ? 'ricariche, in parte stimate' : 'ricariche')
    const when = l.dates.length === 1 ? dayShort(l.dates[0]) : l.dates.length > 1 ? `${l.dates.length} volte` : ''
    if (when) bits.push(when)
    return bits.join(' · ')
  }
  const row = (l) => (
    <div key={l.line} className="row fl-row">
      {chipFor(l)}
      <div className="txt">
        <div className="nm">{l.label}</div>
        <div className="sb">{lineSub(l)}</div>
      </div>
      <div className={`am${l.dir === 'in' ? ' pos' : ''}`}>
        {signed(l.dir, l.amount)}
        {l.expected > 0 && <span className="fl-tag">{l.real ? 'in parte da arrivare' : 'da arrivare'}</span>}
      </div>
    </div>
  )

  return (
    <>
      <section className="card fl-hero">
        <div className="fl-top">
          <div className="fl-main">
            <div className="mute" style={{ fontSize: 15 }}>Puoi ancora spendere</div>
            <Money className={`fl-big${w1.amount < 0 ? ' warn' : ''}`} value={Math.max(0, w1.amount)} />
            <div className="fl-lead">
              {withCards}, da oggi al {dayMonth(w1.until)}, restando dentro il fido.
              {w1.amount > 0 && <> Sono circa {whole(w1.amount / days)} al giorno.</>}
            </div>
          </div>
          <div className="fl-side">
            <div className="fl-fact">
              <span>Disponibile oggi sul conto</span>
              <b>{euro(b.available)}</b>
              <small>saldo {euro(r.today)}{r.limit !== null ? ` · fido ${whole(-r.limit)}` : ''}</small>
            </div>
            {w2 && (
              <div className="fl-fact">
                <span>Poi, dal {dayShort(w2.from)} al {dayShort(w2.until)}</span>
                <b>{whole(w2.amount)}</b>
                <small>se entro il {dayShort(w1.until)} non spendi più di {whole(Math.max(0, w1.amount))}</small>
              </div>
            )}
          </div>
        </div>
        {b.short ? (
          <div className="note c-rosso fl-alert"><Icon name="alert" size={18} /><span>Con gli impegni già certi, dal {dayMonth(b.short.date)} mancano fino a {whole(b.short.amount)} per restare dentro il fido.</span></div>
        ) : b.steps.length > 1 ? (
          <div className="note fl-alert plain">
            <Icon name="calendar" size={18} />
            <span>
              Attenzione ai tempi. Dal conto oggi puoi usare solo {whole(b.steps[0].amount)}, {list(b.steps.slice(1).map((s) => `dal ${dayMonth(s.from)} ${whole(s.amount)}`))} (in tutto, non in più).
              {firstDue && <> Quello che compri con {list(saldoNames)} entro fine {mLabel(firstDue.card.of)} esce dal conto il {dayMonth(firstDue.date)}; gli acquisti fatti dopo contano per il periodo seguente.</>}
            </span>
          </div>
        ) : null}
        <div className="sb">
          Conto: {cashNames} insieme. Calcolo solo quello che so già (rate, carte, stipendio ed entrate che si ripetono): nessuna spesa stimata
          {r.wallets.length > 0 ? `, tranne le ricariche di ${list(r.wallets.map((w) => w.name))}. Il saldo di ${list(r.wallets.map((w) => w.name))} non conta nel disponibile.` : '.'}
        </div>
      </section>

      <div className="grid g-fl">
        <section className="card pad">
          <h2 className="h">Cosa ti passerà la carta</h2>
          {r.cards.map((c) => {
            const a = accById.get(c.id)
            const v = accountVisual(a)
            return (
              <div key={c.id} className="fl-card">
                <div className="row">
                  <span className={`chip ${v.chip}`}><Icon name={v.icon} /></span>
                  <div className="txt">
                    <div className="nm">{c.name}</div>
                    <div className="sb">
                      {c.saldo ? 'paghi gli acquisti il mese dopo' : c.debt > 0 ? `debito di oggi ${euro(c.debt)}` : 'nessun debito oggi'}
                      {!c.saldo && c.statementDay ? ` · estratto conto il ${c.statementDay} del mese` : ''}
                    </div>
                  </div>
                  {onEditCard && <button type="button" className="hb fl-edit" aria-label={`Modifica i dati della carta ${c.name}`} title="Modifica i dati della carta" onClick={() => onEditCard(a)}><Icon name="pen" size={17} /></button>}
                </div>
                {(c.saldo || c.statementDay ? c.next : c.next.slice(0, 1)).map((n, i) => {
                  const st = n.statement ? statementText(c, n) : null
                  // Carta con interessi: il rimborso si può provare e poi salvare tra i movimenti previsti.
                  const editable = !c.saldo && !!n.fromId
                  const base = n.saved ?? n.usual
                  const key = `${c.id}|${n.date}`
                  const busy = saving === key
                  return (
                    <div key={n.date} className="fl-due">
                      <div className="fl-due-h">
                        <span>{dayMonth(n.date)}{editable && <small>quanto rimborsi</small>}</span>
                        {editable ? <AmountStepper value={n.amount} onChange={(x) => { setPayErr(null); setPayment(c.id, ym(n.date), x === base ? null : x) }} label={`Rimborso ${c.name} del ${dayMonth(n.date)}`} /> : <b>{euro(n.amount)}</b>}
                      </div>
                      {n.card ? (
                        <div className="sb">
                          {i === 0 ? `${cardParts(n.card, true)}. Cresce con ogni acquisto fino a fine ${mLabel(n.card.of)}.` : `${cardParts(n.card, false) || 'niente finora'}, più gli acquisti di ${mLabel(n.card.of)}.`}
                        </div>
                      ) : st ? (
                        <>
                          <div className="sb">{st.head}</div>
                          {st.res && <div className={`fl-res${st.tone}`}>{st.res}</div>}
                        </>
                      ) : (
                        <div className="sb">
                          Negli ultimi {r.paceDays} giorni con {c.name} hai speso {whole(c.monthly)}: {c.monthly > n.amount ? 'più di quanto rimborsi, quindi il debito sale.' : 'meno di quanto rimborsi, quindi il debito scende.'}
                        </div>
                      )}
                      {editable && (n.chosen ? (
                        <div className="fl-acts">
                          <button type="button" className="btn small" disabled={busy} onClick={() => savePayment(c, n)}><Icon name="check" size={16} />{busy ? 'Salvo…' : `Salva ${round(n.amount)}`}</button>
                          <button type="button" className="lnk" disabled={busy} onClick={() => { setPayErr(null); setPayment(c.id, ym(n.date), null) }}>Annulla, torna a {round(base)}</button>
                        </div>
                      ) : n.saved !== null ? (
                        <div className="fl-acts">
                          <span className="fl-tag ok"><Icon name="check" size={13} />salvato tra i movimenti previsti</span>
                          <button type="button" className="lnk" disabled={busy} onClick={() => removePayment(c, n)}>{busy ? 'Tolgo…' : n.usual !== null ? `Togli, torna a ${round(n.usual)}` : 'Togli'}</button>
                        </div>
                      ) : (
                        <div className="fl-tag">come l'ultima volta</div>
                      ))}
                      {payErr?.key === key && <div className="mv-hint err" role="alert" style={{ marginTop: 6, padding: 0 }}><Icon name="alert" size={15} /><span>{payErr.text}</span></div>}
                    </div>
                  )
                })}
                {c.next.length === 0 && <div className="sb" style={{ marginTop: 6 }}>Nessun addebito previsto.</div>}
                {!c.saldo && c.statementDay && c.next.length > 0 && <div className="sb fl-fine">Gli interessi dell'estratto conto contano quando li inserisci come spesa su {c.name}.</div>}
              </div>
            )
          })}
          {r.wallets.map((w) => {
            const a = accById.get(w.id)
            const v = a ? accountVisual(a) : { icon: 'bank', chip: 'c-blu' }
            const key = `w|${w.id}`
            const busy = saving === key
            const base = w.saved ?? w.average
            const now = w.months[0]
            const hist = w.history.filter((h) => h.amount > 0 || w.history.length === 1)
            return (
              <div key={w.id} className="fl-card">
                <div className="row">
                  <span className={`chip ${v.chip}`}><Icon name={v.icon} /></span>
                  <div className="txt">
                    <div className="nm">Ricariche {w.name}</div>
                    <div className="sb">cambiano ogni volta: le stimo sul mese</div>
                  </div>
                </div>
                <div className="fl-due">
                  <div className="fl-due-h">
                    <span>Al mese<small>quanto ricarichi</small></span>
                    <AmountStepper step={10} value={w.monthly} onChange={(x) => { setPayErr(null); setWallet(w.id, x === base ? null : x) }} label={`Ricariche ${w.name} al mese`} />
                  </div>
                  <div className="sb">
                    {hist.length ? <>Media degli ultimi mesi: {round(w.average)} ({hist.map((h) => `${mLabel(h.month)} ${whole(h.amount)}`).join(', ')}). </> : <>Non ci sono ancora mesi completi per fare la media. </>}
                    {now && <>A {mLabel(now.month)} hai già ricaricato {euro(now.done)}{now.rest > 0 ? `: ne restano circa ${euro(now.rest)}, ${now.dates.length === 1 ? `il ${dayMonth(now.dates[0])}` : `divisi tra il ${list(now.dates.map((d) => String(Number(d.slice(8)))))} ${mLabel(now.month)}`}.` : ', quindi per questo mese non prevedo altro.'}</>}
                  </div>
                  {w.chosen !== null ? (
                    <div className="fl-acts">
                      <button type="button" className="btn small" disabled={busy} onClick={() => saveWallet(w, w.chosen)}><Icon name="check" size={16} />{busy ? 'Salvo…' : `Salva ${round(w.chosen)} al mese`}</button>
                      <button type="button" className="lnk" disabled={busy} onClick={() => { setPayErr(null); setWallet(w.id, null) }}>Annulla, torna a {round(base)}</button>
                    </div>
                  ) : w.saved !== null ? (
                    <div className="fl-acts">
                      <span className="fl-tag ok"><Icon name="check" size={13} />cifra tua, salvata</span>
                      <button type="button" className="lnk" disabled={busy} onClick={() => saveWallet(w, null)}>{busy ? 'Torno…' : `Torna alla media (${round(w.average)})`}</button>
                    </div>
                  ) : (
                    <div className="fl-tag">media degli ultimi mesi</div>
                  )}
                  {payErr?.key === key && <div className="mv-hint err" role="alert" style={{ marginTop: 6, padding: 0 }}><Icon name="alert" size={15} /><span>{payErr.text}</span></div>}
                </div>
              </div>
            )
          })}
        </section>

        <section className="card pad">
          <div className="fl-sec">
            <h2 className="h">Prossimi movimenti sul conto</h2>
            <span className="sb">a destra, il disponibile dopo ogni movimento se non spendi altro. Tocca stipendio, entrate o spese per cambiare l'importo</span>
          </div>
          <div className="row fl-mov today">
            <span className="d">Oggi</span>
            <span className="chip c-blu"><Icon name="bank" /></span>
            <div className="txt"><div className="nm">Disponibile sul conto</div><div className="sb">saldo più fido</div></div>
            <div className="fl-av"><b>{euro(b.available)}</b><span className="fl-track"><i style={{ width: `${Math.max(0, (b.available / maxAfter) * 100)}%` }} /></span></div>
          </div>
          {shown.map((it, i) => {
            const tight = it.date === w1.until && Math.abs(it.after - w1.amount) < 0.005 && (shown[i + 1]?.date !== it.date)
            const can = editable(it)
            const key = itemKey(it)
            const open = can && edit?.key === key
            const busy = saving === `i|${key}`
            const toggle = () => { setPayErr(null); setEdit(open ? null : { key, amount: it.amount }) }
            const rowProps = can ? { role: 'button', tabIndex: 0, 'aria-expanded': open, 'aria-label': `${it.label} del ${dayMonth(it.date)}: cambia l'importo`, onClick: toggle, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } } } : {}
            return (
              <Fragment key={`${it.date}-${it.line}-${i}`}>
              <div className={`row fl-mov${tight ? ' tight' : ''}${can ? ' ed' : ''}${open ? ' on' : ''}`} {...rowProps}>
                <span className="d">{dayShort(it.date)}</span>
                {chipFor(it)}
                <div className="txt">
                  <div className="nm">{it.label}</div>
                  <div className="sb">{itemSub(it)}</div>
                </div>
                <span className={`fl-amt${it.dir === 'in' ? ' pos' : ''}`}>{signed(it.dir, it.amount)}</span>
                <div className="fl-av">
                  <b className={it.after < 0 ? 'warn' : undefined}>{euro(it.after)}</b>
                  <span className="fl-track"><i style={{ width: `${Math.max(0, (it.after / maxAfter) * 100)}%` }} /></span>
                  {tight && <span className="fl-tag">punto più stretto</span>}
                </div>
              </div>
              {open && (
                <div className="fl-editbox">
                  <div className="fl-due-h">
                    <span>{it.dir === 'in' ? 'Quanto entra' : 'Quanto esce'}<small>il {dayMonth(it.date)}</small></span>
                    <AmountStepper step={it.amount >= 500 ? 50 : 10} value={edit.amount} onChange={(x) => { setPayErr(null); setEdit({ key, amount: x }) }} label={`Importo di ${it.label} del ${dayMonth(it.date)}`} />
                  </div>
                  <div className="sb">
                    {it.txId ? 'È già tra i movimenti previsti: cambio il suo importo.' : 'Lo salvo tra i movimenti previsti di quel giorno, al posto della previsione. Gli altri mesi restano come prima.'}
                  </div>
                  <div className="fl-acts">
                    <button type="button" className="btn small" disabled={busy || edit.amount <= 0 || Math.abs(edit.amount - it.amount) < 0.005} onClick={() => saveItem(it, edit.amount)}><Icon name="check" size={16} />{busy ? 'Salvo…' : `Salva ${round(edit.amount)}`}</button>
                    {it.txId && <button type="button" className="lnk" disabled={busy} onClick={() => removeItem(it)}>{it.oneOff ? 'Togli questa una tantum' : 'Togli, torna alla previsione'}</button>}
                    <button type="button" className="lnk" disabled={busy} onClick={() => { setPayErr(null); setEdit(null) }}>Annulla</button>
                  </div>
                  {payErr?.key === `i|${key}` && <div className="mv-hint err" role="alert" style={{ marginTop: 6, padding: 0 }}><Icon name="alert" size={15} /><span>{payErr.text}</span></div>}
                </div>
              )}
              </Fragment>
            )
          })}
          {w2 && <button type="button" className="lnk fl-more" onClick={() => setMore(!more)}>{more ? `Mostra solo fino al ${dayMonth(w1.until)}` : `Mostra anche fino al ${dayMonth(w2.until)}`}</button>}
          {onNew && (
            <button type="button" className="lnk fl-add" onClick={() => onNew('spesa', { oneOff: true })}><Icon name="plus" size={16} />Aggiungi una spesa o entrata una tantum</button>
          )}
        </section>
      </div>

      <section className="card pad">
        <div className="fl-sec">
          <h2 className="h">Com'è andata, mese per mese</h2>
          <div className="fl-legend"><span><i className="in" />entrate sul conto</span><span><i className="out" />uscite dal conto</span></div>
        </div>
        <div className="fl-past">
          <MonthColumns months={months} selected={sel.month} onSelect={setMonth} />
          <div className="fl-det">
            <div className="fl-dhead">
              <button type="button" className="hb" aria-label="Mese precedente" disabled={idx <= 0} onClick={() => setMonth(months[idx - 1].month)}><Icon name="left" /></button>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <h2 className="h">{monthYear(sel.month)}<span className={`badge${sel.status === 'reale' ? ' plain' : ''}`}>{STATUS[sel.status]}</span></h2>
                <div className="sb">Saldo dei conti da {whole(sel.start)} a {whole(sel.end)}</div>
              </div>
              <button type="button" className="hb" aria-label="Mese successivo" disabled={idx >= months.length - 1} onClick={() => setMonth(months[idx + 1].month)}><Icon name="right" /></button>
            </div>
            <div className="fl-sum">
              <div><span>Entrate</span><b className="pos">{whole(sel.in, true)}</b></div>
              <div><span>Uscite</span><b>{whole(-sel.out)}</b></div>
              <div><span>Risultato</span><b className={sel.net < 0 ? 'warn' : 'pos'}>{whole(sel.net, true)}</b></div>
            </div>
            <div className="lbl">Entrate</div>
            {sel.lines.filter((l) => l.dir === 'in').map(row)}
            <div className="lbl">Uscite</div>
            {sel.lines.filter((l) => l.dir === 'out').map(row)}
          </div>
          {split.total > 0 && (
            <div className="fl-why">
              <b>Perché non coincide con le spese del mese</b>
              <p>
                Le spese di {mLabel(sel.month)} sono {euro(split.total)}: {euro(split.cash)} pagate dai conti
                {split.cards > 0 && <>, {euro(split.cards)} con le carte (escono dai conti quando paghi la carta)</>}
                {split.wallet > 0 && <>, {euro(split.wallet)} con {list(r.wallets.map((w) => w.name)) || 'Satispay'} (dai conti escono le ricariche)</>}
                {split.interest > 0 && <> e {euro(split.interest)} di interessi, già dentro le rate</>}.
                {' '}Le rate escono intere dai conti, ma solo gli interessi sono una spesa: il capitale riduce il debito.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
