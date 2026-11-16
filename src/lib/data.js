import { supabase } from './supabase.js'

const TX_FIELDS = 'id, kind, date, amount, account_id, to_account_id, category_id, note, planned'

const num = (v) => (v === null || v === undefined ? v : Number(v))

export async function loadAll() {
  const [acc, cat, tx, set, imp] = await Promise.all([
    supabase.from('accounts').select('id, name, kind, start_date, initial_balance, overdraft, credit_limit, tan, instalment, instalment_day, auto_instalment, payment_account_id, last_instalment, excluded, archived, sort_order').order('sort_order'),
    supabase.from('categories').select('id, parent_id, kind, name, icon, symbol, tint, budget, sort_order').order('sort_order'),
    supabase.from('transactions').select(TX_FIELDS).order('date', { ascending: false }).order('created_at', { ascending: false }).range(0, 49999),
    supabase.from('user_settings').select('theme, accent, main_account_id').maybeSingle(),
    supabase.from('imports').select('id, source, imported_at, report').order('imported_at', { ascending: false }),
  ])
  for (const r of [acc, cat, tx, set, imp]) if (r.error) throw r.error
  const accounts = acc.data.map((a) => ({ ...a, initial_balance: num(a.initial_balance), overdraft: num(a.overdraft), credit_limit: num(a.credit_limit), tan: num(a.tan), instalment: num(a.instalment) }))
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

export async function saveAppearance(patch) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { error } = await supabase.from('user_settings').upsert({ owner: user.id, ...patch, updated_at: new Date().toISOString() })
  if (error) console.warn('Impostazioni non salvate', error)
}
