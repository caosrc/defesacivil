// WebSocket client — connects to the Express server at /ws
// Public API is identical to the old Supabase Realtime version for compatibility.

import { dispararPushSos } from './pushNotifications'

type WsHandler = (msg: Record<string, unknown>) => void
type OpenHandler = () => void

const handlers = new Map<string, Set<WsHandler>>()
const openHandlers = new Set<OpenHandler>()

let ws: WebSocket | null = null
let isOpen = false
let desejaConectado = false
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
  // Also dispatch as a window event so other components can listen
  try {
    window.dispatchEvent(new MessageEvent('ws-message', { data: JSON.stringify(msg) }))
  } catch { /* ignore */ }
}

function getWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (desejaConectado) connect()
  }, 3000)
}

function startPing() {
  if (pingTimer) return
  pingTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ tipo: 'ping' }))
      ws.send(JSON.stringify({ tipo: 'online_ping', id: getMeuId() }))
    }
  }, 25000)
}

function stopPing() {
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
}

function connect() {
  desejaConectado = true
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  const url = getWsUrl()
  try {
    ws = new WebSocket(url)
  } catch (e) {
    console.warn('[WS] falha ao criar WebSocket:', e)
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    isOpen = true
    // Announce online presence
    ws!.send(JSON.stringify({ tipo: 'online', id: getMeuId(), nome: getMeuNome() }))
    // Ask for current state
    ws!.send(JSON.stringify({ tipo: 'solicitar_estado' }))
    startPing()
    openHandlers.forEach(h => { try { h() } catch { /* ignore */ } })
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as Record<string, unknown>
      const tipo = msg.tipo as string
      if (!tipo) return
      if (tipo === 'pong') return
      dispatch(tipo, msg)
    } catch { /* ignore */ }
  }

  ws.onclose = () => {
    isOpen = false
    ws = null
    stopPing()
    if (desejaConectado) scheduleReconnect()
  }

  ws.onerror = () => {
    isOpen = false
  }
}

function doDisconnect() {
  desejaConectado = false
  isOpen = false
  stopPing()
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (ws) {
    try { ws.close() } catch { /* ignore */ }
    ws = null
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

  // GPS
  if (tipo === 'posicao') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
    return
  }

  if (tipo === 'parar') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
    return
  }

  // SOS
  if (tipo === 'sos') {
    // Send via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    } else {
      // Fallback: HTTP if WS is down
      fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      }).catch(() => {})
    }
    // Also fire push notification
    const { id, agente, lat, lng, bateria } = msg as any
    dispararPushSos({ id, agente, lat, lng, bateria }).catch(() => {})
    return
  }

  if (tipo === 'sos-audio') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    } else {
      fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      }).catch(() => {})
    }
    return
  }

  if (tipo === 'sos-cancelar') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    } else {
      fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      }).catch(() => {})
    }
    return
  }

  if (tipo === 'sos-visualizar' || tipo === 'sos-mensagem') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
    return
  }

  // Presence
  if (tipo === 'online') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ ...msg, id: getMeuId(), nome: getMeuNome() }))
    }
    return
  }

  if (tipo === 'offline') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ tipo: 'offline', id: getMeuId() }))
    }
    return
  }

  if (tipo === 'solicitar_estado' || tipo === 'solicitar_online') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
    return
  }

  // Generic passthrough
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

export function wsConnect() {
  connect()
}

export function wsDisconnect() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ tipo: 'offline', id: getMeuId() })) } catch { /* ignore */ }
    try { ws.send(JSON.stringify({ tipo: 'parar', id: getMeuId() })) } catch { /* ignore */ }
  }
  doDisconnect()
}

// Announce offline when tab closes
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ tipo: 'offline', id: getMeuId() }))
        ws.send(JSON.stringify({ tipo: 'parar', id: getMeuId() }))
      }
    } catch { /* ignore */ }
  })
}
