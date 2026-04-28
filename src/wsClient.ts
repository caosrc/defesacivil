type WsHandler = (msg: Record<string, unknown>) => void
type OpenHandler = () => void

const handlers = new Map<string, Set<WsHandler>>()
const openHandlers = new Set<OpenHandler>()
let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let manuallyClosed = false

// Fila de mensagens enviadas antes do WS estar aberto
const sendQueue: string[] = []

function getWsUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/ws`
}

function flushQueue() {
  while (sendQueue.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
    const msg = sendQueue.shift()!
    try { ws.send(msg) } catch { sendQueue.unshift(msg); break }
  }
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  ws = new WebSocket(getWsUrl())

  ws.onopen = () => {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    flushQueue()
    // Notifica todos os assinantes que o WS está aberto (inicial e cada reconexão).
    openHandlers.forEach(h => { try { h() } catch { /* ignore */ } })
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as Record<string, unknown>
      const tipo = msg.tipo as string | undefined
      if (!tipo) return
      const set = handlers.get(tipo)
      if (set) set.forEach(h => h(msg))
      const all = handlers.get('*')
      if (all) all.forEach(h => h(msg))
    } catch { /* ignore malformed */ }
  }

  ws.onclose = () => {
    ws = null
    if (!manuallyClosed) {
      reconnectTimer = setTimeout(connect, 2000)
    }
  }

  ws.onerror = () => {
    ws?.close()
  }
}

export function wsOn(tipo: string, handler: WsHandler): () => void {
  if (!handlers.has(tipo)) handlers.set(tipo, new Set())
  handlers.get(tipo)!.add(handler)
  connect()
  return () => {
    handlers.get(tipo)?.delete(handler)
  }
}

// Registra um callback que é executado sempre que o WS abre (inicial e em cada reconexão).
// Se o WS já estiver aberto no momento da assinatura, dispara imediatamente para que o
// componente possa pedir o snapshot de estado mesmo se for montado depois.
export function wsOnOpen(handler: OpenHandler): () => void {
  openHandlers.add(handler)
  if (ws && ws.readyState === WebSocket.OPEN) {
    queueMicrotask(() => { try { handler() } catch { /* ignore */ } })
  } else {
    connect()
  }
  return () => { openHandlers.delete(handler) }
}

export function wsSend(msg: Record<string, unknown>): void {
  const json = JSON.stringify(msg)
  connect()
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(json)
    } catch {
      sendQueue.push(json)
    }
  } else {
    // WS ainda conectando ou desconectado — enfileira para enviar quando abrir
    sendQueue.push(json)
  }
}

export function wsConnect() {
  manuallyClosed = false
  connect()
}

export function wsDisconnect() {
  manuallyClosed = true
  ws?.close()
}
