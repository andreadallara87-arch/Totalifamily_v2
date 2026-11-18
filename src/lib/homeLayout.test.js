import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOME_BLOCKS, dropIndex, hideBlock, moveBlock, normalizeLayout, showBlock, visibleBlocks } from './homeLayout.js'

test('senza layout salvato: ordine di sempre, niente nascosto', () => {
  assert.deepEqual(normalizeLayout(null), { order: HOME_BLOCKS, hidden: [] })
})

test('layout salvato: toglie doppioni e nomi sconosciuti, aggiunge i riquadri nuovi in fondo', () => {
  const l = normalizeLayout({ order: ['spese', 'boh', 'spese', 'saldo'], hidden: ['conti', 'boh'] })
  assert.deepEqual(l.order, ['mese', 'spese', 'saldo', 'grafico', 'arrivo', 'conti', 'finanziamenti'])
  assert.deepEqual(l.hidden, ['conti'])
})

test('sposta tra i visibili lasciando i nascosti al loro posto', () => {
  const l = { order: ['saldo', 'grafico', 'arrivo', 'conti'], hidden: ['grafico'] }
  const m = moveBlock(l, 'conti', 0)
  assert.deepEqual(visibleBlocks(m), ['conti', 'saldo', 'arrivo'])
  assert.equal(m.order[1], 'grafico')
  assert.deepEqual(visibleBlocks(moveBlock(l, 'saldo', 9)), ['arrivo', 'conti', 'saldo'])
})

test('nascondi e rimetti: torna in fondo', () => {
  const l = normalizeLayout(null)
  const h = hideBlock(l, 'saldo')
  assert.ok(!visibleBlocks(h).includes('saldo'))
  const s = showBlock(h, 'saldo')
  assert.deepEqual(s.hidden, [])
  assert.equal(s.order.at(-1), 'saldo')
})

test('posizione di arrivo trascinando', () => {
  assert.equal(dropIndex(0, 30, 80, 5), 0)
  assert.equal(dropIndex(0, 45, 80, 5), 1)
  assert.equal(dropIndex(2, -170, 80, 5), 0)
  assert.equal(dropIndex(3, 900, 80, 5), 4)
})

test('spese vive: chi aveva un ordine salvato le trova in cima, e restano dove le sposti', () => {
  const l = normalizeLayout({ order: ['saldo', 'grafico', 'conti', 'spese', 'arrivo', 'finanziamenti'], hidden: ['grafico'] })
  assert.equal(l.order[0], 'mese')
  assert.deepEqual(l.hidden, ['grafico'])
  const moved = normalizeLayout(moveBlock(l, 'mese', 2))
  assert.equal(moved.order.indexOf('mese'), 3)
})
