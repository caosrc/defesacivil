import type { Ocorrencia } from './types'

const BASE = '/api/ocorrencias'

async function lerJson<T>(resposta: Response, mensagemErro: string): Promise<T> {
  if (!resposta.ok) {
    let detalhe = ''
    try {
      const corpo = await resposta.json()
      detalhe = corpo?.error || ''
    } catch { /* ignora */ }
    throw new Error(detalhe || `${mensagemErro} (HTTP ${resposta.status})`)
  }
  return resposta.json() as Promise<T>
}

export async function listarOcorrencias(): Promise<Ocorrencia[]> {
  const r = await fetch(BASE)
  return lerJson<Ocorrencia[]>(r, 'Erro ao listar ocorrências')
}

export async function criarOcorrencia(
  dados: Omit<Ocorrencia, 'id' | 'created_at'>
): Promise<Ocorrencia> {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  })
  return lerJson<Ocorrencia>(r, 'Erro ao criar ocorrência')
}

export async function atualizarOcorrencia(
  id: number,
  dados: Partial<Ocorrencia>
): Promise<Ocorrencia> {
  const r = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  })
  return lerJson<Ocorrencia>(r, 'Erro ao atualizar ocorrência')
}

export async function deletarOcorrencia(id: number): Promise<void> {
  const r = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  if (!r.ok) throw new Error(`Erro ao deletar ocorrência (HTTP ${r.status})`)
}
