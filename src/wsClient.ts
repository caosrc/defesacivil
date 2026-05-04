// WebSocket client — conecta ao servidor Express em /ws
// API pública idêntica à versão Supabase Realtime para compatibilidade total.

import { dispararPushSos } from './pushNotifications'

type WsHandler = (msg: Record<string, unknown>) => void
type OpenHandler = () => void

const handlers = new Map<string, Set<WsHandler>>()
const openHandlers = new Set<OpenHandler>()

let ws: WebSocket | null = null
let isOpen = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let pingTimer: ReturnType<typeof setInterval> | null = null

function getMeuId(): string {
  let id = sessionStorage.getItem('defesacivil-device-id')
  if (!id) {
    id = localStorage.getItem('defesacivil-device-id') || ''
    if (!id) {
      id = Math.random().toString(36).substring(2, 9).toUpperCase()
    }
    sessionStorage.setItem('defesacivil-device-id', id)
  }
  try {
    if (localStorage.getItem('defesacivil-device-id') !== id) {
      localStorage.setItem('defesacivil-device-id', id)
    }
  } catch { /* ignore */ }
  return id
}

function getMeuNome(): string {
  return (
    sessionStorage.getItem('defesacivil-agente-sessao') ||
    localStorage.getItem('defesacivil-device-nome') ||
    `Equipe ${getMeuId()}`
  )
}

function dispatch(tipo: string, msg: Record<string, unknown>) {
  const set = handlers.get(tipo)
  if (set) set.forEach(h => { try { h(msg) } catch { /* ignore */ } })
  const all = handlers.get('*')
  if (all) all.forEach(h => { try { h(msg) } catch { /* ignore */ } })
  try {
    window.dispatchEvent(new MessageEvent('ws-message', { data: JSON.stringify(msg) }))
  } catch { /* ignore */ }
}

// URL do backend Replit (dev server público, não precisa publicar no Replit)
const REPLIT_WS = 'wss://87a7d4ce-738a-4aa3-ac74-9e5507611668-00-1qfaq1dnzb4z7.picard.replit.dev/ws'

function getWsUrl(): string {
  const host = location.hostname
  // localhost ou domínio do próprio Replit → proxy local do Vite
  if (host === 'localhost' || host.includes('replit.dev')) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${location.host}/ws`
  }
  // Qualquer outro domínio (ex.: Netlify) → conecta direto ao backend Replit
  return REPLIT_WS
}

function startPing() {
  if (pingTimer) clearInterval(pingTimer)
  pingTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ tipo: 'ping' }))
      // Also send online_ping to keep agent alive
      const id = getMeuId()
      if (id) ws.send(JSON.stringify({ tipo: 'online_ping', id }))
    }
  }, 30000)
}

function stopPing() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, 3000)
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  try {
    ws = new WebSocket(getWsUrl())
  } catch {
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    isOpen = true
    startPing()
    // Announce presence
    const id = getMeuId()
    const nome = getMeuNome()
    ws!.send(JSON.stringify({ tipo: 'online', id, nome }))
    ws!.send(JSON.stringify({ tipo: 'solicitar_estado' }))
    ws!.send(JSON.stringify({ tipo: 'solicitar_online' }))
    openHandlers.forEach(h => { try { h() } catch { /* ignore */ } })
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as Record<string, unknown>
      const tipo = msg.tipo as string
      if (tipo) dispatch(tipo, msg)
    } catch { /* ignore */ }
  }

  ws.onclose = () => {
    isOpen = false
    stopPing()
    ws = null
    scheduleReconnect()
  }

  ws.onerror = () => {
    ws?.close()
  }
}

// ─── API pública ──────────────────────────────────────────────────────────

export function wsOn(tipo: string, handler: WsHandler): () => void {
  if (!handlers.has(tipo)) handlers.set(tipo, new Set())
  handlers.get(tipo)!.add(handler)
  connect()
  return () => { handlers.get(tipo)?.delete(handler) }
}

export function wsOnOpen(handler: OpenHandler): () => void {
  openHandlers.add(handler)
  if (isOpen) {
    queueMicrotask(() => { try { handler() } catch { /* ignore */ } })
  } else {
    connect()
  }
  return () => { openHandlers.delete(handler) }
}

export function wsSend(msg: Record<string, unknown>): void {
  connect()
  const tipo = (msg as { tipo?: string }).tipo
  if (!tipo) return

  // For SOS events, also notify the server via REST for persistence + push
  if (tipo === 'sos') {
    // Send via REST API for server-side push notifications and DB persistence
    fetch('/api/sos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    }).catch(() => {})
    // Also trigger push via dedicated endpoint
    const { id, agente, lat, lng, bateria } = msg as Record<string, unknown>
    dispararPushSos({ id: id as string, agente: agente as string, lat: lat as number | null, lng: lng as number | null, bateria: bateria as number | null }).catch(() => {})
  }

  if (tipo === 'sos-audio' || tipo === 'sos-cancelar' || tipo === 'sos-mensagem') {
    fetch('/api/sos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
    }).catch(() => {})
  }

  // Always send over WebSocket for real-time delivery
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

export function wsConnect() {
  connect()
}

export function wsDisconnect() {
  stopPing()
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (ws) {
    // Announce going offline before closing
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ tipo: 'offline', id: getMeuId() }))
      }
    } catch { /* ignore */ }
    ws.close()
    ws = null
    isOpen = false
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ tipo: 'offline', id: getMeuId() }))
      }
    } catch { /* ignore */ }
  })
}
