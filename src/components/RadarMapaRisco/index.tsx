import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './RadarMapaRisco.css'
import RadarWeatherLayers from './RadarWeatherLayers'

export type RiskArea = {
  id: string
  nome: string
  tipo: 'encosta' | 'enchente' | 'drenagem' | 'alagamento' | 'deslizamento' | 'via' | 'obra' | 'inundacao' | 'incendio' | 'outro'
  icone: 'water' | 'landslide' | 'fire' | 'other'
  poligono: { lat: number; lng: number }[]
  limiteMm: number
  inicioRisco?: string
  referenciaLocal?: string
  observacoes?: string
  ativo: boolean
}

type AreaDraft = Omit<RiskArea, 'id'>

type Props = {
  areas: RiskArea[]
  precipitacao24h: Record<string, number | null>
  carregando: boolean
  erro: string | null
  salvando: boolean
  carregandoChuva: boolean
  onCriar: (area: AreaDraft) => Promise<void>
  onAtualizar: (id: string, area: AreaDraft) => Promise<void>
  onExcluir: (id: string) => Promise<void>
  onAtualizarChuva: () => void
}

const CENTRO_OURO_BRANCO: [number, number] = [-20.5195, -43.6983]

const HAZARDS: Record<RiskArea['tipo'], { label: string; icon: RiskArea['icone']; color: string }> = {
  encosta: { label: 'Encostas', icon: 'landslide', color: '#dda34e' },
  enchente: { label: 'Enchentes', icon: 'water', color: '#4bb8d8' },
  drenagem: { label: 'Drenagem', icon: 'water', color: '#51bfcb' },
  alagamento: { label: 'Alagamentos', icon: 'water', color: '#42b9dc' },
  deslizamento: { label: 'Deslizamentos', icon: 'landslide', color: '#e3a34a' },
  via: { label: 'Vias', icon: 'other', color: '#778ee8' },
  obra: { label: 'Obras', icon: 'other', color: '#95af53' },
  inundacao: { label: 'Inundações', icon: 'water', color: '#39a6cd' },
  incendio: { label: 'Incêndios', icon: 'fire', color: '#e56f5c' },
  outro: { label: 'Outros riscos', icon: 'other', color: '#a68be0' },
}
const TIPOS_RISCO = Object.keys(HAZARDS) as RiskArea['tipo'][]
type VisaoMapa = 'ouro-branco' | 'lafaiete' | 'minas-gerais'
const VISOES_MAPA: Record<VisaoMapa, { label: string; center: [number, number]; zoom: number }> = {
  'ouro-branco': { label: 'Ouro Branco', center: CENTRO_OURO_BRANCO, zoom: 14 },
  lafaiete: { label: 'Lafaiete', center: [-20.6636, -43.7862], zoom: 13 },
  'minas-gerais': { label: 'Toda MG', center: [-18.5122, -44.555], zoom: 6 },
}

const ICONS: Record<RiskArea['icone'], { label: string; path: string }> = {
  water: {
    label: 'Água',
    path: '<path d="M12 2.8S5.5 10 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10 12 2.8 12 2.8Z"/><path d="M9 15.5a3.1 3.1 0 0 0 3 2.2"/>',
  },
  landslide: {
    label: 'Encosta',
    path: '<path d="m3 19 6.5-11 3.4 5.1 2.2-3.2L21 19H3Z"/><path d="M6.5 16h2m2.5-2h2m2.5 3h2"/>',
  },
  fire: {
    label: 'Fogo',
    path: '<path d="M13 2.8c.8 3.5-2.2 4.4-1.3 7.4.4 1.1 1.5 1.8 2.4 1.8.8-1.2.9-2.6.6-3.8 2.8 2.2 4.2 4.4 4.2 7a6.9 6.9 0 0 1-13.8 0c0-3.2 1.8-5.8 4.8-8.8-.1 2.4.4 3.4 1.1 4.1C10.6 7.7 13.7 6 13 2.8Z"/>',
  },
  other: {
    label: 'Outro',
    path: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8m-4-4h8"/>',
  },
}

function HazardIcon({ icon, size = 19 }: { icon: RiskArea['icone']; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <g dangerouslySetInnerHTML={{ __html: ICONS[icon].path }} />
    </svg>
  )
}

function markerIcon(area: RiskArea, alert: boolean) {
  const color = HAZARDS[area.tipo].color
  const iconPath = ICONS[area.icone].path
  return L.divIcon({
    className: 'risk-map-div-icon',
    html: `<span class="risk-map-marker${alert ? ' is-alert' : ''}" style="--marker-color:${color}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg></span>`,
    iconSize: [38, 46],
    iconAnchor: [19, 42],
    popupAnchor: [0, -39],
  })
}

function MapClickCapture({ onPoint }: { onPoint: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onPoint(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

function MapResizeSync() {
  const map = useMap()
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => map.invalidateSize({ pan: false }))
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => map.invalidateSize({ pan: false }))
      : null
    if (observer && map.getContainer().parentElement) observer.observe(map.getContainer().parentElement)
    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [map])
  return null
}

function MapViewController({ view }: { view: VisaoMapa }) {
  const map = useMap()
  useEffect(() => {
    const target = VISOES_MAPA[view]
    map.flyTo(target.center, target.zoom, { duration: 0.85 })
  }, [map, view])
  return null
}

function centroide(points: RiskArea['poligono']): [number, number] | null {
  if (!points.length) return null
  const total = points.reduce((sum, point) => [sum[0] + point.lat, sum[1] + point.lng], [0, 0])
  return [total[0] / points.length, total[1] / points.length]
}

function formatRain(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mm`
    : 'Sem previsão'
}

export default function RadarMapaRisco({
  areas,
  precipitacao24h,
  carregando,
  erro,
  salvando,
  carregandoChuva,
  onCriar,
  onAtualizar,
  onExcluir,
  onAtualizarChuva,
}: Props) {
  const [desenhando, setDesenhando] = useState(false)
  const [pontos, setPontos] = useState<RiskArea['poligono']>([])
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [excluirId, setExcluirId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<RiskArea['tipo']>('alagamento')
  const [icone, setIcone] = useState<RiskArea['icone']>('water')
  const [limite, setLimite] = useState('')
  const [ativo, setAtivo] = useState(true)
  const [coordLat, setCoordLat] = useState('')
  const [coordLng, setCoordLng] = useState('')
  const [mutationError, setMutationError] = useState('')
  const [mostrarChuva, setMostrarChuva] = useState(false)
  const [mostrarRadarSintetico, setMostrarRadarSintetico] = useState(false)
  const [mostrarNuvens, setMostrarNuvens] = useState(false)
  const [satelite, setSatelite] = useState(false)
  const [visaoMapa, setVisaoMapa] = useState<VisaoMapa>('ouro-branco')
  const [tiposVisiveis, setTiposVisiveis] = useState(() => new Set(TIPOS_RISCO))
  const [erroCamadas, setErroCamadas] = useState('')
  const [quadroAtualizadoEm, setQuadroAtualizadoEm] = useState('')

  const receberErroCamadas = useCallback((mensagem: string) => {
    setErroCamadas(mensagem)
  }, [])
  const receberAtualizacaoRadar = useCallback((horario: string) => {
    setQuadroAtualizadoEm(horario)
  }, [])

  const activeAreas = useMemo(() => areas.filter(area => area.ativo), [areas])
  const areasDesenhadas = useMemo(() => areas.filter(area => tiposVisiveis.has(area.tipo)), [areas, tiposVisiveis])
  const alertCount = useMemo(() => activeAreas.filter(area => {
    const forecast = precipitacao24h[area.id]
    return typeof forecast === 'number' && Number.isFinite(forecast) && forecast > area.limiteMm
  }).length, [activeAreas, precipitacao24h])
  const editingArea = areas.find(area => area.id === editandoId) ?? null
  const deletingArea = areas.find(area => area.id === excluirId) ?? null

  const addPoint = useCallback((lat: number, lng: number) => {
    if (!desenhando || !Number.isFinite(lat) || !Number.isFinite(lng)) return
    setPontos(previous => [...previous, { lat, lng }])
  }, [desenhando])

  useEffect(() => {
    if (!desenhando) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const typing = target instanceof HTMLElement && (
        target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      )
      if (event.key === 'Escape') {
        event.preventDefault()
        setDesenhando(false)
        setPontos([])
      } else if (event.key === 'Backspace' && !typing) {
        event.preventDefault()
        setPontos(previous => previous.slice(0, -1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [desenhando])

  function resetForm() {
    setEditandoId(null)
    setDesenhando(false)
    setPontos([])
    setNome('')
    setTipo('alagamento')
    setIcone('water')
    setLimite('')
    setAtivo(true)
    setCoordLat('')
    setCoordLng('')
    setMutationError('')
  }

  function startCreate() {
    resetForm()
    setDesenhando(true)
    setMutationError('')
  }

  function startEdit(area: RiskArea) {
    setDesenhando(false)
    setPontos([])
    setEditandoId(area.id)
    setNome(area.nome)
    setTipo(area.tipo)
    setIcone(area.icone)
    setLimite(String(area.limiteMm))
    setAtivo(area.ativo)
    setMutationError('')
    setSelecionadaId(area.id)
  }

  function changeType(nextType: RiskArea['tipo']) {
    setTipo(nextType)
    setIcone(HAZARDS[nextType].icon)
  }

  function addCoordinatePoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const lat = Number(coordLat.replace(',', '.'))
    const lng = Number(coordLng.replace(',', '.'))
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setMutationError('Informe latitude e longitude válidas.')
      return
    }
    addPoint(lat, lng)
    setCoordLat('')
    setCoordLng('')
    setMutationError('')
  }

  async function submitArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsedLimit = Number(limite.replace(',', '.'))
    if (!nome.trim()) {
      setMutationError('Informe um nome para a área.')
      return
    }
    if (!limite.trim() || !Number.isFinite(parsedLimit) || parsedLimit < 0) {
      setMutationError('O limite deve ser um número igual ou maior que zero.')
      return
    }
    if (!editingArea && pontos.length < 3) {
      setMutationError('Marque ao menos três pontos no mapa para salvar a área.')
      return
    }
    const area: AreaDraft = {
      nome: nome.trim(),
      tipo,
      icone,
      poligono: editingArea ? editingArea.poligono : pontos,
      limiteMm: parsedLimit,
      ativo,
    }
    setMutationError('')
    try {
      if (editingArea) await onAtualizar(editingArea.id, area)
      else await onCriar(area)
      resetForm()
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Não foi possível salvar a área. Tente novamente.')
    }
  }

  async function confirmDelete() {
    if (!excluirId) return
    setMutationError('')
    try {
      await onExcluir(excluirId)
      if (editandoId === excluirId) resetForm()
      if (selecionadaId === excluirId) setSelecionadaId(null)
      setExcluirId(null)
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : 'Não foi possível excluir a área. Tente novamente.')
      setExcluirId(null)
    }
  }

  return (
    <section className="risk-map-panel" aria-labelledby="risk-map-title">
      <header className="risk-map-heading">
        <div>
          <span className="risk-map-eyebrow">RADAR DC <i aria-hidden="true" /> OURO BRANCO</span>
          <h2 id="risk-map-title">Áreas de risco</h2>
          <p>Polígonos monitorados e precipitação prevista para as próximas 24 horas.</p>
        </div>
        <div className="risk-map-heading-actions">
          <span className={`risk-map-alert-counter${alertCount ? ' has-alert' : ''}`} aria-live="polite">
            <b>{alertCount.toString().padStart(2, '0')}</b>
            <span>{alertCount === 1 ? 'alerta ativo' : 'alertas ativos'}</span>
          </span>
          <button className="risk-map-button risk-map-button-quiet" type="button" onClick={onAtualizarChuva} disabled={carregandoChuva} aria-label="Atualizar previsão de chuva">
            <span className={carregandoChuva ? 'risk-map-refresh-icon is-loading' : 'risk-map-refresh-icon'} aria-hidden="true">↻</span>
            Atualizar chuva
          </button>
          <button className="risk-map-button risk-map-button-primary" type="button" onClick={startCreate} disabled={salvando || desenhando}>
            <span aria-hidden="true">＋</span> Nova área
          </button>
        </div>
      </header>

      {(erro || mutationError) && (
        <div className="risk-map-error" role="alert">
          <span className="risk-map-error-mark" aria-hidden="true">!</span>
          <span>{mutationError || erro}</span>
          {mutationError && <button type="button" onClick={() => setMutationError('')} aria-label="Fechar mensagem">Fechar</button>}
        </div>
      )}

      <div className="risk-map-workspace">
        <div className={`risk-map-canvas${desenhando ? ' is-drawing' : ''}`}>
          <div className="risk-map-map-label">
            <span className="risk-map-live-dot" aria-hidden="true" />
            <span>MAPA MUNICIPAL</span>
            <span className="risk-map-map-coords">20°31′ S · 43°42′ O</span>
          </div>
          <div className="risk-map-layer-controls" role="group" aria-label="Camadas do mapa">
            <div className="risk-map-base-switch" role="group" aria-label="Mapa base">
              <button
                type="button"
                className={!satelite ? 'is-active' : ''}
                aria-pressed={!satelite}
                onClick={() => setSatelite(false)}
              >Mapa</button>
              <button
                type="button"
                className={satelite ? 'is-active' : ''}
                aria-pressed={satelite}
                data-testid="toggle-base-satelite"
                onClick={() => setSatelite(true)}
              >Satélite</button>
            </div>
            <button
              type="button"
              className={mostrarChuva ? 'is-active' : ''}
              aria-pressed={mostrarChuva}
              data-testid="toggle-radar-chuva-observada"
              onClick={() => { setMostrarChuva(value => !value); setErroCamadas('') }}
            >Chuva ativa</button>
            <button
              type="button"
              className={mostrarRadarSintetico ? 'is-active' : ''}
              aria-pressed={mostrarRadarSintetico}
              data-testid="toggle-radar-sintetico"
              onClick={() => { setMostrarRadarSintetico(value => !value); setErroCamadas('') }}
            >Radar sintético</button>
            <button
              type="button"
              className={mostrarNuvens ? 'is-active' : ''}
              aria-pressed={mostrarNuvens}
              data-testid="toggle-nuvens-goes"
              onClick={() => { setMostrarNuvens(value => !value); setErroCamadas('') }}
            >Nuvens GOES</button>
            <label className="risk-map-region-select">
              <span>Área</span>
              <select aria-label="Área do mapa" value={visaoMapa} onChange={event => setVisaoMapa(event.target.value as VisaoMapa)}>
                {Object.entries(VISOES_MAPA).map(([value, view]) => <option value={value} key={value}>{view.label}</option>)}
              </select>
            </label>
          </div>
          {(erroCamadas || (quadroAtualizadoEm && (mostrarChuva || mostrarRadarSintetico))) && (
            <div className={`risk-map-weather-status${erroCamadas ? ' is-error' : ''}`} role={erroCamadas ? 'status' : undefined}>
              {erroCamadas || `RainViewer · ${new Date(quadroAtualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
            </div>
          )}
          <MapContainer
            center={CENTRO_OURO_BRANCO}
            zoom={14}
            minZoom={10}
            maxZoom={19}
            scrollWheelZoom
            keyboard
            className="risk-map-leaflet"
            aria-label="Mapa de Ouro Branco e áreas de risco"
          >
            <RadarWeatherLayers
              mostrarChuva={mostrarChuva}
              mostrarSintetico={mostrarRadarSintetico}
              mostrarNuvens={mostrarNuvens}
              satelite={satelite}
              onErro={receberErroCamadas}
              onAtualizado={receberAtualizacaoRadar}
            />
            <MapResizeSync />
            <MapViewController view={visaoMapa} />
            {desenhando && <MapClickCapture onPoint={addPoint} />}
            {areasDesenhadas.map(area => {
              const center = centroide(area.poligono)
              const forecast = precipitacao24h[area.id]
              const hasForecast = typeof forecast === 'number' && Number.isFinite(forecast)
              const alert = area.ativo && hasForecast && forecast > area.limiteMm
              const color = HAZARDS[area.tipo].color
              const positions = area.poligono.map(point => [point.lat, point.lng] as [number, number])
              return (
                <Fragment key={area.id}>
                  {positions.length >= 3 && (
                    <Polygon
                      positions={positions}
                      pathOptions={{
                        color: alert ? '#f16a62' : color,
                        weight: selecionadaId === area.id ? 3 : 2,
                        opacity: 0.95,
                        fillColor: alert ? '#ef665d' : color,
                        fillOpacity: alert ? 0.31 : 0.19,
                        className: alert ? 'risk-map-polygon-alert' : 'risk-map-polygon',
                      }}
                      eventHandlers={{ click: () => setSelecionadaId(area.id) }}
                    />
                  )}
                  {center && (
                    <Marker
                      position={center}
                      icon={markerIcon(area, alert)}
                      title={`${area.nome}${alert ? ', alerta de precipitação' : ''}`}
                      eventHandlers={{ click: () => setSelecionadaId(area.id) }}
                    >
                      <Popup className="risk-map-popup">
                        <strong>{area.nome}</strong>
                        <span>{HAZARDS[area.tipo].label}{!area.ativo ? ' · inativa' : ''}</span>
                        <span>Previsão 24 h: {formatRain(precipitacao24h[area.id])}</span>
                        <span>Limite: {formatRain(area.limiteMm)}</span>
                        <button type="button" onClick={() => startEdit(area)}>Editar área</button>
                      </Popup>
                    </Marker>
                  )}
                </Fragment>
              )
            })}
            {desenhando && pontos.length > 1 && (
              <Polyline positions={pontos.map(point => [point.lat, point.lng] as [number, number])} pathOptions={{ color: HAZARDS[tipo].color, weight: 2.5, dashArray: '6 6' }} />
            )}
            {desenhando && pontos.length >= 3 && (
              <Polygon positions={pontos.map(point => [point.lat, point.lng] as [number, number])} pathOptions={{ color: HAZARDS[tipo].color, weight: 2.5, fillColor: HAZARDS[tipo].color, fillOpacity: 0.16 }} />
            )}
            {desenhando && pontos.map((point, index) => (
              <CircleMarker key={`${point.lat}-${point.lng}-${index}`} center={[point.lat, point.lng]} radius={6} pathOptions={{ color: '#f6fbff', weight: 2, fillColor: HAZARDS[tipo].color, fillOpacity: 1 }} />
            ))}
          </MapContainer>
          {desenhando && (
            <div className="risk-map-draw-guide" role="status">
              <span className="risk-map-draw-step">{String(Math.min(pontos.length + 1, 99)).padStart(2, '0')}</span>
              <span><strong>Marque o perímetro</strong><small>{pontos.length < 3 ? `Toque no mapa · faltam ${3 - pontos.length} pontos para fechar` : `${pontos.length} pontos · área pronta para salvar`}</small></span>
            </div>
          )}
          {!desenhando && areas.length === 0 && !carregando && (
            <div className="risk-map-map-empty">
              <span className="risk-map-empty-cross" aria-hidden="true">＋</span>
              <strong>Nenhuma área cadastrada</strong>
              <span>Inicie o cadastro e marque três pontos no mapa.</span>
            </div>
          )}
          <div className="risk-map-map-legend" aria-label="Legenda do mapa">
            {Object.entries(HAZARDS).map(([key, hazard]) => (
              <span key={key}><i style={{ backgroundColor: hazard.color }} />{hazard.label}</span>
            ))}
          </div>
        </div>

        <aside className="risk-map-sidebar" aria-label="Lista de áreas monitoradas">
          <div className="risk-map-list-head">
            <div><span className="risk-map-section-label">MONITORAMENTO</span><h3>Áreas de risco <b>{areas.length.toString().padStart(2, '0')}</b></h3></div>
            <button
              type="button"
              className={`risk-map-refresh-small${carregandoChuva ? ' is-loading' : ''}`}
              onClick={onAtualizarChuva}
              disabled={carregandoChuva}
              aria-label="Atualizar previsão de chuva"
              title="Atualizar previsão de chuva"
            >↻</button>
            <button type="button" className="risk-map-add-small" onClick={startCreate} aria-label="Cadastrar nova área" disabled={salvando || desenhando}>＋</button>
          </div>
          <div className="risk-map-type-menu" aria-label="Tipos de risco visíveis no mapa">
            <div className="risk-map-type-menu-heading">
              <span>TIPOS NO MAPA</span>
              <button
                type="button"
                className={tiposVisiveis.size === TIPOS_RISCO.length ? 'is-selected' : ''}
                aria-pressed={tiposVisiveis.size === TIPOS_RISCO.length}
                onClick={() => setTiposVisiveis(new Set(TIPOS_RISCO))}
              >Todas as áreas</button>
            </div>
            <ul className="risk-map-type-list">
              {TIPOS_RISCO.map(tipoRisco => {
                const hazard = HAZARDS[tipoRisco]
                const count = areas.filter(area => area.tipo === tipoRisco).length
                const visible = tiposVisiveis.has(tipoRisco)
                return (
                  <li key={tipoRisco}>
                    <button
                      type="button"
                      className={`risk-map-type-option${visible ? ' is-visible' : ''}`}
                      aria-pressed={visible}
                      onClick={() => setTiposVisiveis(previous => {
                        const next = new Set(previous)
                        if (next.has(tipoRisco)) next.delete(tipoRisco)
                        else next.add(tipoRisco)
                        return next
                      })}
                    >
                      <span className="risk-map-type-icon" style={{ color: hazard.color }}><HazardIcon icon={hazard.icon} size={14} /></span>
                      <span>{hazard.label}</span>
                      <b>{count}</b>
                      <i aria-hidden="true">{visible ? '✓' : ''}</i>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
          {carregando ? (
            <div className="risk-map-skeleton-list" aria-label="Carregando áreas">
              {[0, 1, 2].map(item => <div className="risk-map-skeleton-row" key={item}><i /><span /><b /></div>)}
            </div>
          ) : areas.length === 0 ? (
            <div className="risk-map-empty-state">
              <span className="risk-map-empty-index">00 / 00</span>
              <strong>Sem áreas para monitorar</strong>
              <p>Cadastre um perímetro para acompanhar o risco local.</p>
              <button type="button" onClick={startCreate}>Cadastrar primeira área</button>
            </div>
          ) : (
            <ul className="risk-map-area-list">
              {areas.map(area => {
                const forecast = precipitacao24h[area.id]
                const hasForecast = typeof forecast === 'number' && Number.isFinite(forecast)
                const alert = area.ativo && hasForecast && forecast > area.limiteMm
                const selected = selecionadaId === area.id
                return (
                  <li key={area.id}>
                    <button
                      type="button"
                      className={`risk-map-area-row${selected ? ' is-selected' : ''}${alert ? ' is-alert' : ''}${!area.ativo ? ' is-inactive' : ''}`}
                      onClick={() => {
                        if (!tiposVisiveis.has(area.tipo)) {
                          setTiposVisiveis(previous => new Set(previous).add(area.tipo))
                        }
                        setSelecionadaId(selected ? null : area.id)
                      }}
                      aria-pressed={selected}
                    >
                      <span className="risk-map-area-icon" style={{ color: HAZARDS[area.tipo].color }}><HazardIcon icon={area.icone} /></span>
                      <span className="risk-map-area-copy">
                        <span className="risk-map-area-title">{area.nome}</span>
                        <span className="risk-map-area-meta">{HAZARDS[area.tipo].label} <i aria-hidden="true">/</i> limite {formatRain(area.limiteMm)}</span>
                      </span>
                      <span className={`risk-map-status${alert ? ' is-alert' : area.ativo ? ' is-active' : ' is-off'}`}>
                        <i aria-hidden="true" />{alert ? 'ALERTA' : area.ativo ? 'ATIVA' : 'INATIVA'}
                      </span>
                      <span className="risk-map-rain-value">{formatRain(forecast)}</span>
                      <span className="risk-map-row-caption">PREVISÃO 24 H</span>
                    </button>
                    <div className="risk-map-row-actions">
                      <button type="button" onClick={() => startEdit(area)}>Editar</button>
                      <button type="button" onClick={() => setExcluirId(area.id)}>Excluir</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="risk-map-forecast-note">
            <span className="risk-map-note-mark" aria-hidden="true">i</span>
            <p>Previsão horária do Open-Meteo, acumulada para as próximas 24 horas. O alerta dispara quando o valor <strong>ultrapassa o limite</strong>; dados indisponíveis não são considerados zero.</p>
          </div>
        </aside>
      </div>

      {(desenhando || editingArea) && (
        <section className="risk-map-editor" aria-labelledby="risk-map-editor-title">
          <div className="risk-map-editor-heading">
            <div>
              <span className="risk-map-section-label">{editingArea ? 'CONFIGURAÇÃO DA ÁREA' : 'NOVO PERÍMETRO'}</span>
              <h3 id="risk-map-editor-title">{editingArea ? `Editar ${editingArea.nome}` : 'Cadastrar área de risco'}</h3>
            </div>
            <button type="button" className="risk-map-close-editor" onClick={resetForm} aria-label="Cancelar e fechar formulário">×</button>
          </div>
          {!editingArea && (
            <div className="risk-map-drawing-controls">
              <div className="risk-map-drawing-progress" aria-live="polite">
                <span className={pontos.length >= 3 ? 'is-complete' : ''}>{String(pontos.length).padStart(2, '0')}</span>
                <span>pontos marcados <i aria-hidden="true">/</i> mínimo 03</span>
              </div>
              <div className="risk-map-control-actions">
                <button type="button" className="risk-map-button risk-map-button-quiet" onClick={() => setPontos(previous => previous.slice(0, -1))} disabled={!pontos.length}>Desfazer ponto</button>
                <button type="button" className="risk-map-button risk-map-button-quiet" onClick={() => setPontos([])} disabled={!pontos.length}>Limpar pontos</button>
                <button type="button" className="risk-map-button risk-map-button-quiet" onClick={resetForm}>Cancelar desenho</button>
              </div>
              <form className="risk-map-coordinate-form" onSubmit={addCoordinatePoint}>
                <span>Adicionar ponto por coordenadas</span>
                <label>Latitude<input inputMode="decimal" value={coordLat} onChange={event => setCoordLat(event.target.value)} placeholder="-20.5195" aria-label="Latitude do ponto" /></label>
                <label>Longitude<input inputMode="decimal" value={coordLng} onChange={event => setCoordLng(event.target.value)} placeholder="-43.6983" aria-label="Longitude do ponto" /></label>
                <button type="submit" className="risk-map-button risk-map-button-quiet">Adicionar</button>
              </form>
              <p className="risk-map-key-hint">Atalhos: Backspace desfaz o último ponto · Esc cancela o desenho.</p>
            </div>
          )}
          <form className="risk-map-area-form" onSubmit={submitArea}>
            <label className="risk-map-field risk-map-name-field">Nome da área
              <input value={nome} onChange={event => setNome(event.target.value)} maxLength={72} placeholder="Ex.: Encosta do bairro..." required />
            </label>
            <label className="risk-map-field">Tipo de risco
              <select value={tipo} onChange={event => changeType(event.target.value as RiskArea['tipo'])}>
                {Object.entries(HAZARDS).map(([key, hazard]) => <option value={key} key={key}>{hazard.label}</option>)}
              </select>
            </label>
            <label className="risk-map-field">Ícone do mapa
              <select value={icone} onChange={event => setIcone(event.target.value as RiskArea['icone'])}>
                {Object.entries(ICONS).map(([key, icon]) => <option value={key} key={key}>{icon.label}</option>)}
              </select>
            </label>
            <label className="risk-map-field risk-map-threshold-field">Limite de chuva
              <span className="risk-map-number-input"><input type="number" min="0" step="0.1" value={limite} onChange={event => setLimite(event.target.value)} required /><b>mm / 24 h</b></span>
            </label>
            {editingArea && (
              <label className="risk-map-active-toggle">
                <input type="checkbox" checked={ativo} onChange={event => setAtivo(event.target.checked)} />
                <span><b>Monitoramento ativo</b><small>Desative para suspender os alertas desta área.</small></span>
              </label>
            )}
            <div className="risk-map-form-actions">
              <button type="button" className="risk-map-button risk-map-button-quiet" onClick={resetForm}>Cancelar</button>
              <button type="submit" className="risk-map-button risk-map-button-primary" disabled={salvando || ( !editingArea && pontos.length < 3)}>
                {salvando ? 'Salvando…' : editingArea ? 'Salvar alterações' : `Salvar área${pontos.length >= 3 ? ` · ${pontos.length} pontos` : ''}`}
              </button>
            </div>
          </form>
        </section>
      )}

      {deletingArea && (
        <div className="risk-map-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setExcluirId(null) }}>
          <section className="risk-map-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="risk-map-delete-title">
            <span className="risk-map-dialog-kicker">REMOÇÃO DE PERÍMETRO</span>
            <h3 id="risk-map-delete-title">Excluir “{deletingArea.nome}”?</h3>
            <p>A área será removida do monitoramento. Esta ação não pode ser desfeita.</p>
            <div>
              <button type="button" className="risk-map-button risk-map-button-quiet" onClick={() => setExcluirId(null)}>Manter área</button>
              <button type="button" className="risk-map-button risk-map-button-danger" onClick={() => void confirmDelete()} disabled={salvando}>Excluir área</button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
