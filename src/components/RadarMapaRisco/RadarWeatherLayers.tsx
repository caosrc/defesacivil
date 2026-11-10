import { useEffect, useMemo, useState } from 'react'
import { Pane, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import RadarChuvaAnimado from '../RadarChuvaAnimado'

export type QuadroRadar = {
  host: string
  path: string
  frameTime: number
  quadros?: { path: string; time: number }[]
  atualizadoEm?: string
  erroAtualizacao?: boolean
}

type FeatureRadar = {
  geometry?: {
    type?: string
    coordinates?: unknown
  }
  properties?: {
    tipo?: string
    cor?: string
    alpha?: number
    intensidade?: string
  }
}

type Props = {
  mostrarChuva: boolean
  mostrarSintetico: boolean
  mostrarNuvens: boolean
  satelite: boolean
  renderizarBase?: boolean
  quadroExterno?: QuadroRadar | null
  onErro: (mensagem: string) => void
  onAtualizado: (horario: string) => void
}

const URL_BASE_RUA = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const URL_BASE_SATELITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const URL_NUVENS_GOES = String(
  import.meta.env.VITE_GOES_CLOUD_TILES_URL
    || 'https://gis.nnvl.noaa.gov/arcgis/rest/services/GOES/GOES_current/ImageServer/tile/{z}/{y}/{x}',
).trim()
const CAMINHO_RADAR_VALIDO = /^\/v2\/radar\/[a-z0-9]+$/i

function templateTilesHttpsValido(url: string) {
  return /^https:\/\//i.test(url) && ['{z}', '{x}', '{y}'].every(token => url.includes(token))
}

function validarQuadroRadar(dados: Partial<QuadroRadar> | null | undefined): QuadroRadar | null {
  const frameTime = Number(dados?.frameTime)
  if (!dados?.host || !CAMINHO_RADAR_VALIDO.test(dados.path || '') || !Number.isFinite(frameTime) || frameTime <= 0) {
    return null
  }

  try {
    const host = new URL(dados.host)
    if (host.protocol !== 'https:') return null
    return {
      host: host.origin,
      path: dados.path!,
      frameTime,
      quadros: Array.isArray(dados.quadros)
        ? dados.quadros
          .map(quadro => ({ path: String(quadro.path || ''), time: Number(quadro.frameTime) }))
          .filter(quadro => CAMINHO_RADAR_VALIDO.test(quadro.path) && Number.isFinite(quadro.time) && quadro.time > 0)
        : [],
      atualizadoEm: dados.atualizadoEm,
      erroAtualizacao: dados.erroAtualizacao === true,
    }
  } catch {
    return null
  }
}

function RadarSintetico({ quadro, onErro }: { quadro: QuadroRadar; onErro: (mensagem: string) => void }) {
  const mapa = useMap()

  useEffect(() => {
    let cancelado = false
    const camada = L.layerGroup()
    const nomePane = 'radar-risco-sintetico'
    if (!mapa.getPane(nomePane)) mapa.createPane(nomePane)
    mapa.getPane(nomePane)!.style.zIndex = '365'
    camada.addTo(mapa)

    const desenhar = async () => {
      try {
        const params = new URLSearchParams({ path: quadro.path, frameTime: String(quadro.frameTime) })
        const resposta = await fetch(`/api/radar-chuva-poligonos?${params}`, { cache: 'no-store' })
        if (!resposta.ok) throw new Error('Contornos do radar indisponíveis.')
        const dados = await resposta.json() as { features?: FeatureRadar[] }
        if (!Array.isArray(dados.features)) throw new Error('O radar sintético retornou dados inválidos.')
        if (cancelado) return

        dados.features.forEach(feature => {
          const propriedades = feature.properties || {}
          const tipo = propriedades.tipo === 'nucleo' ? 'nucleo' : 'mancha'
          const cor = propriedades.cor || (tipo === 'nucleo' ? '#0878d1' : '#9fe6ff')
          const transparencia = Number(propriedades.alpha || 0)
          const geometry = feature.geometry

          if (geometry?.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
            const anel = geometry.coordinates[0]
            if (!Array.isArray(anel)) return
            const pontos = anel
              .filter((ponto): ponto is number[] => Array.isArray(ponto) && ponto.length >= 2)
              .map(ponto => [Number(ponto[1]), Number(ponto[0])] as [number, number])
            if (pontos.length < 3) return
            L.polygon(pontos, {
              pane: nomePane,
              color: tipo === 'nucleo' ? cor : 'transparent',
              weight: tipo === 'nucleo' ? 1 : 0,
              fillColor: cor,
              fillOpacity: tipo === 'nucleo'
                ? Math.min(0.78, 0.42 + transparencia / 700)
                : Math.min(0.42, 0.18 + transparencia / 900),
              smoothFactor: tipo === 'nucleo' ? 1.4 : 2.8,
            }).addTo(camada)
          } else if (geometry?.type === 'Point' && Array.isArray(geometry.coordinates)) {
            const ponto = geometry.coordinates as number[]
            if (ponto.length < 2 || !Number.isFinite(Number(ponto[0])) || !Number.isFinite(Number(ponto[1]))) return
            L.circleMarker([Number(ponto[1]), Number(ponto[0])], {
              pane: nomePane,
              radius: 6,
              color: '#fff',
              weight: 1.5,
              fillColor: cor,
              fillOpacity: 0.95,
            }).addTo(camada)
          }
        })
      } catch {
        if (!cancelado) onErro('Contornos do radar sintético indisponíveis.')
      }
    }

    void desenhar()
    return () => {
      cancelado = true
      camada.removeFrom(mapa)
    }
  }, [mapa, onErro, quadro.frameTime, quadro.path])

  return null
}

export default function RadarWeatherLayers({
  mostrarChuva,
  mostrarSintetico,
  mostrarNuvens,
  satelite,
  renderizarBase = true,
  quadroExterno,
  onErro,
  onAtualizado,
}: Props) {
  const [quadroInterno, setQuadroInterno] = useState<QuadroRadar | null>(null)
  const radarAtivo = mostrarChuva || mostrarSintetico
  const usaQuadroExterno = quadroExterno !== undefined
  const quadroFonte = usaQuadroExterno ? quadroExterno : quadroInterno
  const quadro = useMemo(() => validarQuadroRadar(quadroFonte), [quadroFonte])

  useEffect(() => {
    if (!radarAtivo || usaQuadroExterno) return
    let cancelado = false

    const carregar = async () => {
      try {
        const resposta = await fetch(`/api/radar-chuva?_ts=${Date.now()}`, { cache: 'no-store' })
        const dados = await resposta.json() as Partial<QuadroRadar> & { erro?: string }
        if (!resposta.ok) throw new Error(dados.erro || 'Radar de chuva indisponível.')
        const proximo = validarQuadroRadar(dados)
        if (!proximo) {
          throw new Error('O serviço não retornou um quadro de radar válido.')
        }
        if (cancelado) return
        setQuadroInterno(proximo)
        onErro('')
        onAtualizado(proximo.atualizadoEm || '')
      } catch (error) {
        if (!cancelado) onErro(error instanceof Error ? error.message : 'Radar de chuva indisponível.')
      }
    }

    void carregar()
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carregar()
    }, 5 * 60 * 1000)
    const atualizarAoVoltar = () => {
      if (document.visibilityState === 'visible') void carregar()
    }
    document.addEventListener('visibilitychange', atualizarAoVoltar)
    return () => {
      cancelado = true
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', atualizarAoVoltar)
    }
  }, [radarAtivo, usaQuadroExterno, onAtualizado, onErro])

  return (
    <>
      {renderizarBase && (satelite ? (
        <TileLayer
          key="radar-risk-satellite"
          url={URL_BASE_SATELITE}
          attribution="Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics"
          maxNativeZoom={17}
          maxZoom={19}
          keepBuffer={2}
          updateWhenZooming={false}
        />
      ) : (
        <TileLayer
          key="radar-risk-street"
          url={URL_BASE_RUA}
          subdomains={['a', 'b', 'c']}
          attribution="&copy; OpenStreetMap contributors"
          maxZoom={19}
          keepBuffer={2}
          updateWhenZooming={false}
        />
      ))}
      {mostrarNuvens && templateTilesHttpsValido(URL_NUVENS_GOES) && (
        <Pane name="radar-risk-goes" style={{ zIndex: 330 }}>
          <TileLayer
            key={`radar-risk-goes-${URL_NUVENS_GOES}`}
            url={URL_NUVENS_GOES}
            opacity={0.55}
            maxNativeZoom={8}
            maxZoom={19}
            updateWhenZooming={false}
            attribution='Cloud imagery &copy; <a href="https://gis.nnvl.noaa.gov/arcgis/rest/services/GOES/GOES_current/ImageServer" target="_blank" rel="noreferrer">NOAA GOES</a>'
          />
        </Pane>
      )}
      {mostrarChuva && quadro && (
        <Pane name="radar-risk-rain-observed" style={{ zIndex: 345 }}>
          <RadarChuvaAnimado
            host={quadro.host}
            quadros={quadro.quadros || []}
            quadroReserva={{ time: quadro.frameTime, path: quadro.path }}
            opacity={0.72}
            maxZoom={18}
          />
        </Pane>
      )}
      {mostrarSintetico && quadro && <RadarSintetico quadro={quadro} onErro={onErro} />}
    </>
  )
}
