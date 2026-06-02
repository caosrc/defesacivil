import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

// Supabase ativado quando as variáveis de ambiente estão configuradas
export const supabaseDisponivel = !!(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder',
  {
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  }
)
