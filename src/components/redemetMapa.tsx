import { CircleMarker, ImageOverlay, Pane, Popup } from 'react-leaflet'
import type { DadosRedemet } from './redemetApi'

export function CamadaRadarRedemet({
  ativa,
  dados,
  opacidade = 0.78,
}: {
  ativa: boolean
  dados: DadosRedemet | null
  opacidade?: number
}) {
  if (!ativa || !dados?.imagens?.length) return null
  return (
    <Pane name="mapaRadarRedemet" style={{ zIndex: 435 }}>
      {dados.imagens.map(imagem => (
        <ImageOverlay
          key={imagem.id}
          url={imagem.url}
          bounds={imagem.bounds}
          opacity={opacidade}
          attribution='Imagem de radar <a href="https://www.decea.mil.br/" target="_blank" rel="noreferrer">REDEMET/DECEA</a>'
        />
      ))}
    </Pane>
  )
}

export function CamadaSateliteRedemet({
  ativa,
  dados,
  opacidade = 0.42,
}: {
  ativa: boolean
  dados: DadosRedemet | null
  opacidade?: number
}) {
  if (!ativa || !dados?.imagens?.length) return null
  return (
    <Pane name="mapaSateliteRedemet" style={{ zIndex: 405 }}>
      {dados.imagens.map(imagem => (
        <ImageOverlay
          key={imagem.id}
          url={imagem.url}
          bounds={imagem.bounds}
          opacity={opacidade}
          attribution='Imagem de satélite <a href="https://www.decea.mil.br/" target="_blank" rel="noreferrer">REDEMET/DECEA</a>'
        />
      ))}
    </Pane>
  )
}

export function CamadaStscRedemet({
  ativa,
  dados,
}: {
  ativa: boolean
  dados: DadosRedemet | null
}) {
  if (!ativa || !dados?.pontos?.length) return null
  return (
    <Pane name="mapaStscRedemet" style={{ zIndex: 465 }}>
      {dados.pontos.map(ponto => (
        <CircleMarker
          key={ponto.id}
          center={[ponto.latitude, ponto.longitude]}
          radius={5}
          pathOptions={{
            color: '#fff7ed',
            weight: 1.5,
            fillColor: '#f97316',
            fillOpacity: 0.92,
          }}
        >
          <Popup>
            <strong>Ocorrência de trovoada · STSC</strong>
            <div>Posição informada pela REDEMET: {ponto.latitude.toFixed(2)}, {ponto.longitude.toFixed(2)}</div>
            {dados.horarioQuadro && <div>Quadro: {dados.horarioQuadro}</div>}
            <small>Fonte: REDEMET · DECEA</small>
          </Popup>
        </CircleMarker>
      ))}
    </Pane>
  )
}
