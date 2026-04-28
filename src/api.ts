import type { Ocorrencia } from './types'
import { savePending, getCachedOcorrencias } from './offline'
import { API_BASE } from './config'

const BASE = `${API_BASE}/api`

export async function listarOcorrencias(): Promise<Ocorrencia[]> {
  if (!navigator.onLine) {
    return (await getCachedOcorrencias()) as Ocorrencia[]
  }
  try {
    const res = await fetch(`${BASE}/ocorrencias`)
    if (!res.ok) throw new Error('Falha ao listar ocorrências')
    return await res.json()
  } catch {
    return (await getCachedOcorrencias()) as Ocorrencia[]
  }
}

export async function criarOcorrencia(
  dados: Omit<Ocorrencia, 'id' | 'created_at'>
): Promise<Ocorrencia> {
  if (!navigator.onLine) {
    const localId = await savePending(dados)
    return {
      ...(dados as object),
      id: -Number(localId),
      created_at: new Date().toISOString(),
      _offline: true,
      _localId: Number(localId),
    } as unknown as Ocorrencia
  }
  try {
    const res = await fetch(`${BASE}/ocorrencias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro ao criar ocorrência' }))
      throw new Error(err.error || 'Erro ao criar ocorrência')
    }
    return await res.json()
  } catch (e) {
    const localId = await savePending(dados)
    return {
      ...(dados as object),
      id: -Number(localId),
      created_at: new Date().toISOString(),
      _offline: true,
      _localId: Number(localId),
    } as unknown as Ocorrencia
  }
}

export async function atualizarOcorrencia(
  id: number,
  dados: Partial<Ocorrencia>
): Promise<Ocorrencia> {
  const res = await fetch(`${BASE}/ocorrencias/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro ao atualizar ocorrência' }))
    throw new Error(err.error || 'Erro ao atualizar ocorrência')
  }
  const data = await res.json()
  if (!data) throw new Error('Resposta vazia do servidor')
  return data as Ocorrencia
}

export async function deletarOcorrencia(id: number): Promise<void> {
  const res = await fetch(`${BASE}/ocorrencias/${id}`, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro ao deletar ocorrência' }))
    throw new Error(err.error || 'Erro ao deletar ocorrência')
  }
}
