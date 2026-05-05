// WebSocket client — usa Supabase Realtime (Broadcast + Presence)
// API pública idêntica à versão WebSocket para compatibilidade total.

import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import { dispararPushSos } from './pushNotifications'

type WsHandler = (msg: Record<string, unknown>) => void
type OpenHandler = () => void

const handlers = new Map<string, Set<WsHandler>>()
const openHandlers = new Set<OpenHandler>()

let channel: RealtimeChannel | null = null
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

function syncPresence() {
  if (!channel) return
  const state = channel.presenceState()
  const agentes: { id: string; nome: string }[] = []
  for (const presences of Object.values(state)) {
    for (const p of presences as Array<Record<string, unknown>>) {
      if (p.id && p.nome) agentes.push({ id: p.id as string, nome: p.nome as string })
    }
  }
  dispatch('online_sync', { tipo: 'online_sync', agentes })
}

async function loadSosAtivos() {
  try {
    const limiteTs = Date.now() - 60 * 60 * 1000
    const { data } = await supabase
      .from('sos_ativos_db')
      .select('*')
      .gt('timestamp', limiteTs)
    if (data && data.length > 0) {
      const alertas = data.map(row => ({
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
      dispatch('sos_persistidos', { tipo: 'sos_persistidos', alertas })
    }
  } catch (e) {
    console.warn('[wsClient] erro ao carregar SOS ativos:', e)
  }
}

function connect() {
  if (channel) return

  const id = getMeuId()
  const nome = getMeuNome()

  channel = supabase.channel('defesacivil-main', {
    config: {
      broadcast: { ack: false },
      presence: { key: id },
    },
  })

  channel.on('broadcast', { event: '*' }, ({ event, payload }) => {
    const msg = (payload || {}) as Record<string, unknown>
    const tipo = event || (msg.tipo as string)
    if (tipo) dispatch(tipo, { ...msg, tipo })
  })

  channel.on('presence', { event: 'sync' }, () => { syncPresence() })
  channel.on('presence', { event: 'join' }, () => { syncPresence() })
  channel.on('presence', { event: 'leave' }, () => { syncPresence() })

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      isOpen = true
      await channel!.track({ id, nome })
      await loadSosAtivos()
      openHandlers.forEach(h => { try { h() } catch { /* ignore */ } })
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      isOpen = false
      supabase.removeChannel(channel!)
      channel = null
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          connect()
        }, 3000)
      }
    }
  })
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
    const { id, agente, lat, lng, bateria, audio, timestamp } = msg as Record<string, unknown>
    supabase.from('sos_ativos_db').upsert({
      id: String(id),
      agente: String(agente || ''),
      lat: lat ?? null,
      lng: lng ?? null,
      bateria: bateria ?? null,
      audio: audio ?? null,
      timestamp: Number(timestamp || Date.now()),
      visualizadores: [],
      mensagens: [],
    }).then(() => {}).catch(() => {})
    dispararPushSos({
      id: id as string,
      agente: agente as string,
      lat: lat as number | null,
      lng: lng as number | null,
      bateria: bateria as number | null,
    }).catch(() => {})
  }

  if (tipo === 'sos-cancelar') {
    const { id } = msg as Record<string, unknown>
    supabase.from('sos_ativos_db').delete().eq('id', String(id)).then(() => {}).catch(() => {})
  }

  if (tipo === 'sos-visualizar') {
    const { id, agente } = msg as Record<string, unknown>
    if (id && agente) {
      supabase.from('sos_ativos_db').select('visualizadores').eq('id', String(id)).single()
        .then(({ data }) => {
          const vizs = Array.isArray(data?.visualizadores) ? data.visualizadores : []
          if (!vizs.includes(agente)) {
            const novos = [...vizs, agente]
            supabase.from('sos_ativos_db').update({ visualizadores: novos }).eq('id', String(id)).then(() => {}).catch(() => {})
            channel?.send({ type: 'broadcast', event: 'sos-visualizado', payload: { tipo: 'sos-visualizado', id, visualizadores: novos } })
          }
        }).catch(() => {})
    }
  }

  if (tipo === 'sos-mensagem') {
    const { id, agente, texto, ts, audio } = msg as Record<string, unknown>
    if (id && agente) {
      supabase.from('sos_ativos_db').select('mensagens').eq('id', String(id)).single()
        .then(({ data }) => {
          const msgs = Array.isArray(data?.mensagens) ? data.mensagens : []
          const nova: Record<string, unknown> = { agente, texto: texto || '', ts: ts || Date.now() }
          if (audio) nova.audio = audio
          const novas = [...msgs, nova]
          supabase.from('sos_ativos_db').update({ mensagens: novas }).eq('id', String(id)).then(() => {}).catch(() => {})
        }).catch(() => {})
    }
  }

  if (channel) {
    channel.send({ type: 'broadcast', event: tipo, payload: msg }).catch(() => {})
  }
}

export function wsConnect() {
  connect()
}

export function wsAnunciarOnline() {
  connect()
  const id = getMeuId()
  const nome = getMeuNome()
  if (channel && isOpen) {
    channel.track({ id, nome }).catch(() => {})
  }
}

export function wsDisconnect() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  if (channel) {
    channel.untrack().catch(() => {})
    supabase.removeChannel(channel)
    channel = null
    isOpen = false
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try { channel?.untrack() } catch { /* ignore */ }
  })
}
