import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCard, cardForm, cardProblem } from './cards.js'

test('scheda della carta: i valori salvati diventano testo e tornano uguali', () => {
  const nexi = { statement_day: 31, instalment_day: 15, plan_amount: 88.26, plan_until: '2027-12', statement_fee: 2 }
  const f = cardForm(nexi)
  assert.deepEqual(f, { statementDay: '31', debitDay: '15', planAmount: '88,26', planUntil: '2027-12', fee: '2' })
  assert.equal(cardProblem(f), null)
  assert.deepEqual(buildCard(f), nexi)
})

test('scheda della carta: campi vuoti e piano senza rata', () => {
  const empty = cardForm({ statement_day: null, instalment_day: null, plan_amount: null, plan_until: null, statement_fee: null })
  assert.deepEqual(empty, { statementDay: '', debitDay: '', planAmount: '', planUntil: '', fee: '' })
  assert.equal(cardProblem(empty), null)
  assert.deepEqual(buildCard(empty), { statement_day: null, instalment_day: null, plan_amount: null, plan_until: null, statement_fee: null })
  // Tolta la rata, sparisce anche l'ultimo mese.
  assert.deepEqual(buildCard({ ...empty, statementDay: '16', debitDay: '29', planAmount: '0', planUntil: '2027-12' }), { statement_day: 16, instalment_day: 29, plan_amount: null, plan_until: null, statement_fee: null })
})

test('scheda della carta: dice cosa non va', () => {
  const ok = { statementDay: '16', debitDay: '29', planAmount: '', planUntil: '', fee: '' }
  assert.equal(cardProblem({ ...ok, statementDay: '32' }), 'Il giorno di chiusura va da 1 a 31')
  assert.equal(cardProblem({ ...ok, debitDay: 'x' }), 'Il giorno di addebito va da 1 a 31')
  assert.equal(cardProblem({ ...ok, planAmount: 'abc' }), 'La rata del piano non è un importo valido')
  assert.equal(cardProblem({ ...ok, planAmount: '88,26' }), "Scegli l'ultimo mese del piano a rate")
  assert.equal(cardProblem({ ...ok, planAmount: '88,26', planUntil: '2027-12', fee: '-1' }), 'Il bollo non è un importo valido')
})
