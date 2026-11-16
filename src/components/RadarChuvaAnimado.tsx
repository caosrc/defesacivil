import { useMemo } from 'react'
import { TileLayer } from 'react-leaflet'
import { normalizarQuadroRadar, type ControleLinhaTempoRadar, type QuadroRadarChuva } from './radarTimeline'

export type { QuadroRadarChuva } from './radarTimeline'

interface Props {
  host: string
  quadros: QuadroRadarChuva[]
  quadroReserva?: QuadroRadarChuva | null
  quadroSelecionado?: QuadroRadarChuva | null
  tileUrlTemplate?: string
  onTileError?: () => void
  opacity: number
  maxZoom: number
}

export function ControleHistoricoRadar({
  controle,
  temaEscuro = false,
}: {
  controle: ControleLinhaTempoRadar
  temaEscuro?: boolean
}) {
  const { quadros, quadroAtual, indiceAtual, animando } = controle
  if (quadros.length < 2 || !quadroAtual) return null

  const formatarHorario = (time: number) => new Date(time * 1000).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={`mapa-chuva-historico${temaEscuro ? ' mapa-chuva-historico--escuro' : ''}`}>
      <div className="mapa-chuva-historico-topo">
        <button
          type="button"
          onClick={controle.alternarAnimacao}
          aria-pressed={animando}
          title="Reproduzir os quadros observados; não é previsão"
        >
          {animando ? '⏸ Pausar' : '▶ Animar histórico'}
        </button>
        <button
          type="button"
          className={controle.aoVivo ? 'ao-vivo' : ''}
          onClick={controle.irAoVivo}
          aria-pressed={controle.aoVivo}
        >
          ● Ao vivo
        </button>
        <strong>{formatarHorario(quadroAtual.time)}</strong>
      </div>
      <input
        type="range"
        min={0}
        max={quadros.length - 1}
        step={1}
        value={indiceAtual}
        aria-label="Selecionar horário dos quadros observados de chuva"
        onChange={evento => controle.selecionar(quadros[Number(evento.target.value)].time)}
      />
      <div className="mapa-chuva-historico-escala">
        <span>{formatarHorario(quadros[0].time)}</span>
        <span>Quadro {indiceAtual + 1} de {quadros.length}</span>
        <span>{formatarHorario(quadros[quadros.length - 1].time)}</span>
      </div>
      <small>Histórico observado RainViewer; não representa nowcasting ou previsão.</small>
    </div>
  )
}

export default function RadarChuvaAnimado({
  host,
  quadros,
  quadroReserva,
  quadroSelecionado,
  tileUrlTemplate,
  onTileError,
  opacity,
  maxZoom,
}: Props) {
  const quadroAtual = useMemo(() => {
    const validos = quadros
      .filter(quadro => quadro.tipoQuadro !== 'nowcast')
      .map(normalizarQuadroRadar)
      .filter((quadro): quadro is { time: number; path: string } => quadro !== null)
      .sort((a, b) => a.time - b.time)
    const selecionado = normalizarQuadroRadar(quadroSelecionado)
    return validos.find(quadro => quadro.time === selecionado?.time)
      || validos.at(-1)
      || normalizarQuadroRadar(quadroReserva)
  }, [quadros, quadroReserva, quadroSelecionado])
  if (!host || !quadroAtual) return null

  return (
    <TileLayer
      key={`${quadroAtual.time}:${quadroAtual.path}`}
      url={tileUrlTemplate || `${host.replace(/\/$/, '')}${quadroAtual.path}/256/{z}/{x}/{y}/2/1_0.png`}
      opacity={opacity}
      attribution='Weather data by <a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a>'
      maxNativeZoom={7}
      maxZoom={maxZoom}
      tileSize={256}
      updateWhenZooming={false}
      updateWhenIdle
      eventHandlers={onTileError ? { tileerror: onTileError } : undefined}
    />
  )
}
