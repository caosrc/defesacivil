import type { Ocorrencia } from './types'
import { savePending, getCachedOcorrencias } from './offline'
import { supabase } from './supabaseClient'

function localOffline(dados: Omit<Ocorrencia, 'id' | 'created_at'>, localId: number): Ocorrencia {
  return {
    ...(dados as object),
    id: -Number(localId),
    created_at: new Date().toISOString(),
    _offline: true,
    _localId: Number(localId),
  } as unknown as Ocorrencia
}

function buildPayload(dados: Omit<Ocorrencia, 'id' | 'created_at'>) {
  return {
    tipo: dados.tipo,
    natureza: dados.natureza,
    subnatureza: dados.subnatureza ?? null,
    nivel_risco: dados.nivel_risco,
    status_oc: dados.status_oc ?? 'ativo',
    fotos: Array.isArray(dados.fotos) ? dados.fotos : [],
    lat: dados.lat ?? null,
    lng: dados.lng ?? null,
    endereco: dados.endereco ?? null,
    proprietario: dados.proprietario ?? null,
    situacao: dados.situacao ?? null,
    recomendacao: dados.recomendacao ?? null,
    conclusao: dados.conclusao ?? null,
    data_ocorrencia: dados.data_ocorrencia ?? null,
    agentes: Array.isArray(dados.agentes) ? dados.agentes : [],
    responsavel_registro: dados.responsavel_registro ?? null,
    vistorias: Array.isArray(dados.vistorias) ? dados.vistorias : [],
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function listarOcorrencias(): Promise<Ocorrencia[]> {
  if (!navigator.onLine) {
    return (await getCachedOcorrencias()) as Ocorrencia[]
  }
  try {
    const { data, error } = await supabase
      .from('ocorrencias')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return (Array.isArray(data) ? data : []) as Ocorrencia[]
  } catch (e) {
    console.warn('[api] listarOcorrencias falhou — usando cache offline:', e)
    return (await getCachedOcorrencias()) as Ocorrencia[]
  }
}

export async function enviarOcorrenciaServidor(
  dados: Omit<Ocorrencia, 'id' | 'created_at'>
): Promise<Ocorrencia> {
  const { data, error } = await supabase
    .from('ocorrencias')
    .insert(buildPayload(dados))
    .select()
    .single()
  if (error) throw new ApiError(500, error.message)
  if (!data || typeof (data as Record<string, unknown>).id === 'undefined') {
    throw new Error('Supabase retornou resposta inválida (sem id)')
  }
  return data as unknown as Ocorrencia
}

export async function criarOcorrencia(
  dados: Omit<Ocorrencia, 'id' | 'created_at'>
): Promise<Ocorrencia> {
  if (!navigator.onLine) {
    const localId = await savePending(dados)
    return localOffline(dados, Number(localId))
  }
  try {
    return await enviarOcorrenciaServidor(dados)
  } catch (e) {
    console.warn('[api] criarOcorrencia falhou — salvando offline:', e)
    const localId = await savePending(dados)
    return localOffline(dados, Number(localId))
  }
}

export async function atualizarOcorrencia(
  id: number,
  dados: Partial<Ocorrencia>
): Promise<Ocorrencia> {
  const { id: _i, created_at: _c, _offline: _o, _localId: _l, ...payload } = dados as Record<string, unknown>
  void _i; void _c; void _o; void _l
  const { data, error } = await supabase
    .from('ocorrencias')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as Ocorrencia
}

export async function deletarOcorrencia(id: number): Promise<void> {
  const { error } = await supabase
    .from('ocorrencias')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}
