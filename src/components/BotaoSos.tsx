import { useEffect, useRef, useState } from 'react'
import { dispararSos } from '../sos'
import './BotaoSos.css'

function getNomeAgente(): string {
  return (
    sessionStorage.getItem('defesacivil-agente-sessao') ||
    localStorage.getItem('defesacivil-agente') ||
    'Agente'
  )
}

const SEGURAR_MS = 1500

export default function BotaoSos() {
  const [aberto, setAberto] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState('')
  const seguraRef = useRef<{ start: number; raf: number; timer: number } | null>(null)

  async function disparar() {
    setEnviando(true)
    setErro('')
    try {
      await dispararSos(getNomeAgente())
      setEnviado(true)
      setTimeout(() => {
        setEnviado(false)
        setConfirmando(false)
        setAberto(false)
      }, 2500)
    } catch (e: any) {
      setErro(e?.message || 'Falha ao enviar SOS')
    } finally {
      setEnviando(false)
    }
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

  // Atalho: tecla volume +/- aciona o painel de confirmação
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'AudioVolumeUp' || e.key === 'AudioVolumeDown') {
        e.preventDefault()
        if (!aberto && !confirmando) {
          setAberto(true)
          setConfirmando(true)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aberto, confirmando])

  return (
    <>
      <button
        className="sos-fab"
        title="SOS Crítico — toque para abrir"
        onClick={() => { setAberto(true); setConfirmando(true) }}
        aria-label="SOS Crítico"
      >
        🆘
      </button>

      {aberto && (
        <div className="sos-fab-modal" onClick={() => { if (!enviando) { setAberto(false); setConfirmando(false); limparSegurar() } }}>
          <div className="sos-fab-painel" onClick={(e) => e.stopPropagation()}>
            <div className="sos-fab-tit">🆘 SOS CRÍTICO</div>
            <div className="sos-fab-sub">
              Vai disparar alerta para <strong>todos os agentes</strong>, com sua localização, bateria e gravação de 10s de áudio.
            </div>

            {enviado ? (
              <div className="sos-fab-ok">✅ Alerta enviado a todos os agentes</div>
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
                <button className="sos-fab-cancelar" onClick={() => { setAberto(false); setConfirmando(false); limparSegurar() }} disabled={enviando}>
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
