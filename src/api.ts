import type { Ocorrencia } from './types'

async function pedido<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (!resp.ok) {
    let msg = `Erro ${resp.status}`
    try {
      const data = await resp.json()
      if (data?.error) msg = data.error
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  if (resp.status === 204) return undefined as T
  return resp.json() as Promise<T>
}

export async function listarOcorrencias(): Promise<Ocorrencia[]> {
  return pedido<Ocorrencia[]>('/api/ocorrencias')
}

export async function criarOcorrencia(
  dados: Omit<Ocorrencia, 'id' | 'created_at'>
): Promise<Ocorrencia> {
  return pedido<Ocorrencia>('/api/ocorrencias', {
    method: 'POST',
    body: JSON.stringify(dados),
  })
}

export async function atualizarOcorrencia(
  id: number,
  dados: Partial<Ocorrencia>
): Promise<Ocorrencia> {
  return pedido<Ocorrencia>(`/api/ocorrencias/${id}`, {
    method: 'PUT',
    body: JSON.stringify(dados),
  })
}

export async function deletarOcorrencia(id: number): Promise<void> {
  await pedido<{ success: boolean }>(`/api/ocorrencias/${id}`, {
    method: 'DELETE',
  })
}
