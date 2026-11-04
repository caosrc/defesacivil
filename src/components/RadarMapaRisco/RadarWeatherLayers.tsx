import { useEffect, useState } from 'react'
import { ImageOverlay, Pane, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'

type QuadroRadar = {
  host: string
  path: string
  frameTime: number
  atualizadoEm?: string
  erroAtualizacao?: boolean
}

type ImagemGoes = {
  url: string
  bounds: [[number, number], [number, number]]
  atualizadoEm?: string
  fonte?: string
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
  onErro: (mensagem: string) => void
  onAtualizado: (horario: string) => void
}

const URL_BASE_RUA = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const URL_BASE_SATELITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const CAMINHO_RADAR_VALIDO = /^\/v2\/radar\/[a-z0-9]+$/i

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
  onErro,
  onAtualizado,
}: Props) {
  const [quadro, setQuadro] = useState<QuadroRadar | null>(null)
  const [imagemGoes, setImagemGoes] = useState<ImagemGoes | null>(null)
  const radarAtivo = mostrarChuva || mostrarSintetico

  useEffect(() => {
    if (!radarAtivo) return
    let cancelado = false

    const carregar = async () => {
      try {
        const resposta = await fetch(`/api/radar-chuva?_ts=${Date.now()}`, { cache: 'no-store' })
        const dados = await resposta.json() as Partial<QuadroRadar> & { erro?: string }
        if (!resposta.ok) throw new Error(dados.erro || 'Radar de chuva indisponível.')
        if (!dados.host || !CAMINHO_RADAR_VALIDO.test(dados.path || '')) {
          throw new Error('O serviço não retornou um quadro de radar válido.')
        }
        const host = new URL(dados.host)
        if (host.protocol !== 'https:') throw new Error('O endereço do radar não é seguro.')
        if (cancelado) return
        const proximo = {
          host: host.origin,
          path: dados.path!,
          frameTime: Number(dados.frameTime),
          atualizadoEm: dados.atualizadoEm,
          erroAtualizacao: dados.erroAtualizacao === true,
        }
        setQuadro(proximo)
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
  }, [radarAtivo, onAtualizado, onErro])

  useEffect(() => {
    if (!mostrarNuvens) return
    let cancelado = false
    const carregar = async () => {
      try {
        const resposta = await fetch(`/api/goes-nuvens?_ts=${Date.now()}`, { cache: 'no-store' })
        if (!resposta.ok) throw new Error('Imagem de nuvens GOES indisponível.')
        const dados = await resposta.json() as ImagemGoes
        if (!dados.url || !Array.isArray(dados.bounds)) throw new Error('A imagem GOES retornou dados inválidos.')
        if (!cancelado) {
          setImagemGoes(dados)
          onErro('')
        }
      } catch (error) {
        if (!cancelado) onErro(error instanceof Error ? error.message : 'Imagem de nuvens GOES indisponível.')
      }
    }
    void carregar()
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carregar()
    }, 10 * 60 * 1000)
    return () => {
      cancelado = true
      window.clearInterval(intervalo)
    }
  }, [mostrarNuvens, onErro])

  const urlChuva = quadro
    ? `${quadro.host}${quadro.path}/256/{z}/{x}/{y}/2/1_1.png`
    : ''

  return (
    <>
      {satelite ? (
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
      )}
      {mostrarNuvens && imagemGoes && (
        <Pane name="radar-risk-goes" style={{ zIndex: 330 }}>
          <ImageOverlay
            key={`${imagemGoes.url}-${imagemGoes.atualizadoEm || ''}`}
            url={`${imagemGoes.url}?t=${encodeURIComponent(imagemGoes.atualizadoEm || '')}`}
            bounds={imagemGoes.bounds}
            opacity={0.38}
            attribution={imagemGoes.fonte || 'NOAA/NESDIS · GOES-19'}
          />
        </Pane>
      )}
      {mostrarChuva && quadro && (
        <Pane name="radar-risk-rain-observed" style={{ zIndex: 345 }}>
          <TileLayer
            key={`rainviewer-${quadro.frameTime}`}
            url={urlChuva}
            opacity={0.7}
            maxNativeZoom={7}
            maxZoom={18}
            attribution="Weather data by RainViewer"
          />
        </Pane>
      )}
      {mostrarSintetico && quadro && <RadarSintetico quadro={quadro} onErro={onErro} />}
    </>
  )
}
