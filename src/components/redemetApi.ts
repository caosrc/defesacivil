import { useCallback, useEffect, useState } from 'react'

export type TipoRadarRedemet = 'maxcappi' | '10km' | '07km' | '05km' | '03km'
export type ProdutoRedemet = 'radar' | 'stsc' | 'satelite'

export interface ImagemRedemet {
  id: string
  nome: string
  bounds: [[number, number], [number, number]]
  url: string
  atualizadoEm: string | null
}

export interface DadosRedemet {
  disponivel: boolean
  configurada?: boolean
  produto?: ProdutoRedemet
  tipo?: string
  fonte?: string
  imagens?: ImagemRedemet[]
  pontos?: Array<{ id: string; latitude: number; longitude: number }>
  raioReferenciaKm?: number
  referencia?: string
  horarioQuadro?: string | null
  consultadoEm?: string
  erro?: string
  cache?: boolean
}

type EstadoProdutoRedemet = {
  dados: DadosRedemet | null
  carregando: boolean
  erro: string
}

const INTERVALO_ATUALIZACAO_MS = 2 * 60 * 1000

export function useProdutoRedemet(ativo: boolean, produto: ProdutoRedemet, tipo?: TipoRadarRedemet) {
  const [estado, setEstado] = useState<EstadoProdutoRedemet>({
    dados: null,
    carregando: false,
    erro: '',
  })

  const carregar = useCallback(async () => {
    setEstado(anterior => ({ ...anterior, carregando: true, erro: '' }))
    try {
      const params = new URLSearchParams({ produto })
      if (produto === 'radar' && tipo) params.set('tipo', tipo)
      const resposta = await fetch(`/api/redemet?${params}`, { cache: 'no-store' })
      const corpo = await resposta.json().catch(() => ({})) as DadosRedemet
      if (!resposta.ok || corpo?.disponivel !== true) {
        throw new Error(typeof corpo?.erro === 'string' ? corpo.erro : 'Produto REDEMET indisponível.')
      }
      setEstado({ dados: corpo, carregando: false, erro: '' })
    } catch (erro) {
      setEstado(anterior => ({
        ...anterior,
        carregando: false,
        erro: erro instanceof Error ? erro.message : 'Produto REDEMET indisponível.',
      }))
    }
  }, [produto, tipo])

  useEffect(() => {
    if (!ativo) return
    const inicio = window.setTimeout(() => { void carregar() }, 0)
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === 'visible') void carregar()
    }, INTERVALO_ATUALIZACAO_MS)
    const atualizarAoVoltar = () => {
      if (document.visibilityState === 'visible') void carregar()
    }
    document.addEventListener('visibilitychange', atualizarAoVoltar)
    return () => {
      window.clearTimeout(inicio)
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', atualizarAoVoltar)
    }
  }, [ativo, carregar])

  return { ...estado, atualizar: carregar }
}
