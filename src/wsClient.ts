// WebSocket client — native WS para Replit dev + Supabase Realtime para Netlify.
// API pública idêntica para compatibilidade total.

import { dispararPushSos } from './pushNotifications'
import { supabase, supabaseDisponivel } from './supabaseClient'

type WsHandler = (msg: Record<string, unknown>) => void
type OpenHandler = () => void

const handlers = new Map<string, Set<WsHandler>>()
const openHandlers = new Set<OpenHandler>()

let ws: WebSocket | null = null
let isOpen = false
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

// Deduplicação de mensagens recebidas por ambos os transportes
const recentMsgIds = new Set<string>()
function novaMsg(key: string): boolean {
  if (recentMsgIds.has(key)) return false
  recentMsgIds.add(key)
  if (recentMsgIds.size > 200) {
    const primeiro = recentMsgIds.values().next().value
    if (primeiro) recentMsgIds.delete(primeiro)
  }
  return true
}

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
    ws!.send(JSON.stringify({ tipo: 'online', id, nome }))
    openHandlers.forEach(h => { try { h() } catch { /* ignore */ } })
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as Record<string, unknown>
      const tipo = msg.tipo as string
      if (!tipo) return
      // Chave de dedup para evitar duplicar mensagens do Supabase Realtime
      const dedupKey = `${tipo}-${msg.id ?? msg.ts ?? JSON.stringify(msg).slice(0, 60)}`
      novaMsg(dedupKey) // marca mas não filtra — WS nativo tem prioridade
      dispatch(tipo, msg)
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

// ─── Supabase Realtime broadcast (funciona no Netlify sem servidor WS) ────────

let sbChannel: ReturnType<typeof supabase.channel> | null = null
let sbPresenceTracked = false

function conectarSupabaseRealtime() {
  if (!supabaseDisponivel) return
  if (sbChannel) return

  const id = getMeuId()
  const nome = getMeuNome()

  sbChannel = supabase.channel('defesa-civil', {
    config: { broadcast: { self: false }, presence: { key: id } },
  })

  sbChannel
    .on('broadcast', { event: 'msg' }, ({ payload }: { payload: Record<string, unknown> }) => {
      const tipo = payload?.tipo as string
      if (!tipo) return
      // Dedup: evita processar mensagem que este dispositivo enviou ou já recebeu via WS nativo
      const dedupKey = `${tipo}-${payload.id ?? payload.ts ?? JSON.stringify(payload).slice(0, 60)}`
      if (!novaMsg(dedupKey)) return
      dispatch(tipo, payload)
    })
    .on('presence', { event: 'sync' }, () => {
      if (!sbChannel) return
      const state = sbChannel.presenceState()
      const agentes = Object.entries(state).map(([presId, arr]) => {
        const first = (arr as Array<Record<string, unknown>>)[0] ?? {}
        return { id: presId, nome: (first.nome as string) || `Equipe ${presId.slice(0, 4)}` }
      })
      dispatch('online_sync', { tipo: 'online_sync', agentes })
    })
    .on('presence', { event: 'join' }, ({ key, newPresences }: { key: string; newPresences: Array<Record<string, unknown>> }) => {
      const nome2 = (newPresences[0]?.nome as string) || `Equipe ${key.slice(0, 4)}`
      dispatch('agente_entrou', { tipo: 'agente_entrou', id: key, nome: nome2 })
    })
    .on('presence', { event: 'leave' }, ({ key, leftPresences }: { key: string; leftPresences: Array<Record<string, unknown>> }) => {
      const nome2 = (leftPresences[0]?.nome as string) || `Equipe ${key.slice(0, 4)}`
      dispatch('agente_saiu', { tipo: 'agente_saiu', id: key, nome: nome2 })
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && sbChannel && !sbPresenceTracked) {
        sbPresenceTracked = true
        await sbChannel.track({ nome })
        openHandlers.forEach(h => { try { h() } catch { /* ignore */ } })
        // Carrega SOS ativos ao conectar
        loadSosAtivos().catch(() => {})
      }
    })
}

function sbBroadcast(msg: Record<string, unknown>) {
  if (!sbChannel || !supabaseDisponivel) return
  sbChannel.send({ type: 'broadcast', event: 'msg', payload: msg }).catch(() => {})
}

// ─── SOS persistidos ─────────────────────────────────────────────────────────

async function loadSosAtivos() {
  try {
    const limiteTs = Date.now() - 60 * 60 * 1000
    // Tenta via Express (Replit) primeiro; fallback: Supabase direto
    let alertas: Record<string, unknown>[] = []
    const res = await fetch('/api/sos-ativos').catch(() => null)
    if (res?.ok) {
      const data = await res.json()
      alertas = Array.isArray(data) ? data : []
    } else if (supabaseDisponivel) {
      const { data } = await supabase
        .from('sos_ativos')
        .select('*')
        .gt('timestamp', limiteTs)
      alertas = data ?? []
    }
    const filtrados = alertas
      .filter((row) => Number(row.timestamp) > limiteTs)
      .map((row) => ({
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
    if (filtrados.length > 0) {
      dispatch('sos_persistidos', { tipo: 'sos_persistidos', alertas: filtrados })
    }
  } catch (e) {
    console.warn('[wsClient] erro ao carregar SOS ativos:', e)
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────

export function wsOn(tipo: string, handler: WsHandler): () => void {
  if (!handlers.has(tipo)) handlers.set(tipo, new Set())
  handlers.get(tipo)!.add(handler)
  connect()
  conectarSupabaseRealtime()
  return () => { handlers.get(tipo)?.delete(handler) }
}

export function wsOnOpen(handler: OpenHandler): () => void {
  openHandlers.add(handler)
  if (isOpen || sbPresenceTracked) {
    queueMicrotask(() => { try { handler() } catch { /* ignore */ } })
  } else {
    connect()
    conectarSupabaseRealtime()
  }
  return () => { openHandlers.delete(handler) }
}

export function wsSend(msg: Record<string, unknown>): void {
  connect()
  conectarSupabaseRealtime()
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

  // Chave de dedup para a própria mensagem que estamos enviando
  const dedupKey = `${tipo}-${msg.id ?? msg.ts ?? JSON.stringify(msg).slice(0, 60)}`
  novaMsg(dedupKey)

  // Envia pelo WS nativo (Replit dev)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }

  // Envia pelo Supabase Realtime (Netlify)
  sbBroadcast(msg)
}

export function wsConnect() {
  connect()
  conectarSupabaseRealtime()
  loadSosAtivos().catch(() => {})
}

export function wsAnunciarOnline() {
  connect()
  conectarSupabaseRealtime()
  const id = getMeuId()
  const nome = getMeuNome()
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ tipo: 'online', id, nome }))
  }
  // Supabase Presence é atualizado automaticamente via track()
  if (sbChannel && sbPresenceTracked) {
    sbChannel.track({ nome }).catch(() => {})
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
  if (sbChannel) {
    sbChannel.unsubscribe().catch(() => {})
    sbChannel = null
    sbPresenceTracked = false
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
