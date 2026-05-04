// ════════════════════════════════════════════════════════════════════════════
// Defesa Civil Ouro Branco — Push Notifications (Web Push API)
// Usa Supabase diretamente (sem servidor Express).
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from './supabaseClient'

const STORAGE_DEVICE_ID = 'defesacivil-device-id'
const STORAGE_PUSH_PEDIU = 'defesacivil-push-permissao-pedida-v1'
const STORAGE_PUSH_VAPID = 'defesacivil-push-vapid-key'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''
const VAPID_PUBLIC_KEY_ENV = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

function getMeuId(): string {
  let id = sessionStorage.getItem(STORAGE_DEVICE_ID)
  if (!id) {
    id = localStorage.getItem(STORAGE_DEVICE_ID) ?? ''
    if (!id) {
      id = Math.random().toString(36).substring(2, 9).toUpperCase()
    }
    sessionStorage.setItem(STORAGE_DEVICE_ID, id)
  }
  try {
    if (localStorage.getItem(STORAGE_DEVICE_ID) !== id) {
      localStorage.setItem(STORAGE_DEVICE_ID, id)
    }
  } catch { /* ignore */ }
  return id
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return ''
  const bytes = new Uint8Array(buffer)
  let bin = ''
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function getVapidPublicKey(): string {
  return (window as Record<string, unknown>).__VAPID_PUBLIC_KEY__ as string || VAPID_PUBLIC_KEY_ENV
}

export function pushSuportado(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    const reg = await navigator.serviceWorker.ready
    return reg ?? null
  } catch {
    return null
  }
}

export async function registrarServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  try {
    await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    return true
  } catch (e) {
    console.warn('[Push] falha ao registrar service worker:', e)
    return false
  }
}

async function salvarInscricao(
  sub: PushSubscription,
  agente: string,
): Promise<void> {
  const json = sub.toJSON()
  const endpoint = sub.endpoint
  const p256dh =
    json.keys?.p256dh ??
    arrayBufferToBase64(sub.getKey('p256dh'))
  const auth =
    json.keys?.auth ??
    arrayBufferToBase64(sub.getKey('auth'))
  if (!endpoint || !p256dh || !auth) return

  const id = getMeuId()
  try {
    const { error } = await supabase.from('push_subscriptions').upsert({
      id,
      agente: agente || null,
      endpoint,
      p256dh,
      auth,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    if (error) console.warn('[Push] erro ao salvar inscrição no Supabase:', error.message)
  } catch (e) {
    console.warn('[Push] erro ao salvar inscrição:', e)
  }
}

export async function registrarPushSeNecessario(agente: string): Promise<void> {
  if (!pushSuportado()) return
  if (!agente) return

  const VAPID_PUBLIC_KEY = getVapidPublicKey()
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[Push] VAPID public key não disponível — push desabilitado.')
    return
  }

  const reg = await getServiceWorkerRegistration()
  if (!reg) return

  const chaveSalva = localStorage.getItem(STORAGE_PUSH_VAPID)
  const existente = await reg.pushManager.getSubscription().catch(() => null)
  if (existente && chaveSalva && chaveSalva !== VAPID_PUBLIC_KEY) {
    try { await existente.unsubscribe() } catch { /* ignore */ }
    localStorage.setItem(STORAGE_PUSH_VAPID, VAPID_PUBLIC_KEY)
  } else if (existente) {
    localStorage.setItem(STORAGE_PUSH_VAPID, VAPID_PUBLIC_KEY)
    await salvarInscricao(existente, agente)
    return
  }

  if (Notification.permission === 'denied') return

  if (Notification.permission === 'default') {
    try {
      const result = await Notification.requestPermission()
      localStorage.setItem(STORAGE_PUSH_PEDIU, '1')
      if (result !== 'granted') return
    } catch {
      return
    }
  }

  try {
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
    localStorage.setItem(STORAGE_PUSH_VAPID, VAPID_PUBLIC_KEY)
    await salvarInscricao(sub, agente)
  } catch (e) {
    console.warn('[Push] falha ao inscrever:', e)
  }
}

export async function pedirPermissaoEInscrever(agente: string): Promise<'ok' | 'negado' | 'erro' | 'sem-suporte'> {
  if (!pushSuportado()) return 'sem-suporte'

  const okRegistro = await registrarServiceWorker()
  if (!okRegistro) {
    console.warn('[Push] service worker não pôde ser registrado')
    return 'erro'
  }

  const VAPID_PUBLIC_KEY = getVapidPublicKey()
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[Push] VAPID public key não encontrada nas env vars')
    return 'erro'
  }

  const reg = await getServiceWorkerRegistration()
  if (!reg) return 'erro'

  if (Notification.permission === 'default') {
    try {
      const r = await Notification.requestPermission()
      localStorage.setItem(STORAGE_PUSH_PEDIU, '1')
      if (r !== 'granted') return 'negado'
    } catch {
      return 'erro'
    }
  } else if (Notification.permission === 'denied') {
    return 'negado'
  }

  try {
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }
    await salvarInscricao(sub, agente)
    return 'ok'
  } catch (e) {
    console.warn('[Push] erro ao inscrever/salvar:', e)
    return 'erro'
  }
}

export async function getStatusNotificacoes(): Promise<'ativo' | 'concedido' | 'negado' | 'sem-suporte' | 'desconhecido'> {
  if (!pushSuportado()) return 'sem-suporte'
  if (Notification.permission === 'denied') return 'negado'
  const reg = await getServiceWorkerRegistration()
  if (!reg) return 'sem-suporte'
  const sub = await reg.pushManager.getSubscription().catch(() => null)
  if (sub) return 'ativo'
  if (Notification.permission === 'granted') return 'concedido'
  return 'desconhecido'
}

// Dispara push SOS via Supabase Edge Function.
export async function dispararPushSos(payload: {
  id: string
  agente: string
  lat?: number | null
  lng?: number | null
  bateria?: number | null
}): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-sos-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        id: payload.id,
        agente: payload.agente,
        lat: payload.lat ?? null,
        lng: payload.lng ?? null,
        bateria: payload.bateria ?? null,
        excludeId: getMeuId(),
      }),
    })
  } catch (e) {
    console.warn('[Push] erro ao chamar Edge Function send-sos-push:', e)
  }
}
