import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

export interface SosAlerta {
  id: string
  agente: string
  lat: number | null
  lng: number | null
  bateria: number | null
  audio: string | null
  timestamp: number
}

const CANAL_SOS = 'sos-alerta-defesa-civil'
const TTL_MS = 60 * 60 * 1000

let _channel: ReturnType<typeof supabase.channel> | null = null
function getChannel() {
  if (_channel) return _channel
  _channel = supabase.channel(CANAL_SOS, {
    config: { broadcast: { self: false, ack: false } },
  })
  _channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') console.info('[SOS] canal pronto')
    if (status === 'CHANNEL_ERROR') console.warn('[SOS] erro de canal')
  })
  return _channel
}

async function lerBateria(): Promise<number | null> {
  try {
    const nav: any = navigator
    if (typeof nav.getBattery === 'function') {
      const bat = await nav.getBattery()
      return Math.round((bat.level ?? 0) * 100)
    }
  } catch {}
  return null
}

function lerGps(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    let resolvido = false
    const timer = setTimeout(() => { if (!resolvido) { resolvido = true; resolve(null) } }, 5000)
    navigator.geolocation.getCurrentPosition(
      (pos) => { if (!resolvido) { resolvido = true; clearTimeout(timer); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }) } },
      () => { if (!resolvido) { resolvido = true; clearTimeout(timer); resolve(null) } },
      { enableHighAccuracy: true, timeout: 4500, maximumAge: 30000 },
    )
  })
}

async function gravarAudio(durMs = 10000): Promise<string | null> {
  try {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return null
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const tipos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
    const mime = tipos.find(t => MediaRecorder.isTypeSupported(t)) ?? ''
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const pedacos: BlobPart[] = []
    rec.ondataavailable = (e) => { if (e.data.size > 0) pedacos.push(e.data) }
    return await new Promise<string | null>((resolve) => {
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(pedacos, { type: mime || 'audio/webm' })
        if (blob.size === 0) return resolve(null)
        const reader = new FileReader()
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      }
      rec.start()
      setTimeout(() => { try { rec.stop() } catch {} }, durMs)
    })
  } catch (e) {
    console.warn('[SOS] sem permissão de áudio:', e)
    return null
  }
}

export async function dispararSos(agente: string): Promise<SosAlerta> {
  const id = `sos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const timestamp = Date.now()
  // Capta GPS e bateria em paralelo (rápido). Áudio começa imediato e fica em background.
  const [gps, bateria] = await Promise.all([lerGps(), lerBateria()])
  const alertaInicial: SosAlerta = {
    id,
    agente,
    lat: gps?.lat ?? null,
    lng: gps?.lng ?? null,
    bateria,
    audio: null,
    timestamp,
  }
  const ch = getChannel()
  await ch.send({ type: 'broadcast', event: 'sos', payload: alertaInicial })
  // Áudio em background — quando pronto, manda atualização do mesmo id
  gravarAudio(10000).then(async (audio) => {
    if (audio) {
      await ch.send({
        type: 'broadcast',
        event: 'sos-audio',
        payload: { id, audio },
      })
    }
  })
  return alertaInicial
}

export function useSosListener() {
  const [alertas, setAlertas] = useState<SosAlerta[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const ch = getChannel()
    const onSos = (msg: { payload: SosAlerta }) => {
      const a = msg.payload
      if (!a?.id) return
      setAlertas((prev) => {
        if (prev.find(x => x.id === a.id)) return prev
        return [...prev, a]
      })
      const t = setTimeout(() => removerLocal(a.id), TTL_MS)
      timersRef.current.set(a.id, t)
    }
    const onAudio = (msg: { payload: { id: string; audio: string } }) => {
      const { id, audio } = msg.payload || ({} as any)
      if (!id || !audio) return
      setAlertas(prev => prev.map(x => x.id === id ? { ...x, audio } : x))
    }
    const onCancelar = (msg: { payload: { id: string } }) => {
      if (msg.payload?.id) removerLocal(msg.payload.id)
    }
    ch.on('broadcast', { event: 'sos' }, onSos)
    ch.on('broadcast', { event: 'sos-audio' }, onAudio)
    ch.on('broadcast', { event: 'sos-cancelar' }, onCancelar)
    return () => {
      timersRef.current.forEach(t => clearTimeout(t))
      timersRef.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function removerLocal(id: string) {
    const t = timersRef.current.get(id)
    if (t) { clearTimeout(t); timersRef.current.delete(id) }
    setAlertas(prev => prev.filter(x => x.id !== id))
  }

  async function dispensar(id: string) {
    removerLocal(id)
    try {
      await getChannel().send({ type: 'broadcast', event: 'sos-cancelar', payload: { id } })
    } catch {}
  }

  return { alertas, dispensar }
}

let _sirene: { ctx: AudioContext; osc: OscillatorNode; gain: GainNode; lfo: number } | null = null

export function tocarSirene() {
  pararSirene()
  try {
    const Ctx: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.value = 700
    gain.gain.value = 0.15
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    let alta = true
    const lfo = window.setInterval(() => {
      try {
        osc.frequency.exponentialRampToValueAtTime(alta ? 1100 : 600, ctx.currentTime + 0.18)
        alta = !alta
      } catch {}
    }, 220)
    _sirene = { ctx, osc, gain, lfo }
  } catch (e) {
    console.warn('[SOS] sem áudio:', e)
  }
}

export function pararSirene() {
  if (!_sirene) return
  try {
    clearInterval(_sirene.lfo)
    _sirene.osc.stop()
    _sirene.ctx.close()
  } catch {}
  _sirene = null
}

export function vibrarLongo() {
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate([400, 150, 400, 150, 800])
    }
  } catch {}
}

export function rotaParaResgate(lat: number, lng: number) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
  window.open(url, '_blank', 'noopener,noreferrer')
}
