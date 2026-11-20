import test from 'node:test'
import assert from 'node:assert/strict'
import { LOCK_AFTER_MS, shouldLock } from './lock.js'

test('non blocca se l\'app non è mai stata nascosta', () => {
  assert.equal(shouldLock(null, 1000), false)
})
test('non blocca prima di 5 minuti', () => {
  assert.equal(shouldLock(0, LOCK_AFTER_MS - 1), false)
  assert.equal(shouldLock(0, 60_000), false)
})
test('blocca dopo 5 minuti', () => {
  assert.equal(LOCK_AFTER_MS, 300_000)
  assert.equal(shouldLock(0, LOCK_AFTER_MS), true)
  assert.equal(shouldLock(1000, 1000 + 3_600_000), true)
})
