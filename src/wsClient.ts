// ─── Camada de tempo real via Supabase Realtime ────────────────────────────────
// Substitui o servidor WebSocket próprio. Toda a comunicação (GPS em tempo real,
// SOS, áudio, cancelar, "parar de compartilhar") passa pelo Supabase, direto
// entre os navegadores dos agentes — não precisa de backend rodando 24/7.
//
// A API pública (wsOn/wsSend/wsOnOpen) é mantida igual para que o resto do app
// (MapaOcorrencias, sos.ts, BotaoSos, App.tsx) continue funcionando sem alterações.
//
// Persistência de SOS: a tabela `sos_alertas` no Supabase guarda os alertas
// ativos por até 10 min, para que agentes que entram DEPOIS de um SOS disparado
// também o vejam.

import { supabase } from './supabaseClient'
import type { RealtimeChannel } from '@supabase/supabase-js'

type WsHandler = (msg: Record<string, unknown>) => void
type OpenHandler = () => void

const handlers = new Map<string, Set<WsHandler>>()
const openHandlers = new Set<OpenHandler>()

let channel: RealtimeChannel | null = null
let isJoined = false
let myLastPosicao: Record<string, unknown> | null = null

const SOS_TTL_MS = 10 * 60 * 1000
const CHANNEL_NAME = 'defesa-civil-realtime'

function dispatch(tipo: string, msg: Record<string, unknown>) {
  const set = handlers.get(tipo)
  if (set) set.forEach(h => { try { h(msg) } catch { /* ignore */ } })
  const all = handlers.get('*')
  if (all) all.forEach(h => { try { h(msg) } catch { /* ignore */ } })
}

async function buscarSosAtivos() {
  try {
    const desde = new Date(Date.now() - SOS_TTL_MS).toISOString()
    const { data, error } = await supabase
      .from('sos_alertas')
      .select('*')
      .gt('created_at', desde)
      .order('created_at', { ascending: true })
    if (error) {
      console.warn('[Realtime] erro lendo sos_alertas:', error.message)
      return
    }
    if (data && data.length > 0) {
      dispatch('sos_persistidos', {
        tipo: 'sos_persistidos',
        alertas: data.map((r: any) => ({
          id: r.id,
          agente: r.agente,
          lat: r.lat,
          lng: r.lng,
          bateria: r.bateria,
          audio: r.audio,
          timestamp: new Date(r.created_at).getTime(),
        })),
      })
    }
  } catch (e) {
    console.warn('[Realtime] falha ao consultar SOS ativos:', e)
  }
}

function setupChannel() {
  if (channel) return
  channel = supabase.channel(CHANNEL_NAME, {
    config: { broadcast: { self: false } },
  })

  // GPS em tempo real
  channel.on('broadcast', { event: 'posicao' }, ({ payload }) => {
    dispatch('posicao', { tipo: 'posicao', ...(payload as object) })
  })

  channel.on('broadcast', { event: 'parar' }, ({ payload }) => {
    const p = { tipo: 'parar', ...(payload as object) }
    dispatch('parar', p)
    dispatch('remover', { ...p, tipo: 'remover' })
  })

  // Quando alguém entra e pede o estado, todos online reenviam sua última posição
  channel.on('broadcast', { event: 'pedir_posicao' }, () => {
    if (myLastPosicao && channel && isJoined) {
      channel.send({
        type: 'broadcast',
        event: 'posicao',
        payload: myLastPosicao,
      }).catch(() => { /* ignore */ })
    }
  })

  // SOS
  channel.on('broadcast', { event: 'sos' }, ({ payload }) => {
    dispatch('sos', { tipo: 'sos', ...(payload as object) })
  })
  channel.on('broadcast', { event: 'sos-audio' }, ({ payload }) => {
    dispatch('sos-audio', { tipo: 'sos-audio', ...(payload as object) })
  })
  channel.on('broadcast', { event: 'sos-cancelar' }, ({ payload }) => {
    dispatch('sos-cancelar', { tipo: 'sos-cancelar', ...(payload as object) })
  })

  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      isJoined = true
      // Pré-carrega SOS ativos persistidos no Supabase (últimos 10 min)
      await buscarSosAtivos()
      // Notifica todos os assinantes de que o canal abriu
      openHandlers.forEach(h => { try { h() } catch { /* ignore */ } })
    } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      isJoined = false
    }
  })
}

export function wsOn(tipo: string, handler: WsHandler): () => void {
  if (!handlers.has(tipo)) handlers.set(tipo, new Set())
  handlers.get(tipo)!.add(handler)
  setupChannel()
  return () => { handlers.get(tipo)?.delete(handler) }
}

export function wsOnOpen(handler: OpenHandler): () => void {
  openHandlers.add(handler)
  if (isJoined) {
    queueMicrotask(() => { try { handler() } catch { /* ignore */ } })
  } else {
    setupChannel()
  }
  return () => { openHandlers.delete(handler) }
}

export function wsSend(msg: Record<string, unknown>): void {
  setupChannel()
  const tipo = msg.tipo as string

  if (tipo === 'posicao') {
    const { tipo: _t, ...payload } = msg
    myLastPosicao = payload
    if (isJoined && channel) {
      channel.send({ type: 'broadcast', event: 'posicao', payload }).catch(() => { /* ignore */ })
    }
    return
  }

  if (tipo === 'parar') {
    const { tipo: _t, ...payload } = msg
    myLastPosicao = null
    if (isJoined && channel) {
      channel.send({ type: 'broadcast', event: 'parar', payload }).catch(() => { /* ignore */ })
    }
    return
  }

  if (tipo === 'solicitar_estado') {
    // Pede para todos online reenviarem suas posições
    if (isJoined && channel) {
      channel.send({ type: 'broadcast', event: 'pedir_posicao', payload: {} }).catch(() => { /* ignore */ })
    }
    // E busca os SOS ativos persistidos
    buscarSosAtivos()
    return
  }

  if (tipo === 'sos') {
    const { tipo: _t, ...payload } = msg
    if (isJoined && channel) {
      channel.send({ type: 'broadcast', event: 'sos', payload }).catch(() => { /* ignore */ })
    }
    // Persiste para que agentes que entrem depois também vejam
    supabase.from('sos_alertas').insert({
      id: msg.id as string,
      agente: msg.agente as string,
      lat: (msg.lat as number) ?? null,
      lng: (msg.lng as number) ?? null,
      bateria: (msg.bateria as number) ?? null,
      audio: (msg.audio as string) ?? null,
      created_at: new Date((msg.timestamp as number) ?? Date.now()).toISOString(),
    }).then(({ error }) => {
      if (error) console.warn('[Realtime] erro ao persistir SOS:', error.message)
    })
    return
  }

  if (tipo === 'sos-audio') {
    const { tipo: _t, ...payload } = msg
    if (isJoined && channel) {
      channel.send({ type: 'broadcast', event: 'sos-audio', payload }).catch(() => { /* ignore */ })
    }
    supabase.from('sos_alertas')
      .update({ audio: msg.audio as string })
      .eq('id', msg.id as string)
      .then(({ error }) => {
        if (error) console.warn('[Realtime] erro ao atualizar áudio do SOS:', error.message)
      })
    return
  }

  if (tipo === 'sos-cancelar') {
    const { tipo: _t, ...payload } = msg
    if (isJoined && channel) {
      channel.send({ type: 'broadcast', event: 'sos-cancelar', payload }).catch(() => { /* ignore */ })
    }
    supabase.from('sos_alertas')
      .delete()
      .eq('id', msg.id as string)
      .then(({ error }) => {
        if (error) console.warn('[Realtime] erro ao deletar SOS:', error.message)
      })
    return
  }
}

export function wsConnect() {
  setupChannel()
}

export function wsDisconnect() {
  if (channel) {
    supabase.removeChannel(channel)
    channel = null
    isJoined = false
  }
}
