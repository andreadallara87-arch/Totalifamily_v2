import { supabase } from './supabase.js'

const TX_FIELDS = 'id, kind, date, amount, account_id, to_account_id, category_id, note, planned'
const CAT_FIELDS = 'id, parent_id, kind, name, icon, symbol, tint, budget, sort_order'
const ACC_FIELDS = 'id, name, kind, start_date, initial_balance, overdraft, credit_limit, tan, instalment, instalment_day, auto_instalment, payment_account_id, last_instalment, statement_day, plan_amount, plan_until, statement_fee, excluded, archived, sort_order'

const num = (v) => (v === null || v === undefined ? v : Number(v))
const account = (a) => ({ ...a, initial_balance: num(a.initial_balance), overdraft: num(a.overdraft), credit_limit: num(a.credit_limit), tan: num(a.tan), instalment: num(a.instalment), plan_amount: num(a.plan_amount), statement_fee: num(a.statement_fee) })

export async function loadAll() {
  const [acc, cat, tx, set, imp] = await Promise.all([
    supabase.from('accounts').select(ACC_FIELDS).order('sort_order'),
    supabase.from('categories').select(CAT_FIELDS).order('sort_order'),
    supabase.from('transactions').select(TX_FIELDS).order('date', { ascending: false }).order('created_at', { ascending: false }).range(0, 49999),
    supabase.from('user_settings').select('theme, accent, main_account_id').maybeSingle(),
    supabase.from('imports').select('id, source, imported_at, report').order('imported_at', { ascending: false }),
  ])
  for (const r of [acc, cat, tx, set, imp]) if (r.error) throw r.error
  const accounts = acc.data.map(account)
  const categories = cat.data.map((c) => ({ ...c, budget: num(c.budget) }))
  const txs = tx.data.map((t) => ({ ...t, amount: num(t.amount) }))
  return { accounts, categories, txs, settings: set.data, imports: imp.data }
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
  const { data, error } = await supabase.from('accounts').update(patch).eq('id', id).select(ACC_FIELDS).single()
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
