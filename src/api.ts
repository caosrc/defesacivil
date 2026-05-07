import type { Ocorrencia } from './types'
import { savePending, getCachedOcorrencias } from './offline'
import { supabase, supabaseDisponivel } from './supabaseClient'

// Redimensiona e recomprime um base64 para no máximo maxW pixels de largura
// e qualidade JPEG reduzida. Isso mantém o payload do Supabase abaixo de 10 MB.
async function comprimirFoto(dataUrl: string, maxW = 1280, qualidade = 0.72): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxW) {
        height = Math.round((height * maxW) / width)
        width = maxW
      }
      try {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(dataUrl); return }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', qualidade))
      } catch {
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

async function comprimirFotos(fotos: unknown[]): Promise<string[]> {
  if (!Array.isArray(fotos) || fotos.length === 0) return []
  return Promise.all(
    fotos.map(f => (typeof f === 'string' ? comprimirFoto(f) : Promise.resolve('')))
  )
}

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
    tipo: dados.tipo ?? null,
    natureza: dados.natureza ?? null,
    subnatureza: dados.subnatureza ?? null,
    nivel_risco: dados.nivel_risco ?? 'baixo',
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

// Detecta se a resposta do Express é válida (não é a página HTML do Netlify/redirect)
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
  // Supabase direto quando disponível (Netlify)
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

  // Express (Replit)
  try {
    const res = await fetch('/api/ocorrencias')
    if (respostaExpressValida(res)) {
      const data = await res.json()
      return (data || []) as Ocorrencia[]
    }
  } catch { /* cai para cache offline */ }

  // Fallback offline
  console.warn('[api] listarOcorrencias — usando cache offline')
  return (await getCachedOcorrencias()) as Ocorrencia[]
}

export async function enviarOcorrenciaServidor(
  dados: Omit<Ocorrencia, 'id' | 'created_at'>
): Promise<Ocorrencia> {
  // Supabase direto quando disponível (Netlify) — não tenta Express para evitar
  // que o redirect catch-all do Netlify sirva HTML antes de chegarmos aqui.
  if (supabaseDisponivel) {
    // Comprime fotos antes de enviar para manter o payload abaixo do limite de
    // 10 MB do PostgREST. Uma foto de celular (4000x3000 px) ocupa ~4-7 MB em
    // base64; com 3+ fotos o INSERT falha com timeout. Comprimimos para ≤1280 px
    // de largura e qualidade 0.72 (~150-300 KB/foto), mantendo boa qualidade visual.
    const fotosComprimidas = await comprimirFotos(Array.isArray(dados.fotos) ? dados.fotos : [])
    const dadosComprimidos = { ...dados, fotos: fotosComprimidas }
    const payload = buildPayload(dadosComprimidos)

    const { data, error } = await supabase
      .from('ocorrencias')
      .insert(payload)
      .select()
      .single()
    if (error) {
      console.error('[api] Supabase insert error:', error)
      // Inclui o código do erro para facilitar diagnóstico
      const detalhe = error.code ? `[${error.code}] ${error.message}` : error.message
      throw new ApiError(500, detalhe)
    }
    if (!data) throw new ApiError(500, 'Supabase retornou resposta inválida')
    return data as Ocorrencia
  }

  const payload = buildPayload(dados)

  // Express (Replit)
  try {
    const res = await fetch('/api/ocorrencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (respostaExpressValida(res)) {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new ApiError(res.status, err.error || res.statusText)
      }
      const data = await res.json()
      if (!data) throw new ApiError(500, 'Servidor retornou resposta inválida')
      return data as Ocorrencia
    }
  } catch (e) {
    if (e instanceof ApiError) throw e
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

  // Supabase direto quando disponível (Netlify)
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

  // Express (Replit)
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
    if (e instanceof Error && e.message) throw e
  }

  throw new Error('Servidor indisponível')
}

export async function deletarOcorrencia(id: number): Promise<void> {
  // Supabase direto quando disponível (Netlify)
  if (supabaseDisponivel) {
    const { error } = await supabase.from('ocorrencias').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return
  }

  // Express (Replit)
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
    if (e instanceof Error && e.message) throw e
  }

  throw new Error('Servidor indisponível')
}
