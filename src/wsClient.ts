type WsHandler = (msg: Record<string, unknown>) => void

const handlers = new Map<string, Set<WsHandler>>()
let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let manuallyClosed = false

function getWsUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.host}/ws`
}

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
  ws = new WebSocket(getWsUrl())

  ws.onopen = () => {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
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
      reconnectTimer = setTimeout(connect, 3000)
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

export function wsSend(msg: Record<string, unknown>): void {
  connect()
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
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
