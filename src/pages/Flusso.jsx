import { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import Money from '../components/Money.jsx'
import CatChip from '../components/CatChip.jsx'
import FlowChart from '../components/FlowChart.jsx'
import { ym } from '../lib/calc.js'
import { cashflow, spendingSplit } from '../lib/cashflow.js'
import { dayMonth, dayShort, euro, monthName, monthShort, monthYear } from '../lib/format.js'
import { accountVisual } from '../lib/visual.js'

const AHEAD = [[3, '3 mesi'], [6, '6 mesi'], [12, '12 mesi']]
const STATUS = { reale: 'Reale', 'in corso': 'In corso', previsto: 'Previsto' }
const mNum = (m) => Number(m.slice(5, 7))
const mLabel = (m) => monthName(mNum(m))
const list = (arr) => (arr.length < 2 ? arr.join('') : `${arr.slice(0, -1).join(', ')} e ${arr[arr.length - 1]}`)
const whole = (v, sign = false) => euro(v, { decimals: false, sign })

/** Colonne mese per mese: entrate e uscite affiancate; i mesi previsti sono tratteggiati. */
function MonthColumns({ months, selected, onSelect }) {
  const max = Math.max(...months.map((m) => Math.max(m.in, m.out)), 1)
  return (
    <div className="flm" role="tablist" aria-label="Mesi">
      {months.map((m) => {
        const on = m.month === selected
        return (
          <button key={m.month} type="button" role="tab" aria-selected={on} className={`flm-col ${m.status === 'previsto' ? 'prev' : m.status === 'in corso' ? 'now' : ''}${on ? ' on' : ''}`} onClick={() => onSelect(m.month)} aria-label={`${monthYear(m.month)}: entrate ${euro(m.in)}, uscite ${euro(m.out)}`}>
            <span className={`flm-net ${m.net < 0 ? 'neg' : 'pos'}`}>{whole(m.net, true)}</span>
            <span className="flm-bars">
              <i className="in" style={{ height: `${(m.in / max) * 100}%` }} />
              <i className="out" style={{ height: `${(m.out / max) * 100}%` }} />
            </span>
            <span className="flm-l">{monthShort(mNum(m.month))}</span>
            <span className="flm-s">{m.status === 'previsto' ? 'previsto' : m.status === 'in corso' ? 'in corso' : ''}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function Flusso({ data, today }) {
  const { accounts, categories, txs } = data
  const [ahead, setAhead] = useState(6)
  const [spending, setSpending] = useState(null)
  const [month, setMonth] = useState(ym(today))
  const r = useMemo(() => cashflow({ accounts, categories, txs, today, ahead, spending }), [accounts, categories, txs, today, ahead, spending])
  const catsById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])

  const sel = r.months.find((m) => m.month === month) || r.months.find((m) => m.status === 'in corso')
  const idx = r.months.indexOf(sel)
  const last = r.months[r.months.length - 1]
  const cashNames = list(r.cashIds.map((id) => accById.get(id)?.name).filter(Boolean))
  const split = sel.status !== 'previsto' ? spendingSplit({ accounts, txs, today, month: sel.month }) : null
  const t = r.typical
  const paceLabel = `ultimi ${r.pace.days} giorni`

  // Messaggio principale: quando si va oltre il fido.
  const first = r.over[0]
  let alert = null
  if (first) {
    const from = first.date === today ? 'Oggi' : `Dal ${dayMonth(first.date)}`
    const deep = `Il punto più basso è il ${dayMonth(r.low.date)}: ${whole(r.low.value)}, cioè ${whole(r.limit - r.low.value)} oltre il fido.`
    if (r.over.length > 1) alert = `${from} i conti vanno oltre il fido ${r.over.length} volte nei prossimi ${ahead} mesi. ${deep}`
    else if (first.back) alert = `${from} al ${dayMonth(first.back)} i conti vanno oltre il fido, fino a ${whole(first.max)} oltre.`
    else alert = `${from} i conti vanno oltre il fido e, con questo ritmo, non rientrano. ${deep}`
  }

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
  const subFor = (l) => {
    const bits = []
    if (l.group === 'spese') {
      if (l.real && l.expected) return `${euro(l.real)} già spesi, ${euro(l.expected)} stimati`
      if (l.expected) return l.sources.includes('stima') ? `stima: ritmo degli ${paceLabel}` : 'già inserite'
      return `${l.count} ${l.count === 1 ? 'movimento' : 'movimenti'}`
    }
    if (l.group === 'rate') bits.push(`capitale ${euro(l.capital)} · interessi ${euro(l.interest)}`)
    if (l.group === 'debiti') bits.push('rimborso')
    if (l.group === 'carte') {
      if (l.card) {
        bits.push(`acquisti di ${mLabel(l.card.of)} ${euro(l.card.purchases)}`)
        if (l.card.plan) bits.push(`piano a rate ${euro(l.card.plan)}`)
        if (l.card.fee) bits.push(`bollo ${euro(l.card.fee)}`)
      } else bits.push('pagamento della carta')
    }
    const when = l.dates.length === 1 ? dayShort(l.dates[0]) : l.dates.length > 1 ? `${l.dates.length} volte` : ''
    if (when) bits.push(when)
    if (l.expected && !l.card) {
      const src = l.sources.includes('rata') ? 'rata del finanziamento' : l.sources.includes('ricorrente') ? 'ogni mese, come l’ultima volta' : 'già inserito'
      bits.push(l.real ? `${euro(l.expected)} previsti` : src)
    }
    return bits.join(' · ')
  }
  const row = (l) => (
    <div key={l.line} className="row fl-row">
      {chipFor(l)}
      <div className="txt">
        <div className="nm">{l.label}</div>
        <div className="sb">{subFor(l)}</div>
      </div>
      <div className={`am${l.dir === 'in' ? ' pos' : ''}`}>
        {l.dir === 'in' ? '+' : '−'}{euro(l.amount).replace('−', '')}
        {l.expected > 0 && <span className="fl-tag">{l.real ? 'in parte previsto' : 'previsto'}</span>}
      </div>
    </div>
  )

  const ins = sel.lines.filter((l) => l.dir === 'in')
  const outs = sel.lines.filter((l) => l.dir === 'out')
  const where = [
    t.onAccounts < 0 ? `${whole(-t.onAccounts)} in meno sui conti` : t.onAccounts > 0 ? `${whole(t.onAccounts)} in più sui conti` : null,
    t.onCards < 0 ? `${whole(-t.onCards)} in più di debito sulle carte` : t.onCards > 0 ? `${whole(t.onCards)} in meno di debito sulle carte` : null,
  ].filter(Boolean)
  const sliderMax = Math.max(4000, Math.ceil(r.pace.all / 500) * 500 + 1000)

  return (
    <>
      <section className="card fl-hero">
        <div className="fl-head">
          <div>
            <div className="mute" style={{ fontSize: 15 }}>Saldo dei conti oggi</div>
            <Money className="fl-big" value={r.today} />
            <div className="sb">{cashNames} insieme{r.limit !== null ? `, con un fido di ${whole(-r.limit)}` : ''}</div>
          </div>
          <div className="segs" role="tablist" aria-label="Previsione">
            {AHEAD.map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={ahead === v} className={ahead === v ? 'seg on' : 'seg'} onClick={() => setAhead(v)}>{l}</button>)}
          </div>
        </div>
        {alert ? (
          <div className="note c-rosso fl-alert"><Icon name="alert" size={18} /><span>{alert}</span></div>
        ) : (
          <div className="note c-verde fl-alert"><Icon name="check" size={18} /><span>Nei prossimi {ahead} mesi resti dentro il fido. Punto più basso: {whole(r.low.value)} il {dayMonth(r.low.date)}.</span></div>
        )}
        <FlowChart series={r.series} limit={r.limit} today={today} />
        <div className="fl-legend"><span><i className="solid" />saldo reale</span><span><i className="dash" />previsione</span>{r.limit !== null && <span><i className="band" />oltre il fido</span>}</div>
      </section>

      <section className="card pad">
        <div className="fl-sec">
          <h2 className="h">Dove va quello che entra in un mese</h2>
          <span className="sb">un mese tipo, al ritmo di adesso</span>
        </div>
        <div className="fl-steps">
          <div className="fl-step">
            <span className="k">Entrano</span>
            <b className="pos">{whole(t.in, true)}</b>
            <small>stipendio e altre entrate che si ripetono</small>
          </div>
          <div className="fl-step">
            <span className="k">Vanno ai debiti</span>
            <b>{whole(-t.debtTotal)}</b>
            <small>{t.debts.map((d) => `${d.label} ${whole(d.amount)}`).join(' · ')}</small>
          </div>
          <div className="fl-step key">
            <span className="k">Restano per vivere</span>
            <b>{whole(t.left)}</b>
            <small>prima di qualsiasi spesa</small>
          </div>
          <div className="fl-step">
            <span className="k">Spendi</span>
            <b>{whole(-t.spend)}</b>
            <small>{spending === null ? `ritmo degli ${paceLabel}, su conti e carte` : `cifra di prova. Negli ${paceLabel}: ${whole(r.pace.all)}`}{r.trend.map((x) => <span key={x.month} className="nw"> · {monthShort(mNum(x.month))} {whole(x.total)}</span>)}</small>
            <input className="fl-range" type="range" min="0" max={sliderMax} step="50" value={Math.round(t.spend)} onChange={(e) => setSpending(Number(e.target.value))} aria-label="Spese al mese" />
            {spending !== null && <button type="button" className="lnk" onClick={() => setSpending(null)}>Torna al ritmo attuale</button>}
          </div>
          <div className={`fl-step res ${t.diff < 0 ? 'neg' : 'ok'}`}>
            <span className="k">{t.diff < 0 ? 'Mancano' : 'Avanzano'}</span>
            <b>{whole(Math.abs(t.diff))}</b>
            <small>{where.join(', ')}</small>
          </div>
        </div>
        <div className="sb fl-foot">Con questo ritmo, a fine {mLabel(last.month)} {last.month.slice(0, 4)} il saldo dei conti sarebbe <b className={r.limit !== null && last.end < r.limit ? 'warn' : undefined}>{whole(last.end)}</b>. Sposta il cursore sotto "Spendi" per vedere cosa cambia.</div>
      </section>

      <div className="grid g-fl">
        <section className="card pad">
          <div className="fl-sec">
            <h2 className="h">Mese per mese</h2>
            <div className="fl-legend"><span><i className="in" />entrate</span><span><i className="out" />uscite</span></div>
          </div>
          <MonthColumns months={r.months} selected={sel.month} onSelect={setMonth} />

          <div className="fl-det">
            <div className="fl-dhead">
              <button type="button" className="hb" aria-label="Mese precedente" disabled={idx <= 0} onClick={() => setMonth(r.months[idx - 1].month)}><Icon name="left" /></button>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <h2 className="h">{monthYear(sel.month)}<span className={`badge${sel.status === 'reale' ? ' plain' : ''}`}>{STATUS[sel.status]}</span></h2>
                <div className="sb">Saldo dei conti da {whole(sel.start)} a {whole(sel.end)}</div>
              </div>
              <button type="button" className="hb" aria-label="Mese successivo" disabled={idx >= r.months.length - 1} onClick={() => setMonth(r.months[idx + 1].month)}><Icon name="right" /></button>
            </div>
            <div className="fl-sum">
              <div><span>Entrate</span><b className="pos">{whole(sel.in, true)}</b></div>
              <div><span>Uscite</span><b>{whole(-sel.out)}</b></div>
              <div><span>Risultato</span><b className={sel.net < 0 ? 'warn' : 'pos'}>{whole(sel.net, true)}</b></div>
            </div>
            <div className="lbl">Entrate</div>
            {ins.length ? ins.map(row) : <div className="sb" style={{ padding: '8px 0' }}>Nessuna entrata</div>}
            <div className="lbl">Uscite</div>
            {outs.map(row)}
            {split && split.total > 0 && (
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

        <section className="card pad fl-how">
          <h2 className="h">Come faccio la previsione</h2>
          <div className="lbl">Spese: il ritmo degli {paceLabel}</div>
          <div className="fl-li"><span>Dai conti</span><b>{euro(r.pace.cash)}</b></div>
          {r.pace.cards.map((c) => (
            <div key={c.id} className="fl-li"><span>Con {c.name}</span><b>{euro(c.monthly)}</b></div>
          ))}
          <div className="sb" style={{ marginTop: 6 }}>Dal {dayMonth(r.pace.from)} al {dayMonth(r.pace.to)}.</div>

          {r.saldoCards.map((c) => (
            <div key={c.id}>
              <div className="lbl">Carta {c.name}</div>
              <div className="sb">
                Ogni mese, il {c.day}, paghi gli acquisti del mese prima
                {c.plan > 0 && <>, più {euro(c.plan)} del piano a rate{c.planUntil ? ` (fino a ${mLabel(c.planUntil)} ${c.planUntil.slice(0, 4)})` : ''}</>}
                {c.fee > 0 && <> e {euro(c.fee)} di bollo</>}.
              </div>
            </div>
          ))}

          <div className="lbl">Ogni mese, come l'ultima volta</div>
          {r.recurring.map((p) => (
            <div key={p.pattern} className="fl-li"><span>{p.label}</span><b className={p.dir === 'in' ? 'pos' : undefined}>{p.dir === 'in' ? '+' : '−'}{euro(p.amount).replace('−', '')}</b><small>il {p.day}</small></div>
          ))}
          <div className="lbl">Rate dei finanziamenti</div>
          {r.loans.map((l) => (
            <div key={l.id} className="fl-li"><span>{l.name}</span><b>−{euro(l.amount)}</b><small>il {l.day}</small></div>
          ))}
          <div className="sb" style={{ marginTop: 14 }}>Contano anche i movimenti già inseriti con una data futura.</div>
        </section>
      </div>
    </>
  )
}
