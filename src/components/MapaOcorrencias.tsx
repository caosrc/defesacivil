import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Circle, Polyline, CircleMarker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Ocorrencia } from '../types'
import { NATUREZA_ICONE, NATUREZA_COR } from '../types'
import { baixarMapaOffline, obterInfoCacheMapa, limparCacheMapa, type ProgressoMapa } from '../offline'

// Fix leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function criarIcone(natureza: string, selecionado = false) {
  const emoji = NATUREZA_ICONE[natureza] ?? '📋'
  const cor = NATUREZA_COR[natureza] ?? '#1a4b8c'
  const size = selecionado ? 46 : 38
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${cor};
      width:${size}px;height:${size}px;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:${selecionado ? '3px solid white' : '2px solid white'};
      box-shadow:${selecionado ? '0 0 0 3px ' + cor + ', 0 4px 12px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.35)'};
      display:flex;align-items:center;justify-content:center;
    "><span style="transform:rotate(45deg);font-size:${selecionado ? 22 : 18}px;line-height:1;">${emoji}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -(size + 4)],
  })
}

function criarIconeViatura() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:36px;height:36px;
      border-radius:50%;
      background:#1a4b8c;
      border:3px solid white;
      box-shadow:0 0 0 3px rgba(26,75,140,0.35), 0 4px 14px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
      font-size:18px;
    ">🚒</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -22],
  })
}

function MapClickHandler({ onMapClick }: { onMapClick: () => void }) {
  useMapEvents({ click: onMapClick })
  return null
}

interface GpsCenterProps {
  position: [number, number]
  seguir: boolean
}

function GpsCenter({ position, seguir }: GpsCenterProps) {
  const map = useMap()
  const initialRef = useRef(false)

  useEffect(() => {
    if (!initialRef.current) {
      map.flyTo(position, Math.max(map.getZoom(), 16), { duration: 1.2 })
      initialRef.current = true
    } else if (seguir) {
      map.panTo(position, { animate: true, duration: 0.5 })
    }
  }, [position, seguir, map])

  return null
}

interface Props {
  ocorrencias: Ocorrencia[]
  onSelecionar: (o: Ocorrencia) => void
}

const OURO_BRANCO: [number, number] = [-20.5195, -43.6983]
const MAX_TRILHA = 300

type StatusGps = 'inativo' | 'aguardando' | 'ativo' | 'erro'

type StatusOffline = 'idle' | 'baixando' | 'concluido' | 'erro'

export default function MapaOcorrencias({ ocorrencias, onSelecionar }: Props) {
  const [selecionada, setSelecionada] = useState<Ocorrencia | null>(null)
  const [legendaAberta, setLegendaAberta] = useState(false)

  // GPS state
  const [statusGps, setStatusGps] = useState<StatusGps>('inativo')
  const [erroGps, setErroGps] = useState<string | null>(null)
  const [posicaoAtual, setPosicaoAtual] = useState<[number, number] | null>(null)
  const [precisao, setPrecisao] = useState<number>(0)
  const [velocidade, setVelocidade] = useState<number | null>(null)
  const [trilha, setTrilha] = useState<[number, number][]>([])
  const [seguir, setSeguir] = useState(true)
  const watchIdRef = useRef<number | null>(null)

  // Estado do download offline de mapa
  const [statusOffline, setStatusOffline] = useState<StatusOffline>('idle')
  const [progressoMapa, setProgressoMapa] = useState<ProgressoMapa | null>(null)
  const [tilesCacheados, setTilesCacheados] = useState<number>(0)
  const [painelOfflineAberto, setPainelOfflineAberto] = useState(false)

  const comGeo = ocorrencias.filter((o) => o.lat && o.lng)
  const semGeo = ocorrencias.length - comGeo.length

  // Carrega info do cache ao montar
  useEffect(() => {
    obterInfoCacheMapa().then(setTilesCacheados).catch(() => {})
  }, [statusOffline])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelecionada(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  function ativarGps() {
    if (!navigator.geolocation) {
      setErroGps('GPS não suportado neste dispositivo.')
      setStatusGps('erro')
      return
    }

    setStatusGps('aguardando')
    setErroGps(null)

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setPosicaoAtual(coords)
        setPrecisao(pos.coords.accuracy)
        setVelocidade(pos.coords.speed)
        setTrilha((prev) => {
          const nova = [...prev, coords]
          return nova.length > MAX_TRILHA ? nova.slice(nova.length - MAX_TRILHA) : nova
        })
        setStatusGps('ativo')
      },
      (err) => {
        let msg = 'Erro ao obter localização.'
        if (err.code === 1) msg = 'Permissão de GPS negada.'
        else if (err.code === 2) msg = 'GPS indisponível no momento.'
        else if (err.code === 3) msg = 'Tempo esgotado ao obter GPS.'
        setErroGps(msg)
        setStatusGps('erro')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
    )
  }

  function desativarGps() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setStatusGps('inativo')
    setPosicaoAtual(null)
    setTrilha([])
    setVelocidade(null)
    setErroGps(null)
    setSeguir(true)
  }

  function toggleGps() {
    if (statusGps === 'ativo' || statusGps === 'aguardando') {
      desativarGps()
    } else {
      ativarGps()
    }
  }

  function selecionarOc(o: Ocorrencia) {
    setSelecionada((prev) => (prev?.id === o.id ? null : o))
  }

  async function iniciarDownloadMapa() {
    if (statusOffline === 'baixando') return
    setStatusOffline('baixando')
    setProgressoMapa(null)
    try {
      await baixarMapaOffline((p) => {
        setProgressoMapa(p)
        if (p.status === 'concluido') setStatusOffline('concluido')
      })
    } catch {
      setStatusOffline('erro')
    }
  }

  async function limparMapa() {
    await limparCacheMapa()
    setTilesCacheados(0)
    setStatusOffline('idle')
    setProgressoMapa(null)
  }

  const naturezasUnicas = [...new Set(comGeo.map((o) => o.natureza))]
  const velocidadeKmh = velocidade != null ? Math.round(velocidade * 3.6) : null

  const porcentagem =
    progressoMapa && progressoMapa.total > 0
      ? Math.round((progressoMapa.concluido / progressoMapa.total) * 100)
      : 0

  return (
    <div className="mapa-wrapper">
      {/* Map */}
      <MapContainer
        center={OURO_BRANCO}
        zoom={14}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        whenReady={() => {}}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
          keepBuffer={4}
        />

        <MapClickHandler onMapClick={() => setSelecionada(null)} />

        {trilha.length >= 2 && (
          <Polyline
            positions={trilha}
            pathOptions={{ color: '#1a4b8c', weight: 4, opacity: 0.65, dashArray: '6 4' }}
          />
        )}

        {posicaoAtual && precisao > 0 && (
          <Circle
            center={posicaoAtual}
            radius={precisao}
            pathOptions={{ color: '#1a4b8c', fillColor: '#1a4b8c', fillOpacity: 0.08, weight: 1.5, opacity: 0.4 }}
          />
        )}

        {posicaoAtual && (
          <>
            <CircleMarker
              center={posicaoAtual}
              radius={22}
              pathOptions={{ color: '#1a4b8c', fillColor: 'rgba(26,75,140,0.18)', weight: 2, fillOpacity: 1 }}
            />
            <Marker
              position={posicaoAtual}
              icon={criarIconeViatura()}
              zIndexOffset={1000}
            >
              <Popup>
                <div style={{ minWidth: 150, fontFamily: 'inherit' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>🚒 Sua posição</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Precisão: ±{Math.round(precisao)} m
                  </div>
                  {velocidadeKmh !== null && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      Velocidade: {velocidadeKmh} km/h
                    </div>
                  )}
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>
                    {posicaoAtual[0].toFixed(6)}, {posicaoAtual[1].toFixed(6)}
                  </div>
                </div>
              </Popup>
            </Marker>
            <GpsCenter position={posicaoAtual} seguir={seguir} />
          </>
        )}

        {comGeo.map((o) => (
          <Marker
            key={o.id}
            position={[o.lat!, o.lng!]}
            icon={criarIcone(o.natureza, selecionada?.id === o.id)}
            eventHandlers={{
              click: (e) => {
                e.originalEvent.stopPropagation()
                selecionarOc(o)
              },
            }}
          >
            <Popup>
              <div style={{ minWidth: 170, fontFamily: 'inherit' }}>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: 2 }}>
                  {NATUREZA_ICONE[o.natureza] ?? '📋'} {o.natureza}
                </div>
                <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 4 }}>
                  {o.tipo} · {o.nivel_risco.charAt(0).toUpperCase() + o.nivel_risco.slice(1)}
                </div>
                {o.endereco && (
                  <div style={{ fontSize: '0.78rem', marginBottom: 6 }}>📍 {o.endereco}</div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onSelecionar(o) }}
                  style={{
                    width: '100%', background: '#E05F00', color: 'white',
                    border: 'none', borderRadius: 6, padding: '6px 0',
                    fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem',
                  }}
                >
                  Ver detalhes completos
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Top stats bar */}
      <div className="mapa-topbar">
        <div className="mapa-stat">
          <span className="mapa-stat-num">{comGeo.length}</span>
          <span className="mapa-stat-label">no mapa</span>
        </div>
        <div className="mapa-stat-div" />
        <div className="mapa-stat">
          <span className="mapa-stat-num">{semGeo}</span>
          <span className="mapa-stat-label">sem GPS</span>
        </div>
        <div className="mapa-stat-div" />
        <div className="mapa-stat">
          <span className="mapa-stat-num">{ocorrencias.length}</span>
          <span className="mapa-stat-label">total</span>
        </div>
        <button className="mapa-legenda-btn" onClick={() => setLegendaAberta((v) => !v)}>
          🗂 Legenda
        </button>
      </div>

      {/* Botão GPS */}
      <button
        className={`mapa-gps-btn mapa-gps-btn--${statusGps}`}
        onClick={toggleGps}
        title={statusGps === 'ativo' ? 'Desativar rastreamento GPS' : 'Ativar rastreamento GPS'}
      >
        {statusGps === 'aguardando' ? (
          <span className="mapa-gps-spinner" />
        ) : (
          <span className="mapa-gps-icon">
            {statusGps === 'ativo' ? '📡' : statusGps === 'erro' ? '⚠️' : '🛰️'}
          </span>
        )}
        <span className="mapa-gps-label">
          {statusGps === 'inativo' && 'GPS'}
          {statusGps === 'aguardando' && 'Aguardando…'}
          {statusGps === 'ativo' && 'GPS ativo'}
          {statusGps === 'erro' && 'Erro GPS'}
        </span>
      </button>

      {/* Botão Download Offline */}
      <button
        className={`mapa-offline-btn ${statusOffline === 'baixando' ? 'mapa-offline-btn--baixando' : statusOffline === 'concluido' ? 'mapa-offline-btn--ok' : ''}`}
        onClick={() => setPainelOfflineAberto((v) => !v)}
        title="Baixar mapa para uso offline"
      >
        <span>
          {statusOffline === 'baixando' ? '⏳' : statusOffline === 'concluido' ? '✅' : '📥'}
        </span>
        <span>
          {statusOffline === 'baixando'
            ? `${porcentagem}%`
            : statusOffline === 'concluido'
            ? 'Offline OK'
            : 'Offline'}
        </span>
      </button>

      {/* Painel Download Mapa Offline */}
      {painelOfflineAberto && (
        <div className="mapa-offline-painel">
          <div className="mapa-offline-painel-header">
            <span>📥 Mapa Offline — Ouro Branco</span>
            <button onClick={() => setPainelOfflineAberto(false)}>✕</button>
          </div>
          <div className="mapa-offline-painel-corpo">
            {tilesCacheados > 0 && (
              <div className="mapa-offline-info">
                ✅ {tilesCacheados.toLocaleString('pt-BR')} tiles salvos no dispositivo
              </div>
            )}
            {tilesCacheados === 0 && statusOffline !== 'baixando' && (
              <div className="mapa-offline-info mapa-offline-info--aviso">
                📵 Mapa ainda não baixado. Sem conexão, o mapa ficará cinza.
              </div>
            )}

            {statusOffline === 'baixando' && progressoMapa && (
              <div className="mapa-offline-progresso">
                <div className="mapa-offline-barra-wrap">
                  <div
                    className="mapa-offline-barra"
                    style={{ width: `${porcentagem}%` }}
                  />
                </div>
                <div className="mapa-offline-pct">
                  {porcentagem}% — {progressoMapa.concluido.toLocaleString('pt-BR')} / {progressoMapa.total.toLocaleString('pt-BR')} tiles
                </div>
              </div>
            )}

            {statusOffline !== 'baixando' && (
              <button
                className="mapa-offline-btn-acao"
                onClick={iniciarDownloadMapa}
                disabled={!navigator.onLine}
              >
                {navigator.onLine
                  ? tilesCacheados > 0
                    ? '🔄 Atualizar mapa offline'
                    : '📥 Baixar mapa offline (zoom 12–16)'
                  : '📵 Sem conexão para baixar'}
              </button>
            )}

            {tilesCacheados > 0 && statusOffline !== 'baixando' && (
              <button className="mapa-offline-btn-limpar" onClick={limparMapa}>
                🗑 Apagar mapa offline
              </button>
            )}

            <div className="mapa-offline-aviso">
              O GPS do dispositivo funciona offline por hardware. Apenas os tiles visuais do mapa precisam ser baixados com conexão.
            </div>
          </div>
        </div>
      )}

      {/* Painel de info GPS ativo */}
      {statusGps === 'ativo' && posicaoAtual && (
        <div className="mapa-gps-info">
          <div className="mapa-gps-info-row">
            <span className="mapa-gps-info-dot" />
            <span className="mapa-gps-info-text">
              {velocidadeKmh !== null ? `${velocidadeKmh} km/h` : 'Parado'}
            </span>
            <span className="mapa-gps-info-sep">·</span>
            <span className="mapa-gps-info-text">±{Math.round(precisao)} m</span>
            <span className="mapa-gps-info-sep">·</span>
            <span className="mapa-gps-info-text">{trilha.length} pts</span>
          </div>
          <button
            className={`mapa-gps-seguir ${seguir ? 'mapa-gps-seguir--ativo' : ''}`}
            onClick={() => setSeguir((v) => !v)}
            title={seguir ? 'Parar de seguir posição' : 'Seguir posição'}
          >
            {seguir ? '🔒 Seguindo' : '🔓 Livre'}
          </button>
        </div>
      )}

      {/* Erro GPS */}
      {statusGps === 'erro' && erroGps && (
        <div className="mapa-gps-erro">
          ⚠️ {erroGps}
          <button onClick={() => setStatusGps('inativo')}>✕</button>
        </div>
      )}

      {/* Legenda */}
      {legendaAberta && (
        <div className="mapa-legenda">
          <div className="mapa-legenda-header">
            <span>Legenda</span>
            <button onClick={() => setLegendaAberta(false)}>✕</button>
          </div>
          <div className="mapa-legenda-lista">
            {naturezasUnicas.length === 0
              ? <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>Nenhuma ocorrência com GPS</div>
              : naturezasUnicas.map((n) => (
                <div key={n} className="mapa-legenda-item">
                  <div
                    className="mapa-legenda-dot"
                    style={{ background: NATUREZA_COR[n] ?? '#1a4b8c' }}
                  >
                    {NATUREZA_ICONE[n] ?? '📋'}
                  </div>
                  <span>{n}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Bottom panel — slides up when marker selected */}
      {selecionada && (
        <div className="mapa-painel" onClick={(e) => e.stopPropagation()}>
          <div className="mapa-painel-handle" onClick={() => setSelecionada(null)} />
          <div className="mapa-painel-corpo">
            <div className="mapa-painel-topo">
              <div
                className="mapa-painel-icone"
                style={{ background: NATUREZA_COR[selecionada.natureza] ?? '#1a4b8c' }}
              >
                {NATUREZA_ICONE[selecionada.natureza] ?? '📋'}
              </div>
              <div className="mapa-painel-info">
                <div className="mapa-painel-natureza">{selecionada.natureza}</div>
                <div className="mapa-painel-tipo">{selecionada.tipo}</div>
              </div>
              <button className="mapa-painel-fechar" onClick={() => setSelecionada(null)}>✕</button>
            </div>

            <div className="mapa-painel-badges">
              <span className={`nivel-badge nivel-${selecionada.nivel_risco}`}>
                {selecionada.nivel_risco === 'baixo' ? '🟢 Baixo' : selecionada.nivel_risco === 'medio' ? '🟡 Médio' : '🔴 Alto'}
              </span>
              <span className={`status-badge status-${selecionada.status_oc}`}>
                {selecionada.status_oc === 'ativo' ? '🔴 Ativo' : '✅ Resolvido'}
              </span>
            </div>

            {selecionada.endereco && (
              <div className="mapa-painel-end">📍 {selecionada.endereco}</div>
            )}
            {selecionada.proprietario && (
              <div className="mapa-painel-end">👤 {selecionada.proprietario}</div>
            )}
            {selecionada.observacoes && (
              <div className="mapa-painel-obs">"{selecionada.observacoes}"</div>
            )}

            <div className="mapa-painel-data">
              🕐 {new Date(selecionada.created_at).toLocaleString('pt-BR')}
            </div>

            <button
              className="mapa-painel-btn"
              onClick={() => { onSelecionar(selecionada); setSelecionada(null) }}
            >
              Ver detalhes completos →
            </button>
          </div>
        </div>
      )}

      {comGeo.length === 0 && (
        <div className="mapa-sem-geo">
          📍 Nenhuma ocorrência com GPS ainda. Registre uma com localização para aparecer aqui.
        </div>
      )}
    </div>
  )
}
