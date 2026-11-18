import { useMemo, useState } from 'react'
import PhoneHome from '../components/PhoneHome.jsx'
import useWide from '../lib/useWide.js'
import Icon from '../components/Icon.jsx'
import Money from '../components/Money.jsx'
import Donut, { DONUT_COLORS } from '../components/Donut.jsx'
import BalanceChart from '../components/BalanceChart.jsx'
import CatChip from '../components/CatChip.jsx'
import LiveCard from '../components/LiveCard.jsx'
import { liveMonth, spendingLimit } from '../lib/vive.js'
import { addDays, addMonths, balancesAt, dailySeries, fromCents, lastDayOfMonth, loanEnd, rootCategory, spendingByCategory, upcoming, ym } from '../lib/calc.js'
import { cashflow } from '../lib/cashflow.js'
import { ruleItems } from '../lib/recurring.js'
import { euro, monthName, monthShortYear, relativeDay, dayMonth } from '../lib/format.js'
import { accountSubtitle, accountVisual, kindVisual } from '../lib/visual.js'

const PERIODS = [
  { id: 'settimana', label: 'Settimana', short: '7 g', days: 7 },
  { id: 'mese', label: 'Mese', short: 'Mese', days: 30 },
  { id: '3mesi', label: '3 mesi', short: '3 mesi', days: 90 },
  { id: 'anno', label: 'Anno', short: 'Anno', days: 365 },
]

export default function Home({ data, today, go, onNew, onEdit, onConfirm, onLimit, layout, onLayout }) {
  const [period, setPeriod] = useState('mese')
  const wide = useWide()
  const { accounts, categories, txs, settings, recurring: rules } = data

  const m = useMemo(() => {
    const catsById = new Map(categories.map((c) => [c.id, c]))
    const accById = new Map(accounts.map((a) => [a.id, a]))
    const bal = balancesAt(accounts, txs, today)
    const balance = (id) => fromCents(bal.get(id) || 0)
    const main = accById.get(settings?.main_account_id) || accounts.find((a) => a.kind === 'conto')
    const mainBal = main ? balance(main.id) : 0
    const month = ym(today)
    const prevMonth = addMonths(month, -1)
    const prevEnd = `${prevMonth}-${String(lastDayOfMonth(prevMonth)).padStart(2, '0')}`
    const startBal = main ? fromCents(balancesAt([main], txs, prevEnd).get(main.id)) : 0
    // Già inseriti con data futura, rate automatiche e movimenti ricorrenti con importo fisso.
    const items = [...upcoming({ accounts, txs, today }), ...ruleItems(rules, txs, today, addDays(today, 31))].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const checks = txs.filter((t) => t.to_check && t.date <= today)
    const day = Number(today.slice(8, 10))
    // Spese vive: senza la categoria Costi finanziari (interessi, commissioni, bolli).
    const live = liveMonth({ txs, categories, today, limit: spendingLimit(settings) })
    const liveTxs = live.finId ? txs.filter((t) => t.kind !== 'spesa' || rootCategory(catsById, t.category_id)?.id !== live.finId) : txs
    const spend = spendingByCategory(liveTxs, catsById, `${month}-01`, today)
    const prevSpend = spendingByCategory(liveTxs, catsById, `${prevMonth}-01`, `${prevMonth}-${String(Math.min(day, lastDayOfMonth(prevMonth))).padStart(2, '0')}`)
    const top = spend.rows.slice(0, 5)
    const rest = spend.rows.slice(5).reduce((s, r) => s + r.total, 0)
    const parts = top.map((r, i) => ({ label: r.name, value: r.total, color: DONUT_COLORS[i] }))
    if (rest > 0) parts.push({ label: 'Altro', value: rest, color: DONUT_COLORS[5] })
    const loans = accounts.filter((a) => a.kind === 'finanziamento' && !a.archived).map((a) => {
      const residual = -balance(a.id)
      return { ...a, residual, end: loanEnd(residual, a.tan, a.instalment, today)?.end }
    })
    const prevFrom = `${prevMonth}-01`
    const interest = txs.filter((t) => t.kind === 'spesa' && t.date >= prevFrom && t.date <= prevEnd && accById.get(t.account_id)?.kind === 'finanziamento').reduce((s, t) => s + t.amount, 0)
    const wallets = accounts.filter((a) => a.kind !== 'finanziamento' && !a.archived)
    return { catsById, accById, balance, main, mainBal, startBal, items, checks, live, spend, prevSpend, parts, loans, interest, prevMonth, wallets }
  }, [accounts, categories, txs, settings, today, rules])
  // Quanto si può ancora spendere restando dentro il fido, con gli impegni già noti (pagina "Flusso di cassa").
  const flow = useMemo(() => cashflow({ accounts, categories, txs, today, rules }).budget, [accounts, categories, txs, today, rules])
  const liveCard = <LiveCard live={m.live} flow={wide ? null : flow} go={go} onLimit={onLimit} wide={wide} />

  const p = PERIODS.find((x) => x.id === period)
  const series = useMemo(() => (m.main ? dailySeries(m.main, txs, addDays(today, -p.days), today) : []), [m.main, txs, today, p.days])

  const overdraft = m.main ? Number(m.main.overdraft) || 0 : 0
  const available = m.mainBal + overdraft
  const used = overdraft > 0 ? Math.min(1, Math.max(0, -m.mainBal / overdraft)) : 0
  const diff = m.mainBal - m.startBal

  const itemLabel = (it) => {
    if (it.source === 'rata' || it.source === 'ricorrente') return it.note
    const c = it.category_id && m.catsById.get(it.category_id)
    if (it.kind === 'giroconto') return `Giroconto verso ${m.accById.get(it.to_account_id)?.name || 'conto'}`
    return it.note || c?.name || (it.kind === 'entrata' ? 'Entrata' : 'Spesa')
  }
  const itemSign = (it) => {
    if (it.kind === 'entrata') return 1
    if (it.kind === 'spesa') return -1
    return it.account_id === m.main?.id ? -1 : 1
  }
  const loansTotal = m.loans.reduce((s, l) => s + Math.max(0, l.residual), 0)
  const costliest = m.loans.reduce((best, l) => (Number(l.tan) > Number(best?.tan || 0) ? l : best), null)
  const spendDiff = m.prevSpend.total - m.spend.total
  const maxBar = Math.max(m.spend.total, m.prevSpend.total) || 1

  const accName = (id) => m.accById.get(id)?.name || ''
  const checksBlock = m.checks.length > 0 && (
      <section className="card pad chk-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <h2 className="h">Da controllare</h2>
          <span className="sb">movimenti ricorrenti appena inseriti</span>
        </div>
        {m.checks.map((t) => {
          const cat = t.kind !== 'giroconto' && t.category_id && m.catsById.get(t.category_id)
          const v = kindVisual(t.kind)
          const s = t.kind === 'entrata' ? 1 : -1
          return (
            <div className="row" key={t.id}>
              {cat ? <CatChip cat={cat} root={rootCategory(m.catsById, cat.id)} /> : <div className={`chip ${v.chip}`}><Icon name={v.icon} /></div>}
              <div className="txt"><div className="nm">{t.note || cat?.name || 'Movimento'}</div><div className="sb">{relativeDay(t.date, today)} · {t.kind === 'giroconto' ? `${accName(t.account_id)} → ${accName(t.to_account_id)}` : accName(t.account_id)}</div></div>
              <div className="am" style={s > 0 ? { color: 'var(--pos)' } : undefined}>{euro(s * t.amount, { sign: s > 0 })}</div>
              <div className="chk-acts">
                <button type="button" className="btn small ghost" onClick={() => onEdit(t)}>Correggi</button>
                <button type="button" className="btn small" onClick={() => onConfirm(t)}><Icon name="check" size={16} />Va bene</button>
              </div>
            </div>
          )
        })}
      </section>
    )
  const heroLeft = (
      <div className="hero-left">
        <div className="mute" style={{ fontSize: 15 }}>Disponibile {m.main ? `su ${m.main.name}` : ''}</div>
        <Money className="big" value={available} />
        <div><span className="pill" style={{ marginTop: 6 }}>{euro(diff, { sign: true })} sul conto da inizio mese</span></div>
        <div className="fido">
          <div className="kv"><span className="mute">Saldo del conto</span><b>{euro(m.mainBal)}</b></div>
          {overdraft > 0 && (
            <>
              <div className="kv"><span className="mute">Fido</span><b>{euro(overdraft)}</b></div>
              <div className="track"><i style={{ width: `${used * 100}%` }} /></div>
              <div className="sb">Fido usato al {Math.round(used * 100)}%</div>
            </>
          )}
        </div>
      </div>
  )
  const chart = (
    <>
    <div style={{ minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>Saldo del conto</span>
      <div className="segs" role="tablist" aria-label="Periodo">
        {PERIODS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={x.id === period} className={x.id === period ? 'seg on' : 'seg'} onClick={() => setPeriod(x.id)}>
            <span className="desk-only">{x.label}</span><span className="mob-only">{x.short}</span>
          </button>
        ))}
      </div>
    </div>
    <BalanceChart series={series} limit={overdraft > 0 ? -overdraft : null} />
    </>
  )
  const actions = (
    <div className="actions" style={{ display: 'flex', gap: 10 }}>
      <button type="button" className="act c-rosso" onClick={() => onNew('spesa')}><Icon name="down" />Spesa</button>
      <button type="button" className="act c-verde" onClick={() => onNew('entrata')}><Icon name="up" />Entrata</button>
      <button type="button" className="act c-blu" onClick={() => onNew('giroconto')}><Icon name="swap" />Giroconto</button>
    </div>
  )
  const arrivo = (
    <section className="card pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h2 className="h">In arrivo</h2>
        <span className="sb">prossimi 30 giorni</span>
      </div>
      {m.items.length === 0 && <div className="empty">Nessun movimento atteso</div>}
      {m.items.slice(0, 5).map((it) => {
        const v = it.source === 'rata' ? { icon: 'bank', chip: 'c-viola' } : kindVisual(it.kind)
        const cat = it.kind !== 'giroconto' && it.category_id && m.catsById.get(it.category_id)
        const s = itemSign(it)
        const tx = it.source === 'movimento' && txs.find((t) => t.id === it.key)
        const Row = tx ? 'button' : 'div'
        return (
          <Row className={`row${tx ? ' tap' : ''}`} key={it.key} {...(tx ? { type: 'button', onClick: () => onEdit(tx) } : {})}>
            {cat ? <CatChip cat={cat} root={rootCategory(m.catsById, cat.id)} /> : <div className={`chip ${v.chip}`}><Icon name={v.icon} /></div>}
            <div className="txt"><div className="nm">{itemLabel(it)}</div><div className="sb">{relativeDay(it.date, today)}{it.source === 'rata' ? ', rata automatica' : it.source === 'ricorrente' ? ', ricorrente' : ''}</div></div>
            <div className="am" style={s > 0 ? { color: 'var(--pos)' } : undefined}>{euro(s * it.amount, { decimals: false, sign: true })}</div>
          </Row>
        )
      })}
      {wide && <a className="row tap flow-link" href="#/flusso" onClick={(e) => { e.preventDefault(); go('flusso') }}>
        <div className={`chip ${flow.short ? 'c-rosso' : 'c-blu'}`}><Icon name={flow.short ? 'alert' : 'trend'} /></div>
        {flow.short ? (
          <div className="txt"><div className="nm">Mancano {euro(flow.short.amount, { decimals: false })} per restare nel fido</div><div className="sb">con gli impegni già certi, dal {dayMonth(flow.short.date)}</div></div>
        ) : (
          <div className="txt"><div className="nm">Puoi ancora spendere {euro(Math.max(0, flow.windows[0].amount), { decimals: false })}</div><div className="sb">fino al {dayMonth(flow.windows[0].until)}, restando dentro il fido</div></div>
        )}
        <Icon name="right" size={18} style={{ color: 'var(--mute)', flex: 'none' }} />
      </a>}
      <a className="row tap" href="#/ricorrenti" onClick={(e) => { e.preventDefault(); go('ricorrenti') }}>
        <div className="chip c-viola"><Icon name="rotate" /></div>
        <div className="txt"><div className="nm">Movimenti ricorrenti</div><div className="sb">{rules.filter((r) => r.active).length} attivi, si inseriscono da soli</div></div>
        <Icon name="right" size={18} style={{ color: 'var(--mute)', flex: 'none' }} />
      </a>
      <a className="row tap" href="#/spese" onClick={(e) => { e.preventDefault(); go('spese') }}>
        <div className="chip c-verde"><Icon name="bars" /></div>
        <div className="txt"><div className="nm">Spese vive mese per mese</div><div className="sb">confronto con il limite, categoria per categoria</div></div>
        <Icon name="right" size={18} style={{ color: 'var(--mute)', flex: 'none' }} />
      </a>
    </section>
  )
  const conti = (
    <section className="card pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="h">Conti e carte</h2>
        <a className="lnk" href="#/movimenti" onClick={(e) => { e.preventDefault(); go('movimenti') }}>Tutti i movimenti</a>
      </div>
      <div className="sb" style={{ marginBottom: 4 }}>Tocca un conto per vedere i suoi movimenti</div>
      {m.wallets.map((a) => {
        const v = accountVisual(a)
        const b = m.balance(a.id)
        return (
          <a className="row tap" key={a.id} href={`#/movimenti?conto=${a.id}`} onClick={() => window.scrollTo(0, 0)}>
            <div className={`chip ${v.chip}`}><Icon name={v.icon} /></div>
            <div className="txt"><div className="nm">{a.name}</div><div className="sb">{accountSubtitle(a, b)}</div></div>
            <Money className="am" value={b} />
            <Icon name="right" size={16} style={{ color: 'var(--mute)', flex: 'none' }} />
          </a>
        )
      })}
    </section>
  )
  const spese = (
    <section className="card pad">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="h">Spese vive di {monthName(Number(today.slice(5, 7)))}</h2>
        <a className="lnk" href="#/categorie" onClick={(e) => { e.preventDefault(); go('categorie') }}>Dettagli</a>
      </div>
      <div className="sb">per categoria, senza interessi e commissioni, al {Number(today.slice(8, 10))} {monthName(Number(today.slice(5, 7)))}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 14 }}>
        <Donut parts={m.parts}>
          <div style={{ fontSize: 21, lineHeight: '24px', fontWeight: 700, letterSpacing: '-0.02em' }}>{euro(m.spend.total, { decimals: false })}</div>
          <div style={{ fontSize: 12, color: 'var(--mute)' }}>spesi</div>
        </Donut>
        <div style={{ flex: 1, minWidth: 0 }}>
          {m.parts.length === 0 && <div className="sb">Nessuna spesa questo mese</div>}
          {m.parts.map((x) => (
            <div className="lg" key={x.label}><i style={{ background: x.color }} /><span>{x.label}</span><b>{euro(x.value, { decimals: false })}</b></div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 18, borderRadius: 18, background: 'var(--soft)', padding: '14px 16px' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>
          {spendDiff >= 0 ? `${euro(spendDiff, { decimals: false })} in meno di ${monthName(Number(m.prevMonth.slice(5)))}` : `${euro(-spendDiff, { decimals: false })} in più di ${monthName(Number(m.prevMonth.slice(5)))}`}
        </div>
        <div style={{ fontSize: 12, color: 'var(--mute)', marginTop: 1 }}>confronto allo stesso giorno del mese</div>
        {[[monthName(Number(today.slice(5, 7))).slice(0, 3), m.spend.total, 'var(--acc)'], [monthName(Number(m.prevMonth.slice(5))).slice(0, 3), m.prevSpend.total, 'var(--bar2)']].map(([l, v, c]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, fontSize: 12 }}>
            <span style={{ width: 28, color: 'var(--mute)' }}>{l}</span>
            <div className="track" style={{ flex: 1 }}><i style={{ width: `${(v / maxBar) * 100}%`, background: c }} /></div>
            <span style={{ width: 56, textAlign: 'right', fontWeight: 600 }}>{euro(v, { decimals: false })}</span>
          </div>
        ))}
      </div>
    </section>
  )
  const finanziamenti = (
    <section className="card pad loans">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="h">Finanziamenti</h2>
        <a className="lnk" href="#/conti" onClick={(e) => { e.preventDefault(); go('conti') }}>Dettagli</a>
      </div>
      <Money value={loansTotal} style={{ display: 'block', fontSize: 34, lineHeight: '40px', fontWeight: 700, letterSpacing: '-0.03em', marginTop: 6 }} />
      <div className="sb" style={{ marginBottom: 10 }}>{euro(m.interest)} di interessi a {monthName(Number(m.prevMonth.slice(5)))}</div>
      {m.loans.map((l) => {
        const v = accountVisual(l)
        const dear = costliest && costliest.id === l.id && Number(l.tan) >= 10
        return (
          <div className="row" key={l.id} style={{ minHeight: 54 }}>
            <div className={`chip ${v.chip}`}><Icon name={v.icon} /></div>
            <div className="txt">
              <div className="nm">{l.name}{dear && <span className="badge warn">il più caro</span>}</div>
              <div className="sb" style={dear ? { color: 'var(--warn)' } : undefined}>
                TAN {String(l.tan ?? '–').replace('.', ',')}%{l.instalment ? `, rata ${euro(l.instalment, { decimals: false })}` : ''}
              </div>
            </div>
            <div className="am">
              <Money value={Math.max(0, l.residual)} />
              {l.end && <div className="sb" style={{ fontWeight: 400 }}>fino a {monthShortYear(l.end)}</div>}
            </div>
          </div>
        )
      })}
    </section>
  )

  if (!wide) {
    const blocks = {
      mese: liveCard,
      saldo: <section className="hero">{heroLeft}{actions}</section>,
      grafico: <section className="chart-col">{chart}</section>,
      arrivo, conti, spese, finanziamenti,
    }
    const meta = {
      mese: { title: 'Spese vive del mese', sub: `${euro(m.live.spent, { decimals: false })} di ${euro(m.live.limit, { decimals: false })}`, icon: 'pie', chip: 'c-verde' },
      saldo: { title: 'Saldo e pulsanti', sub: `${euro(available)} disponibili`, icon: 'bank', chip: 'c-blu' },
      grafico: { title: 'Grafico del saldo', sub: 'andamento del conto', icon: 'trend', chip: 'c-viola' },
      arrivo: { title: 'In arrivo', sub: `${m.items.length} movimenti nei prossimi 30 giorni`, icon: 'calendar', chip: 'c-arancio' },
      conti: { title: 'Conti e carte', sub: `${m.wallets.length} conti e carte`, icon: 'card', chip: 'c-teal' },
      spese: { title: `Spese vive per categoria`, sub: `${euro(m.spend.total, { decimals: false })} spesi`, icon: 'pie', chip: 'c-rosa' },
      finanziamenti: { title: 'Finanziamenti', sub: `${euro(loansTotal, { decimals: false })} da restituire`, icon: 'percent', chip: 'c-giallo' },
    }
    return <PhoneHome blocks={blocks} meta={meta} layout={layout} onLayout={onLayout} top={checksBlock} />
  }

  return (
    <>
      {checksBlock}
      {liveCard}
      <div className="grid g-hero">
        <section className="card hero">
          <div className="hero-in">
            {heroLeft}
            <div className="chart-col" style={{ flex: 1, minWidth: 0 }}>
              {chart}
            </div>
          </div>
          {actions}
        </section>
        {arrivo}
      </div>

      <div className="grid g-row2">
        {conti}
        {spese}
        {finanziamenti}
      </div>
    </>
  )
}
