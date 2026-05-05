const rawApi = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
export const API_BASE = rawApi.replace(/\/+$/, '')

export function apiUrl(path: string): string {
  return API_BASE + path
}

const rawWs = (import.meta.env.VITE_WS_URL as string | undefined) ?? ''
const WS_OVERRIDE = rawWs.replace(/\/+$/, '')

export function getWsUrl(): string {
  if (WS_OVERRIDE) {
    return WS_OVERRIDE.endsWith('/ws') ? WS_OVERRIDE : `${WS_OVERRIDE}/ws`
  }
  if (API_BASE) {
    const wsBase = API_BASE.replace(/^http/i, (m) => (m.toLowerCase() === 'https' ? 'wss' : 'ws'))
    return `${wsBase}/ws`
  }
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/ws`
}

export const SUPABASE_CONFIGURADO = true
