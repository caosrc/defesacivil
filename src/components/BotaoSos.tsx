import { useEffect, useRef, useState } from 'react'
import { dispararSos } from '../sos'
import { wsSend } from '../wsClient'
import './BotaoSos.css'

function getNomeAgente(): string {
  return (
    sessionStorage.getItem('defesacivil-agente-sessao') ||
    localStorage.getItem('defesacivil-agente') ||
    'Agente'
  )
}

const SEGURAR_MS = 1500
const VOLUME_HOLD_MS = 3000
const COOLDOWN_MS = 30000
const SHAKE_THRESHOLD = 22
const SHAKE_WINDOW_MS = 1500
const SHAKE_REQUIRED = 4

interface Props {
  modo?: 'fab' | 'botao'
}

export default function BotaoSos({ modo = 'fab' }: Props) {
  const [aberto, setAberto] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [idEnviado, setIdEnviado] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [volumeProgresso, setVolumeProgresso] = useState(0)
  const [avisoRapido, setAvisoRapido] = useState<string | null>(null)
  const seguraRef = useRef<{ start: number; raf: number; timer: number } | null>(null)
  const volumeRef = useRef<{ start: number; raf: number; timer: number } | null>(null)
  const ultimoDisparoRef = useRef<number>(0)

  async function disparar() {
    setEnviando(true)
    setErro('')
    try {
      const alerta = await dispararSos(getNomeAgente())
      setIdEnviado(alerta.id)
      setEnviado(true)
    } catch (e: any) {
      setErro(e?.message || 'Falha ao enviar SOS')
    } finally {
      setEnviando(false)
    }
  }

  // Disparo automático (volume / chacoalhar) — abre painel já no estado "enviado"
  // e respeita cooldown de 30s para não disparar duas vezes seguidas.
  async function dispararAutomatico(origem: 'volume' | 'chacoalhar') {
    const agora = Date.now()
    if (agora - ultimoDisparoRef.current < COOLDOWN_MS) return
    ultimoDisparoRef.current = agora
    setAvisoRapido(origem === 'volume' ? '🆘 SOS pelo volume…' : '🆘 SOS por chacoalhar…')
    setTimeout(() => setAvisoRapido(null), 3500)
    setAberto(true)
    setConfirmando(false)
    try {
      const alerta = await dispararSos(getNomeAgente())
      setIdEnviado(alerta.id)
      setEnviado(true)
    } catch (e: any) {
      setErro(e?.message || 'Falha ao enviar SOS')
    }
  }

  function fechar() {
    setAberto(false)
    setConfirmando(false)
    limparSegurar()
    setEnviado(false)
    setIdEnviado(null)
    setErro('')
  }

  function cancelarSosEnviado() {
    if (idEnviado) {
      try { wsSend({ tipo: 'sos-cancelar', id: idEnviado }) } catch {}
    }
    fechar()
  }

  function limparSegurar() {
    if (!seguraRef.current) return
    cancelAnimationFrame(seguraRef.current.raf)
    clearTimeout(seguraRef.current.timer)
    seguraRef.current = null
    setProgresso(0)
  }

  function comecarSegurar() {
    if (enviando || enviado) return
    const start = performance.now()
    const tick = () => {
      const pct = Math.min(1, (performance.now() - start) / SEGURAR_MS)
      setProgresso(pct)
      if (pct < 1 && seguraRef.current) {
        seguraRef.current.raf = requestAnimationFrame(tick)
      }
    }
    const raf = requestAnimationFrame(tick)
    const timer = window.setTimeout(() => {
      limparSegurar()
      disparar()
    }, SEGURAR_MS)
    seguraRef.current = { start, raf, timer }
  }

  // Volume menos — segurar 3 segundos dispara SOS direto.
  // Aviso: a maioria dos navegadores em celular NÃO recebe esse evento
  // porque o sistema operacional intercepta os botões físicos.
  useEffect(() => {
    function limparVolume() {
      if (!volumeRef.current) return
      cancelAnimationFrame(volumeRef.current.raf)
      clearTimeout(volumeRef.current.timer)
      volumeRef.current = null
      setVolumeProgresso(0)
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'AudioVolumeDown') return
      e.preventDefault()
      if (e.repeat || volumeRef.current) return
      const start = performance.now()
      const tick = () => {
        const pct = Math.min(1, (performance.now() - start) / VOLUME_HOLD_MS)
        setVolumeProgresso(pct)
        if (pct < 1 && volumeRef.current) {
          volumeRef.current.raf = requestAnimationFrame(tick)
        }
      }
      const raf = requestAnimationFrame(tick)
      const timer = window.setTimeout(() => {
        limparVolume()
        dispararAutomatico('volume')
      }, VOLUME_HOLD_MS)
      volumeRef.current = { start, raf, timer }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'AudioVolumeDown') {
        if (volumeRef.current) {
          cancelAnimationFrame(volumeRef.current.raf)
          clearTimeout(volumeRef.current.timer)
          volumeRef.current = null
          setVolumeProgresso(0)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (volumeRef.current) {
        cancelAnimationFrame(volumeRef.current.raf)
        clearTimeout(volumeRef.current.timer)
        volumeRef.current = null
      }
    }
  }, [])

  // Chacoalhar o celular — atalho que funciona em iPhone e Android.
  // Requer 4 chacoalhadas fortes em até 1,5s para evitar disparo acidental.
  useEffect(() => {
    let attached = false
    let chacoalhadas = 0
    let janelaInicio = 0

    function onMotion(e: DeviceMotionEvent) {
      const a = e.accelerationIncludingGravity
      if (!a) return
      const x = a.x ?? 0, y = a.y ?? 0, z = a.z ?? 0
      const total = Math.sqrt(x * x + y * y + z * z)
      if (total < SHAKE_THRESHOLD) return
      const agora = performance.now()
      if (agora - janelaInicio > SHAKE_WINDOW_MS) {
        janelaInicio = agora
        chacoalhadas = 1
      } else {
        chacoalhadas += 1
        if (chacoalhadas >= SHAKE_REQUIRED) {
          chacoalhadas = 0
          janelaInicio = 0
          dispararAutomatico('chacoalhar')
        }
      }
    }

    function ativar() {
      if (attached) return
      attached = true
      window.addEventListener('devicemotion', onMotion)
    }

    async function pedirPermissaoESeguir() {
      const DM: any = (window as any).DeviceMotionEvent
      if (DM && typeof DM.requestPermission === 'function') {
        try {
          const r = await DM.requestPermission()
          if (r === 'granted') ativar()
        } catch { /* ignore */ }
      } else {
        ativar()
      }
    }

    function onPrimeiroToque() {
      document.removeEventListener('click', onPrimeiroToque)
      document.removeEventListener('touchstart', onPrimeiroToque)
      pedirPermissaoESeguir()
    }

    document.addEventListener('click', onPrimeiroToque, { once: true })
    document.addEventListener('touchstart', onPrimeiroToque, { once: true })

    return () => {
      document.removeEventListener('click', onPrimeiroToque)
      document.removeEventListener('touchstart', onPrimeiroToque)
      if (attached) window.removeEventListener('devicemotion', onMotion)
    }
  }, [])

  return (
    <>
      {/* Aviso rápido quando SOS dispara por volume ou chacoalhar */}
      {avisoRapido && (
        <div className="sos-volume-indicator">
          <div className="sos-volume-fill" style={{ width: '100%' }} />
          <span className="sos-volume-txt">{avisoRapido}</span>
        </div>
      )}

      {/* Indicador visual quando volume menos está sendo segurado */}
      {volumeProgresso > 0 && !avisoRapido && (
        <div className="sos-volume-indicator">
          <div className="sos-volume-fill" style={{ width: `${volumeProgresso * 100}%` }} />
          <span className="sos-volume-txt">
            🆘 Segure… {Math.round(volumeProgresso * 100)}%
          </span>
        </div>
      )}

      <button
        className={modo === 'fab' ? 'sos-fab' : 'sos-botao-inline'}
        title="SOS Crítico — toque para abrir"
        onClick={() => { setAberto(true); setConfirmando(true) }}
        aria-label="SOS Crítico"
      >
        🆘{modo === 'botao' && <span className="sos-botao-inline-txt"> SOS</span>}
      </button>

      {aberto && (
        <div
          className={modo === 'botao' ? 'sos-fab-modal sos-fab-modal--mapa' : 'sos-fab-modal'}
          onClick={() => { if (!enviando) fechar() }}
        >
          <div className={modo === 'botao' ? 'sos-fab-painel sos-fab-painel--mapa' : 'sos-fab-painel'} onClick={(e) => e.stopPropagation()}>
            <div className="sos-fab-tit">🆘 SOS CRÍTICO</div>

            {enviado ? (
              <>
                <div className="sos-fab-ok">✅ Alerta enviado a todos os agentes</div>
                <button
                  className="sos-fab-cancelar sos-fab-cancelar--falso"
                  onClick={cancelarSosEnviado}
                  style={{ marginTop: 10 }}
                >
                  🚫 Falso alarme — cancelar para todos
                </button>
              </>
            ) : (
              <>
                <button
                  className="sos-fab-disparar"
                  disabled={enviando}
                  onMouseDown={comecarSegurar}
                  onMouseUp={limparSegurar}
                  onMouseLeave={limparSegurar}
                  onTouchStart={(e) => { e.preventDefault(); comecarSegurar() }}
                  onTouchEnd={limparSegurar}
                  onTouchCancel={limparSegurar}
                >
                  <span className="sos-fab-disparar-fill" style={{ transform: `scaleX(${progresso})` }} />
                  <span className="sos-fab-disparar-txt">
                    {enviando ? '⏳ Enviando…' : progresso > 0 ? `Segure… ${Math.round(progresso * 100)}%` : '👆 Segure 1,5s para disparar'}
                  </span>
                </button>
                <button className="sos-fab-cancelar" onClick={fechar} disabled={enviando}>
                  Cancelar
                </button>
                {erro && <div className="sos-fab-erro">⚠️ {erro}</div>}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
