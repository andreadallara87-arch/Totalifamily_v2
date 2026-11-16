// Logica della schermata "Nuovo movimento": tastierino, suggerimenti e preparazione della riga da salvare.
import { addDays } from './calc.js'

const MAX_INT_DIGITS = 7

/** Applica un tasto del tastierino all'importo scritto finora (stringa con la virgola decimale). */
export function pressKey(amount, key) {
  if (key === 'del') return amount.slice(0, -1)
  if (key === ',') return amount.includes(',') ? amount : (amount || '0') + ','
  if (!/^[0-9]$/.test(key)) return amount
  const [int, dec] = amount.split(',')
  if (dec !== undefined) return dec.length < 2 ? amount + key : amount
  if (int === '0') return key
  return int.length < MAX_INT_DIGITS ? amount + key : amount
}

/** Valore numerico dell'importo scritto ("12,5" → 12.5). */
export const amountValue = (amount) => Number.parseFloat(String(amount).replace(',', '.')) || 0

/** Categorie usate più spesso nell'ultimo anno per un tipo di movimento.
 *  Le spese registrate sui finanziamenti (interessi addebitati in automatico) non contano. */
export function frequentCategories({ txs, accounts, kind, today, limit = 7 }) {
  const loans = new Set(accounts.filter((a) => a.kind === 'finanziamento').map((a) => a.id))
  const from = addDays(today, -365)
  const count = new Map()
  for (const t of txs) {
    if (t.kind !== kind || !t.category_id || t.date < from || t.date > today) continue
    if (kind === 'spesa' && loans.has(t.account_id)) continue
    count.set(t.category_id, (count.get(t.category_id) || 0) + 1)
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id)
}

/** Conto usato più spesso per una categoria (a parità, quello usato più di recente). */
export function usualAccount(txs, categoryId) {
  const stats = new Map()
  for (const t of txs) {
    if (t.category_id !== categoryId) continue
    const s = stats.get(t.account_id) || { n: 0, last: '' }
    s.n += 1
    if (t.date > s.last) s.last = t.date
    stats.set(t.account_id, s)
  }
  let best = null
  for (const [id, s] of stats) if (!best || s.n > best.n || (s.n === best.n && s.last > best.last)) best = { id, ...s }
  return best ? best.id : null
}

/** Coppie di conti più usate nei giroconti fatti a mano (le rate automatiche dei finanziamenti sono escluse). */
export function frequentPairs({ txs, accounts, today, limit = 5 }) {
  const loans = new Set(accounts.filter((a) => a.kind === 'finanziamento').map((a) => a.id))
  const from = addDays(today, -365)
  const count = new Map()
  for (const t of txs) {
    if (t.kind !== 'giroconto' || t.date < from || t.date > today || loans.has(t.to_account_id)) continue
    const k = `${t.account_id}|${t.to_account_id}`
    count.set(k, (count.get(k) || 0) + 1)
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([k]) => k.split('|'))
}

/** Cosa manca per poter salvare, oppure null. */
export function missingField({ kind, amount, categoryId, toAccountId }) {
  if (!amountValue(amount)) return "Scrivi l'importo"
  if (kind === 'giroconto') return toAccountId ? null : 'Scegli il conto di arrivo'
  return categoryId ? null : 'Scegli la categoria'
}

/** Riga pronta per la tabella transactions. Un movimento con data futura è "previsto". */
export function buildTransaction({ kind, amount, date, accountId, fromAccountId, toAccountId, categoryId, note, today }) {
  const giro = kind === 'giroconto'
  return {
    kind,
    date,
    amount: Math.round(amountValue(amount) * 100) / 100,
    account_id: giro ? fromAccountId : accountId,
    to_account_id: giro ? toAccountId : null,
    category_id: giro ? null : categoryId,
    note: (note || '').trim(),
    planned: date > today,
  }
}

/** Inserisce un movimento nella lista ordinata per data decrescente (i più recenti in cima). */
export function insertByDate(txs, tx) {
  const i = txs.findIndex((t) => t.date <= tx.date)
  return i === -1 ? [...txs, tx] : [...txs.slice(0, i), tx, ...txs.slice(i)]
}

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const euro2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' })

/** Conferma dopo il salvataggio, per esempio "Salvata la spesa di 4,50 € di ieri." */
export function savedMessage(kind, amount, date, today) {
  const what = { spesa: 'Salvata la spesa', entrata: "Salvata l'entrata", giroconto: 'Salvato il giroconto' }[kind]
  const k = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5)
  const day = `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}${date.slice(0, 4) !== today.slice(0, 4) ? ` ${date.slice(0, 4)}` : ''}`
  const planned = `previst${kind === 'giroconto' ? 'o' : 'a'}`
  let when = ''
  if (k === -1) when = ' di ieri'
  else if (k < -1) when = ` del ${day}`
  else if (k === 1) when = ` ${planned} per domani`
  else if (k > 1) when = ` ${planned} per il ${day}`
  return `${what} di ${euro2.format(amount)} €${when}.`
}
