import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './RadarDC.css'
import './RadarDCResponsive.css'
import { getAgenteLogado } from './Login'
import { wsOn, wsSend } from '../wsClient'
import { supabase, supabaseDisponivel } from '../supabaseClient'
import { AGENTES } from '../types'
import { ehFerramentalPorLitro } from '../ferramentalUtils'

type Prioridade = 'normal' | 'importante' | 'urgente'
type ConfirmacaoRadar = { agente: string; confirmado: boolean; confirmedAt?: string }
type RegistroRadar = {
  id: string; texto: string; data: string; hora: string; prioridade: Prioridade
  concluido: boolean; criadoPor: string; criadoEm: string; tipo: 'lembrete' | 'notificacao'
  agentesEnvolvidos: string[]; confirmacoesAgentes: ConfirmacaoRadar[]
}
type Atividade = {
  id: number; agente: string; hora: string; placa?: string; natureza?: string
  endereco?: string; km?: string | number; nivelCombustivel?: string
  itens?: unknown; fotoCarregada?: boolean; created_at: string
}
type AtividadeFerramenta = {
  id: number; ferramentaId: string; agente: string; ferramentaNome: string
  quantidadeCadastrada?: number; quantidadeConferida?: number
  condicao: 'boa' | 'media' | 'ruim' | 'quantidade' | string; itemFaltante?: string; justificativa?: string
  data_checklist: string; created_at: string
}
type FerramentaCatalogo = { id: string; nome: string; quantidade: number }
type ResumoFerramental = {
  agente: string; tiposVerificados: number; totalTipos: number
  itensConferidos: number; itensCadastrados: number
  boa: number; media: number; ruim: number
  ferramentasRuins: string[]; faltantes: string[]; semChecklist: string[]; serragemAlertas: string[]; litrosAlertas: string[]
}

type DiaPrevisao = { data: string; codigo: number; temperaturaMax: number; temperaturaMin: number; precipitacao: number; probabilidade: number; umidade: number; vento: number; rajada: number }
type HoraPrevisao = { time: string; codigo: number; temperatura: number; probabilidade: number; precipitacao: number; vento: number }
type TempoDC = { atual: { codigo: number; temperatura: number; chuva: number; vento: number; rajada: number; umidade: number }; horas: HoraPrevisao[]; dias: DiaPrevisao[] }

const OURO_BRANCO = { latitude: -20.5236, longitude: -43.6949 }
const nomesTempo: Record<number, string> = { 0: 'Céu limpo', 1: 'Predominantemente limpo', 2: 'Parcialmente nublado', 3: 'Nublado', 45: 'Neblina', 48: 'Neblina com gelo', 51: 'Garoa leve', 53: 'Garoa moderada', 55: 'Garoa intensa', 61: 'Chuva leve', 63: 'Chuva moderada', 65: 'Chuva forte', 71: 'Neve leve', 73: 'Neve moderada', 75: 'Neve forte', 80: 'Pancadas leves', 81: 'Pancadas moderadas', 82: 'Pancadas fortes', 95: 'Trovoada', 96: 'Trovoada com granizo', 99: 'Trovoada forte' }
function horarioNoturno(time?: string) {
  const hora = Number(time?.slice(11, 13))
  return Number.isFinite(hora) && (hora >= 18 || hora < 6)
}
function iconeTempo(codigo: number, time?: string) {
  const noturno = horarioNoturno(time)
  if (codigo >= 95) return '⛈️'
  if (codigo >= 80) return '🌦️'
  if (codigo >= 51) return '🌧️'
  if (codigo >= 45) return '🌫️'
  if (codigo >= 2) return noturno ? '☁️' : '⛅'
  return noturno ? '🌙' : '☀️'
}
function dataTempo(data: string) { return new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }

const STORAGE_KEY = 'defesacivil-radar-dc-v2'
const prioridadeConfig: Record<Prioridade, { label: string; emoji: string }> = {
  normal: { label: 'Normal', emoji: '🟢' },
  importante: { label: 'Importante', emoji: '🟠' },
  urgente: { label: 'Urgente', emoji: '🔴' },
}

function dataLocalISO(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
}
function hoje() { return dataLocalISO() }
function horaAgora() { return new Date().toTimeString().slice(0, 5) }
function dataBonita(data: string) {
  return data ? new Date(`${data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '') : 'Sem data'
}
function lerConfirmacoes(valor: unknown): ConfirmacaoRadar[] {
  let dados = valor
  if (typeof dados === 'string') {
    try { dados = JSON.parse(dados) } catch { return [] }
  }
  if (!Array.isArray(dados)) return []
  return dados
    .filter(item => item && typeof item === 'object' && typeof item.agente === 'string')
    .map(item => ({ agente: String(item.agente), confirmado: item.confirmado === true, confirmedAt: typeof item.confirmedAt === 'string' ? item.confirmedAt : undefined }))
}
function disparar(nome: string, detail: unknown) {
  window.dispatchEvent(new CustomEvent(nome, { detail }))
}

function percentual(valor: number, total: number) {
  return total > 0 ? Math.round((valor / total) * 100) : 0
}

function eSerragem(nome: string) {
  return /serragem/i.test(nome)
}

function eControlePorQuantidade(nome: string) {
  return eSerragem(nome) || ehFerramentalPorLitro(nome)
}

function resumirFerramental(
  registros: AtividadeFerramenta[],
  catalogo: FerramentaCatalogo[],
): ResumoFerramental[] {
  const catalogoComCondicao = catalogo.filter(item => !eControlePorQuantidade(item.nome))
  const totalTipos = catalogoComCondicao.length || new Set(
    registros.filter(item => !eControlePorQuantidade(item.ferramentaNome)).map(item => item.ferramentaId).filter(Boolean),
  ).size
  const catalogoPorId = new Map(catalogo.map(item => [item.id, item]))
  const porAgente = new Map<string, Map<string, AtividadeFerramenta>>()

  registros.forEach(registro => {
    const nomeAgente = registro.agente || 'Agente não informado'
    const ferramentaId = registro.ferramentaId || `registro-${registro.id}`
    const registrosDoAgente = porAgente.get(nomeAgente) || new Map<string, AtividadeFerramenta>()
    const anterior = registrosDoAgente.get(ferramentaId)
    if (!anterior || new Date(registro.created_at || registro.data_checklist).getTime() >= new Date(anterior.created_at || anterior.data_checklist).getTime()) {
      registrosDoAgente.set(ferramentaId, registro)
    }
    porAgente.set(nomeAgente, registrosDoAgente)
  })

  return Array.from(porAgente.entries()).map(([agente, registrosMap]) => {
    const registrosAgente = Array.from(registrosMap.values())
    const idsVerificados = new Set(registrosAgente.filter(item => !eControlePorQuantidade(item.ferramentaNome)).map(item => item.ferramentaId))
    const boa = registrosAgente.filter(item => !eControlePorQuantidade(item.ferramentaNome) && item.condicao === 'boa').length
    const media = registrosAgente.filter(item => !eControlePorQuantidade(item.ferramentaNome) && item.condicao === 'media').length
    const ruim = registrosAgente.filter(item => !eControlePorQuantidade(item.ferramentaNome) && item.condicao === 'ruim').length
    let itensCadastrados = 0
    let itensConferidos = 0
    const ferramentasRuins: string[] = []
    const faltantes: string[] = []
    const serragemAlertas: string[] = []
    const litrosAlertas: string[] = []

    registrosAgente.forEach(registro => {
      const catalogoItem = catalogoPorId.get(registro.ferramentaId)
      const cadastrada = Number(registro.quantidadeCadastrada) > 0
        ? Number(registro.quantidadeCadastrada)
        : Math.max(1, catalogoItem?.quantidade || 1)
      const conferida = registro.quantidadeConferida == null
        ? cadastrada
        : Math.max(0, Number(registro.quantidadeConferida))
      const quantidadeFaltante = Math.max(0, cadastrada - conferida)
      itensCadastrados += cadastrada
      itensConferidos += Math.min(cadastrada, conferida)
      if (ehFerramentalPorLitro(registro.ferramentaNome)) {
        if (conferida < 10) {
          litrosAlertas.push(`${conferida} litro(s) de ${registro.ferramentaNome} — Repor estoque`)
        }
        return
      }
      if (eSerragem(registro.ferramentaNome)) {
        if (conferida <= 2) serragemAlertas.push(`${conferida} saco(s) de serragem — Repor serragem`)
        return
      }
      if (registro.condicao === 'ruim') ferramentasRuins.push(registro.ferramentaNome)
      if (quantidadeFaltante > 0) {
        const nomeItem = String(registro.ferramentaNome || 'ferramental').trim()
        const ondeEsta = String(registro.itemFaltante || '').trim()
        const justificativa = String(registro.justificativa || '').trim()
        const explicacao = ondeEsta
          ? `Onde está: ${ondeEsta}`
          : `Justificativa: ${justificativa || 'não informada'}`
        faltantes.push(
          `${quantidadeFaltante} ${nomeItem} — ${explicacao}`,
        )
      }
    })

    const semChecklist = catalogoComCondicao
      .filter(item => !idsVerificados.has(item.id))
      .map(item => item.nome)
    return {
      agente, tiposVerificados: idsVerificados.size, totalTipos, itensConferidos, itensCadastrados,
      boa, media, ruim, ferramentasRuins: [...new Set(ferramentasRuins)],
      faltantes, semChecklist, serragemAlertas: [...new Set(serragemAlertas)],
      litrosAlertas: [...new Set(litrosAlertas)],
    }
  }).sort((a, b) => a.agente.localeCompare(b.agente))
}

function temFotoCarregada(itens: unknown) {
  let dados = itens
  if (typeof dados === 'string') {
    try { dados = JSON.parse(dados) } catch { return false }
  }
  if (!dados || typeof dados !== 'object') return false
  const registro = dados as Record<string, unknown>
  const fotos = registro._fotosCarregadas ?? registro.fotosCarregadas
  return Array.isArray(fotos) && fotos.length > 0
}

function tocarSininho() {
  try {
    if (typeof window === 'undefined' || !window.AudioContext) return
    const contexto = new window.AudioContext()
    const agora = contexto.currentTime
    ;[0, 0.16, 0.32].forEach((atraso, indice) => {
      const oscilador = contexto.createOscillator()
      const ganho = contexto.createGain()
      oscilador.type = 'triangle'
      oscilador.frequency.value = [659, 880, 1175][indice]
      ganho.gain.setValueAtTime(0.0001, agora + atraso)
      ganho.gain.exponentialRampToValueAtTime(0.16, agora + atraso + 0.025)
      ganho.gain.exponentialRampToValueAtTime(0.0001, agora + atraso + 0.72)
      oscilador.connect(ganho).connect(contexto.destination)
      oscilador.start(agora + atraso)
      oscilador.stop(agora + atraso + 0.76)
    })
    window.setTimeout(() => contexto.close().catch(() => {}), 1200)
  } catch { /* áudio pode estar bloqueado até interação */ }
}

export default function RadarDC() {
  const agente = getAgenteLogado() || 'Agente DC'
  const [registros, setRegistros] = useState<RegistroRadar[]>([])
  const [dataSelecionada, setDataSelecionada] = useState(hoje())
  const [mes, setMes] = useState(() => new Date(`${hoje()}T12:00:00`))
  const [textoLembrete, setTextoLembrete] = useState('')
  const [lembreteEditorAberto, setLembreteEditorAberto] = useState(false)
  const [textoNotificacao, setTextoNotificacao] = useState('')
  const [hora, setHora] = useState(horaAgora())
  const [prioridade, setPrioridade] = useState<Prioridade>('normal')
  const [agentesEnvolvidos, setAgentesEnvolvidos] = useState<string[]>([])
  const [agentesLembrete, setAgentesLembrete] = useState<string[]>([])
  const [editorAberto, setEditorAberto] = useState(false)
  const [tv, setTv] = useState(false)
  const [atividades, setAtividades] = useState<{
    checklists: Atividade[]
    checklistsFerramentas: AtividadeFerramenta[]
    ferramentasCatalogo: FerramentaCatalogo[]
    ocorrencias: Atividade[]
  }>({ checklists: [], checklistsFerramentas: [], ferramentasCatalogo: [], ocorrencias: [] })
  const [tempo, setTempo] = useState<TempoDC | null>(null)
  const [horaAtual, setHoraAtual] = useState(() => new Date())
  const [erroTempo, setErroTempo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroSalvamento, setErroSalvamento] = useState('')
  const carregadoRef = useRef(false)
  const pendentesRef = useRef(new Set<string>())
  const ocorrenciasNotificadasRef = useRef(new Set<number>())
  const atividadesAssinaturaRef = useRef('')
  const calendarioRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setHoraAtual(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const carregar = useCallback(async () => {
    try {
      let rows: Array<Record<string, unknown>>
      if (supabaseDisponivel) {
        const result = await supabase.from('radar_bilhetes').select('*').order('data', { ascending: true }).order('hora', { ascending: true }).order('criado_em', { ascending: true })
        if (result.error) throw new Error(result.error.message)
        rows = (result.data || []) as Array<Record<string, unknown>>
      } else {
        const res = await fetch('/api/radar-bilhetes')
        if (!res.ok) throw new Error('Servidor do Radar indisponível.')
        rows = await res.json() as Array<Record<string, unknown>>
      }
      const remotos = rows.map(row => ({
        id: String(row.id), texto: String(row.texto), data: String(row.data), hora: String(row.hora),
        prioridade: (row.prioridade as Prioridade) || 'normal', concluido: Boolean(row.concluido),
        criadoPor: String(row.criado_por), criadoEm: String(row.criado_em),
        tipo: row.tipo === 'notificacao' ? 'notificacao' : 'lembrete',
        agentesEnvolvidos: Array.isArray(row.agentes_envolvidos) ? row.agentes_envolvidos.map(String) : [],
        confirmacoesAgentes: lerConfirmacoes(row.confirmacoes_agentes),
      }))
      setRegistros(prev => {
        const idsRemotos = new Set(remotos.map(row => row.id))
        const aindaPendentes = prev.filter(row => pendentesRef.current.has(row.id) && !idsRemotos.has(row.id))
        return [...remotos, ...aindaPendentes]
      })
      carregadoRef.current = true
    } catch {
      try {
        setRegistros(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'))
        carregadoRef.current = true
      } catch { setRegistros([]) }
    }
  }, [])

  const notificarOcorrenciasNovas = useCallback((ocorrencias: Atividade[], avisar: boolean) => {
    ocorrencias.forEach(ocorrencia => {
      if (!avisar) { ocorrenciasNotificadasRef.current.add(ocorrencia.id); return }
      if (ocorrenciasNotificadasRef.current.has(ocorrencia.id)) return
      ocorrenciasNotificadasRef.current.add(ocorrencia.id)
      if ('Notification' in window && Notification.permission === 'granted') {
        const detalhes = [ocorrencia.hora, ocorrencia.natureza || 'Ocorrência registrada', ocorrencia.endereco || 'Endereço não informado'].join(' · ')
        new Notification('Nova ocorrência no Radar DC', { body: detalhes, tag: 'radar-ocorrencia-' + ocorrencia.id })
      }
    })
  }, [])

  const atualizarAtividadesNaTela = useCallback((dados: {
    checklists: Atividade[]
    checklistsFerramentas: AtividadeFerramenta[]
    ferramentasCatalogo: FerramentaCatalogo[]
    ocorrencias: Atividade[]
  }, avisar: boolean) => {
    const assinatura = JSON.stringify({
      checklists: dados.checklists.map(item => [item.id, item.created_at, item.hora, item.placa, item.km, item.nivelCombustivel]),
      checklistsFerramentas: dados.checklistsFerramentas.map(item => [
        item.id, item.created_at, item.agente, item.ferramentaNome, item.condicao,
        item.quantidadeCadastrada, item.quantidadeConferida, item.itemFaltante, item.justificativa,
      ]),
      ocorrencias: dados.ocorrencias.map(item => [item.id, item.created_at, item.hora, item.natureza, item.endereco]),
    })
    const mudouDesdeUmaLeituraAnterior = Boolean(atividadesAssinaturaRef.current) && atividadesAssinaturaRef.current !== assinatura
    atividadesAssinaturaRef.current = assinatura
    setAtividades(dados)
    notificarOcorrenciasNovas(dados.ocorrencias, avisar)
    if (avisar || mudouDesdeUmaLeituraAnterior) tocarSininho()
  }, [notificarOcorrenciasNovas])

  const carregarAtividades = useCallback(async (avisar = false) => {
    try {
      if (supabaseDisponivel) {
        const proximoDia = new Date(`${dataSelecionada}T12:00:00`)
        proximoDia.setDate(proximoDia.getDate() + 1)
        const proximo = dataLocalISO(proximoDia)
        const [checklistsResult, checklistsFerramentasResult, ocorrenciasResult] = await Promise.all([
          // O checklist de viatura usa data; o de ferramental usa timestamptz.
          supabase.from('checklists_viatura').select('id,data_checklist,km,placa,motorista,itens,created_at').eq('data_checklist', dataSelecionada).order('created_at', { ascending: false }),
          supabase.from('checklists_ferramental').select('id,ferramenta_id,quantidade_cadastrada,quantidade_conferida,condicao,item_faltante,realizado_por,data_checklist,created_at').gte('data_checklist', `${dataSelecionada}T00:00:00-03:00`).lt('data_checklist', `${proximo}T00:00:00-03:00`).order('created_at', { ascending: false }),
          supabase.from('ocorrencias').select('id,natureza,endereco,agentes,responsavel_registro,created_at,hora_inicio,data_ocorrencia')
            .eq('data_ocorrencia', dataSelecionada)
            .order('created_at', { ascending: false }),
        ])
        // A tabela de ferramentas pode não existir em bases Supabase antigas.
        // Ela não deve impedir o carregamento das demais atividades do Radar.
        if (!checklistsResult.error && !ocorrenciasResult.error) {
          const checklistsFerramentas = checklistsFerramentasResult.error
            ? []
            : (checklistsFerramentasResult.data || []) as Array<Record<string, unknown>>
          const materiaisResult = await supabase
            .from('materiais')
            .select('id,nome,quantidade')
            .eq('categoria', 'ferramental')
          const nomesFerramentas = new Map((materiaisResult.data || []).map(row => [String(row.id), String(row.nome)]))
          const dados = {
            checklists: (checklistsResult.data || []).map(row => ({
              ...row,
              agente: row.motorista || 'Agente não informado',
              fotoCarregada: temFotoCarregada(row.itens),
              hora: row.data_checklist?.includes('T') ? row.data_checklist.slice(11, 16) : new Date(row.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
              nivelCombustivel: row.itens && typeof row.itens === 'object' && 'nivelCombustivel' in row.itens
                ? String(row.itens.nivelCombustivel || '')
                : '',
            })) as Atividade[],
            checklistsFerramentas: checklistsFerramentas.map(row => ({
              id: Number(row.id),
              ferramentaId: String(row.ferramenta_id || ''),
              agente: String(row.realizado_por || 'Agente não informado'),
              ferramentaNome: nomesFerramentas.get(String(row.ferramenta_id)) || 'Ferramenta não informada',
              quantidadeCadastrada: Number(row.quantidade_cadastrada || 0),
              quantidadeConferida: Number(row.quantidade_conferida || 0),
              condicao: String(row.condicao || ''),
              itemFaltante: String(row.item_faltante || ''),
              justificativa: String(row.justificativa || ''),
              data_checklist: String(row.data_checklist || ''),
              created_at: String(row.created_at || row.data_checklist || ''),
            })),
            ferramentasCatalogo: (materiaisResult.data || []).map(row => ({
              id: String(row.id),
              nome: String(row.nome || 'Ferramenta não informada'),
              quantidade: Math.max(1, Number(row.quantidade || 1)),
            })),
            ocorrencias: (ocorrenciasResult.data || []).map(row => ({ ...row, agente: row.responsavel_registro || (Array.isArray(row.agentes) ? row.agentes[0] : null) || 'Agente não informado', hora: row.hora_inicio || new Date(row.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) })) as Atividade[],
          }
           atualizarAtividadesNaTela(dados, avisar)
          return
        }
      }
      const res = await fetch(`/api/atividades-dia?data=${dataSelecionada}`)
      if (res.ok) {
        const dados = await res.json() as {
          checklists: Atividade[]
          checklistsFerramentas: AtividadeFerramenta[]
          ferramentasCatalogo: FerramentaCatalogo[]
          ocorrencias: Atividade[]
        }
          atualizarAtividadesNaTela({
            ...dados,
            checklists: dados.checklists.map(c => ({ ...c, fotoCarregada: temFotoCarregada(c.itens) })),
          }, avisar)
      }
    } catch { setAtividades({ checklists: [], checklistsFerramentas: [], ferramentasCatalogo: [], ocorrencias: [] }) }
  }, [dataSelecionada, atualizarAtividadesNaTela])


  useEffect(() => {
    let ativo = true
    const carregarTempo = async () => {
      try {
        const params = new URLSearchParams({ latitude: String(OURO_BRANCO.latitude), longitude: String(OURO_BRANCO.longitude), current: 'temperature_2m,weather_code,precipitation,relative_humidity_2m,wind_speed_10m,wind_gusts_10m', hourly: 'temperature_2m,weather_code,precipitation_probability,precipitation,wind_speed_10m', daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,relative_humidity_2m_min,wind_speed_10m_max,wind_gusts_10m_max', timezone: 'America/Sao_Paulo', forecast_days: '7', wind_speed_unit: 'kmh', precipitation_unit: 'mm' })
         const res = await fetch('https://api.open-meteo.com/v1/forecast?' + params, { cache: 'no-store' })
        if (!res.ok) throw new Error('Serviço meteorológico indisponível.')
        const json = await res.json() as { current: Record<string, number>; hourly: Record<string, Array<string | number>>; daily: Record<string, Array<string | number>> }
        if (!ativo) return
        const hourly = json.hourly || {}
        const horas = (hourly.time || []).map((time, i) => ({
          time: String(time),
          codigo: Number(hourly.weather_code?.[i] ?? 0),
          temperatura: Number(hourly.temperature_2m?.[i] ?? 0),
          probabilidade: Number(hourly.precipitation_probability?.[i] ?? 0),
          precipitacao: Number(hourly.precipitation?.[i] ?? 0),
          vento: Number(hourly.wind_speed_10m?.[i] ?? 0),
        })).filter(h => new Date(h.time).getTime() >= Date.now()).slice(0, 12)
        setTempo({
          atual: { codigo: json.current.weather_code, temperatura: json.current.temperature_2m, chuva: json.current.precipitation, vento: json.current.wind_speed_10m, rajada: json.current.wind_gusts_10m, umidade: json.current.relative_humidity_2m },
          horas,
          dias: json.daily.time.map((data, i) => ({ data: String(data), codigo: Number(json.daily.weather_code[i]), temperaturaMax: Number(json.daily.temperature_2m_max[i]), temperaturaMin: Number(json.daily.temperature_2m_min[i]), precipitacao: Number(json.daily.precipitation_sum[i]), probabilidade: Number(json.daily.precipitation_probability_max[i]), umidade: Number(json.daily.relative_humidity_2m_min[i]), vento: Number(json.daily.wind_speed_10m_max[i]), rajada: Number(json.daily.wind_gusts_10m_max[i]) }))
        })
        setErroTempo('')
      } catch (error) {
        if (ativo) setErroTempo(error instanceof Error ? error.message : 'Não foi possível carregar o tempo.')
      }
    }
     carregarTempo()
     const timer = window.setInterval(carregarTempo, 5 * 60 * 1000)
     const atualizarAoVoltar = () => {
       if (document.visibilityState === 'visible') carregarTempo()
     }
     document.addEventListener('visibilitychange', atualizarAoVoltar)
     return () => {
       ativo = false
       window.clearInterval(timer)
       document.removeEventListener('visibilitychange', atualizarAoVoltar)
     }
  }, [])

  useEffect(() => {
    carregar()
    const off = wsOn('radar_bilhetes_atualizados', () => {
      tocarSininho()
      carregar()
    })
    // Netlify não mantém um servidor WebSocket persistente. O polling mantém
    // o Radar atualizado mesmo quando o Realtime/WS não está disponível.
    const timer = window.setInterval(() => { carregar() }, 10000)
    return () => { off(); window.clearInterval(timer) }
  }, [carregar])
  useEffect(() => {
    carregarAtividades()
    const avisarAtualizacao = () => carregarAtividades(true)
    const offChecklist = wsOn('checklist_atualizado', avisarAtualizacao)
    const offFerramental = wsOn('checklists_ferramental_atualizados', avisarAtualizacao)
    const offMateriais = wsOn('materiais_atualizados', avisarAtualizacao)
    const offOcorrencias = wsOn('ocorrencias_atualizadas', avisarAtualizacao)
    const timer = window.setInterval(() => { carregarAtividades(false) }, 10000)
    return () => { offChecklist(); offFerramental(); offMateriais(); offOcorrencias(); window.clearInterval(timer) }
  }, [carregarAtividades])
  useEffect(() => {
    if (carregadoRef.current) localStorage.setItem(STORAGE_KEY, JSON.stringify(registros))
  }, [registros])

  const dias = useMemo(() => {
    const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1)
    const inicio = new Date(primeiro); inicio.setDate(1 - primeiro.getDay())
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(inicio); d.setDate(inicio.getDate() + i); return d })
  }, [mes])
  const lembretes = registros.filter(r => r.tipo === 'lembrete')
  const notificacoes = registros.filter(r => r.tipo === 'notificacao')
  const notificacoesDaData = notificacoes.filter(r => r.data === dataSelecionada)
  const notificacoesAtivas = notificacoes.filter(r => r.data >= hoje())
  const proximasNotificacoes = notificacoesAtivas.filter(r => !r.concluido).sort((a, b) => `${a.data}${a.hora}`.localeCompare(`${b.data}${b.hora}`))
  const resumosFerramental = useMemo(
    () => resumirFerramental(atividades.checklistsFerramentas, atividades.ferramentasCatalogo),
    [atividades.checklistsFerramentas, atividades.ferramentasCatalogo],
  )
  const destaquesTempo = useMemo(() => {
    if (!tempo?.dias.length) return null
    return {
      chuva: tempo.dias.reduce((maior, dia) => dia.precipitacao > maior.precipitacao ? dia : maior),
      umidade: tempo.dias.reduce((menor, dia) => dia.umidade < menor.umidade ? dia : menor),
      rajada: tempo.dias.reduce((maior, dia) => dia.rajada > maior.rajada ? dia : maior),
    }
  }, [tempo])


  async function salvarRegistro(tipo: RegistroRadar['tipo'], texto: string, data: string, horaRegistro: string) {
    if (!texto.trim() || salvando) return
    const agentesParaRegistro = tipo === 'lembrete' ? agentesLembrete : agentesEnvolvidos
    if (agentesParaRegistro.length === 0) {
      setErroSalvamento('Marque pelo menos um agente para receber este lembrete.')
      return
    }
    const novo: RegistroRadar = {
      id: crypto.randomUUID(), texto: texto.trim(), data, hora: horaRegistro,
      prioridade, concluido: false, criadoPor: agente, criadoEm: new Date().toISOString(), tipo,
      agentesEnvolvidos: agentesParaRegistro, confirmacoesAgentes: [],
    }
    setSalvando(true)
    setErroSalvamento('')
    pendentesRef.current.add(novo.id)
    try {
      let row: Record<string, unknown>
      if (supabaseDisponivel) {
        const result = await supabase.from('radar_bilhetes').upsert({ id: novo.id, texto: novo.texto, data: novo.data, hora: novo.hora, prioridade: novo.prioridade, concluido: false, criado_por: agente, tipo, agentes_envolvidos: novo.agentesEnvolvidos }, { onConflict: 'id' }).select().single()
        if (result.error || !result.data) throw new Error(result.error?.message || 'Não foi possível salvar no banco.')
        row = result.data as Record<string, unknown>
      } else {
        const res = await fetch('/api/radar-bilhetes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...novo, criado_por: agente, tipo, agentes_envolvidos: novo.agentesEnvolvidos }),
        })
        if (!res.ok) {
          const detalhe = await res.json().catch(() => null) as { error?: string } | null
          throw new Error(detalhe?.error || 'Não foi possível salvar o registro.')
        }
        row = await res.json() as Record<string, unknown>
      }
      const salvo: RegistroRadar = {
        id: String(row.id), texto: String(row.texto), data: String(row.data), hora: String(row.hora),
        prioridade: (row.prioridade as Prioridade) || novo.prioridade, concluido: Boolean(row.concluido),
        criadoPor: String(row.criado_por || agente), criadoEm: String(row.criado_em || novo.criadoEm),
        tipo: row.tipo === 'notificacao' ? 'notificacao' : 'lembrete',
        agentesEnvolvidos: Array.isArray(row.agentes_envolvidos) ? row.agentes_envolvidos.map(String) : novo.agentesEnvolvidos,
        confirmacoesAgentes: lerConfirmacoes(row.confirmacoes_agentes),
      }
      setRegistros(prev => [...prev.filter(r => r.id !== salvo.id && r.id !== novo.id), salvo])
      pendentesRef.current.delete(novo.id)
      if (supabaseDisponivel) wsSend({ tipo: 'radar_bilhetes_atualizados' })
      if (tipo === 'lembrete') {
        setTextoLembrete('')
        setAgentesLembrete([])
        setLembreteEditorAberto(false)
      } else {
        setTextoNotificacao('')
        setHora(horaAgora())
        setAgentesEnvolvidos([])
        setEditorAberto(false)
      }
      wsSend({
        tipo: 'radar_notificacao_agente',
        id: novo.id,
        texto: novo.texto,
        data: novo.data,
        hora: novo.hora,
        prioridade: novo.prioridade,
        criadoPor: agente,
        registroTipo: tipo,
        agentesEnvolvidos: novo.agentesEnvolvidos,
      })
      fetch('/api/push/radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentes: novo.agentesEnvolvidos,
          texto: novo.texto,
          data: novo.data,
          hora: novo.hora,
          prioridade: novo.prioridade,
          remetente: agente,
          notificacaoId: novo.id,
          registroTipo: tipo,
        }),
      }).catch(() => {})
    } catch (error) {
      pendentesRef.current.delete(novo.id)
      setErroSalvamento(error instanceof Error ? error.message : 'Não foi possível salvar o registro.')
    } finally {
      setSalvando(false)
    }
  }

  async function remover(id: string) {
    setErroSalvamento('')
    try {
      if (supabaseDisponivel) {
        const result = await supabase.from('radar_bilhetes').delete().eq('id', id).eq('criado_por', agente)
        if (result.error) throw new Error(result.error.message)
      } else {
        const res = await fetch('/api/radar-bilhetes/' + id, {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agente }),
        })
        if (!res.ok) {
          const detalhe = await res.json().catch(() => null) as { error?: string } | null
          throw new Error(detalhe?.error || 'Não foi possível remover o registro.')
        }
      }
      setRegistros(prev => prev.filter(r => r.id !== id))
      if (supabaseDisponivel) wsSend({ tipo: 'radar_bilhetes_atualizados' })
    } catch (error) {
      setErroSalvamento(error instanceof Error ? error.message : 'Não foi possível remover o registro.')
    }
  }

  useEffect(() => wsOn('radar_notificacao_agente', (mensagem) => {
    const envolvidos = Array.isArray(mensagem.agentesEnvolvidos) ? mensagem.agentesEnvolvidos.map(String) : []
    if (!envolvidos.includes(agente) || String(mensagem.criadoPor) === agente) return
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Radar DC — você foi envolvido', {
        body: `${String(mensagem.data || '')} às ${String(mensagem.hora || '')} · ${String(mensagem.texto || '')}`,
        tag: `radar-envolvido-${String(mensagem.id)}`,
      })
    }
  }), [agente])

  useEffect(() => wsOn('radar_confirmacao', (mensagem) => {
    if (String(mensagem.criadoPor) !== agente || !('Notification' in window) || Notification.permission !== 'granted') return
    const nome = String(mensagem.agente || 'Agente')
    const texto = String(mensagem.texto || 'notificação do Radar DC')
    new Notification(mensagem.confirmado === true ? '✅ Radar DC — presença confirmada' : '❌ Radar DC — presença recusada', {
      body: mensagem.confirmado === true ? `${nome} confirmou presença: ${texto}` : `${nome} informou que não poderá ir: ${texto}`,
      tag: `radar-confirmacao-${String(mensagem.id)}-${nome}`,
    })
  }), [agente])

  useEffect(() => {
    if (!editorAberto) return
    const fecharAoClicarFora = (event: PointerEvent) => {
      const alvo = event.target
      if (alvo instanceof Node && !calendarioRef.current?.contains(alvo)) {
        setEditorAberto(false)
      }
    }
    document.addEventListener('pointerdown', fecharAoClicarFora)
    return () => document.removeEventListener('pointerdown', fecharAoClicarFora)
  }, [editorAberto])

  useEffect(() => {
    document.body.classList.toggle('radar-tv-active', tv)
    return () => document.body.classList.remove('radar-tv-active')
  }, [tv])

  return (
    <section className={`radar-page ${tv ? 'radar-tv' : ''}`}>
       <section className="radar-weather radar-weather-compact" aria-labelledby="radar-weather-title">
         <div className="radar-weather-bar">
           <strong className="radar-weather-place" id="radar-weather-title">Ouro Branco – MG</strong>
           {erroTempo && <span className="radar-weather-error">{erroTempo}</span>}
           {!tempo && !erroTempo && <span className="radar-weather-loading">Carregando previsão...</span>}
           {tempo && <div className="radar-weather-condition"><span>{iconeTempo(tempo.atual.codigo)}</span><div><strong>{Math.round(tempo.atual.temperatura)}°C</strong><b>{nomesTempo[tempo.atual.codigo] || 'Condição variável'}</b></div></div>}
           {tempo && <div className="radar-weather-metrics"><span>🌧️ Chuva <b>{tempo.atual.chuva.toFixed(1)} mm</b></span><span>☔ Prob. hoje <b>{tempo.dias[0]?.probabilidade ?? 0}%</b></span><span>💨 Vento <b>{Math.round(tempo.atual.vento)} km/h</b></span><span>💨 Rajadas <b>{Math.round(tempo.atual.rajada)} km/h</b></span><span>💧 Umidade <b>{Math.round(tempo.atual.umidade)}%</b></span></div>}
           <div className="radar-clock" aria-label="Hora atual"><span>HORA ATUAL</span><strong>{horaAtual.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong></div>
           <div className="radar-weather-actions"><button className="radar-tv-btn" onClick={() => setTv(!tv)}>{tv ? '↙ Voltar ao app' : '▣ Modo TV'}</button></div>
         </div>
        {erroTempo && <p className="radar-save-error" role="alert">{erroTempo}</p>}
        {tempo && (
          <div className="radar-weather-detail">
             <div className="weather-section-title">Previsão nas próximas horas</div>
            <div className="weather-hourly" aria-label="Previsão do tempo nas próximas horas">
              {tempo.horas.map(hora => (
                <div className="weather-hour" key={hora.time} title={`${nomesTempo[hora.codigo] || 'Condição variável'} · ${hora.probabilidade}% de chuva`}>
                  <b>{new Date(hora.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</b>
                   <span className="weather-hour-icon">{iconeTempo(hora.codigo, hora.time)}</span>
                  <strong>{Math.round(hora.probabilidade)}%</strong>
                  <div className="weather-probability"><i style={{ height: `${Math.max(3, hora.probabilidade)}%` }} /></div>
                  <small>{Math.round(hora.temperatura)}° · {hora.precipitacao.toFixed(1)} mm</small>
                </div>
              ))}
            </div>
            <div className="weather-section-title weather-days-title">Previsão para os próximos dias</div>
            <div className="weather-days" aria-label="Previsão do tempo para os próximos dias">
              {tempo.dias.map((dia, indice) => (
                <div className="weather-day" key={dia.data}>
                  <b>{indice === 0 ? 'Hoje' : new Date(`${dia.data}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</b>
                  <span>{iconeTempo(dia.codigo)}</span>
                  <strong>{Math.round(dia.temperaturaMax)}° <small>{Math.round(dia.temperaturaMin)}°</small></strong>
                  <em>☔ {Math.round(dia.probabilidade)}%</em>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
      <div className="radar-layout">
        <div className="radar-note-card radar-bilhete-large">
          <div className="card-label"><span className="label-dot" /> LEMBRETE</div>
          <h2>Lembrete</h2>
          <div className="radar-mini-list">
            {lembretes.length === 0 ? (
              <span>Nenhum lembrete cadastrado.</span>
            ) : lembretes.map(l => (
              <div className="radar-mini-item" key={l.id}>
                 <b>{l.agentesEnvolvidos.length > 0 ? l.agentesEnvolvidos.join(', ') : l.criadoPor}</b>
                <span>{l.texto}</span>
                 {l.criadoPor === agente && (
                   <button onClick={() => remover(l.id)} title="Apagar meu lembrete" aria-label="Apagar meu lembrete">×</button>
                 )}
              </div>
            ))}
          </div>
          <textarea value={textoLembrete} onFocus={() => setLembreteEditorAberto(true)} onChange={e => setTextoLembrete(e.target.value)} placeholder="Deixe um lembrete para a equipe..." rows={7} />
           {lembreteEditorAberto && <fieldset className="radar-agentes-fieldset radar-lembrete-agentes">
             <legend>Agentes que receberão o lembrete</legend>
             <div className="radar-agentes-grid">
               {AGENTES.map(nome => (
                 <label key={nome} className="radar-agente-option">
                   <input type="checkbox" checked={agentesLembrete.includes(nome)} onChange={e => setAgentesLembrete(prev => e.target.checked ? [...prev, nome] : prev.filter(item => item !== nome))} />
                   <span>{nome}</span>
                 </label>
               ))}
             </div>
           </fieldset>}
           <button className="radar-add" onClick={() => salvarRegistro('lembrete', textoLembrete, hoje(), horaAgora())} disabled={!textoLembrete.trim() || agentesLembrete.length === 0 || salvando}>{salvando ? 'Salvando...' : '+ Salvar lembrete'}</button>
          {erroSalvamento && <p className="radar-save-error" role="alert">{erroSalvamento}</p>}
          <small>O lembrete fica visível até o agente que o criou removê-lo.</small>
        </div>

        <div className="radar-right-column">
        <div className="radar-calendar-card" ref={calendarioRef}>
          <div className="calendar-top"><div><span>CALENDÁRIO DE NOTIFICAÇÕES</span><h2>{mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h2></div><div className="month-buttons"><button type="button" aria-label="Mês anterior" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}>‹</button><button type="button" aria-label="Próximo mês" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}>›</button></div></div>
          <div className="weekdays">{['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'].map(d => <span key={d}>{d}</span>)}</div>
          <div className="calendar-grid">{dias.map(d => { const key = dataLocalISO(d); const count = notificacoes.filter(n => n.data === key && !n.concluido).length; return <button type="button" key={key} aria-label={dataBonita(key)} className={`${d.getMonth() !== mes.getMonth() ? 'other-month ' : ''}${key === dataSelecionada ? 'selected ' : ''}${key === hoje() ? 'today' : ''}`} onClick={() => { setDataSelecionada(key); setEditorAberto(true) }}><span>{d.getDate()}</span>{count > 0 && <i>{count}</i>}</button> })}</div>
          <div className="calendar-legend"><span><i className="legend-red" /> notificações</span></div>
          {editorAberto && <form className="radar-calendar-editor" onSubmit={e => { e.preventDefault(); salvarRegistro('notificacao', textoNotificacao, dataSelecionada, hora) }}>
            <strong>Notificar em {dataBonita(dataSelecionada)}</strong>
             <div className="radar-date-notifications">
               <span className="radar-date-notifications-title">Notificações desta data</span>
               {notificacoesDaData.length === 0 ? (
                 <span className="radar-date-notifications-empty">Nenhuma notificação cadastrada.</span>
               ) : notificacoesDaData.map(n => (
                 <div className="radar-date-notification" key={n.id}>
                   <div>
                     <b>{n.hora} · {n.prioridade}</b>
                     <span>{n.texto}</span>
                     <small>Por {n.criadoPor}</small>
                     {n.criadoPor === agente && <small className="radar-confirmacoes-status">
                       {n.agentesEnvolvidos.map(nome => {
                         const confirmacao = n.confirmacoesAgentes.find(item => item.agente === nome)
                         return `${nome}: ${confirmacao ? confirmacao.confirmado ? 'vai ✅' : 'não vai ❌' : 'aguardando…'}`
                       }).join(' · ')}
                     </small>}
                   </div>
                   {n.criadoPor === agente && <button type="button" onClick={() => remover(n.id)} aria-label={`Remover notificação: ${n.texto}`} title="Remover notificação">×</button>}
                 </div>
               ))}
             </div>
            <textarea value={textoNotificacao} onChange={e => setTextoNotificacao(e.target.value)} placeholder="Escreva a notificação..." rows={3} />
             <div className="radar-form-row"><label>⏰ Hora<input type="time" value={hora} onChange={e => setHora(e.target.value)} /></label><label>Nível<select value={prioridade} onChange={e => setPrioridade(e.target.value as Prioridade)}>{Object.entries(prioridadeConfig).map(([key, c]) => <option key={key} value={key}>{c.emoji} {c.label}</option>)}</select></label></div>
             <fieldset className="radar-agentes-fieldset">
               <legend>Agentes envolvidos</legend>
               <div className="radar-agentes-grid">
                 {AGENTES.map(nome => (
                   <label key={nome} className="radar-agente-option">
                     <input
                       type="checkbox"
                       checked={agentesEnvolvidos.includes(nome)}
                       onChange={e => setAgentesEnvolvidos(prev => e.target.checked ? [...prev, nome] : prev.filter(item => item !== nome))}
                     />
                     <span>{nome}</span>
                   </label>
                 ))}
               </div>
             </fieldset>
             <button className="radar-add" type="submit" disabled={!textoNotificacao.trim() || salvando}>{salvando ? 'Salvando...' : '+ Colocar no Radar DC'}</button>
            {erroSalvamento && <p className="radar-save-error" role="alert">{erroSalvamento}</p>}
          </form>}
        </div>
        <section className="radar-activities">
         <div className="radar-list-heading"><div><span className="card-label">REGISTROS OPERACIONAIS</span><h2>Atividades de {dataBonita(dataSelecionada)}</h2></div><strong>{atividades.checklists.length + atividades.checklistsFerramentas.length + atividades.ocorrencias.length} registro(s)</strong></div>
        <div className="radar-activity-columns">
          <div><h3>🚗 Checklists do dia</h3>{atividades.checklists.length === 0 ? <div className="radar-empty">Nenhum checklist de viatura registrado.</div> : atividades.checklists.map(c => <button className="radar-activity" key={c.id} onClick={() => disparar('dc:abrir-checklist', { id: c.id })}><b>{c.agente}{c.fotoCarregada && <strong className="radar-foto-carregada">Foto Carregada</strong>}</b><span className="radar-checklist-resumo">{c.hora} - {c.placa || 'Placa não informada'} - KM {c.km || 'não informado'} - ⛽ {c.nivelCombustivel || 'não informado'}</span><em>abrir ›</em></button>)}
          <h3 className="radar-subtitulo-ferramentas">🧰 Checklists de ferramentas</h3>
          {resumosFerramental.length === 0 ? (
            <div className="radar-empty">Nenhum checklist de ferramenta registrado.</div>
          ) : (
            <div className="radar-ferramental-resumos">
              {resumosFerramental.map(resumo => (
                <article className="radar-ferramental-resumo" key={resumo.agente}>
                  <div className="radar-ferramental-cabecalho">
                    <strong>{resumo.agente}</strong>
                    <b>Ferramental {resumo.tiposVerificados}/{resumo.totalTipos}</b>
                  </div>
                   {(resumo.boa + resumo.media + resumo.ruim) > 0 && (
                     <div className="radar-ferramental-itens">
                       <span className="radar-ferramental-boa">Boa - {percentual(resumo.boa, resumo.totalTipos)}%</span>
                       <span className="radar-ferramental-media">Média - {percentual(resumo.media, resumo.totalTipos)}%</span>
                       <span className="radar-ferramental-ruim">Ruim - {percentual(resumo.ruim, resumo.totalTipos)}%</span>
                     </div>
                   )}
                  <div className="radar-ferramental-quantidade">
                     Itens/litros conferidos: {resumo.itensConferidos}/{resumo.itensCadastrados}
                  </div>
                  {resumo.ferramentasRuins.length > 0 && (
                    <div className="radar-ferramental-alerta radar-ferramental-alerta-ruim">
                      <strong>Ruim:</strong> {resumo.ferramentasRuins.join(', ')}
                    </div>
                  )}
                  {resumo.faltantes.length > 0 && (
                    <div className="radar-ferramental-alerta radar-ferramental-alerta-falta">
                      <strong>Faltando:</strong> {resumo.faltantes.join(', ')}
                    </div>
                  )}
                  {resumo.serragemAlertas.length > 0 && (
                    <div className="radar-ferramental-alerta radar-ferramental-alerta-serragem">
                      <strong>⚠️ Serragem:</strong> {resumo.serragemAlertas.join(', ')}
                    </div>
                  )}
                   {resumo.litrosAlertas.length > 0 && (
                     <div className="radar-ferramental-alerta radar-ferramental-alerta-serragem">
                       <strong>⚠️ Estoque baixo:</strong> {resumo.litrosAlertas.join(', ')}
                     </div>
                   )}
                  {resumo.semChecklist.length > 0 && (
                    <div className="radar-ferramental-alerta radar-ferramental-alerta-pendente">
                      <strong>Sem checklist:</strong> {resumo.semChecklist.slice(0, 3).join(', ')}
                      {resumo.semChecklist.length > 3 ? ` e mais ${resumo.semChecklist.length - 3}` : ''}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          </div>
          <div><h3>⚠️ Ocorrências do dia</h3>{atividades.ocorrencias.length === 0 ? <div className="radar-empty">Nenhuma ocorrência registrada.</div> : atividades.ocorrencias.map(o => <button className="radar-activity" key={o.id} onClick={() => disparar('dc:abrir-ocorrencia', { id: o.id })}><b>{o.agente}</b><span>{o.hora} · {o.natureza || 'Natureza não informada'}</span><small>{o.endereco || 'Endereço não informado'}</small><em>abrir ›</em></button>)}</div>
        </div>
        </section>
        </div>
      </div>
      <div className="radar-ticker">
        <span>RADAR DC</span>
        <div className="radar-ticker-viewport">
          {(() => {
            const filaTicker = proximasNotificacoes.length ? proximasNotificacoes : notificacoesAtivas
            return filaTicker.length > 0 ? (
              <div className="radar-ticker-track" style={{ '--ticker-duration': `${Math.max(12, filaTicker.length * 4.2)}s` } as React.CSSProperties}>
                {[0, 1].map(copia => (
                  <div className="radar-ticker-group" key={copia} aria-hidden={copia === 1}>
                    {filaTicker.map(n => <b key={`${copia}-${n.id}`}>● {dataBonita(n.data)} · {n.texto}</b>)}
                  </div>
                ))}
              </div>
            ) : <b className="radar-ticker-empty">Nenhuma notificação cadastrada.</b>
          })()}
        </div>
      </div>
    </section>
  )
}