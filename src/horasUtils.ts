import { supabase, supabaseDisponivel } from './supabaseClient'

const FERIADOS_FIXOS_SET = new Set([
  '01-01', '04-21', '05-01', '09-07', '10-12',
  '11-02', '11-15', '11-20', '12-25',
])

const AGENTES_SEM_SOBREAVISO = new Set(['Talita', 'Cristiane', 'Sócrates'])

function chaveDataDt(dt: Date): string {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function ehFimDeSemanaOuFeriado(chave: string, feriadosCustom: string[] = []): boolean {
  if (feriadosCustom.includes(chave)) return true
  const [y, m, d] = chave.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const dow = dt.getDay()
  if (dow === 0 || dow === 6) return true
  const mmdd = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return FERIADOS_FIXOS_SET.has(mmdd)
}

function minutesSobravisoNoDia(
  _chave: string,
  deMin: number,
  ateMin: number,
  _feriadosCustom: string[] = [],
): number {
  if (ateMin <= deMin) return 0
  const overlap = (a: number, b: number, c: number, d: number) =>
    Math.max(0, Math.min(b, d) - Math.max(a, c))
  let sb = 0
  sb += overlap(deMin, ateMin, 0, 7 * 60)
  sb += overlap(deMin, ateMin, 17 * 60, 24 * 60)
  return sb
}

export function calcularHorasSobreaviso(
  dataStr: string,
  horaInicio: string,
  horaFim: string,
  feriadosCustom: string[] = [],
): number {
  if (!dataStr || !horaInicio || !horaFim) return 0
  const [hI, mI] = horaInicio.split(':').map(Number)
  const [hF, mF] = horaFim.split(':').map(Number)
  if (isNaN(hI) || isNaN(mI) || isNaN(hF) || isNaN(mF)) return 0
  const inicioMin = hI * 60 + mI
  const fimMin = hF * 60 + mF
  if (inicioMin === fimMin) return 0

  const [ano, mes, dia] = dataStr.split('-').map(Number)
  let totalMin = 0

  if (fimMin > inicioMin) {
    totalMin = minutesSobravisoNoDia(dataStr, inicioMin, fimMin, feriadosCustom)
  } else {
    totalMin = minutesSobravisoNoDia(dataStr, inicioMin, 24 * 60, feriadosCustom)
    const dtNext = new Date(ano, mes - 1, dia)
    dtNext.setDate(dtNext.getDate() + 1)
    const chave2 = chaveDataDt(dtNext)
    totalMin += minutesSobravisoNoDia(chave2, 0, fimMin, feriadosCustom)
  }

  return Math.round(totalMin * 100 / 60) / 100
}

export function calcularHorasTotal(horaInicio: string, horaFim: string): number {
  if (!horaInicio || !horaFim) return 0
  const [hI, mI] = horaInicio.split(':').map(Number)
  const [hF, mF] = horaFim.split(':').map(Number)
  if (isNaN(hI) || isNaN(mI) || isNaN(hF) || isNaN(mF)) return 0
  const inicioMin = hI * 60 + mI
  const fimMin = hF * 60 + mF
  const diff = fimMin >= inicioMin ? fimMin - inicioMin : 24 * 60 - inicioMin + fimMin
  return Math.round(diff * 100 / 60) / 100
}

export function formatarHoras(horas: number): string {
  if (!horas || horas <= 0) return '0h'
  const h = Math.floor(horas)
  const m = Math.round((horas - h) * 60)
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}min`
}

// Busca os dados atuais do servidor sem sobrescrever — para fazer merge seguro
async function buscarDadosServidorAtual(): Promise<Record<string, unknown>> {
  try {
    if (supabaseDisponivel) {
      const { data } = await supabase
        .from('escala_estado')
        .select('data')
        .eq('id', 1)
        .single()
      if (data?.data && typeof data.data === 'object') return data.data as Record<string, unknown>
    } else {
      const res = await fetch('/api/escala')
      if (res.ok) {
        const json = await res.json()
        if (json && typeof json === 'object') return json as Record<string, unknown>
      }
    }
  } catch { /* ignora — usa localStorage como base */ }
  return {}
}

export async function sincronizarHorasEscala(params: {
  agentes: string[]
  dataStr: string
  horasSobreaviso: number
  ocId: number | string
  natureza: string
  oldAgentes?: string[]
  oldDataStr?: string
  oldHorasSobreaviso?: number
}): Promise<void> {
  const { agentes, dataStr, horasSobreaviso, ocId, natureza, oldAgentes, oldDataStr, oldHorasSobreaviso } = params

  // Busca dados do servidor primeiro para não sobrescrever o calendário com localStorage vazio
  const dadosServidor = await buscarDadosServidorAtual()

  // Lê localStorage local
  let dadosLocal: Record<string, unknown>
  try {
    const raw = localStorage.getItem('escala-data-v3')
    dadosLocal = raw ? JSON.parse(raw) : {}
  } catch { dadosLocal = {} }

  // Merge: servidor tem precedência para todos os campos EXCETO horas (que vêm do local)
  // Isso preserva o calendário completo mesmo em dispositivos sem escala no localStorage
  const dados: Record<string, unknown> = { ...dadosServidor }

  // Para as horas, usa o local como base (mais atualizado neste dispositivo)
  const htsBase = (dadosLocal.horasTrabalhadasSobreaviso ?? dadosServidor.horasTrabalhadasSobreaviso ?? {}) as Record<string, Record<string, number>>
  const jsBase = (dadosLocal.justificativasSobreaviso ?? dadosServidor.justificativasSobreaviso ?? {}) as Record<string, Record<string, string>>

  const hts: Record<string, Record<string, number>> = { ...htsBase }
  const js: Record<string, Record<string, string>> = { ...jsBase }

  // Remove horas antigas se for edição — subtrai da data acumulada
  if (oldHorasSobreaviso && oldHorasSobreaviso > 0 && oldAgentes && oldDataStr) {
    for (const agente of oldAgentes) {
      if (hts[agente]?.[oldDataStr] != null) {
        const restante = Math.max(0, (hts[agente][oldDataStr] ?? 0) - oldHorasSobreaviso)
        if (restante <= 0) delete hts[agente][oldDataStr]
        else hts[agente][oldDataStr] = Math.round(restante * 100) / 100
      }
    }
  }

  // Adiciona novas horas (somente se > 0)
  if (horasSobreaviso > 0 && dataStr) {
    const justificativa = `Oc.#${ocId}: ${natureza}`
    for (const agente of agentes) {
      if (!hts[agente]) hts[agente] = {}
      hts[agente][dataStr] = Math.round(((hts[agente][dataStr] ?? 0) + horasSobreaviso) * 100) / 100
      if (!js[agente]) js[agente] = {}
      const existente = js[agente][dataStr] ?? ''
      js[agente][dataStr] = existente ? `${existente}; Oc.#${ocId}: ${natureza}` : justificativa
    }
  }

  dados.horasTrabalhadasSobreaviso = hts
  dados.justificativasSobreaviso = js

  // Atualiza localStorage com dados mesclados
  localStorage.setItem('escala-data-v3', JSON.stringify(dados))

  try {
    const now = new Date().toISOString()
    if (supabaseDisponivel) {
      await supabase
        .from('escala_estado')
        .upsert({ id: 1, data: dados, updated_at: now }, { onConflict: 'id' })
    } else {
      await fetch('/api/escala', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      })
    }
  } catch (e) {
    console.warn('[horasUtils] Falha ao sincronizar escala:', e)
  }
}
