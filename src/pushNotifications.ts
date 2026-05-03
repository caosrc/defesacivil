// ════════════════════════════════════════════════════════════════════════════
// Defesa Civil Ouro Branco — Push Notifications (Web Push API)
// ════════════════════════════════════════════════════════════════════════════

import { API_BASE } from './config'

const STORAGE_DEVICE_ID = 'defesacivil-device-id'
const STORAGE_PUSH_PEDIU = 'defesacivil-push-permissao-pedida-v1'
const STORAGE_PUSH_VAPID = 'defesacivil-push-vapid-key'

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

// Cache da chave VAPID buscada do servidor
let _vapidKeyCache: string | null = null

// Busca a chave VAPID do servidor (ou usa env var se disponível).
// Resultado é cacheado para não bater no servidor toda vez.
async function getVapidPublicKeyAsync(): Promise<string> {
  // 1. Env var (build-time) — funciona em Replit dev se VITE_VAPID_PUBLIC_KEY estiver definida
  const envKey = (window as any).__VAPID_PUBLIC_KEY__ || (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)
  if (envKey) return envKey

  // 2. Cache de sessão
  if (_vapidKeyCache) return _vapidKeyCache

  // 3. Busca do servidor — sempre disponível em produção
  try {
    const resp = await fetch(`${API_BASE}/api/vapid-public-key`)
    if (!resp.ok) return ''
    const data = await resp.json()
    if (data?.publicKey) {
      _vapidKeyCache = data.publicKey as string
      return _vapidKeyCache
    }
  } catch {
    /* ignora se offline ou endpoint não disponível */
  }
  return ''
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
    await fetch(`${API_BASE}/api/push-subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, agente, endpoint, p256dh, auth }),
    })
  } catch (e) {
    console.warn('[Push] erro ao salvar inscrição:', e)
  }
}

export async function registrarPushSeNecessario(agente: string): Promise<void> {
  if (!pushSuportado()) return
  if (!agente) return

  const VAPID_PUBLIC_KEY = await getVapidPublicKeyAsync()
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[Push] VAPID public key não disponível — push desabilitado.')
    return
  }

  const reg = await getServiceWorkerRegistration()
  if (!reg) return

  // Se a chave VAPID mudou, cancela a inscrição antiga e força nova
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

  // Garante que o SW está registrado antes de qualquer coisa
  const okRegistro = await registrarServiceWorker()
  if (!okRegistro) {
    console.warn('[Push] service worker não pôde ser registrado')
    return 'erro'
  }

  // Busca a chave VAPID do servidor (async, não depende de env var)
  const VAPID_PUBLIC_KEY = await getVapidPublicKeyAsync()
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[Push] VAPID public key não encontrada no servidor nem nas env vars')
    return 'erro'
  }

  const reg = await getServiceWorkerRegistration()
  if (!reg) return 'erro'

  // Pede permissão ao usuário se ainda não foi concedida
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

// Dispara push SOS via servidor Express próprio (/api/send-sos-push).
export async function dispararPushSos(payload: {
  id: string
  agente: string
  lat?: number | null
  lng?: number | null
  bateria?: number | null
}): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/send-sos-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    console.warn('[Push] erro ao chamar /api/send-sos-push:', e)
  }
}
