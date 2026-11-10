import { useCallback, useEffect, useState } from 'react'
import { ImageOverlay, Pane, TileLayer } from 'react-leaflet'

type ImagemGoes = {
  url: string
  bounds: [[number, number], [number, number]]
  atualizadoEm?: string
  fonte?: string
}

type Props = {
  ativo: boolean
  nomePane: string
  zIndex: number
  opacidade?: number
  maxZoom?: number
  onErro?: (mensagem: string) => void
}

const URL_NUVENS_GOES_PADRAO =
  'https://gis.nnvl.noaa.gov/arcgis/rest/services/GOES/GOES_current/ImageServer/tile/{z}/{y}/{x}'
const URL_NUVENS_GOES = String(
  import.meta.env.VITE_GOES_CLOUD_TILES_URL || URL_NUVENS_GOES_PADRAO,
).trim()
const TEMPLATE_GOES_VALIDO = /^https:\/\//i.test(URL_NUVENS_GOES)
  && ['{z}', '{x}', '{y}'].every(token => URL_NUVENS_GOES.includes(token))

export default function NuvensGoesLayer({
  ativo,
  nomePane,
  zIndex,
  opacidade = 0.7,
  maxZoom = 19,
  onErro,
}: Props) {
  const [falhaTiles, setFalhaTiles] = useState(false)
  const [imagem, setImagem] = useState<ImagemGoes | null>(null)
  const usarImagemReserva = !TEMPLATE_GOES_VALIDO || falhaTiles

  const ativarReserva = useCallback(() => {
    setFalhaTiles(true)
  }, [])

  useEffect(() => {
    if (!ativo || !usarImagemReserva) return
    let cancelado = false
    let controller: AbortController | null = null

    const carregarImagem = async () => {
      controller?.abort()
      controller = new AbortController()
      try {
        const resposta = await fetch(`/api/goes-nuvens?_ts=${Date.now()}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const dados = await resposta.json() as Partial<ImagemGoes> & { erro?: string }
        if (!resposta.ok || typeof dados.url !== 'string' || !Array.isArray(dados.bounds)) {
          throw new Error(dados.erro || 'Imagem de nuvens GOES indisponível.')
        }
        if (!cancelado) {
          setImagem({
            url: dados.url,
            bounds: dados.bounds as ImagemGoes['bounds'],
            atualizadoEm: dados.atualizadoEm,
            fonte: dados.fonte,
          })
        }
      } catch (error) {
        if (!cancelado && !(error instanceof DOMException && error.name === 'AbortError')) {
          onErro?.(error instanceof Error ? error.message : 'Imagem de nuvens GOES indisponível.')
        }
      }
    }

    void carregarImagem()
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carregarImagem()
    }, 10 * 60 * 1000)
    return () => {
      cancelado = true
      controller?.abort()
      window.clearInterval(intervalo)
    }
  }, [ativo, onErro, usarImagemReserva])

  if (!ativo) return null

  return (
    <Pane name={nomePane} style={{ zIndex }}>
      {TEMPLATE_GOES_VALIDO && (
        <TileLayer
          key={`goes-cloud-tiles-${URL_NUVENS_GOES}`}
          url={URL_NUVENS_GOES}
          opacity={imagem ? 0 : opacidade}
          maxNativeZoom={8}
          maxZoom={maxZoom}
          updateWhenZooming={false}
          eventHandlers={{ tileerror: ativarReserva }}
          attribution='Cloud imagery &copy; <a href="https://gis.nnvl.noaa.gov/arcgis/rest/services/GOES/GOES_current/ImageServer" target="_blank" rel="noreferrer">NOAA GOES</a>'
        />
      )}
      {imagem && usarImagemReserva && (
        <ImageOverlay
          key={`${imagem.url}-${imagem.atualizadoEm || ''}`}
          url={`${imagem.url}?t=${encodeURIComponent(imagem.atualizadoEm || '')}`}
          bounds={imagem.bounds}
          opacity={Math.min(opacidade, 0.48)}
          attribution={imagem.fonte || 'NOAA/NESDIS · GOES-19'}
        />
      )}
    </Pane>
  )
}
