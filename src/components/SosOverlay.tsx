import { useEffect, useRef, useState } from 'react'
import { useSosListener, tocarSirene, pararSirene, vibrarLongo, rotaParaResgate, type SosAlerta } from '../sos'
import { wsSend } from '../wsClient'
import { getAgenteLogado } from './Login'
import './SosOverlay.css'

function formatarHoraMsg(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function formatarHora(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function tempoDecorrido(ts: number, agora: number) {
  const seg = Math.max(0, Math.floor((agora - ts) / 1000))
  if (seg < 60) return `há ${seg}s`
  const min = Math.floor(seg / 60)
  if (min < 60) return `há ${min}min`
  return `há ${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}

export default function SosOverlay() {
  const { alertas, dispensar } = useSosListener()
  const [agora, setAgora] = useState(Date.now())
  const tocandoRef = useRef(false)

  useEffect(() => {
    if (alertas.length > 0 && !tocandoRef.current) {
      tocarSirene()
      vibrarLongo()
      tocandoRef.current = true
    }
    if (alertas.length === 0 && tocandoRef.current) {
      pararSirene()
      tocandoRef.current = false
    }
  }, [alertas.length])

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => () => pararSirene(), [])

  if (alertas.length === 0) return null

  return (
    <div className="sos-overlay">
      {alertas.map((a) => (
        <SosCard
          key={a.id}
          alerta={a}
          agora={agora}
          onDispensar={() => dispensar(a.id)}
          onSilenciar={() => { pararSirene(); tocandoRef.current = false }}
        />
      ))}
    </div>
  )
}

function SosCard({
  alerta,
  agora,
  onDispensar,
  onSilenciar,
}: {
  alerta: SosAlerta
  agora: number
  onDispensar: () => void
  onSilenciar: () => void
}) {
  const temGps = alerta.lat != null && alerta.lng != null
  const [textoMsg, setTextoMsg] = useState('')
  const msgsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const agente = getAgenteLogado()
    if (agente) {
      wsSend({ tipo: 'sos-visualizar', id: alerta.id, agente })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerta.id])

  useEffect(() => {
    if (msgsRef.current) {
      msgsRef.current.scrollTop = msgsRef.current.scrollHeight
    }
  }, [alerta.mensagens?.length])

  function enviarMensagem() {
    const agente = getAgenteLogado()
    const txt = textoMsg.trim()
    if (!txt || !agente) return
    wsSend({ tipo: 'sos-mensagem', id: alerta.id, agente, texto: txt, ts: Date.now() })
    setTextoMsg('')
  }

  return (
    <div className="sos-card">
      <div className="sos-card-pisca" />
      <div className="sos-card-conteudo">
        <div className="sos-card-titulo">
          <span className="sos-icone">🚨</span>
          <div>
            <div className="sos-tit">SOS CRÍTICO</div>
            <div className="sos-sub">{alerta.agente.toUpperCase()} pediu socorro</div>
          </div>
        </div>

        <div className="sos-info">
          <div className="sos-info-linha">
            <span>🕒 Acionado às {formatarHora(alerta.timestamp)} ({tempoDecorrido(alerta.timestamp, agora)})</span>
          </div>
          {alerta.bateria != null && (
            <div className="sos-info-linha">
              <span>🔋 Bateria: <strong>{alerta.bateria}%</strong></span>
            </div>
          )}
          {temGps ? (
            <div className="sos-info-linha">
              <span>📍 GPS: <strong>{alerta.lat!.toFixed(5)}, {alerta.lng!.toFixed(5)}</strong></span>
            </div>
          ) : (
            <div className="sos-info-linha sos-info-erro">
              <span>📍 GPS indisponível</span>
            </div>
          )}
          {alerta.visualizadores && alerta.visualizadores.length > 0 && (
            <div className="sos-info-linha">
              <span>👁️ Visto por: <strong>{alerta.visualizadores.join(', ')}</strong></span>
            </div>
          )}
          {alerta.audio ? (
            <div className="sos-info-audio">
              <span>🎙️ Áudio capturado:</span>
              <audio
                controls
                src={alerta.audio}
                preload="auto"
                onPlay={onSilenciar}
              />
            </div>
          ) : (
            <div className="sos-info-linha sos-info-aguarde">
              <span>🎙️ Sem áudio (microfone do agente não autorizado)</span>
            </div>
          )}
        </div>

        <div className="sos-chat">
          <div className="sos-chat-titulo">💬 Enviar mensagem para {alerta.agente}</div>
          {(alerta.mensagens ?? []).length > 0 && (
            <div className="sos-chat-msgs" ref={msgsRef}>
              {(alerta.mensagens ?? []).map((m, i) => (
                <div key={i} className="sos-chat-msg">
                  <span className="sos-chat-msg-hora">{formatarHoraMsg(m.ts)}</span>
                  <strong className="sos-chat-msg-agente">{m.agente}</strong>
                  <span className="sos-chat-msg-txt">{m.texto}</span>
                </div>
              ))}
            </div>
          )}
          <div className="sos-chat-row">
            <input
              className="sos-chat-input"
              type="text"
              placeholder="Digite sua mensagem…"
              value={textoMsg}
              onChange={(e) => setTextoMsg(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && enviarMensagem()}
            />
            <button
              className="sos-chat-btn"
              onClick={enviarMensagem}
              disabled={!textoMsg.trim()}
            >
              Enviar
            </button>
          </div>
        </div>

        <div className="sos-botoes">
          {temGps && (
            <button
              className="sos-btn sos-btn-primario"
              onClick={() => rotaParaResgate(alerta.lat!, alerta.lng!)}
            >
              🗺️ Traçar rota de resgate
            </button>
          )}
          <button className="sos-btn sos-btn-secundario" onClick={onDispensar}>
            ✅ Dispensar alerta
          </button>
        </div>
        <div className="sos-rodape">Ativo por até 1 hora ou até ser dispensado</div>
      </div>
    </div>
  )
}
