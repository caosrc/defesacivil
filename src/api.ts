import type { Ocorrencia } from './types'
import { savePending, getCachedOcorrencias } from './offline'
import { supabase, supabaseDisponivel } from './supabaseClient'

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

// Detecta se a resposta do Express é válida (não é a página HTML do Netlify)
function respostaExpressValida(res: Response): boolean {
  if (!res.ok) return false
  const ct = res.headers.get('content-type') || ''
  return !ct.includes('text/html')
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function listarOcorrencias(): Promise<Ocorrencia[]> {
  // Tenta Express primeiro
  try {
    const res = await fetch('/api/ocorrencias')
    if (respostaExpressValida(res)) {
      const data = await res.json()
      return (data || []) as Ocorrencia[]
    }
  } catch { /* cai para Supabase */ }

  // Fallback: Supabase direto (Netlify)
  if (supabaseDisponivel) {
    try {
      const { data, error } = await supabase
        .from('ocorrencias')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data || []) as Ocorrencia[]
    } catch (e) {
      console.warn('[api] listarOcorrencias Supabase falhou:', e)
    }
  }

  // Fallback offline
  console.warn('[api] listarOcorrencias — usando cache offline')
  return (await getCachedOcorrencias()) as Ocorrencia[]
}

export async function enviarOcorrenciaServidor(
  dados: Omit<Ocorrencia, 'id' | 'created_at'>
): Promise<Ocorrencia> {
  const payload = buildPayload(dados)

  // Tenta Express primeiro
  try {
    const res = await fetch('/api/ocorrencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (respostaExpressValida(res)) {
      const err = await res.clone().json().catch(() => ({ error: res.statusText }))
      if (!res.ok) throw new ApiError(res.status, err.error || res.statusText)
      const data = await res.json()
      if (!data) throw new Error('Servidor retornou resposta inválida')
      return data as Ocorrencia
    }
  } catch (e) {
    if (e instanceof ApiError) throw e
    // Express não disponível — tenta Supabase
  }

  // Fallback: Supabase direto (Netlify)
  if (supabaseDisponivel) {
    const { data, error } = await supabase
      .from('ocorrencias')
      .insert(payload)
      .select()
      .single()
    if (error) throw new ApiError(500, error.message)
    if (!data) throw new Error('Supabase retornou resposta inválida')
    return data as Ocorrencia
  }

  throw new ApiError(503, 'Servidor indisponível')
}

export async function criarOcorrencia(
  dados: Omit<Ocorrencia, 'id' | 'created_at'>
): Promise<Ocorrencia> {
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

  // Tenta Express primeiro
  try {
    const res = await fetch(`/api/ocorrencias/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (respostaExpressValida(res)) {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || res.statusText)
      }
      const data = await res.json()
      if (!data) throw new Error('Ocorrência não encontrada')
      return data as Ocorrencia
    }
  } catch (e) {
    if ((e as Error).message && !(e as Error).message.includes('Express')) throw e
  }

  // Fallback: Supabase direto (Netlify)
  if (supabaseDisponivel) {
    const { data, error } = await supabase
      .from('ocorrencias')
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('Ocorrência não encontrada')
    return data as Ocorrencia
  }

  throw new Error('Servidor indisponível')
}

export async function deletarOcorrencia(id: number): Promise<void> {
  // Tenta Express primeiro
  try {
    const res = await fetch(`/api/ocorrencias/${id}`, { method: 'DELETE' })
    if (respostaExpressValida(res)) {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || res.statusText)
      }
      return
    }
  } catch (e) {
    if ((e as Error).message && !(e as Error).message.includes('Express')) throw e
  }

  // Fallback: Supabase direto (Netlify)
  if (supabaseDisponivel) {
    const { error } = await supabase.from('ocorrencias').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return
  }

  throw new Error('Servidor indisponível')
}
