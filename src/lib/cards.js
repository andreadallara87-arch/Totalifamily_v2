// Dati di una carta che servono al flusso di cassa: quando chiude l'estratto conto, quando addebita sul conto,
// l'eventuale piano a rate sulla carta e il bollo dell'estratto conto.

const text = (v) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','))
const amount = (v) => {
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN
}
const dayOf = (v) => {
  const s = String(v ?? '').trim()
  if (s === '') return null
  return /^\d{1,2}$/.test(s) && Number(s) >= 1 && Number(s) <= 31 ? Number(s) : NaN
}

/** Valori iniziali della scheda, come testo da modificare. */
export function cardForm(a) {
  return {
    statementDay: text(a.statement_day),
    debitDay: text(a.instalment_day),
    planAmount: text(a.plan_amount),
    planUntil: a.plan_until || '',
    fee: text(a.statement_fee),
  }
}

/** Cosa non va in quello che è stato scritto, oppure null. */
export function cardProblem(f) {
  if (Number.isNaN(dayOf(f.statementDay))) return 'Il giorno di chiusura va da 1 a 31'
  if (Number.isNaN(dayOf(f.debitDay))) return 'Il giorno di addebito va da 1 a 31'
  const plan = amount(f.planAmount)
  if (Number.isNaN(plan)) return 'La rata del piano non è un importo valido'
  if (plan > 0 && !/^\d{4}-(0[1-9]|1[0-2])$/.test(f.planUntil || '')) return "Scegli l'ultimo mese del piano a rate"
  if (Number.isNaN(amount(f.fee))) return 'Il bollo non è un importo valido'
  return null
}

/** Campi pronti per la tabella accounts. Senza rata non c'è piano: anche l'ultimo mese si svuota. */
export function buildCard(f) {
  const plan = amount(f.planAmount) || null
  return {
    statement_day: dayOf(f.statementDay),
    instalment_day: dayOf(f.debitDay),
    plan_amount: plan,
    plan_until: plan ? f.planUntil : null,
    statement_fee: amount(f.fee) || null,
  }
}
