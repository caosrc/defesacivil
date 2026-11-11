import { supabase, supabaseDisponivel } from './supabaseClient'
import type { RiskArea } from './components/RadarMapaRisco'
import { OURO_BRANCO } from './localidades'

export type RiskAreaDraft = Omit<RiskArea, 'id'>

const ENDPOINT = '/api/radar-areas-risco'
const TIPOS_RISCO = new Set<RiskArea['tipo']>([
  'encosta', 'enchente', 'drenagem', 'alagamento', 'deslizamento',
  'via', 'obra', 'inundacao', 'incendio', 'outro',
])
const ICONES_RISCO = new Set<RiskArea['icone']>(['water', 'landslide', 'fire', 'other'])

type RiskAreaRow = Record<string, unknown>

function parsePolygon(value: unknown): RiskArea['poligono'] {
  let points = value
  if (typeof points === 'string') {
    try {
      points = JSON.parse(points)
    } catch {
      throw new Error('O polígono salvo para uma área está inválido.')
    }
  }
  if (!Array.isArray(points)) throw new Error('O polígono salvo para uma área está inválido.')

  return points.map(point => {
    if (!point || typeof point !== 'object') throw new Error('O polígono salvo para uma área está inválido.')
    const coordinates = point as Record<string, unknown>
    const lat = Number(coordinates.lat)
    const lng = Number(coordinates.lng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new Error('O polígono salvo para uma área está inválido.')
    }
    return { lat, lng }
  })
}

function fromRow(row: RiskAreaRow): RiskArea {
  const tipo = String(row.tipo) as RiskArea['tipo']
  const icone = String(row.icone) as RiskArea['icone']
  const poligono = parsePolygon(row.poligono)
  const limiteMm = Number(row.limite_mm)

  if (!TIPOS_RISCO.has(tipo) || !ICONES_RISCO.has(icone) || poligono.length < 3 || !Number.isFinite(limiteMm)) {
    throw new Error('Uma área de risco salva contém dados inválidos.')
  }

  return {
    id: String(row.id),
    nome: String(row.nome),
    tipo,
    icone,
    poligono,
    limiteMm,
    ativo: row.ativo === true,
  }
}

function validarRascunho(area: RiskAreaDraft) {
  if (!area.nome.trim()) throw new Error('Informe um nome para a área.')
  if (!TIPOS_RISCO.has(area.tipo) || !ICONES_RISCO.has(area.icone)) throw new Error('Tipo ou ícone de risco inválido.')
  if (!Number.isFinite(area.limiteMm) || area.limiteMm < 0) throw new Error('O limite de chuva precisa ser um número válido.')
  if (area.poligono.length < 3) throw new Error('Marque ao menos três pontos para formar o polígono.')
  if (area.poligono.some(point =>
    !Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90 ||
    !Number.isFinite(point.lng) || point.lng < -180 || point.lng > 180
  )) throw new Error('O polígono contém coordenadas inválidas.')
}

async function respostaApi<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string } & T
  if (!response.ok) throw new Error(body.error || 'Não foi possível salvar as áreas de risco.')
  return body
}

function novoId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `area-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function payload(area: RiskAreaDraft, criadoPor: string) {
  return {
    nome: area.nome.trim(),
    tipo: area.tipo,
    icone: area.icone,
    poligono: area.poligono,
    limite_mm: area.limiteMm,
    ativo: area.ativo,
    criado_por: criadoPor,
  }
}

export async function listarAreasRisco(): Promise<RiskArea[]> {
  if (supabaseDisponivel) {
    const result = await supabase
      .from('radar_areas_risco')
      .select('*')
      .order('criado_em', { ascending: false })
    if (result.error) throw new Error(result.error.message)
    return (result.data || []).map(row => fromRow(row as RiskAreaRow))
  }

  const response = await fetch(ENDPOINT)
  const rows = await respostaApi<RiskAreaRow[]>(response)
  return rows.map(fromRow)
}

export async function criarAreaRisco(area: RiskAreaDraft, criadoPor: string): Promise<RiskArea> {
  validarRascunho(area)
  const id = novoId()
  const row = { id, ...payload(area, criadoPor) }

  if (supabaseDisponivel) {
    const result = await supabase.from('radar_areas_risco').upsert(row, { onConflict: 'id' }).select('*').single()
    if (result.error) throw new Error(result.error.message)
    return fromRow(result.data as RiskAreaRow)
  }

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  })
  return fromRow(await respostaApi<RiskAreaRow>(response))
}

export async function atualizarAreaRisco(id: string, area: RiskAreaDraft, criadoPor: string): Promise<RiskArea> {
  validarRascunho(area)
  const row = payload(area, criadoPor)

  if (supabaseDisponivel) {
    const result = await supabase.from('radar_areas_risco').update(row).eq('id', id).select('*').single()
    if (result.error) throw new Error(result.error.message)
    return fromRow(result.data as RiskAreaRow)
  }

  const response = await fetch(`${ENDPOINT}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  })
  return fromRow(await respostaApi<RiskAreaRow>(response))
}

export async function excluirAreaRisco(id: string): Promise<void> {
  if (supabaseDisponivel) {
    const result = await supabase.from('radar_areas_risco').delete().eq('id', id)
    if (result.error) throw new Error(result.error.message)
    return
  }

  const response = await fetch(`${ENDPOINT}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await respostaApi<{ success: boolean }>(response)
}

function horaLocalOuroBranco() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}T${values.hour}:00`
}

export async function buscarPrecipitacao24hAreas(
  areas: RiskArea[],
  signal?: AbortSignal,
): Promise<Record<string, number | null>> {
  const monitoradas = areas.filter(area => area.ativo && area.poligono.length >= 3)
  if (!monitoradas.length) return {}

  const params = new URLSearchParams({
    latitude: OURO_BRANCO.latitude.toFixed(5),
    longitude: OURO_BRANCO.longitude.toFixed(5),
    hourly: 'precipitation',
    forecast_days: '2',
    timezone: 'America/Sao_Paulo',
    precipitation_unit: 'mm',
  })
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error('Não foi possível atualizar a previsão de chuva das áreas.')

  const data: unknown = await response.json()
  const location = Array.isArray(data) ? data[0] as RiskAreaRow | undefined : data as RiskAreaRow
  const hourly = location?.hourly as Record<string, unknown> | undefined
  const times = Array.isArray(hourly?.time) ? hourly.time.map(String) : []
  const amounts = Array.isArray(hourly?.precipitation) ? hourly.precipitation : []
  const inicio = horaLocalOuroBranco()
  const startIndex = times.findIndex(time => time >= inicio)
  const next24Hours = startIndex < 0 ? [] : amounts.slice(startIndex, startIndex + 24)
  const total = next24Hours.length === 24 && next24Hours.every(value => typeof value === 'number' && Number.isFinite(value))
    ? next24Hours.reduce((sum, value) => sum + (value as number), 0)
    : null
  const result = Object.fromEntries(monitoradas.map(area => [area.id, total]))
  return result
}
