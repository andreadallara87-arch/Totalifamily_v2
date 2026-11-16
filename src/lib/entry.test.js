import test from 'node:test'
import assert from 'node:assert/strict'
import { amountText, amountValue, buildTransaction, formFromTx, frequentCategories, frequentPairs, insertByDate, missingField, pressKey, replaceTx, savedMessage, usualAccount } from './entry.js'

const type = (keys) => keys.reduce((a, k) => pressKey(a, k), '')

test('tastierino: virgola, due decimali, zeri iniziali e cancella', () => {
  assert.equal(type(['1', '2', ',', '5']), '12,5')
  assert.equal(type(['1', ',', '2', '3', '4']), '1,23')
  assert.equal(type([',', '5']), '0,5')
  assert.equal(type(['0', '0', '7']), '7')
  assert.equal(type(['1', ',', ',', '2']), '1,2')
  assert.equal(type(['9', '9', 'del']), '9')
  assert.equal(type(['1', '2', '3', '4', '5', '6', '7', '8']), '1234567')
  assert.equal(amountValue('12,5'), 12.5)
  assert.equal(amountValue(''), 0)
})

const accounts = [
  { id: 'co', kind: 'conto' }, { id: 'sat', kind: 'conto' }, { id: 'loan', kind: 'finanziamento' },
]
const txs = [
  { kind: 'spesa', date: '2026-11-10', category_id: 'bar', account_id: 'sat' },
  { kind: 'spesa', date: '2026-11-09', category_id: 'bar', account_id: 'sat' },
  { kind: 'spesa', date: '2026-11-08', category_id: 'bar', account_id: 'co' },
  { kind: 'spesa', date: '2026-11-07', category_id: 'super', account_id: 'co' },
  { kind: 'spesa', date: '2026-11-06', category_id: 'interessi', account_id: 'loan' },
  { kind: 'spesa', date: '2026-11-05', category_id: 'interessi', account_id: 'loan' },
  { kind: 'spesa', date: '2026-12-01', category_id: 'futura', account_id: 'co' },
  { kind: 'giroconto', date: '2026-11-04', account_id: 'co', to_account_id: 'sat' },
  { kind: 'giroconto', date: '2026-11-03', account_id: 'co', to_account_id: 'loan' },
]

test('suggerimenti: categorie frequenti, conto abituale, giroconti', () => {
  assert.deepEqual(frequentCategories({ txs, accounts, kind: 'spesa', today: '2026-11-16' }), ['bar', 'super'])
  assert.equal(usualAccount(txs, 'bar'), 'sat')
  assert.equal(usualAccount(txs, 'nessuna'), null)
  assert.deepEqual(frequentPairs({ txs, accounts, today: '2026-11-16' }), [['co', 'sat']])
})

test('salvataggio: campi mancanti e riga per il database', () => {
  assert.equal(missingField({ kind: 'spesa', amount: '', categoryId: 'bar' }), "Scrivi l'importo")
  assert.equal(missingField({ kind: 'spesa', amount: '3', categoryId: null }), 'Scegli la categoria')
  assert.equal(missingField({ kind: 'giroconto', amount: '3', toAccountId: null }), 'Scegli il conto di arrivo')
  assert.equal(missingField({ kind: 'entrata', amount: '3', categoryId: 'x' }), null)
  const spesa = buildTransaction({ kind: 'spesa', amount: '4,5', date: '2026-11-16', accountId: 'sat', categoryId: 'bar', note: ' caffè ', today: '2026-11-16' })
  assert.deepEqual(spesa, { kind: 'spesa', date: '2026-11-16', amount: 4.5, account_id: 'sat', to_account_id: null, category_id: 'bar', note: 'caffè', planned: false })
  const giro = buildTransaction({ kind: 'giroconto', amount: '200', date: '2026-11-20', accountId: 'x', fromAccountId: 'co', toAccountId: 'sat', categoryId: 'bar', today: '2026-11-16' })
  assert.equal(giro.account_id, 'co'); assert.equal(giro.to_account_id, 'sat'); assert.equal(giro.category_id, null); assert.equal(giro.planned, true)
})

test('il nuovo movimento entra nella lista al posto giusto', () => {
  const list = [{ id: 'a', date: '2026-11-20' }, { id: 'b', date: '2026-11-10' }]
  assert.deepEqual(insertByDate(list, { id: 'n', date: '2026-11-15' }).map((t) => t.id), ['a', 'n', 'b'])
  assert.deepEqual(insertByDate(list, { id: 'n', date: '2026-11-10' }).map((t) => t.id), ['a', 'n', 'b'])
  assert.deepEqual(insertByDate(list, { id: 'n', date: '2026-01-01' }).map((t) => t.id), ['a', 'b', 'n'])
})

test('messaggio di conferma dopo il salvataggio', () => {
  const t = '2026-11-16'
  assert.equal(savedMessage('spesa', 4.5, t, t), 'Salvata la spesa di 4,50 €.')
  assert.equal(savedMessage('spesa', 4.5, '2026-11-15', t), 'Salvata la spesa di 4,50 € di ieri.')
  assert.equal(savedMessage('entrata', 2880, '2026-12-01', t), "Salvata l'entrata di 2.880,00 € prevista per il 1 dicembre.")
  assert.equal(savedMessage('giroconto', 200, '2026-11-17', t), 'Salvato il giroconto di 200,00 € previsto per domani.')
  assert.equal(savedMessage('spesa', 12, '2025-12-30', t), 'Salvata la spesa di 12,00 € del 30 dicembre 2025.')
})

test('modifica: il movimento salvato torna nel modulo e nella lista', () => {
  assert.equal(amountText(4.5), '4,50'); assert.equal(amountText(200), '200'); assert.equal(amountText(80.76), '80,76'); assert.equal(amountText(0), '')
  assert.equal(pressKey(amountText(4.5), '9'), '4,50')
  assert.equal(pressKey(amountText(4.5), 'del'), '4,5')
  const spesa = formFromTx({ kind: 'spesa', amount: 12.3, date: '2026-11-10', account_id: 'sat', to_account_id: null, category_id: 'bar', note: 'x' }, 'co')
  assert.deepEqual(spesa, { amount: '12,30', cat: 'bar', acc: 'sat', accTouched: true, suggested: false, from: 'co', to: null, date: '2026-11-10', note: 'x' })
  const giro = formFromTx({ kind: 'giroconto', amount: 50, date: '2026-11-10', account_id: 'sat', to_account_id: 'risp', category_id: null, note: '' }, 'co')
  assert.equal(giro.from, 'sat'); assert.equal(giro.to, 'risp'); assert.equal(giro.acc, 'co'); assert.equal(giro.cat, null)
  const list = [{ id: 'a', date: '2026-11-20' }, { id: 'b', date: '2026-11-15' }, { id: 'c', date: '2026-11-15' }, { id: 'd', date: '2026-11-10' }]
  assert.deepEqual(replaceTx(list, { id: 'c', date: '2026-11-15', x: 1 }).map((t) => t.id), ['a', 'b', 'c', 'd'])
  assert.equal(replaceTx(list, { id: 'c', date: '2026-11-15', x: 1 })[2].x, 1)
  assert.deepEqual(replaceTx(list, { id: 'c', date: '2026-11-21' }).map((t) => t.id), ['c', 'a', 'b', 'd'])
  assert.deepEqual(replaceTx(list, { id: 'a', date: '2026-11-01' }).map((t) => t.id), ['b', 'c', 'd', 'a'])
})
