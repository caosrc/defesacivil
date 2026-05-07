import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

// On Replit, we use Express + PostgreSQL as the primary backend.
// Supabase is only active when both env vars are explicitly set AND
// there is no Express server available (i.e., Netlify deployment).
// Setting VITE_USE_SUPABASE=false disables Supabase even when keys exist.
const forceDisabled = import.meta.env.VITE_USE_SUPABASE === 'false'
export const supabaseDisponivel = !forceDisabled && !!(supabaseUrl && supabaseAnonKey)

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  }
)
