// WebSocket client — connects to the Express WebSocket server
// API pública idêntica para compatibilidade total.

import { dispararPushSos } from './pushNotifications'

type WsHandler = (msg: Record<string, unknown>) => void
type OpenHandler = () => void

const handlers = new Map<string, Set<WsHandler>>()
const openHandlers = new Set<OpenHandler>()

let ws: WebSocket | null = null
let isOpen = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

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

function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return

  ws = new WebSocket(getWsUrl())

  ws.onopen = () => {
    isOpen = true
    const id = getMeuId()
    const nome = getMeuNome()
    // Announce presence
    ws!.send(JSON.stringify({ tipo: 'online', id, nome }))
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
    ws = null
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        connect()
      }, 3000)
    }
  }

  ws.onerror = () => {
    ws?.close()
  }
}

async function loadSosAtivos() {
  try {
    const limiteTs = Date.now() - 60 * 60 * 1000
    const res = await fetch('/api/sos-ativos')
    if (!res.ok) return
    const data = await res.json()
    if (data && data.length > 0) {
      const alertas = data.filter((row: Record<string, unknown>) => Number(row.timestamp) > limiteTs).map((row: Record<string, unknown>) => ({
        tipo: 'sos',
        id: row.id,
        agente: row.agente,
        lat: row.lat,
        lng: row.lng,
        bateria: row.bateria,
        audio: row.audio,
        timestamp: Number(row.timestamp),
        visualizadores: Array.isArray(row.visualizadores) ? row.visualizadores : [],
        mensagens: Array.isArray(row.mensagens) ? row.mensagens : [],
      }))
      if (alertas.length > 0) {
        dispatch('sos_persistidos', { tipo: 'sos_persistidos', alertas })
      }
    }
  } catch (e) {
    console.warn('[wsClient] erro ao carregar SOS ativos:', e)
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

  if (tipo === 'sos') {
    const { id, agente, lat, lng, bateria } = msg as Record<string, unknown>
    dispararPushSos({
      id: id as string,
      agente: agente as string,
      lat: lat as number | null,
      lng: lng as number | null,
      bateria: bateria as number | null,
    }).catch(() => {})
  }

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

export function wsConnect() {
  connect()
  loadSosAtivos().catch(() => {})
}

export function wsAnunciarOnline() {
  connect()
  const id = getMeuId()
  const nome = getMeuNome()
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ tipo: 'online', id, nome }))
  }
}

export function wsDisconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (ws) {
    const id = getMeuId()
    try { ws.send(JSON.stringify({ tipo: 'offline', id })) } catch { /* ignore */ }
    ws.close()
    ws = null
    isOpen = false
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const id = getMeuId()
        ws.send(JSON.stringify({ tipo: 'offline', id }))
      }
    } catch { /* ignore */ }
  })
}
