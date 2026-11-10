import { useEffect, useState } from 'react'
import { Circle, Pane, Popup, Tooltip } from 'react-leaflet'

type PontoChuva = {
  lat: number
  lng: number
  precipitacao: number
  chuva: number | null
  pancadas: number | null
  coberturaNuvens: number | null
  hora: string | null
}

type Props = {
  ativo: boolean
  nomePane: string
  zIndex: number
  onErro?: (mensagem: string) => void
}

function numeroValido(valor: unknown): number | null {
  if (valor == null || valor === '') return null
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

function corDaChuva(mm: number) {
  if (mm < 1) return '#38bdf8'
  if (mm < 5) return '#0284c7'
  if (mm < 20) return '#2563eb'
  return '#7c3aed'
}

function formatarMm(valor: number | null) {
  return valor == null
    ? '—'
    : `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mm`
}

export default function PrecipitacaoAtivaLayer({ ativo, nomePane, zIndex, onErro }: Props) {
  const [pontos, setPontos] = useState<PontoChuva[]>([])

  useEffect(() => {
    if (!ativo) return
    let cancelado = false
    let controller: AbortController | null = null

    const carregar = async () => {
      controller?.abort()
      controller = new AbortController()
      try {
        const resposta = await fetch(`/api/chuva-area?_ts=${Date.now()}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const dados = await resposta.json() as { pontos?: unknown; erro?: string }
        if (!resposta.ok || !Array.isArray(dados.pontos)) {
          throw new Error(dados.erro || 'Grade de precipitação indisponível.')
        }
        const atuais = dados.pontos.flatMap((item): PontoChuva[] => {
          if (!item || typeof item !== 'object') return []
          const ponto = item as Record<string, unknown>
          const lat = numeroValido(ponto.lat)
          const lng = numeroValido(ponto.lng)
          const precipitacao = numeroValido(ponto.precipitacao)
          const chuva = numeroValido(ponto.chuva)
          const pancadas = numeroValido(ponto.pancadas)
          const coberturaNuvens = numeroValido(ponto.coberturaNuvens)
          if (lat == null || lat < -90 || lat > 90 || lng == null || lng < -180 || lng > 180) return []

          return [{
            lat,
            lng,
            // Open-Meteo reports precipitation plus its rain/showers components.
            // Taking the largest value avoids counting those components twice.
            precipitacao: Math.max(precipitacao ?? 0, chuva ?? 0, pancadas ?? 0),
            chuva,
            pancadas,
            coberturaNuvens,
            hora: typeof ponto.hora === 'string' ? ponto.hora : null,
          }]
        }).filter(ponto => ponto.precipitacao > 0)

        if (!cancelado) setPontos(atuais)
      } catch (error) {
        if (!cancelado && !(error instanceof DOMException && error.name === 'AbortError')) {
          onErro?.(error instanceof Error ? error.message : 'Grade de precipitação indisponível.')
        }
      }
    }

    void carregar()
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carregar()
    }, 10 * 60 * 1000)
    const atualizarAoVoltar = () => {
      if (document.visibilityState === 'visible') void carregar()
    }
    document.addEventListener('visibilitychange', atualizarAoVoltar)

    return () => {
      cancelado = true
      controller?.abort()
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', atualizarAoVoltar)
    }
  }, [ativo, onErro])

  if (!ativo || pontos.length === 0) return null

  return (
    <Pane name={nomePane} style={{ zIndex }}>
      {pontos.map(ponto => {
        const cor = corDaChuva(ponto.precipitacao)
        const chuvaLocal = Math.max(ponto.chuva ?? 0, ponto.pancadas ?? 0)
        return (
          <Circle
            key={`${ponto.lat}:${ponto.lng}`}
            center={[ponto.lat, ponto.lng]}
            radius={8500}
            pathOptions={{
              color: cor,
              weight: 2,
              opacity: 0.85,
              fillColor: cor,
              fillOpacity: 0.24,
            }}
          >
            <Tooltip sticky>
              🌧️ Chuva estimada: {formatarMm(ponto.precipitacao)}
            </Tooltip>
            <Popup>
              <strong>🌧️ Chuva ativa estimada</strong>
              <br />
              Precipitação: <b>{formatarMm(ponto.precipitacao)}</b>
              <br />
              Chuva: {formatarMm(ponto.chuva)}
              <br />
              Pancadas: {formatarMm(ponto.pancadas)}
              <br />
              Cobertura de nuvens: {ponto.coberturaNuvens == null ? '—' : `${ponto.coberturaNuvens}%`}
              {chuvaLocal > 0 && <><br />Condição: chuva/pancadas detectadas na grade.</>}
              {ponto.hora && <><br />Leitura local: {ponto.hora.replace('T', ' ')}</>}
              <br />
              <small>Estimativa por grade do Open‑Meteo; não é medição de radar.</small>
            </Popup>
          </Circle>
        )
      })}
    </Pane>
  )
}
