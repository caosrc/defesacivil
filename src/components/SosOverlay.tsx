import { useEffect, useRef, useState } from 'react'
import { useSosListener, tocarSirene, pararSirene, vibrarLongo, rotaParaResgate, type SosAlerta } from '../sos'
import './SosOverlay.css'

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
          {alerta.audio ? (
            <div className="sos-info-audio">
              <span>🎙️ Áudio capturado (10s):</span>
              <audio
                controls
                src={alerta.audio}
                preload="auto"
                onPlay={onSilenciar}
              />
            </div>
          ) : (
            <div className="sos-info-linha sos-info-aguarde">
              <span>🎙️ Gravando áudio… (chega em alguns segundos)</span>
            </div>
          )}
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
        <div className="sos-rodape">Auto-encerra em até 10 min se não for dispensado</div>
      </div>
    </div>
  )
}
