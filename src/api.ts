import type { Ocorrencia } from './types'

const BASE = '/api'

export async function listarOcorrencias(): Promise<Ocorrencia[]> {
  const res = await fetch(`${BASE}/ocorrencias`)
  if (!res.ok) throw new Error('Erro ao listar ocorrências')
  return res.json()
}

export async function criarOcorrencia(data: Omit<Ocorrencia, 'id' | 'created_at'>): Promise<Ocorrencia> {
  const res = await fetch(`${BASE}/ocorrencias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Erro ao criar ocorrência')
  return res.json()
}

export async function atualizarOcorrencia(id: number, data: Partial<Ocorrencia>): Promise<Ocorrencia> {
  const res = await fetch(`${BASE}/ocorrencias/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Erro ao atualizar ocorrência')
  return res.json()
}

export async function deletarOcorrencia(id: number): Promise<void> {
  const res = await fetch(`${BASE}/ocorrencias/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Erro ao deletar ocorrência')
}
