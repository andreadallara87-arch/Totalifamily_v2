import { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import Money from '../components/Money.jsx'
import CatChip from '../components/CatChip.jsx'
import { daysBetween, ym } from '../lib/calc.js'
import { cashflow, spendingSplit } from '../lib/cashflow.js'
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

export default function Flusso({ data, today }) {
  const { accounts, categories, txs } = data
  const [month, setMonth] = useState(ym(today))
  const [more, setMore] = useState(false)
  // Rimborso scelto per le carte con interessi, mese per mese: { [idCarta]: { 'AAAA-MM': importo } }.
  const [pay, setPay] = useState({})
  const setPayment = (cardId, m, amount) => setPay((p) => {
    const mine = { ...p[cardId] }
    if (amount === null) delete mine[m]
    else mine[m] = amount
    return { ...p, [cardId]: mine }
  })
  // Solo impegni già certi: nessuna spesa stimata. Il fido è un limite che non si supera.
  const r = useMemo(() => cashflow({ accounts, categories, txs, today, ahead: 3, spending: 0, payments: pay }), [accounts, categories, txs, today, pay])
  const catsById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const b = r.budget
  const [w1, w2] = b.windows
  const t = r.typical
  const saldoNames = r.cards.filter((c) => c.saldo).map((c) => c.name)
  const revolving = r.cards.filter((c) => !c.saldo && (c.next.length || c.monthly > 0))
  const revolvingNames = revolving.map((c) => c.name)
  // Quanto hai messo sulle carte con interessi: l'ultimo estratto conto, se la carta ne ha uno, altrimenti gli ultimi 30 giorni.
  const byStatement = revolving.length > 0 && revolving.every((c) => c.next[0]?.statement)
  const revolvingSpend = revolving.reduce((s, c) => s + (byStatement ? c.next[0].statement.net : c.monthly), 0)
  const firstDue = r.cards.find((c) => c.saldo && c.next[0]?.card)?.next[0]
  const withCards = saldoNames.length ? `tra conto e ${list(saldoNames)}` : 'dal conto'
  const days = Math.max(1, daysBetween(today, w1.until))
  const cashNames = list(r.cashIds.map((id) => accById.get(id)?.name).filter(Boolean))
  const over = t.paceHit - t.budget

  const months = r.months.filter((m) => m.status !== 'previsto')
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
    if (it.chosen) return 'importo scelto da te'
    if (it.source === 'ricorrente') return 'come l’ultima volta'
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
  const lineSub = (l) => {
    const bits = []
    if (l.group === 'spese') return l.real && l.expected ? `${euro(l.real)} già spesi, ${euro(l.expected)} già inseriti` : `${l.count} ${l.count === 1 ? 'movimento' : 'movimenti'}`
    if (l.group === 'rate') bits.push(`capitale ${euro(l.capital)} · interessi ${euro(l.interest)}`)
    if (l.group === 'debiti') bits.push('rimborso')
    if (l.group === 'carte') bits.push('pagamento della carta')
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
        <div className="sb">Conto: {cashNames} insieme. Calcolo solo quello che so già (rate, carte, stipendio ed entrate che si ripetono): nessuna spesa stimata.</div>
      </section>

      <div className="grid g-fl">
        <div className="fl-col">
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
                  </div>
                  {(c.saldo || c.statementDay ? c.next : c.next.slice(0, 1)).map((n, i) => {
                    const st = n.statement ? statementText(c, n) : null
                    const editable = !c.saldo && n.source === 'ricorrente'
                    return (
                      <div key={n.date} className="fl-due">
                        <div className="fl-due-h">
                          <span>{dayMonth(n.date)}{editable && <small>quanto rimborsi</small>}</span>
                          {editable ? <AmountStepper value={n.amount} onChange={(v) => setPayment(c.id, ym(n.date), v)} label={`Rimborso ${c.name} del ${dayMonth(n.date)}`} /> : <b>{euro(n.amount)}</b>}
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
                            Negli ultimi {r.pace.days} giorni con {c.name} hai speso {whole(c.monthly)}: {c.monthly > n.amount ? 'più di quanto rimborsi, quindi il debito sale.' : 'meno di quanto rimborsi, quindi il debito scende.'}
                          </div>
                        )}
                        {editable && (n.chosen && n.amount !== n.usual
                          ? <button type="button" className="lnk fl-back" onClick={() => setPayment(c.id, ym(n.date), null)}>Torna a {round(n.usual)}, come l'ultima volta</button>
                          : <div className="fl-tag">come l'ultima volta</div>)}
                      </div>
                    )
                  })}
                  {c.next.length === 0 && <div className="sb" style={{ marginTop: 6 }}>Nessun addebito previsto.</div>}
                  {!c.saldo && c.statementDay && c.next.length > 0 && <div className="sb fl-fine">Gli interessi dell'estratto conto contano quando li inserisci come spesa su {c.name}.</div>}
                </div>
              )
            })}
          </section>

          <section className="card pad">
            <h2 className="h">Un mese tipo</h2>
            <div className="fl-eq">
              <div><span>Entrano</span><b className="pos">{whole(t.in, true)}</b></div>
              {t.debts.map((d) => <div key={d.label} className="sub"><span>{d.label}</span><b>{whole(-d.amount)}</b></div>)}
              {revolving.length > 0 && <div className="sub"><span>Rimborso {list(revolvingNames)}</span><b>{whole(-t.revolving)}</b></div>}
              <div className="key"><span>Restano per le spese, {withCards}</span><b>{whole(t.budget)}</b></div>
              <div><span>Negli ultimi {r.pace.days} giorni, {withCards}, hai speso</span><b>{whole(t.paceHit)}</b></div>
              <div className={over > 0 ? 'bad' : 'good'}><span>{over > 0 ? 'Speso in più di quanto resta' : 'Margine'}</span><b>{whole(Math.abs(over))}</b></div>
            </div>
            {revolvingSpend > 0 && (
              <p className="sb fl-eqn">
                Con {list(revolvingNames)}, {byStatement ? 'nell’ultimo estratto conto' : `negli ultimi ${r.pace.days} giorni`}, hai speso altri {whole(revolvingSpend)}: {revolvingSpend > t.revolving
                  ? `${whole(t.revolving)} li copre il rimborso, ${whole(revolvingSpend - t.revolving)} restano come debito in più.`
                  : `meno dei ${whole(t.revolving)} che rimborsi, quindi quel debito scende di ${whole(t.revolving - revolvingSpend)}.`}
              </p>
            )}
          </section>
        </div>

        <section className="card pad">
          <div className="fl-sec">
            <h2 className="h">Prossimi movimenti sul conto</h2>
            <span className="sb">a destra, il disponibile dopo ogni movimento se non spendi altro</span>
          </div>
          <div className="row fl-mov today">
            <span className="d">Oggi</span>
            <span className="chip c-blu"><Icon name="bank" /></span>
            <div className="txt"><div className="nm">Disponibile sul conto</div><div className="sb">saldo più fido</div></div>
            <div className="fl-av"><b>{euro(b.available)}</b><span className="fl-track"><i style={{ width: `${Math.max(0, (b.available / maxAfter) * 100)}%` }} /></span></div>
          </div>
          {shown.map((it, i) => {
            const tight = it.date === w1.until && Math.abs(it.after - w1.amount) < 0.005 && (shown[i + 1]?.date !== it.date)
            return (
              <div key={`${it.date}-${it.line}-${i}`} className={`row fl-mov${tight ? ' tight' : ''}`}>
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
            )
          })}
          {w2 && <button type="button" className="lnk fl-more" onClick={() => setMore(!more)}>{more ? `Mostra solo fino al ${dayMonth(w1.until)}` : `Mostra anche fino al ${dayMonth(w2.until)}`}</button>}
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
