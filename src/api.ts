import type { Ocorrencia } from './types'
import { supabase } from './supabaseClient'

const TABELA = 'ocorrencias'

export async function listarOcorrencias(): Promise<Ocorrencia[]> {
  const { data, error } = await supabase
    .from(TABELA)
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message || 'Erro ao listar ocorrências')
  return (data ?? []) as Ocorrencia[]
}

export async function criarOcorrencia(
  dados: Omit<Ocorrencia, 'id' | 'created_at'>
): Promise<Ocorrencia> {
  const { data, error } = await supabase
    .from(TABELA)
    .insert(dados)
    .select()
    .single()
  if (error) throw new Error(error.message || 'Erro ao criar ocorrência')
  return data as Ocorrencia
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
