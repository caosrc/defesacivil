import { createClient } from '@supabase/supabase-js'

// No Replit, todo o backend é Express + PostgreSQL.
// Supabase está permanentemente desativado neste ambiente.
export const supabaseDisponivel = false

export const supabase = createClient(
  'https://placeholder.supabase.co',
  'placeholder',
  {
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  }
)
