import { useEffect, useRef, useState } from 'react'
import { wsOn, wsSend, wsOnOpen } from './wsClient'

export interface SosMensagem {
  agente: string
  texto: string
  ts: number
}

export interface SosAlerta {
  id: string
  agente: string
  lat: number | null
  lng: number | null
  bateria: number | null
  audio: string | null
  timestamp: number
  visualizadores?: string[]
  mensagens?: SosMensagem[]
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

// Leitura de GPS otimizada para o SOS:
//   1. Tenta uma leitura RÁPIDA aceitando posição em cache (até 10 s) — assim
//      o alerta sai com algum ponto mesmo se o GPS demorar para fixar.
//   2. Em paralelo, dispara uma leitura PRECISA (sem cache) que normalmente
//      retorna em 2-6 s; quando chega, atualiza o alerta.
// Quem usa o `lerGps` recebe a melhor coordenada disponível dentro de até 8 s.
function lerGps(): Promise<{ lat: number; lng: number; precisa: boolean } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    let resolvido = false
    let melhorCache: { lat: number; lng: number } | null = null

    const finalizar = (valor: { lat: number; lng: number; precisa: boolean } | null) => {
      if (resolvido) return
      resolvido = true
      resolve(valor)
    }

    // Timer de segurança: nunca segura o SOS por mais de 8 s
    const timerLimite = setTimeout(() => {
      if (melhorCache) finalizar({ ...melhorCache, precisa: false })
      else finalizar(null)
    }, 8000)

    // Tentativa 1 — rápida, aceita cache de até 10 s
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        melhorCache = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      },
      () => { /* segue para a tentativa 2 */ },
      { enableHighAccuracy: false, timeout: 2500, maximumAge: 10000 },
    )

    // Tentativa 2 — precisa, sem cache, GPS de hardware
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timerLimite)
        finalizar({ lat: pos.coords.latitude, lng: pos.coords.longitude, precisa: true })
      },
      () => {
        clearTimeout(timerLimite)
        if (melhorCache) finalizar({ ...melhorCache, precisa: false })
        else finalizar(null)
      },
      { enableHighAccuracy: true, timeout: 7500, maximumAge: 0 },
    )
  })
}

// Handle retornado por `iniciarGravacaoAudio`. Devolve a Promise do áudio
// (resolve em `durMs` ms) e um `abortar` para cancelar antes da hora.
type GravacaoHandle = {
  audioPromise: Promise<string | null>
  abortar: () => void
}

// Abre o microfone e começa a gravar. A função SÓ retorna depois que a
// gravação realmente começou (ou null se faltar permissão/suporte). O
// chamador então faz `await handle.audioPromise` para receber o áudio em
// base64 (data URL) quando os `durMs` ms terminarem.
//
// Bitrate fixo em 24kbps (qualidade de voz) → 10s de áudio fica em ~30KB,
// folgado dentro do limite de payload do broadcast Realtime do Supabase.
async function iniciarGravacaoAudio(durMs = 10000): Promise<GravacaoHandle | null> {
  try {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return null
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const tipos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
    const mime = tipos.find(t => MediaRecorder.isTypeSupported(t)) ?? ''
    const opts: MediaRecorderOptions = { audioBitsPerSecond: 24000 }
    if (mime) opts.mimeType = mime
    const rec = new MediaRecorder(stream, opts)
    const pedacos: BlobPart[] = []
    let abortado = false
    rec.ondataavailable = (e) => { if (e.data.size > 0) pedacos.push(e.data) }

    const audioPromise = new Promise<string | null>((resolve) => {
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (abortado) return resolve(null)
        const blob = new Blob(pedacos, { type: mime || 'audio/webm' })
        if (blob.size === 0) return resolve(null)
        const reader = new FileReader()
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
        reader.onerror = () => resolve(null)
        reader.readAsDataURL(blob)
      }
    })

    rec.start()
    const timer = setTimeout(() => { try { rec.stop() } catch {} }, durMs)

    return {
      audioPromise,
      abortar: () => {
        abortado = true
        clearTimeout(timer)
        try { rec.stop() } catch {}
      },
    }
  } catch (e) {
    console.warn('[SOS] sem permissão de áudio:', e)
    return null
  }
}

// Envia o SOS via Supabase Realtime: o `wsSend` faz broadcast em tempo real
// para todos os agentes conectados E grava o alerta na tabela `sos_ativos`,
// para que agentes que abrirem o app depois também recebam o alerta. A
// deduplicação acontece pela chave `id` (UPSERT no banco + dedup local).
function enviarSosTodosOsCanais(payload: Record<string, unknown>) {
  try { wsSend(payload) } catch { /* ignore */ }
}

// Status reportado durante o SOS, usado pelo botão para mostrar feedback
// de gravação ao agente que disparou o alerta.
//   - gravando      : gravação em andamento (com contagem regressiva)
//   - audio_falhou  : sem permissão de microfone — alerta vai sem áudio
export type FaseSos = 'gravando' | 'audio_falhou'
export interface StatusSos {
  fase: FaseSos
  segundosRestantes?: number
}

const DURACAO_AUDIO_MS = 10_000

// Handle público devolvido por dispararSos. O chamador pode `abortar()`
// a gravação enquanto ela está acontecendo (sem mandar nada para os outros)
// e fica `await alerta` para receber o objeto final OU `null` se foi abortado.
export type DisparoEmCurso = {
  alerta: Promise<SosAlerta | null>
  abortar: () => void
}

export function dispararSos(
  agente: string,
  onStatus?: (s: StatusSos) => void,
): DisparoEmCurso {
  const id = `sos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const timestamp = Date.now()

  let abortado = false
  let abortarGravacao: (() => void) | null = null

  const alertaPromise = (async (): Promise<SosAlerta | null> => {
    // 1. Abre o microfone JÁ. O agente que disparou vê o contador 10→0
    //    enquanto fala. NADA é enviado aos outros agentes ainda.
    const gravacao = await iniciarGravacaoAudio(DURACAO_AUDIO_MS)
    if (abortado) {
      gravacao?.abortar()
      return null
    }
    abortarGravacao = gravacao?.abortar ?? null

    let restantes = Math.ceil(DURACAO_AUDIO_MS / 1000)
    let tick: ReturnType<typeof setInterval> | null = null
    if (gravacao) {
      onStatus?.({ fase: 'gravando', segundosRestantes: restantes })
      tick = setInterval(() => {
        restantes -= 1
        if (restantes <= 0) {
          if (tick) { clearInterval(tick); tick = null }
        } else {
          onStatus?.({ fase: 'gravando', segundosRestantes: restantes })
        }
      }, 1000)
    } else {
      // Sem microfone → avisa, mas NÃO bloqueia: o alerta sai sem áudio.
      onStatus?.({ fase: 'audio_falhou' })
    }

    // 2. Em paralelo com a gravação, lê GPS + bateria. Quando os 10s
    //    da gravação terminarem, ambos já vão estar prontos.
    const [audio, gps, bateria] = await Promise.all([
      gravacao ? gravacao.audioPromise : Promise.resolve<string | null>(null),
      lerGps(),
      lerBateria(),
    ])
    if (tick) { clearInterval(tick); tick = null }
    if (abortado) return null

    // 3. Agora sim: envia o alerta junto com o áudio para todos os agentes.
    const alerta: SosAlerta = {
      id,
      agente,
      lat: gps?.lat ?? null,
      lng: gps?.lng ?? null,
      bateria,
      audio,
      timestamp,
    }
    enviarSosTodosOsCanais({ tipo: 'sos', ...alerta })
    return alerta
  })()

  return {
    alerta: alertaPromise,
    abortar: () => {
      abortado = true
      if (abortarGravacao) try { abortarGravacao() } catch {}
    },
  }
}

// ─── Persistência local de SOS já dispensados ──────────────────────────────
// Quando o agente clica "Dispensar", o SOS continua existindo para os outros
// agentes (e no banco), mas NÃO deve mais aparecer para ele — nem agora, nem
// se ele sair e voltar a abrir o app. Guardamos { id: tsExpira } no
// localStorage; entradas vencidas são limpas a cada leitura (lista nunca cresce
// indefinidamente).
const STORAGE_DISPENSADOS = 'sos_dispensados_v1'

function lerDispensados(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_DISPENSADOS)
    if (!raw) return {}
    const obj = JSON.parse(raw) as Record<string, number>
    const agora = Date.now()
    let mudou = false
    for (const id of Object.keys(obj)) {
      if (typeof obj[id] !== 'number' || obj[id] < agora) {
        delete obj[id]
        mudou = true
      }
    }
    if (mudou) localStorage.setItem(STORAGE_DISPENSADOS, JSON.stringify(obj))
    return obj
  } catch { return {} }
}

function marcarDispensado(id: string) {
  try {
    const atual = lerDispensados()
    atual[id] = Date.now() + TTL_MS // expira junto com o próprio SOS
    localStorage.setItem(STORAGE_DISPENSADOS, JSON.stringify(atual))
  } catch { /* ignore */ }
}

function esquecerDispensado(id: string) {
  try {
    const atual = lerDispensados()
    if (atual[id] != null) {
      delete atual[id]
      localStorage.setItem(STORAGE_DISPENSADOS, JSON.stringify(atual))
    }
  } catch { /* ignore */ }
}

function foiDispensado(id: string): boolean {
  return id in lerDispensados()
}

export function useSosListener() {
  const [alertas, setAlertas] = useState<SosAlerta[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  function adicionarAlerta(a: SosAlerta) {
    if (!a?.id) return
    if (foiDispensado(a.id)) return // já dispensado pelo próprio agente — ignora
    setAlertas((prev) => {
      const idx = prev.findIndex(x => x.id === a.id)
      if (idx >= 0) {
        // Atualização do mesmo SOS (ex.: coordenada precisa chegou depois) —
        // mescla campos sem disparar a sirene de novo.
        const atualizado = [...prev]
        atualizado[idx] = { ...prev[idx], ...a, audio: prev[idx].audio ?? a.audio }
        return atualizado
      }
      return [...prev, a]
    })
    if (!timersRef.current.has(a.id)) {
      const t = setTimeout(() => removerLocal(a.id), TTL_MS)
      timersRef.current.set(a.id, t)
    }
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
      const id = msg.id as string | undefined
      if (!id) return
      esquecerDispensado(id)
      removerLocal(id)
    })

    const offVisualizado = wsOn('sos-visualizado', (msg) => {
      const { id, visualizadores } = msg as { id: string; visualizadores: string[] }
      if (!id) return
      setAlertas(prev => prev.map(a => a.id === id ? { ...a, visualizadores } : a))
    })

    const offMensagem = wsOn('sos-nova-mensagem', (msg) => {
      const { id, mensagens } = msg as { id: string; mensagens: SosMensagem[] }
      if (!id) return
      setAlertas(prev => prev.map(a => a.id === id ? { ...a, mensagens } : a))
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
      offVisualizado()
      offMensagem()
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

  // Dispensar é LOCAL: só some para o agente que clicou. Não cancela para os outros.
  // Apenas o agente que disparou o SOS (via BotaoSos.cancelarSosEnviado) pode
  // cancelar para todos enviando "sos-cancelar".
  // O id fica marcado como "dispensado" no localStorage, então mesmo se o agente
  // sair e voltar, o alerta não aparece mais para ele (até expirar o TTL).
  function dispensar(id: string) {
    marcarDispensado(id)
    removerLocal(id)
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

// Nome do evento que o App.tsx escuta para abrir o mapa interno e
// traçar automaticamente a rota até o local do SOS.
export const EVT_ROTA_RESGATE = 'sos-rota-resgate'

export function rotaParaResgate(lat: number, lng: number) {
  // Em vez de abrir o Google Maps externo, dispara um evento que faz o
  // próprio app trocar para a aba do mapa e traçar a rota usando a malha
  // viária do OpenStreetMap (com suporte offline).
  window.dispatchEvent(new CustomEvent(EVT_ROTA_RESGATE, { detail: { lat, lng } }))
}
