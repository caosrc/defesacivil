import type { Ocorrencia } from './types'
import { savePending, getCachedOcorrencias } from './offline'
import { API_BASE } from './config'

const BASE = `${API_BASE}/api`

function localOffline(dados: Omit<Ocorrencia, 'id' | 'created_at'>, localId: number): Ocorrencia {
  return {
    ...(dados as object),
    id: -Number(localId),
    created_at: new Date().toISOString(),
    _offline: true,
    _localId: Number(localId),
  } as unknown as Ocorrencia
}

// Valida que a resposta é JSON antes de tentar parsear.
// Evita que redirecionamentos para index.html (Netlify SPA) sejam tratados como sucesso.
async function parseJsonSeguro<T>(resp: Response): Promise<T> {
  const ct = resp.headers.get('content-type') ?? ''
  if (!ct.includes('application/json')) {
    throw new Error(`Resposta não é JSON (content-type: ${ct}) — possível redirect para index.html`)
  }
  return resp.json() as Promise<T>
}

export async function listarOcorrencias(): Promise<Ocorrencia[]> {
  if (!navigator.onLine) {
    return (await getCachedOcorrencias()) as Ocorrencia[]
  }
  try {
    const resp = await fetch(`${BASE}/ocorrencias`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await parseJsonSeguro<unknown>(resp)
    return (Array.isArray(data) ? data : []) as Ocorrencia[]
  } catch (e) {
    console.warn('[api] listarOcorrencias falhou — usando cache offline:', e)
    return (await getCachedOcorrencias()) as Ocorrencia[]
  }
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

// Envia diretamente para o servidor — LANÇA erro se falhar (sem fallback offline).
// Usar durante a sincronização de pendentes.
export async function enviarOcorrenciaServidor(
  dados: Omit<Ocorrencia, 'id' | 'created_at'>
): Promise<Ocorrencia> {
  const resp = await fetch(`${BASE}/ocorrencias`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload(dados)),
  })
  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`
    try {
      const ct = resp.headers.get('content-type') ?? ''
      if (ct.includes('application/json')) {
        const body = await resp.json()
        msg = body?.error ?? msg
      }
    } catch { /* ignora */ }
    throw new ApiError(resp.status, msg)
  }
  // Valida que é JSON real — evita aceitar index.html como sucesso
  const resultado = await parseJsonSeguro<Ocorrencia>(resp)
  if (!resultado || typeof (resultado as any).id === 'undefined') {
    throw new Error('Servidor retornou resposta inválida (sem id)')
  }
  return resultado
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
  const { id: _i, created_at: _c, _offline: _o, _localId: _l, ...payload } = dados as any
  void _i; void _c; void _o; void _l
  const resp = await fetch(`${BASE}/ocorrencias/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }))
    throw new Error(err.error || `HTTP ${resp.status}`)
  }
  return await resp.json() as Ocorrencia
}

export async function deletarOcorrencia(id: number): Promise<void> {
  const resp = await fetch(`${BASE}/ocorrencias/${id}`, { method: 'DELETE' })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
}
