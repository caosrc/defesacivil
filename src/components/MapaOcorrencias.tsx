import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { MapContainer, TileLayer, ImageOverlay, Marker, Popup, useMapEvents, useMap, Circle, Polyline, CircleMarker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { Ocorrencia } from '../types'
import { NATUREZA_ICONE, NATUREZA_COR, NATUREZAS } from '../types'
import {
  baixarMapaOffline,
  obterInfoCacheMapa,
  limparCacheMapa,
  baixarMalhaViariaOffline,
  obterInfoMalhaViaria,
  type ProgressoMapa,
  type ProgressoMalha,
} from '../offline'
import {
  buscarRuas,
  roteamentoLocal,
  malhaDisponivel,
  preAquecerMalha,
  descartarMalhaEmMemoria,
} from '../malhaViaria'
import { wsOn, wsSend, wsOnOpen } from '../wsClient'
import {
  ativarGps as ativarGpsGlobal,
  desativarGps as desativarGpsGlobal,
  subscribeGps,
  getEstadoGps,
} from '../gpsService'


// ── Tipos ───────────────────────────────────────────────────────
interface FocoIncendio {
  lat: number
  lng: number
  confidence: string  // 'l' | 'n' | 'h'
  frp: number         // Fire Radiative Power (MW)
  data: string
  hora: string
  satelite: string
  fonte: string       // FIRMS ou EARTH-ENGINE-MULTISATELITE
}

interface CamadaMonitoramento {
  id: string
  nome: string
  descricao: string
  url: string | null
  periodo: string
  frequencia?: string
  tipo?: string
  quantidade?: number
  disponivel?: boolean
  configuracaoNecessaria?: string | null
  status?: 'disponivel' | 'sem-dados' | 'aguardando'
}

interface FonteMonitoramento {
  id: string
  nome: string
  descricao: string
  frequencia: string
  tipo: string
  disponivel: boolean
  quantidade: number
  atualizadoEm?: string | null
  configuracaoNecessaria?: string | null
}

const FERRAMENTAS_SATELITE: CamadaMonitoramento[] = [
  {
    id: 'goes-19-fire',
    nome: 'GOES-R / GOES-19 ABI',
    descricao: 'Evolução temporal do fogo pelo produto Fire/Hot Spot Characterization.',
    periodo: 'Últimas 24 horas',
    url: null,
    frequencia: '10 min',
    tipo: 'Earth Engine',
  },
  {
    id: 'viirs-noaa20-fire',
    nome: 'NOAA-20 VIIRS',
    descricao: 'Focos de alta resolução espacial em passagem orbital.',
    periodo: 'Últimos 3 dias',
    url: null,
    frequencia: 'NRT',
    tipo: 'NASA FIRMS',
  },
  {
    id: 'viirs-snpp-fire',
    nome: 'S-NPP VIIRS',
    descricao: 'Focos de alta resolução espacial em passagem orbital.',
    periodo: 'Últimos 3 dias',
    url: null,
    frequencia: 'NRT',
    tipo: 'NASA FIRMS',
  },
  {
    id: 'modis-terra-fire',
    nome: 'Terra MODIS',
    descricao: 'Confirmação e complemento das detecções de fogo ativo.',
    periodo: 'Últimos 3 dias',
    url: null,
    frequencia: 'NRT',
    tipo: 'NASA FIRMS',
  },
  {
    id: 'modis-aqua-fire',
    nome: 'Aqua MODIS',
    descricao: 'Confirmação e complemento das detecções de fogo ativo.',
    periodo: 'Últimos 3 dias',
    url: null,
    frequencia: 'NRT',
    tipo: 'NASA FIRMS',
  },
]

interface IndicadorMonitoramento {
  id: string
  nome: string
  valor: number
  unidade: string
}

interface DadosRadarChuva {
  host: string
  path: string
  frameTime: number
  atualizadoEm: string
  fonte: string
  tipoQuadro?: 'observado' | 'nowcast'
  quadros?: QuadroRadarChuva[]
  cache?: boolean
  erroAtualizacao?: boolean
}

interface QuadroRadarChuva {
  path: string
  frameTime: number
  tipoQuadro: 'observado' | 'nowcast'
}

interface ResumoChuvaOntem {
  data: string
  precipitacao: number
  horasComChuva: number
  picoHoraria: number
  horaPico: string | null
  coberturaNuvensMedia: number | null
  fonte?: string
}

interface ChuvaNoPonto {
  precipitacao: number | null
  fonte?: string
}

function intensidadeChuva(precipitacao: number): string {
  if (precipitacao >= 50) return 'extrema'
  if (precipitacao >= 20) return 'intensa'
  if (precipitacao >= 7.6) return 'muito-forte'
  if (precipitacao >= 2.5) return 'forte'
  if (precipitacao >= 0.5) return 'moderada'
  if (precipitacao > 0) return 'fraca'
  return 'nuvens'
}

function corIntensidadeChuva(precipitacao: number, coberturaNuvens: number | null): string {
  if (precipitacao <= 0 && (coberturaNuvens ?? 0) >= 40) return '#93c5fd'
  const cores: Record<string, string> = {
    fraca: '#7dd3fc',
    moderada: '#22c55e',
    forte: '#facc15',
    'muito-forte': '#f97316',
    intensa: '#ef4444',
    extrema: '#c026d3',
    nuvens: '#bfdbfe',
  }
  return cores[intensidadeChuva(precipitacao)]
}

// ── Cache de ícones no nível do módulo ──────────────────────────
// Evita recriar objetos DivIcon a cada render — o Leaflet compara por
// referência e só atualiza o DOM quando o objeto muda. Com o cache,
// somente os marcadores realmente alterados (selecionado/desselecionado)
// causam atualização no DOM, em vez de todos os N marcadores.
const _ICONES_CACHE = new Map<string, L.DivIcon>()
function getIconeCache(natureza: string, selecionado: boolean, semGps: boolean): L.DivIcon {
  const key = `${natureza}|${selecionado}|${semGps}`
  if (!_ICONES_CACHE.has(key)) _ICONES_CACHE.set(key, criarIcone(natureza, selecionado, semGps))
  return _ICONES_CACHE.get(key)!
}

// Fix leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ── Dispositivo local ────────────────────────────────────────────
// ID usa sessionStorage → único por aba/celular (não compartilhado entre abas)
function getDispositivoId(): string {
  let id = sessionStorage.getItem('defesacivil-device-id')
  if (!id) {
    id = Math.random().toString(36).substring(2, 9).toUpperCase()
    sessionStorage.setItem('defesacivil-device-id', id)
  }
  return id
}

// Nome do dispositivo = nome do agente logado na sessão
function getNomeAgente(): string {
  return (
    sessionStorage.getItem('defesacivil-agente-sessao') ||
    localStorage.getItem('defesacivil-device-nome') ||
    `Equipe ${getDispositivoId()}`
  )
}

// ── Ícones ──────────────────────────────────────────────────────
function criarIcone(natureza: string, selecionado = false, semGps = false) {
  const emoji = NATUREZA_ICONE[natureza] ?? '📋'
  const cor = NATUREZA_COR[natureza] ?? '#1a4b8c'
  const size = selecionado ? 46 : 38
  const borda = selecionado
    ? `3px solid white`
    : semGps ? `2px dashed rgba(255,255,255,0.75)` : `2px solid white`
  const etiqueta = semGps
    ? `<div style="position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);
        background:rgba(0,0,0,0.65);color:white;font-size:7px;padding:1px 4px;
        border-radius:3px;white-space:nowrap;font-family:sans-serif;letter-spacing:0.03em;">
        📍 sem GPS</div>`
    : ''
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;">
      <div style="
        background:${cor};width:${size}px;height:${size}px;
        border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        border:${borda};
        box-shadow:${selecionado ? '0 0 0 3px ' + cor + ', 0 4px 12px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.35)'};
        display:flex;align-items:center;justify-content:center;
        opacity:${semGps ? 0.78 : 1};
      "><span style="transform:rotate(45deg);font-size:${selecionado ? 22 : 18}px;line-height:1;">${emoji}</span></div>
      ${etiqueta}
    </div>`,
    iconSize: [size, size + (semGps ? 20 : 0)],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -(size + 4)],
  })
}

// Posição com deslocamento em espiral para ocorrências sem GPS
function coordsSemGps(id: number): [number, number] {
  const seed = Math.abs(id ?? 0)
  const angle = (seed * 137.508) * (Math.PI / 180)
  const r = 0.0012 + (seed % 20) * 0.00015
  return [
    OURO_BRANCO[0] + r * Math.cos(angle),
    OURO_BRANCO[1] + r * Math.sin(angle),
  ]
}

function criarIconeAgente(nome: string, cor = '#1a4b8c') {
  const nomeCurto = nome.length > 12 ? nome.slice(0, 12) + '…' : nome
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
      <div style="
        background:${cor};
        color:white;
        font-size:0.65rem;
        font-weight:700;
        padding:2px 7px;
        border-radius:10px;
        white-space:nowrap;
        box-shadow:0 2px 6px rgba(0,0,0,0.35);
        font-family:sans-serif;
        letter-spacing:0.02em;
      ">${nomeCurto}</div>
      <div style="
        width:38px;height:38px;border-radius:50%;
        background:${cor};border:3px solid white;
        box-shadow:0 0 0 3px ${cor}55, 0 4px 14px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;font-size:20px;
      ">🧑</div>
    </div>`,
    iconSize: [60, 62],
    iconAnchor: [30, 62],
    popupAnchor: [0, -66],
  })
}

// Cores para outros dispositivos (índice circular)
const CORES_EQUIPES = ['#dc2626', '#d97706', '#7c3aed', '#0891b2', '#059669', '#db2777']

// Distância em km entre dois pontos (haversine)
function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function corParaDispositivo(_id: string, idx: number) {
  return CORES_EQUIPES[idx % CORES_EQUIPES.length]
}

function criarIconeFogo(confidence: string, fonte: string): L.DivIcon {
  const isGoes = fonte === 'GOES'
  // VIIRS: vermelho/laranja — menor resolução, mais preciso
  // GOES:  âmbar/laranja — resolução ~2km, atualiza a cada 10min
  const bg = isGoes
    ? (confidence === 'h' ? '#b45309' : confidence === 'n' ? '#d97706' : '#f59e0b')
    : (confidence === 'h' ? '#dc2626' : confidence === 'n' ? '#ea580c' : '#f97316')
  const size = isGoes ? 34 : 30
  const label = isGoes ? `<div style="position:absolute;top:-1px;right:-1px;width:12px;height:12px;
    background:#1e40af;border-radius:50%;border:1px solid white;font-size:7px;
    display:flex;align-items:center;justify-content:center;color:white;font-weight:700;">G</div>` : ''
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;font-size:${isGoes ? 18 : 16}px;width:${size}px;height:${size}px;
      display:flex;align-items:center;justify-content:center;background:${bg};border-radius:50%;
      border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.5);
      animation:pulsoFogo 1.8s ease-in-out infinite;">🔥${label}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

// ── Componentes auxiliares ──────────────────────────────────────
function MapClickHandler({ onMapClick }: { onMapClick: () => void }) {
  useMapEvents({ click: onMapClick })
  return null
}

function GpsCenter({ position, seguir }: { position: [number, number]; seguir: boolean }) {
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

interface RadarChuvaPoligonosProps {
  path: string
  frameTime: number
  enabled: boolean
}

interface RadarFeature {
  geometry?: { type?: string; coordinates?: unknown }
  properties?: {
    tipo?: string
    cor?: string
    intensidade?: string
    alpha?: number
    pixels?: number
  }
}

interface DadosNuvensGoes {
  url: string
  bounds: [[number, number], [number, number]]
  atualizadoEm?: string
  fonte?: string
  frequencia?: string
}

function criarIconeNucleoRadar(cor: string): L.DivIcon {
  return L.divIcon({
    className: 'radar-nucleo-icon',
    html: `<span style="display:block;width:15px;height:15px;border:2px solid #fff;
      border-radius:70% 32% 70% 32%;background:${cor};transform:rotate(45deg);
      box-shadow:0 0 0 2px rgba(0,91,187,.24),0 2px 8px rgba(0,35,90,.55);">
      <i style="display:block;width:4px;height:4px;margin:3px auto;background:#dff5ff;
      border-radius:50%;opacity:.9;"></i></span>`,
    iconSize: [21, 21],
    iconAnchor: [10.5, 10.5],
  })
}

function RadarChuvaPoligonos({ path, frameTime, enabled }: RadarChuvaPoligonosProps) {
  const map = useMap()

  useEffect(() => {
    if (!enabled) return

    let desmontado = false
    const grupo = L.layerGroup().addTo(map)
    const pane = 'radar-poligonos-pane'
    if (!map.getPane(pane)) map.createPane(pane)
    map.getPane(pane)!.style.zIndex = '650'

    const desenharGeoJson = (geojson: { features?: RadarFeature[] }) => {
      for (const feature of geojson.features || []) {
        const propriedades = feature.properties || {}
        const tipo = propriedades.tipo || 'mancha'
        const cor = propriedades.cor || (tipo === 'nucleo' ? '#006bd6' : '#bdeaff')
        if (feature.geometry?.type === 'Polygon' && Array.isArray(feature.geometry.coordinates)) {
          const anel = feature.geometry.coordinates[0]
          if (!Array.isArray(anel)) continue
          const coordenadas = anel.map((coordenada: any) => [coordenada[1], coordenada[0]]) as [number, number][]
          L.polygon(coordenadas, {
            pane,
            color: cor,
            weight: tipo === 'nucleo' ? 1 : 0,
            opacity: tipo === 'nucleo' ? 0.72 : 0,
            fillColor: cor,
            fillOpacity: tipo === 'nucleo'
              ? Math.min(0.78, 0.42 + Number(propriedades.alpha || 0) / 700)
              : Math.min(0.42, 0.18 + Number(propriedades.alpha || 0) / 900),
            smoothFactor: tipo === 'nucleo' ? 1.4 : 2.8,
            lineJoin: 'round',
          }).bindPopup(
            `<strong>${tipo === 'nucleo' ? 'Núcleo de chuva' : 'Mancha de precipitação'}</strong><br />RainViewer · intensidade ${propriedades.intensidade || 'não informada'}`
          ).addTo(grupo)
        }
        if (feature.geometry?.type === 'Point' && Array.isArray(feature.geometry.coordinates)) {
          const coordenada = feature.geometry.coordinates as number[]
          const ponto = [coordenada[1], coordenada[0]] as [number, number]
          L.marker(ponto, {
            pane,
            icon: criarIconeNucleoRadar(cor),
            zIndexOffset: 50,
          }).bindPopup(
            `<strong>💧 Núcleo de chuva detectado</strong><br />Intensidade ${propriedades.intensidade || 'não informada'}<br />${propriedades.pixels || 0} células do radar`
          ).addTo(grupo)
        }
      }
    }

    const desenhar = async () => {
      try {
        const respostaGeoJson = await fetch(
          `/api/radar-chuva-poligonos?path=${encodeURIComponent(path)}&frameTime=${frameTime}`,
          { cache: 'no-store' }
        )
        if (!respostaGeoJson.ok) throw new Error('Contorno do radar indisponível')
        const geojson = await respostaGeoJson.json()
        if (!desmontado) desenharGeoJson(geojson)
      } catch {
        // O painel segue informando o quadro do radar; a camada vetorial só é
        // desenhada quando o PNG real pôde ser lido no servidor.
      }
    }

    void desenhar()
    return () => {
      desmontado = true
      grupo.removeFrom(map)
    }
  }, [enabled, frameTime, map, path])

  return null
}

function CamadaNuvensGoes({ enabled }: { enabled: boolean }) {
  const [dados, setDados] = useState<DadosNuvensGoes | null>(null)

  useEffect(() => {
    if (!enabled) {
      setDados(null)
      return
    }

    let desmontado = false
    const buscar = async () => {
      try {
        const resposta = await fetch(`/api/goes-nuvens?_ts=${Date.now()}`, { cache: 'no-store' })
        if (!resposta.ok) throw new Error('Imagem GOES indisponível')
        const proximo = await resposta.json() as DadosNuvensGoes
        if (!desmontado && proximo.url && Array.isArray(proximo.bounds)) setDados(proximo)
      } catch {
        // A chuva vetorial permanece disponível mesmo quando a imagem GOES
        // estiver temporariamente fora do ar.
      }
    }

    void buscar()
    const intervalo = setInterval(buscar, 10 * 60 * 1000)
    const atualizarAoVoltar = () => {
      if (document.visibilityState === 'visible') void buscar()
    }
    document.addEventListener('visibilitychange', atualizarAoVoltar)
    return () => {
      desmontado = true
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', atualizarAoVoltar)
    }
  }, [enabled])

  if (!enabled || !dados) return null

  return (
    <ImageOverlay
      key={`${dados.url}-${dados.atualizadoEm || ''}`}
      url={`${dados.url}?t=${encodeURIComponent(dados.atualizadoEm || '')}`}
      bounds={dados.bounds}
      opacity={0.38}
      zIndex={20}
      attribution={dados.fonte || 'NOAA/NESDIS · GOES-19'}
    />
  )
}

// Centraliza no destino quando ele muda — usado pela busca de endereço.
function FocoDestino({ destino, rota }: {
  destino: { lat: number; lng: number } | null
  rota: [number, number][]
}) {
  const map = useMap()
  useEffect(() => {
    if (!destino) return
    if (rota.length >= 2) {
      // Ajusta o zoom para mostrar o trajeto inteiro
      const bounds = L.latLngBounds(rota.map(p => L.latLng(p[0], p[1])))
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 })
    } else {
      map.flyTo([destino.lat, destino.lng], Math.max(map.getZoom(), 16), { duration: 1 })
    }
  }, [destino, rota, map])
  return null
}

// Ícone do pino de destino (estilo Google Maps)
function criarIconeDestino() {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;">
      <div style="
        background:#dc2626;width:42px;height:42px;
        border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        border:3px solid white;
        box-shadow:0 0 0 3px #dc262655, 0 4px 12px rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;
      "><span style="transform:rotate(45deg);font-size:22px;line-height:1;">📍</span></div>
    </div>`,
    iconSize: [42, 48],
    iconAnchor: [21, 48],
    popupAnchor: [0, -48],
  })
}

// Ícone de cone para equipamentos em campo
function criarIconeCone(nome?: string | null, selecionado = false) {
  const size = selecionado ? 44 : 36
  const primeiroNome = nome ? nome.split(/[\s,/-]/)[0].slice(0, 10) : 'Campo'
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;text-align:center;">
      <div style="
        background:#ea580c;width:${size}px;height:${size}px;
        border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        border:${selecionado ? '3px solid white' : '2px solid white'};
        box-shadow:${selecionado ? '0 0 0 3px #ea580c, 0 4px 12px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.35)'};
        display:flex;align-items:center;justify-content:center;
      "><span style="transform:rotate(45deg);font-size:${selecionado ? 20 : 16}px;line-height:1;">🚧</span></div>
      <div style="
        position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);
        background:rgba(234,88,12,0.9);color:white;font-size:8px;padding:1px 4px;
        border-radius:3px;white-space:nowrap;font-family:sans-serif;font-weight:700;
      ">${primeiroNome}</div>
    </div>`,
    iconSize: [size, size + 18],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -(size + 4)],
  })
}

// ── Tipos ───────────────────────────────────────────────────────
interface EquipamentoCampoMapa {
  id: number
  material_nome: string | null
  latitude: number | null
  longitude: number | null
  rua: string | null
  bairro: string | null
  observacao: string | null
  status: string
}

interface Props {
  ocorrencias: Ocorrencia[]
  onSelecionar: (o: Ocorrencia) => void
  /** Destino vindo de fora (ex: "Traçar rota de resgate" do SOS). Quando definido,
   *  o mapa centraliza no ponto e calcula a rota automaticamente.
   *  Quando soMostrar=true, apenas centraliza no ponto sem traçar rota. */
  destinoExterno?: { lat: number; lng: number; nome?: string; soMostrar?: boolean } | null
  /** Callback chamado depois que o destinoExterno foi consumido — para limpar no pai. */
  onDestinoExternoConsumido?: () => void
  /** Equipamentos em campo para exibir no mapa. */
  equipamentosCampo?: EquipamentoCampoMapa[]
  /** Abre o detalhe de um equipamento em campo no Patrimônio. */
  onVerDetalheCampo?: (equipId: number) => void
}

interface CamadaOcorrenciasProps {
  ocorrencias: Ocorrencia[]
  naturezasOcultas: Set<string>
  selecionadaId: number | undefined
  onSelecionar: (ocorrencia: Ocorrencia) => void
}

/**
 * Mantém os marcadores fora da árvore React.
 *
 * Antes, cada movimento do mapa alterava estado e desmontava todos os
 * <Marker>. Em celulares isso causava o sumiço dos ícones e uma sequência
 * pesada de criação de DOM. O MarkerClusterGroup mantém os marcadores no
 * Leaflet, atualizando somente o agrupamento necessário no zoom.
 */
function CamadaOcorrencias({
  ocorrencias,
  naturezasOcultas,
  selecionadaId,
  onSelecionar,
}: CamadaOcorrenciasProps) {
  const map = useMap()
  const onSelecionarRef = useRef(onSelecionar)
  const marcadoresRef = useRef(new Map<number, {
    marker: L.Marker
    natureza: string
    semGps: boolean
  }>())
  onSelecionarRef.current = onSelecionar

  useEffect(() => {
    const grupo = L.markerClusterGroup({
      maxClusterRadius: (zoom) => zoom >= 15 ? 36 : 52,
      disableClusteringAtZoom: 16,
      chunkedLoading: true,
      animate: false,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      removeOutsideVisibleBounds: true,
      iconCreateFunction: (cluster) => {
        const total = cluster.getChildCount()
        const tamanho = total > 99 ? 44 : total > 9 ? 40 : 36
        return L.divIcon({
          className: 'ocorrencias-cluster',
          html: `<span>${total > 999 ? '999+' : total}</span>`,
          iconSize: [tamanho, tamanho],
          iconAnchor: [tamanho / 2, tamanho / 2],
        })
      },
    }).addTo(map)

    const marcadores = ocorrencias
      .filter((ocorrencia) => !naturezasOcultas.has(ocorrencia.natureza))
      .map((ocorrencia) => {
        const temGps = ocorrencia.lat != null && ocorrencia.lng != null
        const posicao: [number, number] = temGps
          ? [ocorrencia.lat!, ocorrencia.lng!]
          : coordsSemGps(ocorrencia.id)
        const marcador = L.marker(posicao, {
          icon: getIconeCache(ocorrencia.natureza, false, !temGps),
          title: ocorrencia.natureza,
        })
        marcador.on('click', (evento) => {
          L.DomEvent.stopPropagation(evento)
          onSelecionarRef.current(ocorrencia)
        })
        return marcador
      })

    marcadoresRef.current = new Map(
      ocorrencias
        .filter((ocorrencia) => !naturezasOcultas.has(ocorrencia.natureza))
        .map((ocorrencia, indice) => {
          const marcador = marcadores[indice]
          return [
            ocorrencia.id,
            {
              marker: marcador,
              natureza: ocorrencia.natureza,
              semGps: ocorrencia.lat == null || ocorrencia.lng == null,
            },
          ]
        }),
    )
    grupo.addLayers(marcadores)
    return () => {
      grupo.clearLayers()
      map.removeLayer(grupo)
      marcadoresRef.current.clear()
    }
  }, [map, ocorrencias, naturezasOcultas])

  useEffect(() => {
    for (const [id, dados] of marcadoresRef.current) {
      dados.marker.setIcon(getIconeCache(dados.natureza, selecionadaId === id, dados.semGps))
    }
  }, [selecionadaId])

  return null
}

interface DispositivoRemoto {
  id: string
  nome: string
  lat: number
  lng: number
  precisao: number
  velocidade: number | null
  ultimaVez: number
  indice: number
}

type StatusGps = 'inativo' | 'aguardando' | 'ativo' | 'erro'
type StatusOffline = 'idle' | 'baixando' | 'concluido' | 'erro'
type StatusWs = 'desconectado' | 'conectando' | 'conectado'
type CamadaMapa = 'padrao' | 'satelite'
type CamadaMonitoramentoId = string | null


function nomeDiaSemana(dateStr: string): string {
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const d = new Date(dateStr + 'T12:00:00')
  return dias[d.getDay()]
}

const OURO_BRANCO: [number, number] = [-20.5195, -43.6983]
const RAIO_RADAR_CHUVA_METROS = 10_000

const MAX_TRILHA = 300

// ── Componente principal ────────────────────────────────────────
export default function MapaOcorrencias({ ocorrencias, onSelecionar, destinoExterno, onDestinoExternoConsumido, equipamentosCampo = [], onVerDetalheCampo }: Props) {
  const [selecionada, setSelecionada] = useState<Ocorrencia | null>(null)
  const [legendaAberta, setLegendaAberta] = useState(false)
  const [camadaMapa, setCamadaMapa] = useState<CamadaMapa>('padrao')
  const [camadaMonitoramento, setCamadaMonitoramento] = useState<CamadaMonitoramentoId>(null)
  const [painelMonitoramentoAberto, setPainelMonitoramentoAberto] = useState(false)
  const [mostrarChuva, setMostrarChuva] = useState(false)
  const [painelChuvaAberto, setPainelChuvaAberto] = useState(false)
  const [radarChuva, setRadarChuva] = useState<DadosRadarChuva | null>(null)
  const [indiceQuadroRadar, setIndiceQuadroRadar] = useState(0)
  const [radarAnimando, setRadarAnimando] = useState(true)
  const [chuvaNoPonto, setChuvaNoPonto] = useState<ChuvaNoPonto | null>(null)
  const [chuvaOntem, setChuvaOntem] = useState<ResumoChuvaOntem | null>(null)
  const [radarChuvaCarregando, setRadarChuvaCarregando] = useState(false)
  const [radarChuvaErro, setRadarChuvaErro] = useState<string | null>(null)
  const [mostrarOcorrencias, setMostrarOcorrencias] = useState(false)
  const [mostrarMateriais, setMostrarMateriais] = useState(false)
  const [painelMaterialAberto, setPainelMaterialAberto] = useState(false)
  const [submenuFiltroAberto, setSubmenuFiltroAberto] = useState(false)
  const [naturezasOcultas, setNaturezasOcultas] = useState<Set<string>>(new Set())

  // Busca de endereço + rota (estilo Google Maps)
  const [enderecoBusca, setEnderecoBusca] = useState('')
  const [resultadosBusca, setResultadosBusca] = useState<Array<{ display: string; lat: number; lng: number }>>([])
  const [buscandoEndereco, setBuscandoEndereco] = useState(false)
  const [destino, setDestino] = useState<{ lat: number; lng: number; nome: string } | null>(null)
  const [rota, setRota] = useState<[number, number][]>([])
  const [rotaInfo, setRotaInfo] = useState<{ km: number; min: number } | null>(null)
  const [calculandoRota, setCalculandoRota] = useState(false)

  // GPS local
  const [statusGps, setStatusGps] = useState<StatusGps>('inativo')
  const [erroGps, setErroGps] = useState<string | null>(null)
  const [posicaoAtual, setPosicaoAtual] = useState<[number, number] | null>(null)
  const [precisao, setPrecisao] = useState<number>(0)
  const [velocidade, setVelocidade] = useState<number | null>(null)
  const [trilha, setTrilha] = useState<[number, number][]>([])
  const [seguir, setSeguir] = useState(true)
  const watchIdRef = useRef<number | null>(null)

  // Dispositivos remotos (outros celulares)
  const [dispositivos, setDispositivos] = useState<Map<string, DispositivoRemoto>>(new Map())
  const [statusWs, setStatusWs] = useState<StatusWs>('desconectado')
  const [painelEquipesAberto, setPainelEquipesAberto] = useState(false)
  const wsConectadoRef = useRef(false) // tracks if WS has connected at least once
  const ultimaPosicaoRef = useRef<{ lat: number; lng: number; precisao: number; velocidade: number | null } | null>(null)
  const proxIndiceRef = useRef(0)
  const indicesRef = useRef<Map<string, number>>(new Map())

  // Nome e ID do dispositivo local — usa o agente escolhido no login da sessão
  const [nomeLocal] = useState(() => getNomeAgente())
  const nomeLocalRef = useRef(nomeLocal)
  const dispositivoId = useRef(getDispositivoId())


  // Focos de incêndio (NASA FIRMS + Earth Engine — somente fogo ativo)
  const [focosIncendio, setFocosIncendio] = useState<FocoIncendio[]>([])
  const [mostrarFocos, setMostrarFocos] = useState(false)
  const [focosConfigurado, setFocosConfigurado] = useState<boolean | null>(null)
  const [focosFontes, setFocosFontes] = useState<string[]>([])
  const [focosAtualizadoEm, setFocosAtualizadoEm] = useState<string | null>(null)
  const [focosCarregando, setFocosCarregando] = useState(false)
  const [focosMonitoramento, setFocosMonitoramento] = useState<{
    firms: boolean
    earthEngine?: { configurado?: boolean; erro?: string | null }
    catalogo?: FonteMonitoramento[]
  } | null>(null)
  const [alertaFocosVisto, setAlertaFocosVisto] = useState(false)
  const [monitoramentoEE, setMonitoramentoEE] = useState<{
    configurado: boolean
    camadas: CamadaMonitoramento[]
    indicadores: IndicadorMonitoramento[]
    erros: string[]
    semDados?: Array<{ id: string; nome: string; periodo?: string }>
    atualizadoEm?: string
    periodo?: { inicio: string; fim: string }
  } | null>(null)
  const [monitoramentoCarregando, setMonitoramentoCarregando] = useState(false)

  // ── Chuva ao vivo — RainViewer + resumo do ponto central ─────────
  const buscarRadarChuva = useCallback(async () => {
    setRadarChuvaCarregando(true)
    setRadarChuvaErro(null)
    const agora = Date.now()
    const [resultadoRadar, resultadoTempo] = await Promise.allSettled([
      fetch(`/api/radar-chuva?_ts=${agora}`, { cache: 'no-store' }),
      fetch(`/api/tempo?_ts=${agora}`, { cache: 'no-store' }),
    ])

    let radarAtualizado = false
    if (resultadoRadar.status === 'fulfilled' && resultadoRadar.value.ok) {
      setRadarChuva(await resultadoRadar.value.json())
      setIndiceQuadroRadar(0)
      setRadarAnimando(true)
      radarAtualizado = true
    } else {
      setRadarChuvaErro('Radar ao vivo indisponível; exibindo a estimativa local.')
    }

    if (resultadoTempo.status === 'fulfilled' && resultadoTempo.value.ok) {
      const dadosTempo = await resultadoTempo.value.json()
      setChuvaOntem(dadosTempo?.ontem || null)
      const precipitacaoAtual = Number(dadosTempo?.atual?.precipitacao)
      const horas = Array.isArray(dadosTempo?.horas) ? dadosTempo.horas : []
      const maisProxima = horas
        .filter((hora: { time?: string }) => hora?.time)
        .sort((a: { time: string }, b: { time: string }) => (
          Math.abs(new Date(a.time).getTime() - agora) - Math.abs(new Date(b.time).getTime() - agora)
        ))[0]
      setChuvaNoPonto(Number.isFinite(precipitacaoAtual)
        ? {
            precipitacao: precipitacaoAtual,
            fonte: 'condição atual no ponto central',
          }
        : {
            precipitacao: Number.isFinite(Number(maisProxima?.precipitacao))
              ? Number(maisProxima.precipitacao)
              : null,
            fonte: 'previsão horária mais próxima',
          })
    }

    if (radarAtualizado) setRadarChuvaErro(null)
    setRadarChuvaCarregando(false)
  }, [])

  useEffect(() => {
    if (!mostrarChuva) return
    buscarRadarChuva()
    const intervalo = setInterval(buscarRadarChuva, 5 * 60 * 1000)
    const atualizarAoVoltar = () => {
      if (document.visibilityState === 'visible') buscarRadarChuva()
    }
    document.addEventListener('visibilitychange', atualizarAoVoltar)
    return () => {
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', atualizarAoVoltar)
    }
  }, [mostrarChuva, buscarRadarChuva])

  const quadrosRadar = useMemo<QuadroRadarChuva[]>(() => {
    if (!radarChuva) return []
    if (Array.isArray(radarChuva.quadros) && radarChuva.quadros.length > 0) {
      return radarChuva.quadros
    }
    return [{
      path: radarChuva.path,
      frameTime: radarChuva.frameTime,
      tipoQuadro: radarChuva.tipoQuadro || 'observado',
    }]
  }, [radarChuva])

  const quadroRadarAtual = quadrosRadar[indiceQuadroRadar] || quadrosRadar.at(-1) || null

  useEffect(() => {
    if (!mostrarChuva || !radarAnimando || quadrosRadar.length < 2) return
    const intervalo = setInterval(() => {
      setIndiceQuadroRadar(indice => (indice + 1) % quadrosRadar.length)
    }, 900)
    return () => clearInterval(intervalo)
  }, [mostrarChuva, radarAnimando, quadrosRadar.length])

  // Mapa offline — inicializa tiles do localStorage para mostrar status imediatamente
  const [statusOffline, setStatusOffline] = useState<StatusOffline>('idle')
  const [progressoMapa, setProgressoMapa] = useState<ProgressoMapa | null>(null)
  const [tilesCacheados, setTilesCacheados] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('dc_tiles_count') || '0') || 0 } catch { return 0 }
  })
  const [painelOfflineAberto, setPainelOfflineAberto] = useState(false)

  // Malha viária offline (ruas + roteamento local) — inicializa do localStorage
  const [malhaInfo, setMalhaInfo] = useState<{ baixada: boolean; bytes: number }>(() => {
    try {
      const s = localStorage.getItem('dc_malha_info')
      return s ? JSON.parse(s) : { baixada: false, bytes: 0 }
    } catch { return { baixada: false, bytes: 0 } }
  })
  const [statusMalha, setStatusMalha] = useState<'idle' | 'baixando' | 'concluido' | 'erro'>('idle')
  const [progressoMalha, setProgressoMalha] = useState<ProgressoMalha | null>(null)

  // Mantém ref sempre atualizada com o nome atual
  useEffect(() => { nomeLocalRef.current = nomeLocal }, [nomeLocal])


  // ── Focos de Incêndio (NASA FIRMS + Earth Engine) ─────────────
  const buscarFocos = useCallback(async () => {
    setFocosCarregando(true)
    try {
      const focosUrl = import.meta.env.VITE_FOCOS_API_URL || '/api/focos-incendio'
      const separador = focosUrl.includes('?') ? '&' : '?'
      const resp = await fetch(`${focosUrl}${separador}_ts=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!resp.ok) return
      const data = await resp.json()
      setFocosConfigurado(data.configurado ?? false)
      if (Array.isArray(data.fontes)) setFocosFontes(data.fontes)
      if (data.atualizadoEm) setFocosAtualizadoEm(data.atualizadoEm)
      if (data.fontesMonitoramento) setFocosMonitoramento(data.fontesMonitoramento)
      if (Array.isArray(data.focos)) {
        setFocosIncendio(data.focos)
        if (data.focos.length > 0) setAlertaFocosVisto(false)
      }
    } catch { /* ignora */ }
    finally {
      setFocosCarregando(false)
    }
  }, [])

  const visualizarFocos = useCallback(async () => {
    setMostrarFocos(true)
    setAlertaFocosVisto(true)
    await buscarFocos()
  }, [buscarFocos])

  // ── Análise ambiental do Earth Engine ─────────────────────────
  const buscarMonitoramento = useCallback(async () => {
    setMonitoramentoCarregando(true)
    try {
      // Usa a rota pública para funcionar no Replit e no Netlify.
      const resp = await fetch(`/api/monitoramento-incendio?_ts=${Date.now()}`, {
        cache: 'no-store',
      })
      if (!resp.ok) return
      const data = await resp.json()
      setMonitoramentoEE({
        ...data,
        camadas: Array.isArray(data.camadas) ? data.camadas : [],
        indicadores: Array.isArray(data.indicadores) ? data.indicadores : [],
        erros: Array.isArray(data.erros) ? data.erros : [],
      })
    } catch {
      setMonitoramentoEE(prev => prev ?? {
        configurado: false,
        camadas: [],
        indicadores: [],
        erros: ['Não foi possível consultar o Earth Engine'],
      })
    } finally {
      setMonitoramentoCarregando(false)
    }
  }, [])

  // Consultas ambientais são adiadas até o usuário abrir o painel. Elas não
  // devem bloquear a primeira interação com o mapa em uma rede móvel lenta.
  useEffect(() => {
    if (!painelMonitoramentoAberto) return

    void buscarFocos()
    void buscarMonitoramento()
    const intervaloFocos = setInterval(buscarFocos, 60 * 1000)
    const intervaloCamadas = setInterval(buscarMonitoramento, 10 * 60 * 1000)
    const atualizarAoVoltar = () => {
      if (document.visibilityState === 'visible') {
        void buscarFocos()
        void buscarMonitoramento()
      }
    }

    document.addEventListener('visibilitychange', atualizarAoVoltar)
    return () => {
      clearInterval(intervaloFocos)
      clearInterval(intervaloCamadas)
      document.removeEventListener('visibilitychange', atualizarAoVoltar)
    }
  }, [painelMonitoramentoAberto, buscarFocos, buscarMonitoramento])

  const comGeo = useMemo(() => ocorrencias.filter((o) => o.lat && o.lng), [ocorrencias])
  const semGeo = ocorrencias.length - comGeo.length

  // Mantém as ferramentas de fogo visíveis mesmo quando o Earth
  // Engine ainda não está autenticado. As URLs reais substituem o catálogo
  // assim que o endpoint retorna as camadas assinadas.
  const camadasMonitoramento = useMemo(() => {
    const reais = new Map((monitoramentoEE?.camadas ?? []).map(camada => [camada.id, camada]))
    const catalogo = new Map((focosMonitoramento?.catalogo ?? []).map(fonte => [fonte.id, fonte]))
    const principais = FERRAMENTAS_SATELITE.map(camada => ({
      ...camada,
      ...(reais.get(camada.id) ?? {}),
      ...(catalogo.get(camada.id) ?? {}),
      status: (reais.get(camada.id)?.url || catalogo.get(camada.id)?.disponivel)
        ? 'disponivel'
        : catalogo.has(camada.id) && !catalogo.get(camada.id)?.configuracaoNecessaria
          ? 'sem-dados'
          : 'aguardando',
    }))
    const extras = (monitoramentoEE?.camadas ?? []).filter(
      camada => !FERRAMENTAS_SATELITE.some(principal => principal.id === camada.id),
    )
    return [...principais, ...extras]
  }, [monitoramentoEE, focosMonitoramento])

  // Persiste contagem de tiles no localStorage para mostrar status entre recargas
  useEffect(() => {
    try { localStorage.setItem('dc_tiles_count', String(tilesCacheados)) } catch { /* ignora */ }
  }, [tilesCacheados])

  // Persiste info da malha no localStorage
  useEffect(() => {
    try { localStorage.setItem('dc_malha_info', JSON.stringify(malhaInfo)) } catch { /* ignora */ }
  }, [malhaInfo])

  // Verifica tiles: ao mudar statusOffline e também quando o SW ficar pronto
  useEffect(() => {
    obterInfoCacheMapa().then(setTilesCacheados).catch(() => {})
  }, [statusOffline])

  // Verifica ao montar — aguarda SW controller disponível para leitura correta
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const verificar = () => {
      obterInfoCacheMapa().then(n => { if (n > 0) setTilesCacheados(n) }).catch(() => {})
      obterInfoMalhaViaria().then(info => {
        if (info.baixada) setMalhaInfo(info)
      }).catch(() => {})
    }
    if (navigator.serviceWorker.controller) {
      verificar()
    } else {
      navigator.serviceWorker.ready.then(verificar).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Carrega info da malha viária (e pré-aquece em segundo plano)
  useEffect(() => {
    obterInfoMalhaViaria()
      .then((info) => {
        setMalhaInfo(info)
        if (info.baixada) preAquecerMalha()
      })
      .catch(() => {})
  }, [statusMalha])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelecionada(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── WebSocket — Rastreamento em tempo real ───────────────────────
  const getIndice = useCallback((id: string) => {
    if (!indicesRef.current.has(id)) {
      indicesRef.current.set(id, proxIndiceRef.current++)
    }
    return indicesRef.current.get(id)!
  }, [])

  useEffect(() => {
    setStatusWs('conectando')

    const offPosicao = wsOn('posicao', (msg) => {
      wsConectadoRef.current = true
      setStatusWs('conectado')
      const id = msg.id as string
      if (!id || id === dispositivoId.current) return
      const lat = msg.lat as number | null
      const lng = msg.lng as number | null
      if (lat == null || lng == null) return
      setDispositivos(prev => {
        const next = new Map(prev)
        next.set(id, {
          id,
          nome: (msg.nome as string) || `Equipe ${id}`,
          lat,
          lng,
          precisao: (msg.precisao as number) ?? 0,
          velocidade: (msg.velocidade as number | null) ?? null,
          ultimaVez: Date.now(),
          indice: getIndice(id),
        })
        return next
      })
    })

    const offPosicoes = wsOn('posicoes_iniciais', (msg) => {
      wsConectadoRef.current = true
      setStatusWs('conectado')
      const posicoes = msg.posicoes as Array<{
        id: string; nome: string; lat: number; lng: number; precisao: number; velocidade: number | null
      }>
      if (!Array.isArray(posicoes)) return
      setDispositivos(() => {
        const next = new Map<string, DispositivoRemoto>()
        for (const p of posicoes) {
          if (p.id === dispositivoId.current) continue
          next.set(p.id, {
            id: p.id,
            nome: p.nome || `Equipe ${p.id}`,
            lat: p.lat,
            lng: p.lng,
            precisao: p.precisao ?? 0,
            velocidade: p.velocidade ?? null,
            ultimaVez: Date.now(),
            indice: getIndice(p.id),
          })
        }
        return next
      })
    })

    const offRemover = wsOn('remover', (msg) => {
      const id = msg.id as string
      if (!id) return
      setDispositivos(prev => {
        const next = new Map(prev)
        next.delete(id)
        return next
      })
    })

    // Sempre que o WS abre (inclusive depois de reconectar):
    //  1. Pede o estado atual ao servidor — assim, mesmo que o mapa seja
    //     aberto DEPOIS que o WS já tinha conectado, o agente recebe as
    //     posições atuais dos demais imediatamente.
    //  2. Reenvia a própria última posição conhecida, garantindo que os
    //     outros agentes voltem a ver o marcador após uma queda curta de rede
    //     (o servidor faz broadcast de "remover" no fechamento da conexão).
    const offOpen = wsOnOpen(() => {
      setStatusWs('conectado')
      wsConectadoRef.current = true
      wsSend({ tipo: 'solicitar_estado' })
      const ultima = ultimaPosicaoRef.current
      if (ultima) {
        wsSend({
          tipo: 'posicao',
          id: dispositivoId.current,
          nome: nomeLocalRef.current,
          lat: ultima.lat,
          lng: ultima.lng,
          precisao: ultima.precisao,
          velocidade: ultima.velocidade,
        })
      }
    })

    return () => {
      offPosicao()
      offPosicoes()
      offRemover()
      offOpen()
    }
  }, [getIndice])

  // ── Anti-fantasma: varredura periódica ───────────────────────────
  // Mesmo que o broadcast 'gps-off' falhe (rede ruim, app crashou, bateria
  // morreu), qualquer dispositivo cujo último heartbeat tenha mais de 10s
  // some do mapa. O heartbeat de `gpsService` reenvia a posição a cada 5s,
  // então o limite de 10s dá uma margem de uma atualização perdida.
  useEffect(() => {
    const TTL = 10_000
    const interval = setInterval(() => {
      setDispositivos(prev => {
        const agora = Date.now()
        let mudou = false
        const next = new Map(prev)
        for (const [id, d] of prev) {
          if (agora - d.ultimaVez > TTL) {
            next.delete(id)
            mudou = true
          }
        }
        return mudou ? next : prev
      })
    }, 3_000)
    return () => clearInterval(interval)
  }, [])

  const enviarPosicao = useCallback((lat: number, lng: number, prec: number, vel: number | null) => {
    ultimaPosicaoRef.current = { lat, lng, precisao: prec, velocidade: vel }
    wsSend({
      tipo: 'posicao',
      id: dispositivoId.current,
      nome: nomeLocalRef.current,
      lat, lng,
      precisao: prec,
      velocidade: vel,
    })
  }, [])

  // ── GPS (via gpsService global) ───────────────────────────────
  // O GPS vive num singleton fora deste componente — assim continua ativo
  // mesmo quando o agente troca pra aba "Lista" ou "Checklist". Aqui só
  // espelhamos o estado do serviço para a UI do mapa.
  useEffect(() => {
    const off = subscribeGps((est) => {
      setStatusGps(est.status)
      setErroGps(est.erro)
      if (est.posicao) {
        const coords: [number, number] = [est.posicao.lat, est.posicao.lng]
        setPosicaoAtual(coords)
        setPrecisao(est.posicao.precisao)
        setVelocidade(est.posicao.velocidade)
        // Trilha: só adiciona ponto se moveu mais de 3 metros
        setTrilha((prev) => {
          if (prev.length > 0) {
            const ultimo = prev[prev.length - 1]
            const distM = distanciaKm(ultimo[0], ultimo[1], coords[0], coords[1]) * 1000
            if (distM < 3) return prev
          }
          const nova = [...prev, coords]
          return nova.length > MAX_TRILHA ? nova.slice(nova.length - MAX_TRILHA) : nova
        })
        ultimaPosicaoRef.current = {
          lat: est.posicao.lat,
          lng: est.posicao.lng,
          precisao: est.posicao.precisao,
          velocidade: est.posicao.velocidade,
        }
      } else if (est.status === 'inativo') {
        setPosicaoAtual(null)
        setTrilha([])
        setVelocidade(null)
        setSeguir(true)
        ultimaPosicaoRef.current = null
      }
    })
    return off
  }, [])

  function toggleGps() {
    const est = getEstadoGps()
    if (est.status === 'ativo' || est.status === 'aguardando') desativarGpsGlobal()
    else ativarGpsGlobal()
  }

  // ── Mapa offline ──────────────────────────────────────────────
  async function iniciarDownloadMapa() {
    if (statusOffline === 'baixando') return
    setStatusOffline('baixando')
    setProgressoMapa(null)
    try {
      // Tiles num raio de 10 km do centro de Ouro Branco, zooms 11..17
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

  // ── Malha viária offline (ruas + roteamento Dijkstra local) ───
  async function iniciarDownloadMalha() {
    if (statusMalha === 'baixando') return
    setStatusMalha('baixando')
    setProgressoMalha(null)
    try {
      await baixarMalhaViariaOffline((p) => {
        setProgressoMalha(p)
        if (p.status === 'concluido') setStatusMalha('concluido')
      })
      // Recarrega o índice em memória com a nova malha
      descartarMalhaEmMemoria()
      preAquecerMalha()
    } catch {
      setStatusMalha('erro')
    }
  }

  // ── Busca de endereço (autocomplete offline-first) ──────────────
  // Estratégia:
  //   1. Busca local na malha viária baixada (instantâneo, offline)
  //   2. Em paralelo, se online, consulta o Nominatim direto (sem proxy)
  //      restringindo o viewbox a ~12 km ao redor de Ouro Branco
  //   3. Mescla resultados (locais primeiro, sem duplicatas)
  const buscaTokenRef = useRef(0)
  const buscarEndereco = useCallback(async (texto: string) => {
    const q = texto.trim()
    const meuToken = ++buscaTokenRef.current
    if (q.length < 2) { setResultadosBusca([]); setBuscandoEndereco(false); return }
    setBuscandoEndereco(true)

    // 1. Local (offline-first)
    let locais: Array<{ display: string; lat: number; lng: number }> = []
    try {
      const ruas = await buscarRuas(q, 8)
      locais = ruas.map((r) => ({ display: r.display, lat: r.lat, lng: r.lng }))
    } catch { /* ignora */ }

    if (meuToken !== buscaTokenRef.current) return

    // Se já tem resultados locais bons, mostra imediatamente enquanto a rede
    // ainda está completando — UX mais responsiva.
    if (locais.length > 0) setResultadosBusca(locais)

    // 2. Nominatim direto (chama de fora porque em produção não há proxy)
    if (navigator.onLine) {
      try {
        // Viewbox: ~12 km ao redor de Ouro Branco (-20.5195, -43.6983)
        // Formato Nominatim: lonMin,latMax,lonMax,latMin (canto NW e SE)
        const viewbox = '-43.81,-20.41,-43.58,-20.63'
        const queryFinal = /ouro branco|mg|minas/i.test(q) ? q : `${q}, Ouro Branco, MG, Brasil`
        // Detecta se a query parece "rua + número" (ex.: "Rua das Flores, 123" ou "Av X 45")
        // Se sim, pede `addressdetails=1` para o Nominatim devolver o número do imóvel
        const temNumero = /\b\d{1,5}\b/.test(q)
        const url =
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryFinal)}` +
          `&format=json&limit=10&countrycodes=br&accept-language=pt-BR` +
          `&viewbox=${viewbox}&bounded=0&addressdetails=${temNumero ? 1 : 0}`
        const resp = await fetch(url, { headers: { 'Accept': 'application/json' } })
        if (meuToken !== buscaTokenRef.current) return
        if (resp.ok) {
          const data = await resp.json()
          const remotos: Array<{ display: string; lat: number; lng: number }> = (Array.isArray(data) ? data : [])
            .map((d: any) => ({
              display: String(d.display_name ?? ''),
              lat: parseFloat(d.lat),
              lng: parseFloat(d.lon),
            }))
            .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng))

          // Mescla: locais primeiro, depois remotos não duplicados (≥30 m)
          const out = [...locais]
          for (const r of remotos) {
            const existe = out.some(
              (o) => Math.abs(o.lat - r.lat) < 3e-4 && Math.abs(o.lng - r.lng) < 3e-4
            )
            if (!existe) out.push(r)
            if (out.length >= 10) break
          }
          if (meuToken === buscaTokenRef.current) setResultadosBusca(out)
        }
      } catch { /* offline ou bloqueado, mantém os locais */ }
    }

    if (meuToken === buscaTokenRef.current) setBuscandoEndereco(false)
  }, [])

  // Quando um destino é escolhido, o input passa a refletir o nome dele;
  // suprimimos o autocomplete enquanto o texto bater com o destino atual.
  const ignorarBuscaRef = useRef(false)
  // Debounce: dispara a busca 280 ms depois da última digitação
  useEffect(() => {
    const q = enderecoBusca.trim()
    if (q.length < 2) {
      setResultadosBusca([])
      setBuscandoEndereco(false)
      return
    }
    if (ignorarBuscaRef.current) {
      ignorarBuscaRef.current = false
      return
    }
    const t = setTimeout(() => buscarEndereco(q), 280)
    return () => clearTimeout(t)
  }, [enderecoBusca, buscarEndereco])

  // Calcula rota do ponto atual (GPS ou centro de Ouro Branco) até o destino.
  // Estratégia: tenta roteamento local (Dijkstra na malha baixada) primeiro
  // — funciona offline e é instantâneo. Se não houver malha, cai para
  // OSRM público; se também falhar, desenha linha reta como último recurso.
  const calcularRota = useCallback(async (origem: [number, number], dest: { lat: number; lng: number }) => {
    setCalculandoRota(true)
    try {
      // 1. Roteamento local (offline)
      if (await malhaDisponivel()) {
        const rotaLoc = await roteamentoLocal(
          { lat: origem[0], lng: origem[1] },
          { lat: dest.lat, lng: dest.lng }
        )
        if (rotaLoc && rotaLoc.coords.length >= 2) {
          setRota(rotaLoc.coords)
          setRotaInfo({ km: rotaLoc.km, min: rotaLoc.min })
          return
        }
      }

      // 2. OSRM público (online) — não exige nosso backend
      if (navigator.onLine) {
        try {
          const url = `https://router.project-osrm.org/route/v1/driving/${origem[1]},${origem[0]};${dest.lng},${dest.lat}?overview=full&geometries=geojson`
          const resp = await fetch(url)
          if (resp.ok) {
            const json = await resp.json()
            const r = json?.routes?.[0]
            if (r) {
              const coords = (r.geometry?.coordinates || []).map(
                ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
              )
              if (coords.length >= 2) {
                setRota(coords)
                setRotaInfo({ km: r.distance / 1000, min: Math.round(r.duration / 60) })
                return
              }
            }
          }
        } catch { /* segue p/ fallback */ }
      }

      // 3. Linha reta (último recurso)
      setRota([origem, [dest.lat, dest.lng]])
      const km = distanciaKm(origem[0], origem[1], dest.lat, dest.lng)
      setRotaInfo({ km, min: Math.round((km / 30) * 60) })
    } finally {
      setCalculandoRota(false)
    }
  }, [])

  function escolherDestino(r: { display: string; lat: number; lng: number }) {
    const dest = { lat: r.lat, lng: r.lng, nome: r.display }
    setDestino(dest)
    setResultadosBusca([])
    // Invalida buscas pendentes e suprime a próxima execução do debounce
    // para que o autocomplete não reabra a lista ao trocar o texto do input
    // para o nome do destino selecionado.
    buscaTokenRef.current++
    ignorarBuscaRef.current = true
    setEnderecoBusca(r.display.split(',')[0])
    const origem: [number, number] = posicaoAtual ?? OURO_BRANCO
    calcularRota(origem, dest)
  }

  function limparBuscaERota() {
    setDestino(null)
    setRota([])
    setRotaInfo(null)
    setEnderecoBusca('')
    setResultadosBusca([])
  }

  // Recalcula a rota se a posição GPS mudar enquanto há um destino ativo
  useEffect(() => {
    if (!destino) return
    if (!posicaoAtual) return
    // Recalcula a cada movimento significativo (>50m) para evitar flood
    const ultimoPonto = rota[0]
    if (ultimoPonto) {
      const d = distanciaKm(ultimoPonto[0], ultimoPonto[1], posicaoAtual[0], posicaoAtual[1]) * 1000
      if (d < 50) return
    }
    calcularRota(posicaoAtual, destino)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posicaoAtual?.[0], posicaoAtual?.[1], destino])

  // Quando o pai envia um destino externo (botão "Traçar rota de resgate" do SOS),
  // posiciona o pino, traça a rota a partir da posição GPS atual (ou do centro de
  // Ouro Branco como fallback) e avisa o pai que já consumiu o destino.
  // Quando soMostrar=true (botão "Ver no Mapa" de equipamento em campo), apenas
  // centraliza no ponto sem calcular rota.
  useEffect(() => {
    if (!destinoExterno) return
    const dest = {
      lat: destinoExterno.lat,
      lng: destinoExterno.lng,
      nome: destinoExterno.nome || (destinoExterno.soMostrar ? 'Equipamento em Campo' : 'Local do SOS'),
    }
    setDestino(dest)
    setEnderecoBusca(dest.nome)
    setResultadosBusca([])
    buscaTokenRef.current++
    ignorarBuscaRef.current = true
    if (destinoExterno.soMostrar) {
      setRota([])
      setRotaInfo(null)
    } else {
      const origem: [number, number] = posicaoAtual ?? OURO_BRANCO
      calcularRota(origem, dest)
    }
    onDestinoExternoConsumido?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinoExterno?.lat, destinoExterno?.lng])

  // ── Misc ──────────────────────────────────────────────────────
  function selecionarOc(o: Ocorrencia) {
    setSelecionada((prev) => (prev?.id === o.id ? null : o))
  }

  function alternarNatureza(n: string) {
    setNaturezasOcultas(prev => {
      const novo = new Set(prev)
      if (novo.has(n)) novo.delete(n); else novo.add(n)
      return novo
    })
  }

  function direcaoVento(graus: number | null): string {
    if (graus == null) return '–'
    const dirs = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO']
    return dirs[Math.round(graus / 45) % 8]
  }

  const naturezasUnicas = useMemo(() => [...new Set(comGeo.map((o) => o.natureza))], [comGeo])
  const velocidadeKmh = useMemo(
    () => velocidade != null ? Math.round(velocidade * 3.6) : null,
    [velocidade]
  )
  const porcentagem = useMemo(
    () => progressoMapa && progressoMapa.total > 0
      ? Math.round((progressoMapa.concluido / progressoMapa.total) * 100) : 0,
    [progressoMapa]
  )
  const dispositivosArray = useMemo(() => Array.from(dispositivos.values()), [dispositivos])
  const totalOnline = dispositivosArray.length + (statusGps === 'ativo' ? 1 : 0)

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="mapa-wrapper">
      <MapContainer
        center={OURO_BRANCO}
        zoom={13}
        minZoom={11}
        // O mapa pode ser arrastado livremente para consultar outras regiões.
        dragging={true}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
        whenReady={() => {}}
      >
        {camadaMapa === 'padrao' && !mostrarChuva ? (
          <TileLayer
            key="mapa-padrao"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            subdomains={['a', 'b', 'c']}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={19}
            keepBuffer={2}
            updateWhenZooming={false}
            updateWhenIdle={true}
          />
        ) : (
          <TileLayer
            key="mapa-satelite"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution='Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics'
            maxZoom={19}
            keepBuffer={2}
            updateWhenZooming={false}
            updateWhenIdle={true}
          />
        )}
        {camadaMonitoramento && camadasMonitoramento.find(c => c.id === camadaMonitoramento)?.url && (
          <TileLayer
            key={`earth-engine-${camadaMonitoramento}`}
            url={camadasMonitoramento.find(c => c.id === camadaMonitoramento)!.url!}
            opacity={0.62}
            attribution="Dados ambientais: Google Earth Engine"
            maxZoom={18}
            zIndex={10}
          />
        )}
        {mostrarChuva && <CamadaNuvensGoes enabled={mostrarChuva} />}
        {mostrarChuva && radarChuva && quadroRadarAtual && (
          <RadarChuvaPoligonos
            path={quadroRadarAtual.path}
            frameTime={quadroRadarAtual.frameTime}
            enabled={mostrarChuva}
          />
        )}
        {mostrarChuva && (
          <Circle
            center={OURO_BRANCO}
            radius={RAIO_RADAR_CHUVA_METROS}
            pathOptions={{
              color: '#1d4ed8',
              weight: 2,
              opacity: 0.95,
              dashArray: '7 5',
              fillColor: '#60a5fa',
              fillOpacity: 0.04,
            }}
          >
            <Popup>
              <strong>Área de observação da chuva</strong>
              <br />
              Raio de 10 km a partir do centro de Ouro Branco
            </Popup>
          </Circle>
        )}
        {mostrarChuva && (
          <CircleMarker
            center={OURO_BRANCO}
            radius={5}
            pathOptions={{
              color: '#0f172a',
              weight: 2,
              fillColor: '#f8fafc',
              fillOpacity: 1,
            }}
          >
            <Popup>
              <strong>Centro de Ouro Branco</strong>
              <br />
              Ponto usado para consultar a precipitação local.
            </Popup>
          </CircleMarker>
        )}

        <MapClickHandler onMapClick={() => setSelecionada(null)} />
        {mostrarOcorrencias && (
          <CamadaOcorrencias
            ocorrencias={ocorrencias}
            naturezasOcultas={naturezasOcultas}
            selecionadaId={selecionada?.id}
            onSelecionar={selecionarOc}
          />
        )}

        {/* Trilha GPS local */}
        {trilha.length >= 2 && (
          <Polyline
            positions={trilha}
            pathOptions={{ color: '#1a4b8c', weight: 4, opacity: 0.65, dashArray: '6 4' }}
          />
        )}

        {/* Círculo de precisão local */}
        {posicaoAtual && precisao > 0 && (
          <Circle
            center={posicaoAtual}
            radius={precisao}
            pathOptions={{ color: '#1a4b8c', fillColor: '#1a4b8c', fillOpacity: 0.08, weight: 1.5, opacity: 0.4 }}
          />
        )}

        {/* Marcador da viatura local */}
        {posicaoAtual && (
          <>
            <CircleMarker
              center={posicaoAtual}
              radius={22}
              pathOptions={{ color: '#1a4b8c', fillColor: 'rgba(26,75,140,0.18)', weight: 2, fillOpacity: 1 }}
            />
            <Marker position={posicaoAtual} icon={criarIconeAgente(nomeLocal, '#1a4b8c')} zIndexOffset={1000}>
              <Popup>
                <div style={{ minWidth: 155, fontFamily: 'inherit' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 2 }}>🧑 {nomeLocal} (você)</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Precisão: ±{Math.round(precisao)} m</div>
                  {velocidadeKmh !== null && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Velocidade: {velocidadeKmh} km/h</div>
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

        {/* Marcadores dos outros dispositivos */}
        {dispositivosArray.map((d) => {
          const cor = corParaDispositivo(d.id, d.indice)
          const velKmh = d.velocidade != null ? Math.round(d.velocidade * 3.6) : null
          const segsAtras = Math.round((Date.now() - d.ultimaVez) / 1000)
          return (
            <Marker
              key={d.id}
              position={[d.lat, d.lng]}
              icon={criarIconeAgente(d.nome, cor)}
              zIndexOffset={900}
            >
              <Popup>
                <div style={{ minWidth: 155, fontFamily: 'inherit' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 2, color: cor }}>
                    🧑 {d.nome}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    Precisão: ±{Math.round(d.precisao)} m
                  </div>
                  {velKmh !== null && (
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Velocidade: {velKmh} km/h</div>
                  )}
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>
                    {d.lat.toFixed(6)}, {d.lng.toFixed(6)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#d1d5db', marginTop: 2 }}>
                    Atualizado há {segsAtras}s
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* Rota até o destino buscado */}
        {rota.length >= 2 && (
          <Polyline
            positions={rota}
            pathOptions={{ color: '#2563eb', weight: 6, opacity: 0.85 }}
          />
        )}

        {/* Pino do destino buscado */}
        {destino && (
          <Marker position={[destino.lat, destino.lng]} icon={criarIconeDestino()} zIndexOffset={2000}>
            <Popup>
              <div style={{ minWidth: 180, fontFamily: 'inherit' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 4 }}>📍 Destino</div>
                <div style={{ fontSize: '0.78rem', color: '#374151', marginBottom: 6 }}>{destino.nome}</div>
                {rotaInfo && (
                  <div style={{ fontSize: '0.78rem', color: '#1e40af', fontWeight: 700 }}>
                    🚗 {rotaInfo.km.toFixed(1)} km · ⏱ {rotaInfo.min} min
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )}

        {destino && <FocoDestino destino={destino} rota={rota} />}

        {/* Focos de incêndio — NASA FIRMS + Earth Engine (fogo ativo) */}
        {mostrarFocos && focosIncendio.map((f, i) => {
          const fonte = f.fonte || ''
          const isGoes = fonte === 'GOES'
          const isEarthEngine = fonte.startsWith('EARTH-ENGINE-')
          const corTitulo = isGoes ? '#b45309' : isEarthEngine ? '#7c2d12' : '#dc2626'
          return (
            <Marker
              key={`fogo-${i}`}
              position={[f.lat, f.lng]}
              icon={criarIconeFogo(f.confidence, f.fonte)}
              zIndexOffset={1500}
            >
              <Popup>
                <div style={{ minWidth: 200, fontFamily: 'inherit' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: corTitulo, marginBottom: 4 }}>
                    🔥 Foco de Incêndio
                  </div>
                  <div style={{ fontSize: '0.72rem', background: isGoes ? '#fef3c7' : '#fee2e2',
                    color: isGoes ? '#92400e' : '#991b1b', borderRadius: 5, padding: '2px 7px',
                    display: 'inline-block', marginBottom: 6, fontWeight: 600 }}>
                    {isEarthEngine
                      ? `🛰️ ${f.satelite || 'Multissatélite'} / Earth Engine — fogo ativo`
                      : `🛰️ ${f.satelite || (isGoes ? 'GOES' : 'VIIRS')} / NASA FIRMS — fogo ativo`}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#374151', marginBottom: 3 }}>
                    <strong>Confiança:</strong>{' '}
                    {f.confidence === 'h' ? '🔴 Alta' : f.confidence === 'n' ? '🟠 Nominal' : '🟡 Baixa'}
                  </div>
                  {f.frp > 0 && (
                    <div style={{ fontSize: '0.78rem', color: '#374151', marginBottom: 3 }}>
                      <strong>Potência radiativa:</strong> {f.frp.toFixed(1)} MW
                    </div>
                  )}
                  <div style={{ fontSize: '0.78rem', color: '#374151', marginBottom: 3 }}>
                    <strong>Data e hora do registro:</strong> {f.data || 'Não informada'}
                    {f.hora ? ` às ${f.hora.slice(0,2)}:${f.hora.slice(2,4)} UTC` : ' · horário não informado pela fonte'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 2 }}>
                    <strong>Satélite:</strong> {f.satelite || f.fonte}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                    {f.lat.toFixed(5)}, {f.lng.toFixed(5)}
                  </div>
                </div>
              </Popup>
            </Marker>
          )
        })}

        {/* Equipamentos em Campo — cone laranja */}
        {mostrarMateriais && equipamentosCampo.filter(c => c.status === 'ativo' && c.latitude && c.longitude).map((c) => (
          <Marker
            key={c.id}
            position={[c.latitude!, c.longitude!]}
            icon={criarIconeCone(c.material_nome)}
          >
            <Popup>
              <div style={{ minWidth: 180, fontFamily: 'inherit' }}>
                <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: 4 }}>
                  🚧 {c.material_nome ?? 'Equipamento em Campo'}
                </div>
                {(c.rua || c.bairro) && (
                  <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 4 }}>
                    📍 {[c.rua, c.bairro].filter(Boolean).join(' — ')}
                  </div>
                )}
                {c.observacao && (
                  <div style={{ fontSize: '0.78rem', marginBottom: 4 }}>
                    {c.observacao}
                  </div>
                )}
                <div style={{ fontSize: '0.72rem', color: '#ea580c', fontWeight: 600, marginBottom: 8 }}>● Ativo em campo</div>
                {onVerDetalheCampo && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onVerDetalheCampo(c.id) }}
                    style={{
                      width: '100%', background: '#ea580c', color: 'white',
                      border: 'none', borderRadius: 6, padding: '6px 0',
                      fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem',
                    }}
                  >
                    Ver detalhes completos
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Banner de alerta — focos de incêndio detectados */}
      {focosIncendio.length > 0 && !alertaFocosVisto && (
        <div className="mapa-fogo-alerta">
          <span className="mapa-fogo-alerta-icone">🔥</span>
          <div className="mapa-fogo-alerta-texto">
            <strong>{focosIncendio.length} foco{focosIncendio.length > 1 ? 's' : ''} de incêndio</strong>
            <span>detectado{focosIncendio.length > 1 ? 's' : ''} em Ouro Branco</span>
          </div>
          <button
            className="mapa-fogo-alerta-ver"
            onClick={() => { setMostrarFocos(true); setAlertaFocosVisto(true) }}
          >
            Ver no mapa
          </button>
          <button
            className="mapa-fogo-alerta-fechar"
            onClick={() => setAlertaFocosVisto(true)}
          >✕</button>
        </div>
      )}

      {/* Top stats bar */}
      <div className="mapa-topbar">
        <div className="mapa-stat">
          <span className="mapa-stat-num">{ocorrencias.length}</span>
          <span className="mapa-stat-label">no mapa</span>
        </div>
        <div className="mapa-stat-div" />
        <div className="mapa-stat">
          <span className="mapa-stat-num" style={{ color: semGeo > 0 ? '#b45309' : undefined }}>{semGeo}</span>
          <span className="mapa-stat-label">sem GPS</span>
        </div>
        <div className="mapa-stat-div" />
        <div className="mapa-stat" style={{ cursor: 'pointer' }} onClick={() => setPainelEquipesAberto(v => !v)}>
          <span className="mapa-stat-num" style={{ color: totalOnline > 0 ? '#15803d' : undefined }}>
            {totalOnline}
          </span>
          <span className="mapa-stat-label">equipes</span>
        </div>
        <button className="mapa-legenda-btn" onClick={() => setLegendaAberta((v) => !v)}>
          🗂 Legenda
        </button>
      </div>

      <div className="mapa-camadas" aria-label="Escolher visualização do mapa">
        <button
          className={`mapa-camada-btn ${camadaMapa === 'padrao' && !mostrarChuva ? 'ativo' : ''}`}
          onClick={() => setCamadaMapa('padrao')}
        >
          🗺️ Mapa
        </button>
        <button
          className={`mapa-camada-btn ${camadaMapa === 'satelite' || mostrarChuva ? 'ativo' : ''}`}
          onClick={() => setCamadaMapa('satelite')}
        >
          🛰️ Satélite
        </button>
        <div className="mapa-chuva-wrap">
          <button
            className={`mapa-camada-btn mapa-chuva-btn ${mostrarChuva ? 'ativo' : ''}`}
            onClick={() => {
              const proximoEstado = !mostrarChuva
              setMostrarChuva(proximoEstado)
              if (proximoEstado) setCamadaMapa('satelite')
              setPainelChuvaAberto(proximoEstado)
            }}
            aria-pressed={mostrarChuva}
            title="Mostrar radar animado de chuva em Ouro Branco"
          >
            🌧️ Chuva
          </button>
          {painelChuvaAberto && (
            <div className="mapa-chuva-painel">
              <div className="mapa-chuva-painel-header">
                <div>
                  <strong>🌧️ Chuva ao vivo</strong>
                  <span>Ouro Branco, MG · área tracejada = raio de observação de 10 km</span>
                </div>
                <button
                  onClick={() => setPainelChuvaAberto(false)}
                  aria-label="Fechar painel de chuva"
                >✕</button>
              </div>
              <div className="mapa-chuva-fontes">
                <strong>🛰️ GOES-19 + radar vetorial</strong>
                <span>Nuvens atualizadas a cada 10 min · PNG RainViewer processado no servidor</span>
              </div>
              {radarChuvaCarregando && !radarChuva && (
                <div className="mapa-chuva-status">⏳ Carregando o último quadro do radar…</div>
              )}
              {radarChuvaErro && (
                <div className="mapa-chuva-status mapa-chuva-status--erro">{radarChuvaErro}</div>
              )}
              {chuvaOntem && (
                <div className="mapa-chuva-historico">
                  <div>
                    <span className="mapa-chuva-resumo-label">
                      Ontem · {new Date(`${chuvaOntem.data}T12:00:00`).toLocaleDateString('pt-BR')}
                    </span>
                    <strong className={chuvaOntem.precipitacao > 0 ? 'chovendo' : ''}>
                      {chuvaOntem.precipitacao > 0
                        ? `🌧️ ${chuvaOntem.precipitacao.toFixed(1)} mm registrados`
                        : '☀️ Sem precipitação registrada'}
                    </strong>
                  </div>
                  <span>
                    {chuvaOntem.horasComChuva > 0
                      ? `${chuvaOntem.horasComChuva}h com chuva · pico ${chuvaOntem.picoHoraria.toFixed(1)} mm/h`
                      : 'Nenhuma hora com chuva detectada'}
                    {chuvaOntem.coberturaNuvensMedia != null
                      ? ` · ${chuvaOntem.coberturaNuvensMedia}% de nuvens em média`
                      : ''}
                  </span>
                </div>
              )}
              {radarChuva && (
                <>
                  <div className="mapa-chuva-resumo">
                    <div>
                        <span className="mapa-chuva-resumo-label">Ponto central · Ouro Branco</span>
                      <strong className={chuvaNoPonto?.precipitacao && chuvaNoPonto.precipitacao > 0 ? 'chovendo' : ''}>
                        {chuvaNoPonto?.precipitacao != null
                          ? chuvaNoPonto.precipitacao > 0
                            ? `🌧️ ${chuvaNoPonto.precipitacao.toFixed(1)} mm`
                            : '☀️ Sem chuva no ponto'
                          : '–'}
                      </strong>
                      <small className="mapa-chuva-ponto-fonte">
                        {chuvaNoPonto?.fonte || 'consulta local'}
                      </small>
                    </div>
                    <div>
                      <span className="mapa-chuva-resumo-label">Quadro do radar</span>
                      <strong>
                        {quadroRadarAtual
                          ? new Date(quadroRadarAtual.frameTime * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                          : '–'}
                        <small className="mapa-chuva-quadro-tipo">
                          {quadroRadarAtual?.tipoQuadro === 'nowcast' ? 'estimativa' : 'observado'}
                        </small>
                      </strong>
                    </div>
                  </div>
                  {quadrosRadar.length > 1 && (
                    <div className="mapa-chuva-animacao">
                      <button
                        type="button"
                        onClick={() => setRadarAnimando(v => !v)}
                        aria-label={radarAnimando ? 'Pausar animação do radar' : 'Reproduzir animação do radar'}
                      >
                        {radarAnimando ? '⏸' : '▶'}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={quadrosRadar.length - 1}
                        value={Math.min(indiceQuadroRadar, quadrosRadar.length - 1)}
                        onChange={evento => {
                          setRadarAnimando(false)
                          setIndiceQuadroRadar(Number(evento.target.value))
                        }}
                        aria-label="Posição da animação do radar"
                      />
                      <span>{indiceQuadroRadar + 1}/{quadrosRadar.length}</span>
                    </div>
                  )}
                  <div className="mapa-chuva-legenda">
                    <span><i className="chuva-cor chuva-cor--goes" /> nuvens GOES-19</span>
                    <span><i className="chuva-cor chuva-cor--nuvens" /> mancha de precipitação</span>
                    <span><i className="chuva-cor chuva-cor--nucleo" /> núcleo detectado</span>
                  </div>
                  <p className="mapa-chuva-ajuda">
                     A base usa imagem de satélite. A mancha irregular e os núcleos azuis são derivados dos pixels reais do PNG do radar; pontos só aparecem quando há núcleo detectado. O contorno tracejado indica 10 km.
                  </p>
                  <div className="mapa-chuva-rodape">
                    <span>{radarChuva.erroAtualizacao ? 'Último radar salvo' : 'RainViewer · ao vivo'}</span>
                    <button onClick={buscarRadarChuva} disabled={radarChuvaCarregando}>
                      {radarChuvaCarregando ? '⏳' : '↻'} Atualizar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <button
          className={`mapa-camada-btn ${mostrarMateriais ? 'ativo' : ''}`}
          onClick={() => {
            if (mostrarMateriais) {
              setMostrarMateriais(false)
              setPainelMaterialAberto(false)
            } else {
              setMostrarMateriais(true)
              setPainelMaterialAberto(true)
            }
          }}
          title={`${equipamentosCampo.filter(c => c.status === 'ativo').length} em campo`}
        >
          🚧 Material{equipamentosCampo.filter(c => c.status === 'ativo').length > 0 ? ` (${equipamentosCampo.filter(c => c.status === 'ativo').length})` : ''}
        </button>
        <div className="mapa-ocorr-wrap">
          <button
            className={`mapa-camada-btn ${mostrarOcorrencias ? 'ativo' : ''}`}
            onClick={() => {
              if (!mostrarOcorrencias) setMostrarOcorrencias(true)
              setSubmenuFiltroAberto(v => !v)
              setSelecionada(null)
            }}
          >
            📋 Ocorrências {mostrarOcorrencias && `▾`}
          </button>

          {submenuFiltroAberto && (
            <div className="mapa-ocorr-submenu" onClick={(e) => e.stopPropagation()}>
              <div className="mapa-ocorr-submenu-header">
                <span>Filtrar tipos</span>
                <button onClick={() => setSubmenuFiltroAberto(false)} aria-label="Fechar">✕</button>
              </div>

              <div className="mapa-ocorr-submenu-acoes">
                <button onClick={() => { setMostrarOcorrencias(true); setNaturezasOcultas(new Set()) }}>
                  ✓ Marcar todas
                </button>
                <button onClick={() => setNaturezasOcultas(new Set(NATUREZAS))}>
                  ✕ Desmarcar todas
                </button>
                <button
                  className={mostrarOcorrencias ? 'mapa-ocorr-submenu-toggle on' : 'mapa-ocorr-submenu-toggle off'}
                  onClick={() => setMostrarOcorrencias(v => !v)}
                >
                  {mostrarOcorrencias ? '👁 Ocultar todas' : '👁‍🗨 Mostrar no mapa'}
                </button>
              </div>

              <div className="mapa-ocorr-submenu-lista">
                {NATUREZAS.map(n => {
                  const visivel = !naturezasOcultas.has(n)
                  const total = ocorrencias.filter(o => o.natureza === n).length
                  return (
                    <label key={n} className={`mapa-ocorr-submenu-item ${visivel ? '' : 'desativado'}`}>
                      <input
                        type="checkbox"
                        checked={visivel}
                        onChange={() => alternarNatureza(n)}
                      />
                      <span
                        className="mapa-ocorr-submenu-cor"
                        style={{ background: NATUREZA_COR[n] ?? '#1a4b8c' }}
                      >
                        {NATUREZA_ICONE[n] ?? '📋'}
                      </span>
                      <span className="mapa-ocorr-submenu-nome">{n}</span>
                      <span className="mapa-ocorr-submenu-qtd">{total}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <div className="mapa-incendios-wrap">
          <button
            className={`mapa-camada-btn mapa-fogo-btn ${mostrarFocos || painelMonitoramentoAberto ? 'ativo' : ''} ${focosIncendio.length > 0 ? 'tem-focos' : ''}`}
            onClick={() => {
              setPainelMonitoramentoAberto(v => !v)
            }}
            title={
              focosConfigurado === false && !focosMonitoramento?.earthEngine?.configurado
                ? 'Configure FIRMS_MAP_KEY ou autentique o Google Earth Engine para ativar'
                : focosIncendio.length > 0
                  ? `${focosIncendio.length} foco(s) — ${focosFontes.join(' + ')} — ${focosAtualizadoEm ? new Date(focosAtualizadoEm).toLocaleTimeString('pt-BR') : ''}`
                  : `Monitoramento via ${focosFontes.length > 0 ? focosFontes.join(' + ') : 'NASA FIRMS + Earth Engine'} — área oficial de Ouro Branco`
            }
          >
            🔥 Incêndios{focosIncendio.length > 0 ? ` (${focosIncendio.length})` : ''}{focosConfigurado === false && !focosMonitoramento?.earthEngine?.configurado ? ' ⚠️' : ''}
          </button>
        </div>
      </div>

      {painelMonitoramentoAberto && (
        <div className="mapa-monitoramento-painel">
          <div className="mapa-monitoramento-header">
            <div>
              <strong>🛰️ Detecção de incêndio por satélite</strong>
              <span>
  NASA FIRMS · Ouro Branco/MG
  {focosAtualizadoEm
    ? ` · atualizado às ${new Date(focosAtualizadoEm).toLocaleTimeString('pt-BR')}`
    : ''}
</span>
            </div>
            <button
              onClick={() => setPainelMonitoramentoAberto(false)}
              aria-label="Fechar análise ambiental"
            >✕</button>
          </div>
            {!monitoramentoEE?.configurado && (
            <div className="mapa-monitoramento-vazio">
              Earth Engine ainda não está autenticado neste ambiente. As ferramentas aparecem abaixo,
              mas as sobreposições precisam do Secret <strong>EARTH_ENGINE_SERVICE_ACCOUNT_JSON</strong>.
                {focosMonitoramento?.firms
                  ? ' Os focos NASA FIRMS continuam ativos e são exibidos no mapa.'
                  : ' A detecção NASA FIRMS também não está disponível neste momento.'}
              {monitoramentoEE?.erros?.[0] && <small>{monitoramentoEE.erros[0]}</small>}
            </div>
          )}
          <>
            {(monitoramentoEE?.configurado || focosMonitoramento?.firms) && (
              <p className="mapa-monitoramento-ajuda">
                 {monitoramentoEE?.configurado
                   ? 'Selecione uma camada para sobrepor ao mapa. Todas as camadas abaixo representam somente detecções de fogo ativo no município.'
                   : 'Os focos ativos da NASA FIRMS já estão exibidos no mapa. As camadas de sobreposição aguardam a autenticação do Earth Engine.'}
              </p>
            )}
            {(monitoramentoEE?.configurado || focosMonitoramento?.firms) && (
              <div className="mapa-monitoramento-fontes">
                <span>🔥 Focos ativos</span>
                <strong>
                  {focosMonitoramento?.firms || focosConfigurado
                    ? `${focosIncendio.length} foco(s) · ${focosFontes.join(' + ') || 'NASA FIRMS'}`
                    : 'MODIS + VIIRS · Earth Engine'}
                </strong>
              </div>
            )}
              <div className="mapa-monitoramento-camadas">
                {camadasMonitoramento.map(camada => {
                  const status = camada.status
                  const statusTexto = camada.url
                    ? `${camada.periodo}${camada.frequencia ? ` · ${camada.frequencia}` : ''}`
                    : camada.configuracaoNecessaria
                      ? 'Coleção não configurada'
                      : status === 'sem-dados'
                        ? `Sem detecções agora · ${camada.tipo || 'fonte'}`
                        : camada.tipo === 'NASA FIRMS'
                          ? `Focos pontuais · ${camada.frequencia || 'NRT'}`
                          : 'Aguardando Earth Engine'
                  return (
                    <button
                      key={camada.id}
                      className={`${camadaMonitoramento === camada.id ? 'selecionada' : ''} ${camada.url ? '' : 'indisponivel'} ${status === 'disponivel' ? 'disponivel' : ''}`}
                      onClick={() => camada.url && setCamadaMonitoramento(prev => prev === camada.id ? null : camada.id)}
                      title={camada.configuracaoNecessaria || camada.descricao}
                    >
                      <span className="mapa-monitoramento-camada-icone">{
                        camada.id.includes('modis') || camada.id.includes('viirs') || camada.id.includes('goes')
                          ? '🔥'
                          : '🛰️'
                      }</span>
                      <span className="mapa-monitoramento-camada-conteudo">
                        <strong>{camada.nome}</strong>
                        <small>{statusTexto}</small>
                        {typeof camada.quantidade === 'number' && (
                          <em>{camada.quantidade} detecção{camada.quantidade === 1 ? '' : 'ões'} no mapa</em>
                        )}
                      </span>
                      <i className={`mapa-monitoramento-camada-status status-${status || 'aguardando'}`} aria-label={status || 'aguardando'} />
                      {camadaMonitoramento === camada.id && <b>✓</b>}
                    </button>
                  )
                })}
              </div>
              {monitoramentoEE?.configurado && (monitoramentoEE.indicadores ?? []).length > 0 && (
                <div className="mapa-monitoramento-indicadores">
                  <div className="mapa-monitoramento-subtitulo">Indicadores médios do município</div>
                  {monitoramentoEE.indicadores.map(indicador => (
                    <div key={indicador.id} className="mapa-monitoramento-indicador">
                      <span>{indicador.nome}</span>
                      <strong>{indicador.valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} <small>{indicador.unidade}</small></strong>
                    </div>
                  ))}
                </div>
              )}
              {monitoramentoEE?.configurado && (monitoramentoEE.erros ?? []).length > 0 && (
                <div className="mapa-monitoramento-aviso">
                  Falha temporária em {(monitoramentoEE.erros ?? []).length} fonte{monitoramentoEE.erros.length === 1 ? '' : 's'}. As demais detecções continuam sendo combinadas.
                </div>
              )}
              <div className="mapa-monitoramento-focos-acao">
                <div>
                  <strong>🔥 Focos dos últimos 3 dias</strong>
                  <span>
                    {focosCarregando
                      ? 'Consultando as fontes de incêndio...'
                      : `${focosIncendio.length} foco${focosIncendio.length === 1 ? '' : 's'} de incêndio encontrado${focosIncendio.length === 1 ? '' : 's'}`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={visualizarFocos}
                  disabled={focosCarregando}
                >
                  {focosCarregando
                    ? '⏳ Consultando…'
                    : mostrarFocos
                      ? '✓ Focos visíveis'
                      : 'Ver no mapa'}
                </button>
              </div>
              <div className="mapa-monitoramento-rodape">
                <span>
                  {monitoramentoEE?.atualizadoEm || focosAtualizadoEm
                    ? `Atualizado ${new Date(monitoramentoEE?.atualizadoEm || focosAtualizadoEm || '').toLocaleString('pt-BR')}`
                    : 'Atualização automática'}
                </span>
                <div className="mapa-monitoramento-acoes">
                  <button onClick={buscarFocos} disabled={focosCarregando}>
                    {focosCarregando ? '⏳' : '🔥'} Focos
                  </button>
                  <button onClick={buscarMonitoramento} disabled={monitoramentoCarregando}>
                    {monitoramentoCarregando ? '⏳' : '🛰️'} Camadas
                  </button>
                </div>
              </div>
          </>
        </div>
      )}

      {/* Painel de equipamentos em campo — aparece quando o botão Material está ativo */}
      {mostrarMateriais && painelMaterialAberto && (
        <div className="mapa-material-painel">
          <div className="mapa-material-painel-header">
            <span>🚧 Equipamentos em Campo</span>
            <button className="mapa-material-painel-fechar" onClick={() => setPainelMaterialAberto(false)}>✕</button>
          </div>
          {equipamentosCampo.filter(c => c.status === 'ativo').length === 0 ? (
            <p className="mapa-material-painel-vazio">Nenhum equipamento ativo em campo.</p>
          ) : (
            <div className="mapa-material-painel-lista">
              {equipamentosCampo.filter(c => c.status === 'ativo').map(c => (
                <div key={c.id} className="mapa-material-painel-item">
                  <span className="mapa-material-painel-nome">🚧 {c.material_nome ?? 'Equipamento'}</span>
                  {(c.rua || c.bairro) ? (
                    <span className="mapa-material-painel-local">📍 {[c.rua, c.bairro].filter(Boolean).join(' — ')}</span>
                  ) : (
                    <span className="mapa-material-painel-sem-gps">📍 Localização não informada</span>
                  )}
                  {c.observacao && (
                    <span className="mapa-material-painel-obs">{c.observacao}</span>
                  )}
                  {!(c.latitude && c.longitude) && (
                    <span className="mapa-material-painel-sem-pin">Sem GPS — não aparece no mapa</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Barra de busca de endereço (estilo Google Maps, com autocomplete) */}
      <div className="mapa-busca">
        <div className="mapa-busca-input-wrap">
          <span className="mapa-busca-icone">{buscandoEndereco ? '⏳' : '🔍'}</span>
          <input
            type="text"
            className="mapa-busca-input"
            placeholder="Digite a rua e o número (ex.: Rua das Flores, 123)"
            value={enderecoBusca}
            onChange={(e) => setEnderecoBusca(e.target.value)}
            autoComplete="off"
          />
          {(enderecoBusca || destino) && (
            <button
              className="mapa-busca-limpar"
              onClick={limparBuscaERota}
              title="Limpar busca e rota"
            >✕</button>
          )}
        </div>

        {!navigator.onLine && !malhaInfo.baixada && (
          <div className="mapa-busca-aviso">
            📵 Sem internet e sem mapa de ruas salvo. Conecte ou baixe o mapa offline.
          </div>
        )}
        {!navigator.onLine && malhaInfo.baixada && (
          <div className="mapa-busca-aviso" style={{ background: '#dcfce7', borderColor: '#86efac', color: '#166534' }}>
            📵 Sem internet — buscando nas ruas salvas offline.
          </div>
        )}

        {resultadosBusca.length > 0 && (
          <div className="mapa-busca-resultados">
            {resultadosBusca.map((r, i) => (
              <button
                key={i}
                className="mapa-busca-resultado"
                onClick={() => escolherDestino(r)}
              >
                <span className="mapa-busca-resultado-icone">📍</span>
                <span className="mapa-busca-resultado-texto">{r.display}</span>
              </button>
            ))}
          </div>
        )}

        {destino && rotaInfo && (
          <div className="mapa-rota-info">
            {calculandoRota ? (
              <span>⏳ Calculando rota…</span>
            ) : (
              <>
                <span className="mapa-rota-info-titulo">🚗 Rota até o destino</span>
                <span className="mapa-rota-info-stats">
                  {rotaInfo.km.toFixed(1)} km · {rotaInfo.min} min
                </span>
                <span className="mapa-rota-info-origem">
                  {posicaoAtual ? 'Saindo da sua posição GPS' : 'Saindo do centro de Ouro Branco — ative o GPS para rota real'}
                </span>
              </>
            )}
          </div>
        )}
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

      {/* Botão download offline */}
      <button
        className={`mapa-offline-btn ${statusOffline === 'baixando' ? 'mapa-offline-btn--baixando' : statusOffline === 'concluido' ? 'mapa-offline-btn--ok' : ''}`}
        onClick={() => setPainelOfflineAberto((v) => !v)}
        title="Baixar mapa para uso offline"
      >
        <span>{statusOffline === 'baixando' ? '⏳' : statusOffline === 'concluido' ? '✅' : '📥'}</span>
        <span>{statusOffline === 'baixando' ? `${porcentagem}%` : statusOffline === 'concluido' ? 'Salvo offline' : 'Salvar offline'}</span>
      </button>

      {/* Painel equipes online */}
      {painelEquipesAberto && (
        <div className="mapa-equipes-painel">
          <div className="mapa-offline-painel-header">
            <span>📡 Equipes em campo</span>
            <button onClick={() => setPainelEquipesAberto(false)}>✕</button>
          </div>
          <div className="mapa-offline-painel-corpo">
            {/* Status WS */}
            <div className={`mapa-ws-status mapa-ws-status--${statusWs}`}>
              <span className="mapa-ws-dot" />
              {statusWs === 'conectado' ? 'Conectado ao servidor' : statusWs === 'conectando' ? 'Conectando…' : 'Desconectado'}
            </div>

            {/* Dispositivo local */}
            <div className="mapa-equipe-item mapa-equipe-item--local">
              <span className="mapa-equipe-icone" style={{ background: '#1a4b8c' }}>🧑</span>
              <div className="mapa-equipe-info">
                <span className="mapa-equipe-nome">{nomeLocal} <em>(você)</em></span>
                <span className="mapa-equipe-status">
                  {statusGps === 'ativo' ? '🟢 Online no mapa para todos' : statusGps === 'aguardando' ? '🟡 Aguardando GPS…' : '⚫ GPS desligado — invisível para os colegas'}
                </span>
              </div>
            </div>

            {/* Outros dispositivos */}
            {dispositivosArray.length === 0 && statusGps !== 'ativo' && (
              <div className="mapa-offline-info mapa-offline-info--aviso">
                Você já está conectado e vai ver as outras equipes que ativarem o GPS. Para aparecer no mapa dos colegas, ative seu GPS.
              </div>
            )}
            {dispositivosArray.length === 0 && statusGps === 'ativo' && (
              <div className="mapa-offline-info" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af' }}>
                Aguardando outras equipes entrarem online…
              </div>
            )}
            {dispositivosArray.map((d) => {
              const cor = corParaDispositivo(d.id, d.indice)
              const segsAtras = Math.round((Date.now() - d.ultimaVez) / 1000)
              const velKmh = d.velocidade != null ? Math.round(d.velocidade * 3.6) : null
              return (
                <div key={d.id} className="mapa-equipe-item">
                  <span className="mapa-equipe-icone" style={{ background: cor }}>🧑</span>
                  <div className="mapa-equipe-info">
                    <span className="mapa-equipe-nome">{d.nome}</span>
                    <span className="mapa-equipe-status" style={{ color: '#6b7280' }}>
                      🟢 Ativo · {velKmh !== null ? `${velKmh} km/h` : 'parado'} · ±{Math.round(d.precisao)}m · {segsAtras}s atrás
                    </span>
                  </div>
                </div>
              )
            })}

            <div className="mapa-offline-aviso">
              Todas as equipes com GPS ativo aparecem aqui e no mapa em tempo real.
            </div>
          </div>
        </div>
      )}

      {/* Painel Download Mapa Offline */}
      {painelOfflineAberto && (
        <div className="mapa-offline-painel">
          <div className="mapa-offline-painel-header">
            <span>📥 Mapa Offline — Ouro Branco</span>
            <button onClick={() => setPainelOfflineAberto(false)}>✕</button>
          </div>
          <div className="mapa-offline-painel-corpo">
            <div className="mapa-offline-info" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af' }}>
              🌐 Com internet, o mapa carrega normalmente. Salve offline para usar sem conexão.
            </div>

            {tilesCacheados > 0 && (
              <div className="mapa-offline-info">
                ✅ {tilesCacheados.toLocaleString('pt-BR')} tiles salvos — mapa disponível offline
              </div>
            )}
            {tilesCacheados === 0 && statusOffline !== 'baixando' && (
              <div className="mapa-offline-info mapa-offline-info--aviso">
                📵 Mapa não salvo ainda. Sem internet o mapa ficará cinza.
              </div>
            )}
            {statusOffline === 'baixando' && progressoMapa && (
              <div className="mapa-offline-progresso">
                <div className="mapa-offline-barra-wrap">
                  <div className="mapa-offline-barra" style={{ width: `${porcentagem}%` }} />
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
                  ? tilesCacheados > 0 ? '🔄 Atualizar mapa offline' : '📥 Salvar mapa de Ouro Branco'
                  : '📵 Sem conexão para baixar'}
              </button>
            )}
            {tilesCacheados > 0 && statusOffline !== 'baixando' && (
              <button className="mapa-offline-btn-limpar" onClick={limparMapa}>
                🗑 Apagar mapa salvo
              </button>
            )}
            <div className="mapa-offline-aviso">
              Cobre raio de 10 km ao redor do centro de Ouro Branco — MG (cidade + entorno imediato). O GPS funciona offline pelo hardware do aparelho.
            </div>

            {/* ── Malha viária offline (ruas + roteamento) ── */}
            <div style={{ height: 1, background: '#e5e7eb', margin: '12px 0' }} />
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1a4b8c', marginBottom: 6 }}>
              🛣️ Ruas e roteamento offline
            </div>

            {malhaInfo.baixada && (
              <div className="mapa-offline-info">
                ✅ Malha viária salva ({(malhaInfo.bytes / (1024 * 1024)).toFixed(1)} MB) — busca de endereços e rota funcionam offline
              </div>
            )}
            {!malhaInfo.baixada && statusMalha !== 'baixando' && (
              <div className="mapa-offline-info mapa-offline-info--aviso">
                📵 Ruas não salvas. Sem internet, a busca de endereço não vai funcionar.
              </div>
            )}
            {statusMalha === 'baixando' && (
              <div className="mapa-offline-progresso">
                <div className="mapa-offline-barra-wrap">
                  <div
                    className="mapa-offline-barra"
                    style={{
                      width: progressoMalha?.status === 'concluido' ? '100%' : '60%',
                      transition: 'width 0.6s ease',
                    }}
                  />
                </div>
                <div className="mapa-offline-pct">
                  {progressoMalha?.status === 'iniciando' && 'Baixando ruas da Overpass…'}
                  {progressoMalha?.status === 'concluido' &&
                    `Concluído (${((progressoMalha.bytes ?? 0) / (1024 * 1024)).toFixed(1)} MB)`}
                </div>
              </div>
            )}
            {statusMalha === 'erro' && (
              <div className="mapa-offline-info mapa-offline-info--aviso">
                ⚠️ {progressoMalha?.mensagem || 'Falha ao baixar a malha viária. Tente novamente.'}
              </div>
            )}
            {statusMalha !== 'baixando' && (
              <button
                className="mapa-offline-btn-acao"
                onClick={iniciarDownloadMalha}
                disabled={!navigator.onLine}
                style={{ marginTop: 6 }}
              >
                {navigator.onLine
                  ? malhaInfo.baixada ? '🔄 Atualizar ruas offline' : '📥 Baixar ruas e endereços'
                  : '📵 Sem conexão para baixar'}
              </button>
            )}
            <div className="mapa-offline-aviso">
              Baixa a base de ruas/estradas (raio 10 km) da OpenStreetMap.
              Permite buscar endereços e calcular rotas sem internet.
            </div>
          </div>
        </div>
      )}

      {/* Painel GPS ativo */}
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
            {statusWs === 'conectado' && (
              <>
                <span className="mapa-gps-info-sep">·</span>
                <span className="mapa-gps-info-text" style={{ color: '#15803d' }}>
                  📡 {dispositivosArray.length + 1} equipe{dispositivosArray.length !== 0 ? 's' : ''}
                </span>
              </>
            )}
          </div>
          <button
            className={`mapa-gps-seguir ${seguir ? 'mapa-gps-seguir--ativo' : ''}`}
            onClick={() => setSeguir((v) => !v)}
          >
            {seguir ? '🔒 Seguindo' : '🔓 Livre'}
          </button>
        </div>
      )}

      {/* Erro GPS */}
      {statusGps === 'erro' && erroGps && (
        <div className="mapa-gps-erro">
          <div>
            <strong>⚠️ GPS não permitido</strong>
            <span>{erroGps}</span>
            <small>Depois de liberar no navegador/celular, toque no botão GPS novamente.</small>
          </div>
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
                  <div className="mapa-legenda-dot" style={{ background: NATUREZA_COR[n] ?? '#1a4b8c' }}>
                    {NATUREZA_ICONE[n] ?? '📋'}
                  </div>
                  <span>{n}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Bottom panel — ocorrência selecionada */}
      {selecionada && (
        <div className="mapa-painel" onClick={(e) => e.stopPropagation()}>
          <div className="mapa-painel-handle" onClick={() => setSelecionada(null)} />
          <div className="mapa-painel-corpo">
            <div className="mapa-painel-topo">
              <div className="mapa-painel-icone" style={{ background: NATUREZA_COR[selecionada.natureza] ?? '#1a4b8c' }}>
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
            {selecionada.endereco && <div className="mapa-painel-end">📍 {selecionada.endereco}</div>}
            {selecionada.proprietario && <div className="mapa-painel-end">👤 {selecionada.proprietario}</div>}
            <div className="mapa-painel-data">🕐 {new Date(selecionada.created_at).toLocaleString('pt-BR')}</div>
            <button className="mapa-painel-btn" onClick={() => { onSelecionar(selecionada); setSelecionada(null) }}>
              Ver detalhes completos →
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
