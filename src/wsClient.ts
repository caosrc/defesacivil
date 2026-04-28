import { getWsUrl } from './config'

type WsHandler = (msg: Record<string, unknown>) => void
type OpenHandler = () => void

const handlers = new Map<string, Set<WsHandler>>()
const openHandlers = new Set<OpenHandler>()

let socket: WebSocket | null = null
let isOpen = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 1000
let myLastPosicao: Record<string, unknown> | null = null
let pingTimer: ReturnType<typeof setInterval> | null = null

function dispatch(tipo: string, msg: Record<string, unknown>) {
  const set = handlers.get(tipo)
  if (set) set.forEach(h => { try { h(msg) } catch { /* ignore */ } })
  const all = handlers.get('*')
  if (all) all.forEach(h => { try { h(msg) } catch { /* ignore */ } })
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, 15000)
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }

  try {
    socket = new WebSocket(getWsUrl())
  } catch (e) {
    console.warn('[WS] erro ao criar WebSocket:', e)
    scheduleReconnect()
    return
  }

  socket.onopen = () => {
    isOpen = true
    reconnectDelay = 1000
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        try { socket.send(JSON.stringify({ tipo: 'ping' })) } catch { /* ignore */ }
      }
    }, 30000)

    // Reenvia a última posição conhecida (caso o agente já estivesse compartilhando)
    if (myLastPosicao && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ tipo: 'posicao', ...myLastPosicao }))
      } catch { /* ignore */ }
    }

    openHandlers.forEach(h => { try { h() } catch { /* ignore */ } })
  }

  socket.onmessage = (ev) => {
    try {
      const data = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString())
      const tipo = data?.tipo as string | undefined
      if (!tipo) return
      dispatch(tipo, data)
    } catch { /* ignore mensagens malformadas */ }
  }

  socket.onclose = () => {
    isOpen = false
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
    socket = null
    scheduleReconnect()
  }

  socket.onerror = () => {
    try { socket?.close() } catch { /* ignore */ }
  }
}

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
  const tipo = msg.tipo as string

  if (tipo === 'posicao') {
    const { tipo: _t, ...payload } = msg
    myLastPosicao = payload
  }
  if (tipo === 'parar') {
    myLastPosicao = null
  }

  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(msg))
    } catch (e) {
      console.warn('[WS] erro ao enviar mensagem:', e)
    }
  }
}

export function wsConnect() {
  connect()
}

export function wsDisconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (pingTimer) { clearInterval(pingTimer); pingTimer = null }
  if (socket) {
    try { socket.close() } catch { /* ignore */ }
    socket = null
  }
  isOpen = false
}
