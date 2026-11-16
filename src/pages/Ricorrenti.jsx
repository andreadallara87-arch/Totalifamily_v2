import { useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'
import Money from '../components/Money.jsx'
import CatChip from '../components/CatChip.jsx'
import RecurringEditor from '../components/RecurringEditor.jsx'
import { addDays, rootCategory } from '../lib/calc.js'
import { cashAccountIds } from '../lib/cashflow.js'
import { GROUPS, cardDebit, estimate, every, groupOf, occurrences, doneInMonth, suggestions } from '../lib/recurring.js'
import { saveIgnored } from '../lib/data.js'
import { dayLong, dayShort, euro } from '../lib/format.js'
import { accountVisual } from '../lib/visual.js'

export default function Ricorrenti({ data, today, onRuleSaved, onRuleDeleted, onIgnored }) {
  const { accounts, categories, txs, recurring: rules, settings } = data
  const [edit, setEdit] = useState(null) // { rule } oppure { seed } oppure {}
  const accById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const catsById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const ctx = { accById, catsById, txs }
  const ignored = settings?.ignored_suggestions || []

  const v = useMemo(() => {
    const cash = cashAccountIds(accounts, txs)
    const est = new Map(rules.map((r) => [r.id, estimate(r, { accById, catsById, txs })]))
    let out = 0
    let inn = 0
    for (const r of rules) {
      if (!r.active) continue
      const a = est.get(r.id).amount / (r.every_months || 1)
      if (r.kind === 'entrata' && cash.has(r.account_id)) inn += a
      else if (r.kind !== 'entrata' && cash.has(r.account_id) && !(r.kind === 'giroconto' && cash.has(r.to_account_id))) out += a
    }
    const groups = GROUPS.map((g) => ({ ...g, rules: rules.filter((r) => groupOf(r, accById, catsById) === g.id) })).filter((g) => g.rules.length)
    // Prossimi 30 giorni: cosa entrerà da solo.
    const until = addDays(today, 30)
    const next = []
    for (const r of rules) {
      for (const date of occurrences(r, today, until)) {
        const done = doneInMonth(r, txs, date)
        let amount = Number(r.amount)
        if (r.calc === 'carta') amount = cardDebit(accById.get(r.to_account_id), txs, catsById, date).amount
        next.push({ r, date, done, amount })
      }
    }
    next.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.r.sort_order - b.r.sort_order))
    return { est, out, inn, groups, next, cash, found: suggestions(data, rules, today, ignored) }
  }, [rules, accounts, txs, accById, catsById, today, data, ignored])

  const chip = (r) => {
    if (r.kind === 'giroconto') {
      const vis = accountVisual(accById.get(r.to_account_id) || {})
      return <div className={`chip ${vis.chip}`}><Icon name={vis.icon} /></div>
    }
    const c = catsById.get(r.category_id)
    return c ? <CatChip cat={c} root={rootCategory(catsById, c.id)} /> : <div className="chip c-rosso"><Icon name="down" /></div>
  }
  const where = (r) => {
    const from = accById.get(r.account_id)?.name || ''
    if (r.kind === 'giroconto') return `${from} → ${accById.get(r.to_account_id)?.name || ''}`
    return `${from} · ${catsById.get(r.category_id)?.name || 'senza categoria'}`
  }
  const sign = (r) => (r.kind === 'entrata' ? 1 : -1)

  async function ignore(s) {
    const list = [...ignored, s.key]
    onIgnored(list)
    try { await saveIgnored(list) } catch { /* resta nascosto in questa sessione */ }
  }

  let lastDay = ''
  return (
    <>
      <div className="grid rc-grid">
        <div className="rc-col">
          <section className="card pad">
            <div className="rc-sum">
              <div><div className="sb">Ogni mese escono dai conti</div><Money className="rc-big" value={v.out} /></div>
              <div><div className="sb">Ogni mese entrano</div><Money className="rc-big pos" value={v.inn} /></div>
              <div className="desk-only"><div className="sb">Attivi</div><div className="rc-big">{rules.filter((r) => r.active).length}</div></div>
            </div>
            <div className="rc-sumfoot">
              <span className="sb">Si inseriscono da soli nel loro giorno, anche ad app chiusa. Le carte contano con l'addebito previsto.</span>
              <button type="button" className="btn small" onClick={() => setEdit({})}><Icon name="plus" size={18} />Nuovo ricorrente</button>
            </div>
          </section>

          {rules.length === 0 && (
            <section className="card pad"><div className="empty">Nessun movimento ricorrente. Aggiungine uno con "Nuovo ricorrente" o da quelli trovati qui sotto.</div></section>
          )}

          {v.groups.map((g) => {
            const tot = g.rules.filter((r) => r.active).reduce((s, r) => s + (sign(r) * v.est.get(r.id).amount) / (r.every_months || 1), 0)
            return (
              <section className="card pad" key={g.id}>
                <div className="rc-gh"><h2 className="h">{g.label}</h2><span className="sb">{euro(tot, { sign: true })} al mese</span></div>
                {g.note && <div className="sb rc-gnote">{g.note}</div>}
                {g.rules.map((r) => {
                  const e = v.est.get(r.id)
                  return (
                    <button type="button" className={`row tap rc-row${r.active ? '' : ' off'}`} key={r.id} onClick={() => setEdit({ rule: r })}>
                      {chip(r)}
                      <div className="txt">
                        <div className="nm">{r.name}{!r.active ? <span className="badge">sospeso</span> : r.check_mode ? <span className="badge chk">da controllare</span> : null}</div>
                        <div className="sb">{every(r)} · {where(r)}</div>
                      </div>
                      <div className="am" style={r.kind === 'entrata' ? { color: 'var(--pos)' } : undefined}>
                        {euro(sign(r) * e.amount, { sign: r.kind === 'entrata' })}
                        {r.calc === 'rata' && e.interest > 0 && <div className="sb rc-amsub">interessi {euro(e.interest)}</div>}
                        {r.calc === 'carta' && <div className="sb rc-amsub">previsto</div>}
                      </div>
                      <div className="rc-when desk-only">{r.active ? dayShort(r.next_date) : '–'}</div>
                    </button>
                  )
                })}
              </section>
            )
          })}

          {v.found.length > 0 && (
            <section className="card pad">
              <h2 className="h">Trovati nei tuoi movimenti</h2>
              <div className="sb rc-gnote">Stesso importo in almeno due degli ultimi tre mesi. Aggiungili solo se sono davvero fissi.</div>
              {v.found.map((s) => {
                const c = catsById.get(s.category_id)
                return (
                  <div className="row rc-row rc-found" key={s.key}>
                    {s.kind === 'giroconto' || !c ? <div className="chip c-blu"><Icon name="swap" /></div> : <CatChip cat={c} root={rootCategory(catsById, c.id)} />}
                    <div className="txt">
                      <div className="nm">{s.name} · {euro(s.amount)}</div>
                      <div className="sb">{s.dates.map(dayShort).join(', ')} · {accById.get(s.account_id)?.name}</div>
                    </div>
                    <div className="rc-fbtns">
                      <button type="button" className="btn small ghost" onClick={() => ignore(s)}>Ignora</button>
                      <button type="button" className="btn small" onClick={() => setEdit({ seed: s })}>Aggiungi</button>
                    </div>
                  </div>
                )
              })}
            </section>
          )}
        </div>

        <div className="rc-col">
          <section className="card pad">
            <div className="rc-gh"><h2 className="h">Prossimi 30 giorni</h2><span className="sb">cosa entra da solo</span></div>
            {v.next.length === 0 && <div className="empty">Niente nei prossimi 30 giorni</div>}
            {v.next.map(({ r, date, done, amount }) => {
              const head = date !== lastDay ? <div className="rc-day">{dayLong(date)}</div> : null
              lastDay = date
              return (
                <div key={`${r.id}-${date}`}>
                  {head}
                  <div className={`rc-nx${done ? ' done' : ''}`}>
                    <span className="rc-dot" />
                    <span className="rc-nxname">{r.name}{done && <span className="sb"> · c'è già</span>}</span>
                    <span className="am" style={r.kind === 'entrata' ? { color: 'var(--pos)' } : undefined}>{euro(sign(r) * amount, { sign: r.kind === 'entrata' })}</span>
                  </div>
                </div>
              )
            })}
          </section>
          <section className="card pad">
            <h2 className="h">Come funziona</h2>
            <ul className="rc-how">
              <li>Nel suo giorno il movimento viene inserito da solo, anche se l'app è chiusa.</li>
              <li>Fino a quel giorno lo vedi in <b>In arrivo</b> e nel <b>Flusso di cassa</b>.</li>
              <li>Se in quel mese c'è già, per esempio perché l'hai inserito tu, non viene inserito di nuovo.</li>
              <li>Quelli <b>da controllare</b> entrano con l'importo dell'ultima volta e in Home ti chiedono di confermarlo.</li>
              <li>Una volta inserito è un movimento normale: lo modifichi o lo cancelli come gli altri.</li>
            </ul>
          </section>
        </div>
      </div>

      {edit && (
        <RecurringEditor
          key={edit.rule?.id || edit.seed?.key || 'nuovo'}
          data={data} today={today} rule={edit.rule || null} seed={edit.seed || null}
          onClose={() => setEdit(null)}
          onSaved={(rule, acc, created) => { setEdit(null); onRuleSaved(rule, acc, created) }}
          onDeleted={(rule) => { setEdit(null); onRuleDeleted(rule) }}
        />
      )}
    </>
  )
}
