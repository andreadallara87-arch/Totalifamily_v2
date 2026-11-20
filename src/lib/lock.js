// Blocco dell'app: Face ID (o password) a ogni apertura e dopo un po' di tempo fuori dall'app.
export const LOCK_AFTER_MS = 5 * 60 * 1000
const PASSKEY_KEY = 'tf-passkey-ok'

// true se l'app è rimasta nascosta abbastanza a lungo da doverla bloccare di nuovo.
export function shouldLock(hiddenAt, now, after = LOCK_AFTER_MS) {
  if (hiddenAt == null) return false
  return now - hiddenAt >= after
}

// Ricorda che su questo dispositivo Face ID/impronta ha già funzionato: così al blocco parte da sola.
export function passkeyUsedHere() {
  try { return localStorage.getItem(PASSKEY_KEY) === '1' } catch { return false }
}
export function markPasskeyUsed() {
  try { localStorage.setItem(PASSKEY_KEY, '1') } catch { /* niente */ }
}
