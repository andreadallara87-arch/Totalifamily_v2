import { supabase } from './supabase.js'

const TX_FIELDS = 'id, kind, date, amount, account_id, to_account_id, category_id, note, planned, recurring_id, to_check, one_off'
const RULE_FIELDS = 'id, name, kind, account_id, to_account_id, category_id, interest_category_id, amount, calc, day, every_months, next_date, until_month, check_mode, active, sort_order, created_at'
const CAT_FIELDS = 'id, parent_id, kind, name, icon, symbol, tint, budget, sort_order'

const num = (v) => (v === null || v === undefined ? v : Number(v))
const account = (a) => ({ ...a, initial_balance: num(a.initial_balance), overdraft: num(a.overdraft), credit_limit: num(a.credit_limit), tan: num(a.tan), instalment: num(a.instalment), plan_amount: num(a.plan_amount), statement_fee: num(a.statement_fee), wallet_monthly: num(a.wallet_monthly) })

const rule = (r) => ({ ...r, amount: num(r.amount) })

export async function loadAll() {
  // Prima inserisce i movimenti ricorrenti arrivati al loro giorno (se non l'ha già fatto il giro di ogni mattina).
  const gen = await supabase.rpc('genera_ricorrenti')
  if (gen.error) console.warn('Movimenti ricorrenti non inseriti', gen.error)
  const [acc, cat, tx, set, imp, rec] = await Promise.all([
    // Tutte le colonne: così l'app funziona anche prima che il database abbia i borsellini (Satispay).
    supabase.from('accounts').select('*').order('sort_order'),
    supabase.from('categories').select(CAT_FIELDS).order('sort_order'),
    supabase.from('transactions').select(TX_FIELDS).order('date', { ascending: false }).order('created_at', { ascending: false }).range(0, 49999),
    // Tutte le colonne: così l'app funziona anche prima che il database abbia i "beni" (casa, auto).
    supabase.from('user_settings').select('*').maybeSingle(),
    supabase.from('imports').select('id, source, imported_at, report').order('imported_at', { ascending: false }),
    supabase.from('recurring').select(RULE_FIELDS).order('sort_order').order('created_at'),
  ])
  for (const r of [acc, cat, tx, set, imp, rec]) if (r.error) throw r.error
  const accounts = acc.data.map(account)
  const categories = cat.data.map((c) => ({ ...c, budget: num(c.budget) }))
  const txs = tx.data.map((t) => ({ ...t, amount: num(t.amount) }))
  return { accounts, categories, txs, settings: set.data, imports: imp.data, recurring: rec.data.map(rule) }
}

/** Salva un nuovo movimento e restituisce la riga come la legge l'app. */
export async function addTransaction(row) {
  const { data, error } = await supabase.from('transactions').insert(row).select(TX_FIELDS).single()
  if (error) throw error
  return { ...data, amount: num(data.amount) }
}

/** Salva le modifiche a un movimento esistente. */
export async function updateTransaction(id, row) {
  const { data, error } = await supabase.from('transactions').update(row).eq('id', id).select(TX_FIELDS).single()
  if (error) throw error
  return { ...data, amount: num(data.amount) }
}

/** Elimina un movimento e restituisce la riga completa (anche i dati dell'import), per poterla ripristinare. */
export async function deleteTransaction(id) {
  const { data, error } = await supabase.from('transactions').delete().eq('id', id).select('*').single()
  if (error) throw error
  return data
}

/** Rimette una riga eliminata, identica a prima (stesso id, stessa data di creazione). */
export async function restoreTransaction(full) {
  const { data, error } = await supabase.from('transactions').insert(full).select(TX_FIELDS).single()
  if (error) throw error
  return { ...data, amount: num(data.amount) }
}

/** Salva le modifiche a un conto o a una carta e restituisce la riga come la legge l'app. */
export async function updateAccount(id, patch) {
  const { data, error } = await supabase.from('accounts').update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return account(data)
}

/** Crea una categoria (senza id) o salva le modifiche a una esistente. */
export async function saveCategory(id, row) {
  const q = id ? supabase.from('categories').update(row).eq('id', id) : supabase.from('categories').insert(row)
  const { data, error } = await q.select(CAT_FIELDS).single()
  if (error) throw error
  return { ...data, budget: num(data.budget) }
}

/** Elimina una categoria. Il database rifiuta se ha sottocategorie o movimenti. */
export async function deleteCategory(id) {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw error
}

export async function saveAppearance(patch) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('user_settings').upsert({ owner: user.id, ...patch, updated_at: new Date().toISOString() })
  if (error) console.warn('Impostazioni non salvate', error)
}

/** Crea una regola ricorrente (senza id) o salva le modifiche a una esistente. */
export async function saveRecurring(id, row) {
  const q = id ? supabase.from('recurring').update(row).eq('id', id) : supabase.from('recurring').insert(row)
  const { data, error } = await q.select(RULE_FIELDS).single()
  if (error) throw error
  return rule(data)
}

/** Elimina una regola. I movimenti già inseriti restano. */
export async function deleteRecurring(id) {
  const { error } = await supabase.from('recurring').delete().eq('id', id)
  if (error) throw error
}

/** Salva i suggerimenti di ricorrenti scartati. */
export async function saveIgnored(list) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('user_settings').upsert({ owner: user.id, ignored_suggestions: list, updated_at: new Date().toISOString() })
  if (error) throw error
}

/** Salva i beni che contano nel patrimonio netto (casa, auto...). */
export async function saveAssets(list) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('user_settings').upsert({ owner: user.id, assets: list, updated_at: new Date().toISOString() })
  if (error) throw error
}

/** Salva ordine e riquadri nascosti della Home sul telefono. Restituisce false se il database non li accetta ancora. */
export async function saveHomeLayout(layout) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { error } = await supabase.from('user_settings').upsert({ owner: user.id, home_layout: layout, updated_at: new Date().toISOString() })
  if (error) { console.warn('Ordine della Home non salvato', error); return false }
  return true
}

/** Salva il limite al mese delle spese vive. */
export async function saveSpendingLimit(value) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('user_settings').upsert({ owner: user.id, spending_limit: value, updated_at: new Date().toISOString() })
  if (error) throw error
}
