import { useMemo } from 'react'
import Icon from '../components/Icon.jsx'
import Money from '../components/Money.jsx'
import { balancesAt, fromCents, loanEnd } from '../lib/calc.js'
import { euro, monthShortYear } from '../lib/format.js'
import { accountSubtitle, accountVisual } from '../lib/visual.js'

// Per le carte: quando chiude l'estratto conto e quando addebita, se sono stati indicati.
const cardDays = (a) => `${a.statement_day ? `, estratto il ${a.statement_day}` : ''}${a.instalment_day ? `, addebito il ${a.instalment_day}` : ''}`

const GROUPS = [
  { kind: 'conto', title: 'Conti' },
  { kind: 'carta_revolv', title: 'Carte' },
  { kind: 'finanziamento', title: 'Finanziamenti' },
]

const openMovements = (id) => { window.location.hash = `/movimenti?conto=${id}`; window.scrollTo(0, 0) }

export default function Conti({ data, today, onEditCard }) {
  const { accounts, txs } = data
  const bal = useMemo(() => balancesAt(accounts, txs, today), [accounts, txs, today])
  const b = (id) => fromCents(bal.get(id) || 0)
  return (
    <>
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
                // Una carta si apre per cambiare chiusura dell'estratto conto, giorno di addebito, piano a rate e bollo;
                // gli altri conti aprono i loro movimenti.
                const card = a.kind === 'carta_revolv' && onEditCard
                return (
                  <button type="button" className="row tap" key={a.id} onClick={() => (card ? onEditCard(a) : openMovements(a.id))} aria-label={card ? `${a.name}: modifica i dati della carta` : `${a.name}: movimenti`}>
                    <div className={`chip ${v.chip}`}><Icon name={v.icon} /></div>
                    <div className="txt"><div className="nm">{a.name}</div><div className="sb">{sub}{card ? cardDays(a) : ''}</div></div>
                    {end ? (
                      <div className="am"><Money value={bb} /><div className="sb" style={{ fontWeight: 400 }}>fino a {monthShortYear(end.end)}</div></div>
                    ) : <Money className="am" value={bb} />}
                  </button>
                )
              })}
            </section>
          )
        })}
      </div>
    </>
  )
}
