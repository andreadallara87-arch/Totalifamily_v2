import { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import Money from '../components/Money.jsx'
import CatChip from '../components/CatChip.jsx'
import FlowChart from '../components/FlowChart.jsx'
import { addMonths, ym } from '../lib/calc.js'
import { cashflow, spendingSplit } from '../lib/cashflow.js'
import { dayMonth, dayShort, euro, monthName, monthShort, monthYear } from '../lib/format.js'
import { accountVisual } from '../lib/visual.js'

const AHEAD = [[3, '3 mesi'], [6, '6 mesi'], [12, '12 mesi']]
const STATUS = { reale: 'Reale', 'in corso': 'In corso', previsto: 'Previsto' }
const mNum = (m) => Number(m.slice(5, 7))
const mLabel = (m) => monthName(mNum(m))
const list = (arr) => (arr.length < 2 ? arr.join('') : `${arr.slice(0, -1).join(', ')} e ${arr[arr.length - 1]}`)

/** Colonne mese per mese: entrate in verde, uscite sotto; i mesi previsti sono più chiari. */
function MonthColumns({ months, selected, onSelect }) {
  const max = Math.max(...months.map((m) => Math.max(m.in, m.out)), 1)
  return (
    <div className="flm" role="tablist" aria-label="Mesi">
      {months.map((m) => {
        const on = m.month === selected
        return (
          <button key={m.month} type="button" role="tab" aria-selected={on} className={`flm-col ${m.status === 'previsto' ? 'prev' : m.status === 'in corso' ? 'now' : ''}${on ? ' on' : ''}`} onClick={() => onSelect(m.month)} aria-label={`${monthYear(m.month)}: entrate ${euro(m.in)}, uscite ${euro(m.out)}`}>
            <span className={`flm-net ${m.net < 0 ? 'neg' : 'pos'}`}>{euro(m.net, { decimals: false, sign: true })}</span>
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
  const future = r.months.filter((m) => m.status === 'previsto')
  const avg = (k) => future.reduce((s, m) => s + m[k], 0) / (future.length || 1)
  const avgDebt = future.reduce((s, m) => s + m.lines.reduce((t, l) => t + (l.group === 'rate' ? l.capital : l.group === 'debiti' ? l.amount : 0), 0), 0) / (future.length || 1)
  const last = r.months[r.months.length - 1]
  const cashNames = list(r.cashIds.map((id) => accById.get(id)?.name).filter(Boolean))
  const split = sel.status !== 'previsto' ? spendingSplit({ accounts, txs, today, month: sel.month }) : null
  const estMonths = list(r.estimate.months.map(mLabel))
  const monthlyEst = spending ?? r.estimate.monthly

  // Messaggio principale: quando si va oltre il fido e se si rientra.
  const first = r.over[0]
  const stuck = r.over.find((e) => !e.back)
  let alert = null
  if (first) {
    const when = first.date === today ? 'Oggi' : dayMonth(first.date)
    alert = stuck && stuck === first
      ? `${when}: i conti vanno oltre il fido e, con questo ritmo, non rientrano.`
      : `${when}: i conti vanno oltre il fido (fino a ${euro(first.max, { decimals: false })} oltre) e rientrano il ${dayMonth(first.back)}.${stuck ? ` Dal ${dayMonth(stuck.date)} restano oltre il fido.` : ''}`
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
    if (l.group === 'rate') bits.push(`capitale ${euro(l.capital)} · interessi ${euro(l.interest)}`)
    if (l.group === 'carte') bits.push('pagamento della carta')
    if (l.group === 'debiti') bits.push('rimborso')
    if (l.group === 'spese') {
      if (l.real && l.expected) bits.push(`${euro(l.real)} già spesi, ${euro(l.expected)} stimati`)
      else if (l.expected) bits.push(l.sources.includes('stima') ? `stima: media di ${estMonths || 'questo mese'}` : 'già inserite')
      else bits.push(`${l.count} ${l.count === 1 ? 'movimento' : 'movimenti'}`)
      return bits.join(' · ')
    }
    const when = l.dates.length === 1 ? dayShort(l.dates[0]) : l.dates.length > 1 ? `${l.dates.length} volte` : ''
    if (when) bits.push(when)
    if (l.expected) {
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

  return (
    <>
      <section className="card fl-hero">
        <div className="fl-head">
          <div>
            <div className="mute" style={{ fontSize: 15 }}>Saldo dei conti oggi</div>
            <Money className="fl-big" value={r.today} />
            <div className="sb">{cashNames} insieme{r.limit !== null ? `, con un fido di ${euro(-r.limit, { decimals: false })}` : ''}</div>
          </div>
          <div className="segs" role="tablist" aria-label="Previsione">
            {AHEAD.map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={ahead === v} className={ahead === v ? 'seg on' : 'seg'} onClick={() => setAhead(v)}>{l}</button>)}
          </div>
        </div>
        {alert ? (
          <div className="note c-rosso fl-alert"><Icon name="alert" size={18} /><span>{alert}</span></div>
        ) : (
          <div className="note c-verde fl-alert"><Icon name="check" size={18} /><span>Nei prossimi {ahead} mesi resti dentro il fido. Punto più basso: {euro(r.low.value, { decimals: false })} il {dayMonth(r.low.date)}.</span></div>
        )}
        <FlowChart series={r.series} limit={r.limit} today={today} />
        <div className="fl-legend"><span><i className="solid" />saldo reale</span><span><i className="dash" />previsione</span>{r.limit !== null && <span><i className="band" />oltre il fido</span>}</div>
        <div className="fl-kpis">
          <div><span>Entrano ogni mese</span><b className="pos">{euro(avg('in'), { decimals: false, sign: true })}</b></div>
          <div><span>Escono ogni mese</span><b>{euro(-avg('out'), { decimals: false })}</b></div>
          <div><span>Differenza al mese</span><b className={avg('net') < 0 ? 'warn' : 'pos'}>{euro(avg('net'), { decimals: false, sign: true })}</b>{avgDebt > 0 && <small>di cui {euro(avgDebt, { decimals: false })} riducono i debiti</small>}</div>
          <div><span>A fine {mLabel(last.month)} {last.month.slice(0, 4)}</span><b className={r.limit !== null && last.end < r.limit ? 'warn' : undefined}>{euro(last.end, { decimals: false })}</b></div>
        </div>
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
                <div className="sb">Saldo dei conti da {euro(sel.start, { decimals: false })} a {euro(sel.end, { decimals: false })}</div>
              </div>
              <button type="button" className="hb" aria-label="Mese successivo" disabled={idx >= r.months.length - 1} onClick={() => setMonth(r.months[idx + 1].month)}><Icon name="right" /></button>
            </div>
            <div className="fl-sum">
              <div><span>Entrate</span><b className="pos">{euro(sel.in, { decimals: false, sign: true })}</b></div>
              <div><span>Uscite</span><b>{euro(-sel.out, { decimals: false })}</b></div>
              <div><span>Risultato</span><b className={sel.net < 0 ? 'warn' : 'pos'}>{euro(sel.net, { decimals: false, sign: true })}</b></div>
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
          <div className="lbl">Spese pagate dai conti</div>
          <div className="fl-est">
            <Money className="fl-estv" value={monthlyEst} /><span className="sb"> al mese</span>
          </div>
          <div className="sb">{spending === null ? `Media di ${estMonths || 'questo mese'}.` : `Media di ${estMonths}: ${euro(r.estimate.monthly)}.`} Prova con un'altra cifra:</div>
          <input className="fl-range" type="range" min="0" max={Math.max(4000, Math.ceil(r.estimate.monthly / 500) * 500 + 1000)} step="50" value={Math.round(monthlyEst)} onChange={(e) => setSpending(Number(e.target.value))} aria-label="Spese al mese" />
          {spending !== null && <button type="button" className="lnk" onClick={() => setSpending(null)}>Torna alla media</button>}

          <div className="lbl">Ogni mese, come l'ultima volta</div>
          {r.recurring.map((p) => (
            <div key={p.pattern} className="fl-li"><span>{p.label}</span><b className={p.dir === 'in' ? 'pos' : undefined}>{p.dir === 'in' ? '+' : '−'}{euro(p.amount).replace('−', '')}</b><small>il {p.day}</small></div>
          ))}
          <div className="lbl">Rate dei finanziamenti</div>
          {r.loans.map((l) => (
            <div key={l.id} className="fl-li"><span>{l.name}</span><b>−{euro(l.amount)}</b><small>il {l.day}</small></div>
          ))}
          <div className="sb" style={{ marginTop: 14 }}>
            Contano anche i movimenti già inseriti con una data futura. Le spese fatte con le carte entrano nel conto quando paghi la carta.
          </div>
        </section>
      </div>
    </>
  )
}
