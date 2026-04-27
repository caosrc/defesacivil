import type { Ocorrencia } from './types'
import { supabase } from './supabaseClient'
import { savePending, getCachedOcorrencias } from './offline'

const TABELA = 'ocorrencias'

export async function listarOcorrencias(): Promise<Ocorrencia[]> {
  if (!navigator.onLine) {
    return (await getCachedOcorrencias()) as Ocorrencia[]
  }
  const { data, error } = await supabase
    .from(TABELA)
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    return (await getCachedOcorrencias()) as Ocorrencia[]
  }
  return (data ?? []) as Ocorrencia[]
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
    const { data, error } = await supabase
      .from(TABELA)
      .insert(dados)
      .select()
      .single()
    if (error) throw new Error(error.message || 'Erro ao criar ocorrência')
    return data as Ocorrencia
  } catch (e) {
    // Se a rede falhar no meio do envio, salva como pendente para reenvio
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
  const { data, error } = await supabase
    .from(TABELA)
    .update(dados)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message || 'Erro ao atualizar ocorrência')
  if (!data) throw new Error('Resposta vazia do servidor')
  return data as Ocorrencia
}

export async function deletarOcorrencia(id: number): Promise<void> {
  const { error } = await supabase.from(TABELA).delete().eq('id', id)
  if (error) throw new Error(error.message || 'Erro ao deletar ocorrência')
}
