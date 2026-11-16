import { useMemo } from 'react'
import Icon from '../components/Icon.jsx'
import Money from '../components/Money.jsx'
import { balancesAt, fromCents, loanEnd } from '../lib/calc.js'
import { euro, monthShortYear } from '../lib/format.js'
import { accountSubtitle, accountVisual } from '../lib/visual.js'

const GROUPS = [
  { kind: 'conto', title: 'Conti' },
  { kind: 'carta_revolv', title: 'Carte' },
  { kind: 'finanziamento', title: 'Finanziamenti' },
]

export default function Conti({ data, today }) {
  const { accounts, txs } = data
  const bal = useMemo(() => balancesAt(accounts, txs, today), [accounts, txs, today])
  const b = (id) => fromCents(bal.get(id) || 0)
  const net = accounts.filter((a) => !a.excluded).reduce((s, a) => s + b(a.id), 0)
  return (
    <>
      <section className="card pad">
        <div className="sb">Patrimonio netto, tutti i conti</div>
        <Money value={net} style={{ display: 'block', fontSize: 40, lineHeight: '48px', fontWeight: 700, letterSpacing: '-0.03em' }} />
        <div className="sb">Saldi al {today.split('-').reverse().join('/')}, esclusi i movimenti futuri</div>
      </section>
      <div className="grid g-row2">
        {GROUPS.map((g) => {
          const list = accounts.filter((a) => a.kind === g.kind && !a.archived)
          const total = list.reduce((s, a) => s + b(a.id), 0)
          return (
            <section key={g.kind} className={`card pad ${g.kind === 'finanziamento' ? 'loans' : ''}`}>
              <div className="section-title"><h2 className="h">{g.title}</h2><b>{euro(total)}</b></div>
              {list.map((a) => {
                const v = accountVisual(a)
                const bb = b(a.id)
                const end = a.kind === 'finanziamento' ? loanEnd(-bb, a.tan, a.instalment, today) : null
                const sub = a.kind === 'finanziamento'
                  ? `TAN ${String(a.tan ?? '–').replace('.', ',')}%${a.instalment ? `, rata ${euro(a.instalment, { decimals: false })}` : ''}`
                  : accountSubtitle(a, bb)
                return (
                  <div className="row" key={a.id}>
                    <div className={`chip ${v.chip}`}><Icon name={v.icon} /></div>
                    <div className="txt"><div className="nm">{a.name}</div><div className="sb">{sub}</div></div>
                    {end ? (
                      <div className="am"><Money value={bb} /><div className="sb" style={{ fontWeight: 400 }}>fino a {monthShortYear(end.end)}</div></div>
                    ) : <Money className="am" value={bb} />}
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>
    </>
  )
}
