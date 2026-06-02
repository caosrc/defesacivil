import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''
const USE_SUPABASE = (import.meta.env.VITE_USE_SUPABASE as string | undefined) ?? 'true'

// Supabase ativado apenas quando as variáveis estão configuradas E VITE_USE_SUPABASE != 'false'
export const supabaseDisponivel = !!(SUPABASE_URL && SUPABASE_ANON_KEY) && USE_SUPABASE !== 'false'

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder',
  {
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  }
)
