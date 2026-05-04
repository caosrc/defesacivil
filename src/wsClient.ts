// Realtime client — Supabase Realtime Broadcast + Presence
// API pública idêntica à versão WebSocket para compatibilidade total.

import { supabase } from './supabaseClient'
import { dispararPushSos } from './pushNotifications'
import type { RealtimeChannel } from '@supabase/supabase-js'

type WsHandler = (msg: Record<string, unknown>) => void
type OpenHandler = () => void

const handlers = new Map<string, Set<WsHandler>>()
const openHandlers = new Set<OpenHandler>()

let channel: RealtimeChannel | null = null
let isOpen = false

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

async function carregarSosAtivos() {
  try {
    const limiteTs = Date.now() - 60 * 60 * 1000
    const { data } = await supabase
      .from('sos_ativos_db')
      .select('*')
      .gt('timestamp', limiteTs)
    if (data && data.length > 0) {
      dispatch('sos_persistidos', {
        tipo: 'sos_persistidos',
        alertas: data.map((row: Record<string, unknown>) => ({
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
        })),
      })
    }
  } catch (e) {
    console.warn('[Realtime] erro ao carregar SOS ativos:', e)
  }
}

function connect() {
  if (channel) return

  channel = supabase.channel('defesacivil-realtime', {
    config: {
      broadcast: { self: false },
      presence: { key: getMeuId() },
    },
  })

  channel
    .on('broadcast', { event: '*' }, ({ event, payload }) => {
      if (event && payload) {
        dispatch(event, { tipo: event, ...(payload as Record<string, unknown>) })
      }
    })
    .on('presence', { event: 'sync' }, () => {
      const state = channel!.presenceState()
      const agentes: { id: string; nome: string }[] = []
      for (const presences of Object.values(state)) {
        for (const p of presences as Array<Record<string, unknown>>) {
          if (p.id && p.nome) agentes.push({ id: p.id as string, nome: p.nome as string })
        }
      }
      dispatch('online_sync', { tipo: 'online_sync', agentes })
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        isOpen = true
        channel!.track({ id: getMeuId(), nome: getMeuNome() }).catch(() => {})
        carregarSosAtivos().catch(() => {})
        openHandlers.forEach(h => { try { h() } catch { /* ignore */ } })
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

  if (tipo === 'posicao' || tipo === 'parar') {
    channel?.send({ type: 'broadcast', event: tipo, payload: msg }).catch(() => {})
    return
  }

  if (tipo === 'sos') {
    const { id, agente, lat, lng, bateria, audio, timestamp } = msg as Record<string, unknown>
    supabase.from('sos_ativos_db').upsert({
      id,
      agente,
      lat: lat ?? null,
      lng: lng ?? null,
      bateria: bateria ?? null,
      audio: audio ?? null,
      timestamp: (timestamp as number) || Date.now(),
      visualizadores: [],
      mensagens: [],
    }, { onConflict: 'id' }).then(() => {}).catch(() => {})
    channel?.send({ type: 'broadcast', event: 'sos', payload: msg }).catch(() => {})
    dispararPushSos({ id: id as string, agente: agente as string, lat: lat as number | null, lng: lng as number | null, bateria: bateria as number | null }).catch(() => {})
    return
  }

  if (tipo === 'sos-audio') {
    const { id, audio } = msg as Record<string, unknown>
    supabase.from('sos_ativos_db').update({ audio }).eq('id', id).then(() => {}).catch(() => {})
    channel?.send({ type: 'broadcast', event: 'sos-audio', payload: msg }).catch(() => {})
    return
  }

  if (tipo === 'sos-cancelar') {
    const { id } = msg as Record<string, unknown>
    supabase.from('sos_ativos_db').delete().eq('id', id).then(() => {}).catch(() => {})
    channel?.send({ type: 'broadcast', event: 'sos-cancelar', payload: msg }).catch(() => {})
    return
  }

  if (tipo === 'sos-visualizar') {
    const { id, agente } = msg as Record<string, unknown>
    supabase.from('sos_ativos_db').select('visualizadores').eq('id', id).single()
      .then(({ data }) => {
        const vizs: string[] = Array.isArray(data?.visualizadores) ? (data.visualizadores as string[]) : []
        if (!vizs.includes(agente as string)) {
          const atualizados = [...vizs, agente as string]
          supabase.from('sos_ativos_db').update({ visualizadores: atualizados }).eq('id', id).then(() => {}).catch(() => {})
          channel?.send({ type: 'broadcast', event: 'sos-visualizado', payload: { tipo: 'sos-visualizado', id, visualizadores: atualizados } }).catch(() => {})
          dispatch('sos-visualizado', { tipo: 'sos-visualizado', id, visualizadores: atualizados })
        }
      }).catch(() => {})
    return
  }

  if (tipo === 'sos-mensagem') {
    channel?.send({ type: 'broadcast', event: 'sos-nova-mensagem', payload: msg }).catch(() => {})
    return
  }

  if (tipo === 'online') {
    channel?.send({ type: 'broadcast', event: 'online', payload: { ...msg, id: getMeuId(), nome: getMeuNome() } }).catch(() => {})
    return
  }

  if (tipo === 'offline') {
    channel?.send({ type: 'broadcast', event: 'offline', payload: { tipo: 'offline', id: getMeuId() } }).catch(() => {})
    return
  }

  if (tipo === 'solicitar_estado' || tipo === 'solicitar_online') {
    carregarSosAtivos().catch(() => {})
    return
  }

  channel?.send({ type: 'broadcast', event: tipo, payload: msg }).catch(() => {})
}

export function wsConnect() {
  connect()
}

export function wsDisconnect() {
  if (channel) {
    channel.untrack().catch(() => {})
    supabase.removeChannel(channel)
    channel = null
    isOpen = false
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try { channel?.untrack().catch(() => {}) } catch { /* ignore */ }
  })
}
