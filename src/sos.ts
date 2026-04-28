import { useEffect, useRef, useState } from 'react'
import { wsOn, wsSend, wsOnOpen } from './wsClient'

export interface SosAlerta {
  id: string
  agente: string
  lat: number | null
  lng: number | null
  bateria: number | null
  audio: string | null
  timestamp: number
}

const TTL_MS = 60 * 60 * 1000

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
  wsSend({ tipo: 'sos', ...alertaInicial })
  // Áudio em background
  gravarAudio(10000).then(async (audio) => {
    if (audio) {
      wsSend({ tipo: 'sos-audio', id, audio })
    }
  })
  return alertaInicial
}

export function useSosListener() {
  const [alertas, setAlertas] = useState<SosAlerta[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  function adicionarAlerta(a: SosAlerta) {
    if (!a?.id) return
    setAlertas((prev) => {
      if (prev.find(x => x.id === a.id)) return prev
      return [...prev, a]
    })
    const t = setTimeout(() => removerLocal(a.id), TTL_MS)
    timersRef.current.set(a.id, t)
  }

  useEffect(() => {
    const offSos = wsOn('sos', (msg) => {
      adicionarAlerta(msg as unknown as SosAlerta)
    })

    const offPersistidos = wsOn('sos_persistidos', (msg) => {
      const lista = (msg as any).alertas as SosAlerta[]
      if (!Array.isArray(lista)) return
      lista.forEach(a => adicionarAlerta(a))
    })

    const offAudio = wsOn('sos-audio', (msg) => {
      const id = msg.id as string
      const audio = msg.audio as string
      if (!id || !audio) return
      setAlertas(prev => prev.map(x => x.id === id ? { ...x, audio } : x))
    })

    const offCancelar = wsOn('sos-cancelar', (msg) => {
      if (msg.id) removerLocal(msg.id as string)
    })

    // Sempre que o WS abre (inclusive em reconexões e quando o overlay monta
    // tarde por causa do lazy-loading), pede o estado atual ao servidor.
    // O servidor responderá com `sos_persistidos` se houver SOS ativos —
    // assim, agentes que entram depois de um alerta também o veem.
    const offOpen = wsOnOpen(() => {
      wsSend({ tipo: 'solicitar_estado' })
    })

    return () => {
      offSos()
      offPersistidos()
      offAudio()
      offCancelar()
      offOpen()
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
      wsSend({ tipo: 'sos-cancelar', id })
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
