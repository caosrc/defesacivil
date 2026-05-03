import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  console.warn(
    '[Supabase] VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY não configurados. ' +
    'Configure essas variáveis de ambiente para que ocorrências, escala e checklists ' +
    'sejam salvos no banco compartilhado.'
  )
}

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'anon')
