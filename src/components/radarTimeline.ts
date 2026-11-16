import { useEffect, useMemo, useState } from 'react'

export type QuadroRadarChuva = {
  time?: number
  frameTime?: number
  path: string
  tipoQuadro?: string
}

type QuadroValidado = {
  time: number
  path: string
}

export interface ControleLinhaTempoRadar {
  quadros: QuadroValidado[]
  quadroAtual: QuadroValidado | null
  indiceAtual: number
  aoVivo: boolean
  animando: boolean
  selecionar: (time: number) => void
  alternarAnimacao: () => void
  irAoVivo: () => void
}

export function normalizarQuadroRadar(
  quadro: QuadroRadarChuva | null | undefined,
): QuadroValidado | null {
  const time = Number(quadro?.time ?? quadro?.frameTime)
  if (
    !quadro ||
    !Number.isFinite(time) ||
    time <= 0 ||
    typeof quadro.path !== 'string' ||
    !/^\/v2\/radar\/[a-z0-9]+$/i.test(quadro.path)
  ) return null
  return { time, path: quadro.path }
}

export function useRadarFrameTimeline(
  quadros: QuadroRadarChuva[],
  quadroReserva?: QuadroRadarChuva | null,
): ControleLinhaTempoRadar {
  const [instanteSelecionado, setInstanteSelecionado] = useState<number | null>(null)
  const [animando, setAnimando] = useState(false)
  const quadrosValidos = useMemo(() => {
    const disponiveis = quadros
      .filter(quadro => quadro.tipoQuadro !== 'nowcast')
      .map(normalizarQuadroRadar)
      .filter((quadro): quadro is QuadroValidado => quadro !== null)
    if (disponiveis.length === 0) {
      const reserva = normalizarQuadroRadar(quadroReserva)
      if (reserva) disponiveis.push(reserva)
    }
    return [...new Map(disponiveis.map(quadro => [quadro.time, quadro])).values()]
      .sort((a, b) => a.time - b.time)
  }, [quadros, quadroReserva])

  const indiceEncontrado = quadrosValidos.findIndex(quadro => quadro.time === instanteSelecionado)
  const aoVivo = instanteSelecionado == null || indiceEncontrado === -1
  const indiceAtual = aoVivo
    ? Math.max(0, quadrosValidos.length - 1)
    : indiceEncontrado
  const quadroAtual = quadrosValidos[indiceAtual] ?? null

  useEffect(() => {
    if (!animando || quadrosValidos.length < 2) return
    const intervalo = window.setInterval(() => {
      setInstanteSelecionado(atual => {
        const indice = atual == null
          ? quadrosValidos.length - 1
          : quadrosValidos.findIndex(quadro => quadro.time === atual)
        return quadrosValidos[(indice + 1) % quadrosValidos.length]?.time ?? null
      })
    }, 1200)
    return () => window.clearInterval(intervalo)
  }, [animando, quadrosValidos])

  return {
    quadros: quadrosValidos,
    quadroAtual,
    indiceAtual,
    aoVivo,
    animando,
    selecionar: time => {
      setAnimando(false)
      setInstanteSelecionado(time)
    },
    alternarAnimacao: () => {
      if (!animando && quadrosValidos.length > 1 && aoVivo) {
        setInstanteSelecionado(quadrosValidos[0].time)
      }
      setAnimando(value => !value)
    },
    irAoVivo: () => {
      setAnimando(false)
      setInstanteSelecionado(null)
    },
  }
}
