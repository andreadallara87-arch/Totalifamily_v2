import { createClient } from '@supabase/supabase-js'

// Chiave "publishable": è pubblica per natura, i dati sono protetti dalle regole RLS del database.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://knnfvbisgfuuymhvvhqr.supabase.co'
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_6jRjf1VYe1LNc5eoZjKpTQ_mG19Fb6G'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
