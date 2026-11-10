import { useMemo } from 'react'
import { TileLayer } from 'react-leaflet'

export type QuadroRadarChuva = {
  time: number
  path: string
}

interface Props {
  host: string
  quadros: QuadroRadarChuva[]
  quadroReserva?: QuadroRadarChuva | null
  opacity: number
  maxZoom: number
}

export default function RadarChuvaAnimado({
  host,
  quadros,
  quadroReserva,
  opacity,
  maxZoom,
}: Props) {
  const quadroAtual = useMemo(() => {
    const fonte = quadros.length > 0 ? quadros : quadroReserva ? [quadroReserva] : []
    return fonte
      .filter(quadro =>
        Number.isFinite(quadro.time) &&
        typeof quadro.path === 'string' &&
        quadro.path.startsWith('/v2/radar/'),
      )
      .sort((a, b) => a.time - b.time)
      .at(-1)
  }, [quadros, quadroReserva])
  if (!host || !quadroAtual) return null

  return (
    <TileLayer
      key={`${quadroAtual.time}:${quadroAtual.path}`}
      url={`${host.replace(/\/$/, '')}${quadroAtual.path}/256/{z}/{x}/{y}/2/1_0.png`}
      opacity={opacity}
      attribution='Weather data by <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a>'
      maxNativeZoom={7}
      maxZoom={maxZoom}
      tileSize={256}
      updateWhenZooming={false}
      updateWhenIdle
    />
  )
}
