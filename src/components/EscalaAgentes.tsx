import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { getAgenteLogado } from './Login'
import ModalSenha from './ModalSenha'
import './EscalaAgentes.css'
import { supabase } from '../supabaseClient'

// ── Constantes ────────────────────────────────────────────────────
// Todos os agentes — incluindo Moisés — participam da escala/banco de horas
const AGENTES_ESCALA = [
  { nome: 'Moisés',    cor: '#0f766e', iniciais: 'MO' },
  { nome: 'Valteir',   cor: '#2563eb', iniciais: 'VA' },
  { nome: 'Arthur',    cor: '#16a34a', iniciais: 'AR' },
  { nome: 'Gustavo',   cor: '#dc2626', iniciais: 'GU' },
  { nome: 'Vânia',     cor: '#9333ea', iniciais: 'VÂ' },
  { nome: 'Graça',     cor: '#ea580c', iniciais: 'GR' },
  { nome: 'Talita',    cor: '#0891b2', iniciais: 'TA' },
  { nome: 'Cristiane', cor: '#db2777', iniciais: 'CR' },
  { nome: 'Dyonathan', cor: '#b45309', iniciais: 'DY' },
  { nome: 'Sócrates',  cor: '#475569', iniciais: 'SÓ' },
]

// Quem NÃO faz sobreaviso (mas registra horas extras 1:1, sem multiplicador)
const AGENTES_SEM_SOBREAVISO = new Set(['Talita', 'Cristiane', 'Sócrates'])

// Quem pode ser escalado para sobreaviso = agentes operacionais
const AGENTES_SOBREAVISO = AGENTES_ESCALA.filter(ag => !AGENTES_SEM_SOBREAVISO.has(ag.nome))

// Quem só registra horas extras simples (sem sobreaviso, sem multiplicador)
const AGENTES_HORAS_EXTRAS = AGENTES_ESCALA.filter(ag => AGENTES_SEM_SOBREAVISO.has(ag.nome))

const AGENTE_MAP: Record<string, { cor: string; iniciais: string }> = {}
AGENTES_ESCALA.forEach(ag => { AGENTE_MAP[ag.nome] = { cor: ag.cor, iniciais: ag.iniciais } })

const DIAS_SEMANA_HDR  = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const HORAS_POR_SEMANA_SOBREAVISO = 16
const HORAS_POR_DIA_SOBREAVISO = 4.62
const HORAS_POR_FOLGA_BANCO = 8

// Feriados nacionais fixos (MM-DD)
const FERIADOS_FIXOS = new Set([
  '01-01', // Confraternização Universal
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '09-07', // Independência do Brasil
  '10-12', // Nossa Sra. Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '11-20', // Consciência Negra
  '12-25', // Natal
])

const DIAS_SEMANA_NOMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function ehFeriadoOuDomingo(chave: string, feriadosCustom: string[] = []): boolean {
  if (feriadosCustom.includes(chave)) return true
  const [y, m, d] = chave.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (dt.getDay() === 0) return true
  const mmdd = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return FERIADOS_FIXOS.has(mmdd)
}

function ehSabadoComum(chave: string, feriadosCustom: string[] = []): boolean {
  if (ehFeriadoOuDomingo(chave, feriadosCustom)) return false
  const [y, m, d] = chave.split('-').map(Number)
  return new Date(y, m - 1, d).getDay() === 6
}

function multiplicadorDia(
  chave: string,
  percDomFer: number = 100,
  percSb: number = 50,
  percSabado: number = 50,
  feriadosCustom: string[] = [],
): number {
  if (ehFeriadoOuDomingo(chave, feriadosCustom)) return 1 + percDomFer / 100
  if (ehSabadoComum(chave, feriadosCustom)) return 1 + percSabado / 100
  return 1 + percSb / 100
}

// Retorna os 7 dias (Seg–Dom) de uma semana dado o Monday
function _diasDaSemana(seg: string): string[] {
  const [y, m, d] = seg.split('-').map(Number)
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() + i)
    return chaveData(dt.getFullYear(), dt.getMonth(), dt.getDate())
  })
}

// ── Tipos ─────────────────────────────────────────────────────────

interface Ferias {
  agente: string
  inicio: string
  fim: string
}

interface EscalaData {
  adm: Record<string, string[]>
  sobreaviso: Record<string, string[]>                      // legado — mantido por compat
  sobreavisoSemanal: Record<string, string[]>               // segunda-feira (YYYY-MM-DD) → lista de agentes
  folgas: Record<string, string[]>                          // data (YYYY-MM-DD) → agentes em folga marcada
  ferias: Ferias[]
  horasSobreaviso: Record<string, Record<string, number>>   // legado
  horasTrabalhadasSobreaviso: Record<string, Record<string, number>> // agente → { data: horas }
  feriadosCustom: string[]           // feriados municipais/locais: YYYY-MM-DD
  percDomingoFeriado: number         // % de aumento p/ domingo/feriado (padrão 100 → ×2)
  percSobreaviso: number             // % de aumento p/ horas acionado no sobreaviso (padrão 50 → ×1,5)
  percSabado: number
  descontosFolgaBanco: Record<string, Record<string, number>>  // legado — descontos manuais antigos
  horasExtrasSimples: Record<string, Record<string, number>>   // agente → { data: horas } — sem multiplicador
  ajustesBanco: Record<string, number>                         // agente → horas ajuste manual do Moisés (+/-)
}

// ── Storage ───────────────────────────────────────────────────────
const STORAGE_KEY = 'escala-data-v3'
const TABELA_ESCALA = 'escala_estado'

function normalizarSemanal(raw: Record<string, string | string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(raw)) {
    out[k] = Array.isArray(v) ? v : (v ? [v] : [])
  }
  return out
}

function carregarDados(): EscalaData {
  try {
    // Tenta v3 primeiro
    const rawV3 = localStorage.getItem(STORAGE_KEY)
    if (rawV3) {
      const p = JSON.parse(rawV3)
      return {
        adm: p.adm ?? {},
        sobreaviso: p.sobreaviso ?? {},
        sobreavisoSemanal: normalizarSemanal(p.sobreavisoSemanal ?? {}),
        folgas: normalizarSemanal(p.folgas ?? {}),
        ferias: p.ferias ?? [],
        horasSobreaviso: p.horasSobreaviso ?? {},
        horasTrabalhadasSobreaviso: p.horasTrabalhadasSobreaviso ?? {},
        feriadosCustom: p.feriadosCustom ?? [],
        percDomingoFeriado: p.percDomingoFeriado ?? 100,
        percSobreaviso: p.percSobreaviso ?? 50,
        percSabado: p.percSabado ?? 50,
        descontosFolgaBanco: p.descontosFolgaBanco ?? {},
        horasExtrasSimples: p.horasExtrasSimples ?? {},
        ajustesBanco: p.ajustesBanco ?? {},
      }
    }
    // Migra v2
    const rawV2 = localStorage.getItem('escala-data-v2')
    if (rawV2) {
      const p = JSON.parse(rawV2)
      return {
        adm: p.adm ?? {},
        sobreaviso: p.sobreaviso ?? {},
        sobreavisoSemanal: normalizarSemanal(p.sobreavisoSemanal ?? {}),
        folgas: {},
        ferias: p.ferias ?? [],
        horasSobreaviso: p.horasSobreaviso ?? {},
        horasTrabalhadasSobreaviso: p.horasTrabalhadasSobreaviso ?? {},
        feriadosCustom: [],
        percDomingoFeriado: 100,
        percSobreaviso: 50,
        percSabado: 50,
        descontosFolgaBanco: {},
        horasExtrasSimples: {},
        ajustesBanco: {},
      }
    }
  } catch { /* */ }
  return { adm: {}, sobreaviso: {}, sobreavisoSemanal: {}, folgas: {}, ferias: [], horasSobreaviso: {}, horasTrabalhadasSobreaviso: {}, feriadosCustom: [], percDomingoFeriado: 100, percSobreaviso: 50, percSabado: 50, descontosFolgaBanco: {}, horasExtrasSimples: {}, ajustesBanco: {} }
}

// Marca o instante da última edição local — usado para evitar que o snapshot remoto
// (carregado em segundo plano após a montagem) sobrescreva edições recentes do Moisés.
let _ultimaEdicaoLocalTs = 0
function marcarEdicaoLocal() { _ultimaEdicaoLocalTs = Date.now() }
function teveEdicaoLocalRecente(janelaMs = 60_000) {
  return _ultimaEdicaoLocalTs > 0 && (Date.now() - _ultimaEdicaoLocalTs) < janelaMs
}

function salvarDados(data: EscalaData) {
  marcarEdicaoLocal()
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  // Persistência remota (não bloqueia o salvamento local)
  supabase
    .from(TABELA_ESCALA)
    .upsert({ id: 1, data, updated_at: new Date().toISOString() })
    .then(({ error }) => {
      if (error) console.warn('Falha ao salvar escala no Supabase:', error.message)
    })
}

async function carregarDadosRemoto(): Promise<EscalaData | null> {
  const { data, error } = await supabase
    .from(TABELA_ESCALA)
    .select('data')
    .eq('id', 1)
    .maybeSingle()
  if (error || !data?.data) return null
  const p = data.data as Partial<EscalaData> & Record<string, unknown>
  return {
    adm: (p.adm as EscalaData['adm']) ?? {},
    sobreaviso: (p.sobreaviso as EscalaData['sobreaviso']) ?? {},
    sobreavisoSemanal: normalizarSemanal((p.sobreavisoSemanal as Record<string, string | string[]>) ?? {}),
    folgas: normalizarSemanal((p.folgas as Record<string, string | string[]>) ?? {}),
    ferias: (p.ferias as EscalaData['ferias']) ?? [],
    horasSobreaviso: (p.horasSobreaviso as EscalaData['horasSobreaviso']) ?? {},
    horasTrabalhadasSobreaviso: (p.horasTrabalhadasSobreaviso as EscalaData['horasTrabalhadasSobreaviso']) ?? {},
    feriadosCustom: (p.feriadosCustom as EscalaData['feriadosCustom']) ?? [],
    percDomingoFeriado: (p.percDomingoFeriado as number) ?? 100,
    percSobreaviso: (p.percSobreaviso as number) ?? 50,
    percSabado: (p.percSabado as number) ?? 50,
    descontosFolgaBanco: (p.descontosFolgaBanco as EscalaData['descontosFolgaBanco']) ?? {},
    horasExtrasSimples: (p.horasExtrasSimples as EscalaData['horasExtrasSimples']) ?? {},
    ajustesBanco: (p.ajustesBanco as EscalaData['ajustesBanco']) ?? {},
  }
}

// ── Helpers de data ───────────────────────────────────────────────
function chaveData(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes + 1, 0).getDate()
}

function primeiroDiaSemana(ano: number, mes: number): number {
  return new Date(ano, mes, 1).getDay()
}

function hojeStr(): string {
  const d = new Date()
  return chaveData(d.getFullYear(), d.getMonth(), d.getDate())
}

function fmtDataLonga(str: string) {
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

function fmtDataCurta(str: string) {
  const [, m, d] = str.split('-')
  return `${d}/${m}`
}

// Retorna a data da segunda-feira da semana que contém 'chave'
function segundaDaSemana(chave: string): string {
  const [y, m, d] = chave.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const dow = date.getDay() // 0=Dom
  const diasAteSegunda = dow === 0 ? 6 : dow - 1
  date.setDate(date.getDate() - diasAteSegunda)
  return chaveData(date.getFullYear(), date.getMonth(), date.getDate())
}

// Retorna a segunda-feira seguinte à data informada
function proximaSegunda(chave: string): string {
  const [y, m, d] = chave.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + 7)
  return chaveData(date.getFullYear(), date.getMonth(), date.getDate())
}

function proximoDia(chave: string): string {
  const [y, m, d] = chave.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + 1)
  return chaveData(date.getFullYear(), date.getMonth(), date.getDate())
}

function _diaAnterior(chave: string): string {
  const [y, m, d] = chave.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() - 1)
  return chaveData(date.getFullYear(), date.getMonth(), date.getDate())
}
void _diaAnterior;

// Retorna N segundas-feiras a partir de 'inicio'
function listarSegundas(inicioChave: string, quantidade: number): string[] {
  const lista: string[] = []
  let [y, m, d] = inicioChave.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  for (let i = 0; i < quantidade; i++) {
    lista.push(chaveData(date.getFullYear(), date.getMonth(), date.getDate()))
    date.setDate(date.getDate() + 7)
  }
  return lista
}

function agenteEmFerias(nome: string, chave: string, ferias: Ferias[]): boolean {
  return ferias.some(f => f.agente === nome && chave >= f.inicio && chave <= f.fim)
}

// Folgas marcadas para o agente (datas YYYY-MM-DD) — ordenadas crescente
function folgasDoAgente(agente: string, folgas: Record<string, string[]>): string[] {
  return Object.entries(folgas)
    .filter(([, lista]) => lista.includes(agente))
    .map(([data]) => data)
    .sort()
}

// Banco de horas total do agente — só conta dias de sobreaviso que JÁ passaram
// e desconta toda folga marcada (passada ou futura) imediatamente
function calcularBancoHoras(
  agente: string,
  sobreavisoDiario: Record<string, string[]>,
  horasTrabalhadasSobreaviso: Record<string, Record<string, number>> = {},
  percDomFer: number = 100,
  percSb: number = 50,
  percSabado: number = 50,
  feriadosCustom: string[] = [],
  descontosFolgaBanco: Record<string, Record<string, number>> = {},
  folgas: Record<string, string[]> = {},
  hoje: string = hojeStr(),
): number {
  // Conta APENAS os dias de sobreaviso já passados (data < hoje)
  const diasSobreavisoPassados = Object.entries(sobreavisoDiario)
    .filter(([data, lista]) => lista.includes(agente) && data < hoje).length
  const horasFlat = diasSobreavisoPassados * HORAS_POR_DIA_SOBREAVISO
  const horasAgente = horasTrabalhadasSobreaviso[agente] ?? {}
  const horasExtras = Object.entries(horasAgente).reduce((acc, [data, h]) => {
    return acc + (h * multiplicadorDia(data, percDomFer, percSb, percSabado, feriadosCustom))
  }, 0)
  const descontosLegado = Object.values(descontosFolgaBanco[agente] ?? {}).reduce((acc, h) => acc + h, 0)
  // Toda folga marcada (passada ou futura) já desconta do banco
  const descontosFolgas = folgasDoAgente(agente, folgas).length * HORAS_POR_FOLGA_BANCO
  return Math.max(0, horasFlat + horasExtras - descontosLegado - descontosFolgas)
}

// ── Modal: escalar agentes para um dia de sobreaviso (Moisés) ─────
interface ModalSemanaProps {
  data: string
  agentesSelecionados: string[]
  ferias: Ferias[]
  onSalvar: (agentes: string[]) => void
  onFechar: () => void
}

function ModalEscalarSemana({ data, agentesSelecionados, ferias, onSalvar, onFechar }: ModalSemanaProps) {
  const [escolhidos, setEscolhidos] = useState<string[]>(agentesSelecionados)
  const fimTurno = proximoDia(data)

  function toggle(nome: string) {
    setEscolhidos(prev =>
      prev.includes(nome) ? prev.filter(n => n !== nome) : [...prev, nome]
    )
  }

  return (
    <div className="escala-modal-overlay" onClick={onFechar}>
      <div className="escala-modal" onClick={e => e.stopPropagation()}>
        <div className="escala-modal-header">
          <div>
            <div className="escala-modal-titulo">📟 Escalar Sobreaviso</div>
            <div className="escala-modal-sub">
              {fmtDataCurta(data)} 17h → {fmtDataCurta(fimTurno)} 07h
            </div>
          </div>
          <button className="escala-modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <div className="sb-semana-info-box">
          <span>⏰</span>
          <span>Pode selecionar mais de um agente para este dia de sobreaviso.</span>
        </div>

        <div className="sb-modal-counter">
          {escolhidos.length === 0
            ? 'Nenhum selecionado'
            : `${escolhidos.length} selecionado${escolhidos.length > 1 ? 's' : ''}`}
        </div>

        <div className="escala-modal-lista">
          {AGENTES_SOBREAVISO.map(ag => {
            const emFerias = agenteEmFerias(ag.nome, data, ferias)
            const ativo = escolhidos.includes(ag.nome)
            return (
              <button
                key={ag.nome}
                className={`escala-modal-agente ${ativo ? 'selecionado' : ''} ${emFerias ? 'em-ferias' : ''}`}
                style={ativo ? { background: ag.cor, borderColor: ag.cor, color: '#fff' } : { borderColor: ag.cor }}
                onClick={() => !emFerias && toggle(ag.nome)}
                disabled={emFerias}
              >
                <span className="escala-modal-iniciais" style={{ background: ativo ? 'rgba(255,255,255,0.25)' : ag.cor }}>
                  {ag.iniciais}
                </span>
                <span className="escala-modal-agente-nome">{ag.nome}</span>
                {ativo && <span className="sb-modal-check">✓</span>}
                {emFerias && <span className="escala-modal-ferias-tag">🌴 Férias</span>}
              </button>
            )
          })}
        </div>

        <div className="escala-modal-acoes">
          <button className="escala-modal-limpar" onClick={() => { setEscolhidos([]); onSalvar([]) }}>
            Limpar
          </button>
          <button
            className="escala-modal-salvar"
            onClick={() => onSalvar(escolhidos)}
            disabled={escolhidos.length === 0}
          >
            Confirmar {escolhidos.length > 0 ? `(${escolhidos.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Painel de Escalas Semanais (Moisés) ──────────────────────────
interface PainelSemanasProps {
  sobreavisoSemanal: Record<string, string[]>
  ferias: Ferias[]
  onEscalar: (seg: string) => void
}

function _PainelEscalasSemanas({ sobreavisoSemanal, ferias: _ferias, onEscalar }: PainelSemanasProps) {
  const hoje = hojeStr()
  const segHoje = segundaDaSemana(hoje)

  // Segunda 2 semanas antes até 8 semanas à frente
  const [y, m, d] = segHoje.split('-').map(Number)
  const inicioLista = new Date(y, m - 1, d)
  inicioLista.setDate(inicioLista.getDate() - 14)
  const inicioChave = chaveData(inicioLista.getFullYear(), inicioLista.getMonth(), inicioLista.getDate())

  const semanas = listarSegundas(inicioChave, 12)

  return (
    <div className="sb-semanas-painel">
      <div className="sb-semanas-header">
        <span className="sb-semanas-titulo">📋 Escalas Semanais — Sobreaviso</span>
        <span className="sb-semanas-subtitulo">Toque para editar</span>
      </div>
      <div className="sb-semanas-lista">
        {semanas.map(seg => {
          const proxSeg = proximaSegunda(seg)
          const agentes = sobreavisoSemanal[seg] ?? []
          const isSemanaAtual = seg === segHoje
          const isFutura = seg > segHoje

          return (
            <button
              key={seg}
              className={`sb-semana-row ${isSemanaAtual ? 'atual' : ''} ${isFutura ? 'futura' : 'passada'}`}
              onClick={() => onEscalar(seg)}
            >
              <div className="sb-semana-periodo">
                <span className="sb-semana-datas">
                  Seg {fmtDataCurta(seg)} 17h → Seg {fmtDataCurta(proxSeg)} 07h
                </span>
                {isSemanaAtual && <span className="sb-semana-tag-atual">Semana atual</span>}
              </div>
              <div className="sb-semana-direita">
                {agentes.length > 0 ? (
                  <div className="sb-semana-badges">
                    {agentes.map(nome => {
                      const info = AGENTE_MAP[nome]
                      return info ? (
                        <span
                          key={nome}
                          className="sb-semana-agente-badge"
                          style={{ background: info.cor + '20', color: info.cor, borderColor: info.cor }}
                        >
                          <span className="sb-semana-agente-cor" style={{ background: info.cor }} />
                          <span className="sb-semana-agente-nome">{nome}</span>
                        </span>
                      ) : null
                    })}
                  </div>
                ) : (
                  <span className="sb-semana-vago">— vago —</span>
                )}
                <span className="sb-semana-editar">✏️</span>
              </div>
            </button>
          )
        })}
      </div>
      <div className="sb-semana-legenda-bh">
        ℹ️ Cada semana de sobreaviso gera <strong>{HORAS_POR_SEMANA_SOBREAVISO}h</strong> no banco de horas e folga na semana seguinte (Seg–Sex).
      </div>
    </div>
  )
}

// ── Banco de Horas: visão do agente ──────────────────────────────
interface BancoHorasAgenteProps {
  agente: string
  sobreavisoSemanal: Record<string, string[]>
  horasTrabalhadasSobreaviso: Record<string, Record<string, number>>
  descontosFolgaBanco: Record<string, Record<string, number>>
  folgas: Record<string, string[]>
  percDomingoFeriado: number
  percSobreaviso: number
  percSabado: number
  feriadosCustom: string[]
  onUpdateHoras: (data: string, horas: number) => void
}

function fmtH(h: number): string {
  return h % 1 === 0 ? String(h) : h.toFixed(1)
}

function BancoHorasAgente({ agente, sobreavisoSemanal, horasTrabalhadasSobreaviso, descontosFolgaBanco, folgas, percDomingoFeriado, percSobreaviso, percSabado, feriadosCustom, onUpdateHoras }: BancoHorasAgenteProps) {
  const info = AGENTE_MAP[agente]
  const hoje = hojeStr()
  const horasAgente = horasTrabalhadasSobreaviso[agente] ?? {}
  const descontosAgente = descontosFolgaBanco[agente] ?? {}

  // Folgas marcadas para o agente — toda folga marcada já desconta do banco
  const folgasAgente = folgasDoAgente(agente, folgas)
  const proximaFolga = folgasAgente.find(f => f >= hoje) ?? null
  const folgasConsumidas = folgasAgente

  // Dias de sobreaviso deste agente, ordenados mais recentes primeiro
  const semanasDoAgente = useMemo(() => {
    return Object.entries(sobreavisoSemanal)
      .filter(([, lista]) => lista.includes(agente))
      .map(([seg]) => seg)
      .sort((a, b) => b.localeCompare(a))
  }, [agente, sobreavisoSemanal])

  // Semana aberta para editar horas (expandida)
  const [semanaAberta, setSemanaAberta] = useState<string | null>(null)

  const estaDesobreaviso = (sobreavisoSemanal[hoje] ?? []).includes(agente)

  // ── Cálculo separado dos dois buckets ─────────────────────────
  // Bucket 1 — Sobreaviso: base (14h × turnos) + acionamentos em dias úteis
  // Bucket 2 — Domingos/Feriados: acionamentos em domingos/feriados

  const { horasSobreaviso, horasSabado, horasDomFer, descontosFolga, descontosAuto } = useMemo(() => {
    // Só conta horas dos turnos JÁ passados (data < hoje)
    const numTurnosPassados = semanasDoAgente.filter(d => d < hoje).length
    const base = numTurnosPassados * HORAS_POR_DIA_SOBREAVISO

    let extSb = 0   // extras em dias úteis de sobreaviso
    let extSab = 0
    let extDF = 0   // extras em domingos/feriados durante sobreaviso

    for (const [data, h] of Object.entries(horasAgente)) {
      const isFerOuDom = ehFeriadoOuDomingo(data, feriadosCustom)
      const isSabado = ehSabadoComum(data, feriadosCustom)
      const mult = multiplicadorDia(data, percDomingoFeriado, percSobreaviso, percSabado, feriadosCustom)
      if (isFerOuDom) extDF += h * mult
      else if (isSabado) extSab += h * mult
      else extSb += h * mult
    }

    const descontos = Object.values(descontosAgente).reduce((acc, h) => acc + h, 0)
    const descontosAuto = folgasConsumidas.length * HORAS_POR_FOLGA_BANCO
    return { horasSobreaviso: base + extSb, horasSabado: extSab, horasDomFer: extDF, descontosFolga: descontos, descontosAuto }
  }, [semanasDoAgente, horasAgente, descontosAgente, folgasConsumidas, percDomingoFeriado, percSobreaviso, percSabado, feriadosCustom, hoje])

  const totalBruto = horasSobreaviso + horasSabado + horasDomFer
  const totalGeral = Math.max(0, totalBruto - descontosFolga - descontosAuto)

  // Horas de acionamento em dias úteis de uma semana específica
  function horasExtrasDaSemana(seg: string): number {
    return [seg].reduce((acc, data) => {
      const h = horasAgente[data] ?? 0
      return acc + (h * multiplicadorDia(data, percDomingoFeriado, percSobreaviso, percSabado, feriadosCustom))
    }, 0)
  }

  return (
    <div className="bh-agente-wrap">
      {/* ── cabeçalho do agente ──────────────────────────────────── */}
      <div className="bh-agente-cabecalho">
        <span className="bh-card-iniciais" style={{ background: info?.cor ?? '#64748b' }}>
          {info?.iniciais ?? agente.slice(0, 2).toUpperCase()}
        </span>
        <div className="bh-agente-nome-wrap">
          <span className="bh-card-nome">{agente}</span>
          <span className="bh-agente-subtitulo">Banco de Horas</span>
        </div>
      </div>

      {estaDesobreaviso && (
        <div className="bh-aviso-ativo">
          🟢 Você está de sobreaviso hoje (17h às 07h)
        </div>
      )}

      {proximaFolga && (
        <div className="bh-aviso-folga">
          🏠 Folga em {fmtDataCurta(proximaFolga)}
        </div>
      )}

      <div className="bh-bloco">
        <div className="bh-bloco-header">
          <span className="bh-bloco-icone">📟</span>
          <span className="bh-bloco-titulo">Banco de Horas</span>
          <span className="bh-bloco-total">{fmtH(horasSobreaviso)}h</span>
        </div>

        {semanasDoAgente.length === 0 ? (
          <p className="bh-card-vazio">Nenhum turno de sobreaviso registrado.</p>
        ) : (
          <div className="bh-semanas-lista">
            {semanasDoAgente.map(seg => {
              const dias = [seg]
              const aberta = semanaAberta === seg
              const horasExtras = horasExtrasDaSemana(seg)
              const totalSemana = HORAS_POR_DIA_SOBREAVISO + horasExtras

              return (
                <div key={seg} className="bh-semana-bloco">
                  <button
                    className={`bh-semana-header ${aberta ? 'aberta' : ''}`}
                    onClick={() => setSemanaAberta(aberta ? null : seg)}
                  >
                    <span className="bh-semana-titulo">
                      Sobreaviso em {fmtDataCurta(seg)}
                    </span>
                    <div className="bh-semana-resumo">
                      <span className="bh-semana-base">Base: {HORAS_POR_DIA_SOBREAVISO}h</span>
                      {horasExtras > 0 && (
                        <span className="bh-semana-extra">+ {fmtH(horasExtras)}h extras</span>
                      )}
                      <span className="bh-semana-total">= {fmtH(totalSemana)}h</span>
                    </div>
                    <span className="bh-semana-chevron">{aberta ? '▲' : '▼'}</span>
                  </button>

                  {aberta && (
                    <div className="bh-semana-dias">
                      <p className="bh-semana-instrucao">
                        Informe as horas acionadas neste dia. Dias úteis ×{(1 + percSobreaviso / 100).toFixed(1)} · Sábado ×{(1 + percSabado / 100).toFixed(1)} · Dom/Feriado ×{(1 + percDomingoFeriado / 100).toFixed(1)}
                      </p>
                      {dias.map(data => {
                        const [y, m, d] = data.split('-').map(Number)
                        const dow = new Date(y, m - 1, d).getDay()
                        const nomeDia = DIAS_SEMANA_NOMES[dow]
                        const isFerOuDom = ehFeriadoOuDomingo(data, feriadosCustom)
                        const isSabado = ehSabadoComum(data, feriadosCustom)
                        const mult = multiplicadorDia(data, percDomingoFeriado, percSobreaviso, percSabado, feriadosCustom)
                        const hInput = horasAgente[data] ?? 0
                        const hCalc = hInput * mult

                        return (
                          <div key={data} className={`bh-dia-row ${isFerOuDom ? 'feriado-dom' : ''} ${isSabado ? 'sabado' : ''}`}>
                            <div className="bh-dia-info">
                              <span className="bh-dia-nome">{nomeDia}</span>
                              <span className="bh-dia-data">{String(d).padStart(2,'0')}/{String(m).padStart(2,'0')}</span>
                              {isFerOuDom && <span className="bh-dia-badge">×{(1 + percDomingoFeriado / 100).toFixed(1)}</span>}
                              {isSabado && <span className="bh-dia-badge sabado">×{(1 + percSabado / 100).toFixed(1)}</span>}
                              {!isFerOuDom && !isSabado && <span className="bh-dia-badge mult15">×{(1 + percSobreaviso / 100).toFixed(1)}</span>}
                            </div>
                            <div className="bh-dia-input-wrap">
                              <input
                                type="number"
                                min={0}
                                max={24}
                                step={0.5}
                                value={hInput === 0 ? '' : hInput}
                                placeholder="0"
                                className="bh-dia-input"
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0
                                  onUpdateHoras(data, Math.min(24, Math.max(0, val)))
                                }}
                              />
                              <span className="bh-dia-input-h">h</span>
                            </div>
                            {hInput > 0 && (
                              <span className="bh-dia-calc">
                                = {fmtH(hCalc)}h
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bh-bloco bh-bloco-sabado">
        <div className="bh-bloco-header">
          <span className="bh-bloco-icone">🗓️</span>
          <span className="bh-bloco-titulo">Banco de Horas — Sábados</span>
          <span className="bh-bloco-total">{fmtH(horasSabado)}h</span>
        </div>

        {horasSabado === 0 ? (
          <p className="bh-card-vazio">Nenhuma hora em sábado registrada.</p>
        ) : (
          <div className="bh-domfer-lista">
            {Object.entries(horasAgente)
              .filter(([data]) => ehSabadoComum(data, feriadosCustom) && (horasAgente[data] ?? 0) > 0)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([data, hInput]) => {
                const [y, m, d] = data.split('-').map(Number)
                const hCalc = hInput * multiplicadorDia(data, percDomingoFeriado, percSobreaviso, percSabado, feriadosCustom)
                return (
                  <div key={data} className="bh-domfer-row">
                    <span className="bh-domfer-dia">Sáb</span>
                    <span className="bh-domfer-data">{String(d).padStart(2,'0')}/{String(m).padStart(2,'0')}/{y}</span>
                    <span className="bh-domfer-input">{fmtH(hInput)}h</span>
                    <span className="bh-domfer-mult">×{(1 + percSabado / 100).toFixed(1)}</span>
                    <span className="bh-domfer-calc">= {fmtH(hCalc)}h</span>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      <div className="bh-bloco bh-bloco-domfer">
        <div className="bh-bloco-header">
          <span className="bh-bloco-icone">☀️</span>
          <span className="bh-bloco-titulo">Banco de Horas — Domingos e Feriados</span>
          <span className="bh-bloco-total">{fmtH(horasDomFer)}h</span>
        </div>

        {horasDomFer === 0 ? (
          <p className="bh-card-vazio">Nenhuma hora em domingo/feriado registrada.</p>
        ) : (
          <div className="bh-domfer-lista">
            {Object.entries(horasAgente)
              .filter(([data]) => ehFeriadoOuDomingo(data, feriadosCustom) && (horasAgente[data] ?? 0) > 0)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([data, hInput]) => {
                const [y, m, d] = data.split('-').map(Number)
                const dow = new Date(y, m - 1, d).getDay()
                const nomeDia = DIAS_SEMANA_NOMES[dow]
                const mult = multiplicadorDia(data, percDomingoFeriado, percSobreaviso, percSabado, feriadosCustom)
                const hCalc = hInput * mult
                return (
                  <div key={data} className="bh-domfer-row">
                    <span className="bh-domfer-dia">{nomeDia}</span>
                    <span className="bh-domfer-data">{String(d).padStart(2,'0')}/{String(m).padStart(2,'0')}/{y}</span>
                    <span className="bh-domfer-input">{fmtH(hInput)}h</span>
                    <span className="bh-domfer-mult">×{(1 + percDomingoFeriado / 100).toFixed(1)}</span>
                    <span className="bh-domfer-calc">= {fmtH(hCalc)}h</span>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {(descontosFolga + descontosAuto) > 0 && (
        <div className="bh-bloco bh-bloco-descontos">
          <div className="bh-bloco-header">
            <span className="bh-bloco-icone">🏠</span>
            <span className="bh-bloco-titulo">Folgas descontadas</span>
            <span className="bh-bloco-total">-{fmtH(descontosFolga + descontosAuto)}h</span>
          </div>
          <div className="bh-domfer-lista">
            {folgasConsumidas
              .slice()
              .sort((a, b) => b.localeCompare(a))
              .map(data => (
                <div key={`auto-${data}`} className="bh-domfer-row desconto">
                  <span className="bh-domfer-dia">Folga</span>
                  <span className="bh-domfer-data">{fmtDataLonga(data)}</span>
                  <span className="bh-domfer-calc">- {fmtH(HORAS_POR_FOLGA_BANCO)}h</span>
                </div>
              ))}
            {Object.entries(descontosAgente)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([data, horas]) => (
                <div key={`legado-${data}`} className="bh-domfer-row desconto">
                  <span className="bh-domfer-dia">Folga</span>
                  <span className="bh-domfer-data">{fmtDataLonga(data)}</span>
                  <span className="bh-domfer-calc">- {fmtH(horas)}h</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="bh-total-geral">
        <span className="bh-total-label">Total de Horas</span>
        <span className="bh-total-valor">{fmtH(totalGeral)}<span className="bh-total-h">h</span></span>
      </div>
    </div>
  )
}

// ── Banco de Horas Extras (sem multiplicador) — Talita/Cristiane/Sócrates ─
interface BancoHorasExtraSimplesProps {
  agente: string
  horasExtrasSimples: Record<string, Record<string, number>>
  onUpdateHora: (data: string, horas: number) => void
}

function BancoHorasExtraSimples({ agente, horasExtrasSimples, onUpdateHora }: BancoHorasExtraSimplesProps) {
  const info = AGENTE_MAP[agente]
  const horasAgente = horasExtrasSimples[agente] ?? {}
  const [novaData, setNovaData] = useState<string>(hojeStr())
  const [novasHoras, setNovasHoras] = useState<string>('')
  const [erro, setErro] = useState<string>('')

  const total = Object.values(horasAgente).reduce((acc, h) => acc + h, 0)
  const entradas = Object.entries(horasAgente).sort(([a], [b]) => b.localeCompare(a))

  function adicionar() {
    const h = parseFloat(novasHoras)
    if (!novaData || isNaN(h) || h <= 0) {
      setErro('Informe uma data e uma quantidade de horas válida.')
      return
    }
    setErro('')
    const atual = horasAgente[novaData] ?? 0
    onUpdateHora(novaData, Math.min(24, atual + h))
    setNovasHoras('')
  }

  return (
    <div className="bh-agente-wrap">
      <div className="bh-agente-cabecalho">
        <span className="bh-card-iniciais" style={{ background: info?.cor ?? '#64748b' }}>
          {info?.iniciais ?? agente.slice(0, 2).toUpperCase()}
        </span>
        <div className="bh-agente-nome-wrap">
          <span className="bh-card-nome">{agente}</span>
          <span className="bh-agente-subtitulo">Banco de Horas Extras</span>
        </div>
      </div>

      <div className="bh-bloco">
        <div className="bh-bloco-header">
          <span className="bh-bloco-icone">⏱️</span>
          <span className="bh-bloco-titulo">Horas extras (sem multiplicador)</span>
          <span className="bh-bloco-total">{fmtH(total)}h</span>
        </div>

        <div className="escala-ferias-form" style={{ padding: '12px 14px' }}>
          <div className="escala-ferias-datas">
            <div className="escala-ferias-data-campo">
              <label>Data</label>
              <input type="date" value={novaData} onChange={e => { setNovaData(e.target.value); setErro('') }} />
            </div>
            <div className="escala-ferias-data-campo">
              <label>Horas</label>
              <input
                type="number"
                min={0}
                max={24}
                step={0.5}
                value={novasHoras}
                placeholder="0"
                onChange={e => { setNovasHoras(e.target.value); setErro('') }}
              />
            </div>
          </div>
          {erro && <span className="escala-ferias-erro">{erro}</span>}
          <button className="escala-ferias-add" onClick={adicionar}>+ Adicionar horas</button>
        </div>

        {entradas.length === 0 ? (
          <p className="bh-card-vazio">Nenhuma hora extra registrada.</p>
        ) : (
          <div className="bh-domfer-lista">
            {entradas.map(([data, h]) => {
              const [y, m, d] = data.split('-').map(Number)
              const dow = new Date(y, m - 1, d).getDay()
              const nomeDia = DIAS_SEMANA_NOMES[dow]
              return (
                <div key={data} className="bh-domfer-row">
                  <span className="bh-domfer-dia">{nomeDia}</span>
                  <span className="bh-domfer-data">{String(d).padStart(2,'0')}/{String(m).padStart(2,'0')}/{y}</span>
                  <span className="bh-domfer-input">{fmtH(h)}h</span>
                  <span className="bh-domfer-mult">×1,0</span>
                  <span className="bh-domfer-calc">= {fmtH(h)}h</span>
                  <button
                    className="escala-ferias-remover"
                    onClick={() => onUpdateHora(data, 0)}
                    title="Remover"
                  >✕</button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bh-total-geral">
        <span className="bh-total-label">Total de Horas</span>
        <span className="bh-total-valor">{fmtH(total)}<span className="bh-total-h">h</span></span>
      </div>
    </div>
  )
}

// ── Banco de Horas: painel do Moisés ─────────────────────────────
interface BancoHorasMoisesProps {
  sobreavisoSemanal: Record<string, string[]>
  horasTrabalhadasSobreaviso: Record<string, Record<string, number>>
  descontosFolgaBanco: Record<string, Record<string, number>>
  folgas: Record<string, string[]>
  percDomingoFeriado: number
  percSobreaviso: number
  percSabado: number
  feriadosCustom: string[]
  horasExtrasSimples: Record<string, Record<string, number>>
  ajustesBanco: Record<string, number>
  onAjusteChange: (agente: string, ajuste: number) => void
  podeEditar: boolean
}

function BancoHorasMoises({ sobreavisoSemanal, horasTrabalhadasSobreaviso, descontosFolgaBanco, folgas, percDomingoFeriado, percSobreaviso, percSabado, feriadosCustom, horasExtrasSimples, ajustesBanco, onAjusteChange, podeEditar }: BancoHorasMoisesProps) {
  const hoje = hojeStr()
  const [editando, setEditando] = useState<string | null>(null)
  const [valorTemp, setValorTemp] = useState<string>('')

  const lista = useMemo(() => {
    const sobreaviso = AGENTES_SOBREAVISO.map(ag => {
      const calculado = calcularBancoHoras(ag.nome, sobreavisoSemanal, horasTrabalhadasSobreaviso, percDomingoFeriado, percSobreaviso, percSabado, feriadosCustom, descontosFolgaBanco, folgas, hoje)
      const ajuste = ajustesBanco[ag.nome] ?? 0
      const total = calculado + ajuste
      // Dias de folga disponíveis = total de horas no banco / 8h por folga
      const diasFolga = Math.max(0, total) / HORAS_POR_FOLGA_BANCO
      const desobreaviso = (sobreavisoSemanal[hoje] ?? []).includes(ag.nome)
      const temFolga = (folgas[hoje] ?? []).includes(ag.nome)
      return { ...ag, total, calculado, ajuste, diasFolga, desobreaviso, temFolga, tipo: 'sobreaviso' as const }
    })
    const extras = AGENTES_HORAS_EXTRAS.map(ag => {
      const horas = horasExtrasSimples[ag.nome] ?? {}
      const calculado = Object.values(horas).reduce((acc, h) => acc + h, 0)
      const ajuste = ajustesBanco[ag.nome] ?? 0
      const total = calculado + ajuste
      const diasFolga = Math.max(0, total) / HORAS_POR_FOLGA_BANCO
      return { ...ag, total, calculado, ajuste, diasFolga, desobreaviso: false, temFolga: false, tipo: 'extras' as const }
    })
    return [...sobreaviso, ...extras].sort((a, b) => b.total - a.total)
  }, [sobreavisoSemanal, horasTrabalhadasSobreaviso, descontosFolgaBanco, folgas, percDomingoFeriado, percSobreaviso, percSabado, feriadosCustom, horasExtrasSimples, ajustesBanco, hoje])

  const totalGeral = lista.reduce((s, ag) => s + ag.total, 0)

  function abrirEdicao(ag: { nome: string; total: number }) {
    setEditando(ag.nome)
    setValorTemp(String(ag.total % 1 === 0 ? ag.total : ag.total.toFixed(2)))
  }

  function salvarEdicao(ag: { nome: string; calculado: number }) {
    const novoTotal = parseFloat(valorTemp.replace(',', '.'))
    if (!Number.isFinite(novoTotal)) {
      setEditando(null)
      return
    }
    const novoAjuste = +(novoTotal - ag.calculado).toFixed(2)
    onAjusteChange(ag.nome, novoAjuste)
    setEditando(null)
  }

  function zerarAjuste(nome: string) {
    onAjusteChange(nome, 0)
    setEditando(null)
  }

  return (
    <div className="bh-moises-painel">
      <div className="bh-moises-header">
        <span className="bh-moises-titulo">⏱️ Banco de Horas</span>
        <span className="bh-moises-total">{totalGeral % 1 === 0 ? totalGeral : totalGeral.toFixed(1)}h total</span>
      </div>
      <div className="bh-moises-lista">
        {lista.map((ag, idx) => (
          <div key={ag.nome} className="bh-moises-row">
            <span className="bh-moises-rank">#{idx + 1}</span>
            <span className="bh-moises-cor" style={{ background: ag.cor }} />
            <span className="bh-moises-nome">{ag.nome}</span>
            <div className="bh-moises-direita">
              {ag.desobreaviso && (
                <span className="bh-moises-badge-ativo" title="De sobreaviso agora">🟢</span>
              )}
              {ag.temFolga && (
                <span className="bh-moises-badge-folga" title="De folga hoje">🏠</span>
              )}
              {podeEditar ? (
                <button
                  type="button"
                  className="bh-moises-horas-info bh-moises-horas-edit"
                  onClick={() => abrirEdicao(ag)}
                  title="Clique para ajustar as horas deste agente"
                >
                  <span className="bh-moises-h">
                    {ag.total % 1 === 0 ? ag.total : ag.total.toFixed(1)}h
                    {ag.ajuste !== 0 && (
                      <span className="bh-moises-ajuste-badge" title={`Ajuste manual: ${ag.ajuste > 0 ? '+' : ''}${ag.ajuste}h`}>
                        {ag.ajuste > 0 ? '+' : ''}{ag.ajuste % 1 === 0 ? ag.ajuste : ag.ajuste.toFixed(1)}
                      </span>
                    )}
                  </span>
                  <span className="bh-moises-semanas" title={`${ag.total.toFixed(2)}h ÷ ${HORAS_POR_FOLGA_BANCO}h = ${ag.diasFolga.toFixed(2)} dias de folga`}>
                    {ag.diasFolga % 1 === 0 ? ag.diasFolga : ag.diasFolga.toFixed(1)} dia{ag.diasFolga === 1 ? '' : 's'} de folga ✏️
                  </span>
                </button>
              ) : (
                <div className="bh-moises-horas-info">
                  <span className="bh-moises-h">
                    {ag.total % 1 === 0 ? ag.total : ag.total.toFixed(1)}h
                    {ag.ajuste !== 0 && (
                      <span className="bh-moises-ajuste-badge" title={`Ajuste manual: ${ag.ajuste > 0 ? '+' : ''}${ag.ajuste}h`}>
                        {ag.ajuste > 0 ? '+' : ''}{ag.ajuste % 1 === 0 ? ag.ajuste : ag.ajuste.toFixed(1)}
                      </span>
                    )}
                  </span>
                  <span className="bh-moises-semanas" title={`${ag.total.toFixed(2)}h ÷ ${HORAS_POR_FOLGA_BANCO}h = ${ag.diasFolga.toFixed(2)} dias de folga`}>
                    {ag.diasFolga % 1 === 0 ? ag.diasFolga : ag.diasFolga.toFixed(1)} dia{ag.diasFolga === 1 ? '' : 's'} de folga
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="bh-moises-rodape">
        {HORAS_POR_DIA_SOBREAVISO}h por dia de sobreaviso · Dias úteis ×{(1 + percSobreaviso / 100).toFixed(1)} · Sábado ×{(1 + percSabado / 100).toFixed(1)} · Dom/Feriado ×{(1 + percDomingoFeriado / 100).toFixed(1)} · cada folga marcada desconta {HORAS_POR_FOLGA_BANCO}h · "dias de folga" = total ÷ {HORAS_POR_FOLGA_BANCO}h
      </div>

      {editando && (() => {
        const ag = lista.find(a => a.nome === editando)
        if (!ag) return null
        return (
          <div className="escala-modal-overlay" onClick={() => setEditando(null)}>
            <div className="escala-modal bh-edit-modal" onClick={e => e.stopPropagation()}>
              <div className="escala-modal-header">
                <span className="escala-modal-titulo">
                  <span className="bh-edit-cor" style={{ background: ag.cor }} />
                  Banco de horas — {ag.nome}
                </span>
                <button className="escala-modal-fechar" onClick={() => setEditando(null)}>✕</button>
              </div>

              <div className="bh-edit-info">
                <div className="bh-edit-info-linha">
                  <span>Calculado pela escala</span>
                  <strong>{ag.calculado % 1 === 0 ? ag.calculado : ag.calculado.toFixed(2)}h</strong>
                </div>
                <div className="bh-edit-info-linha">
                  <span>Ajuste manual atual</span>
                  <strong className={ag.ajuste > 0 ? 'positivo' : ag.ajuste < 0 ? 'negativo' : ''}>
                    {ag.ajuste > 0 ? '+' : ''}{ag.ajuste % 1 === 0 ? ag.ajuste : ag.ajuste.toFixed(2)}h
                  </strong>
                </div>
              </div>

              <label className="bh-edit-label">
                Total final do banco (em horas)
                <input
                  type="number"
                  step="0.5"
                  inputMode="decimal"
                  className="bh-edit-input"
                  value={valorTemp}
                  onChange={e => setValorTemp(e.target.value)}
                  autoFocus
                  onFocus={e => e.target.select()}
                />
              </label>

              <p className="bh-edit-dica">
                Digite o total final que esse agente deve ter no banco. O sistema vai calcular o ajuste necessário ({ag.calculado.toFixed(1)}h calculado + ajuste).
              </p>

              <div className="bh-edit-acoes">
                <button className="bh-edit-zerar" onClick={() => zerarAjuste(ag.nome)}>
                  Zerar ajuste manual
                </button>
                <div className="bh-edit-acoes-direita">
                  <button className="bh-edit-cancelar" onClick={() => setEditando(null)}>Cancelar</button>
                  <button className="bh-edit-salvar" onClick={() => salvarEdicao(ag)}>Salvar</button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Modal seleção de agentes por dia (Sobreaviso + Folga) ────────
interface ModalDiaProps {
  data: string
  selecionados: string[]
  folgasSelecionadas: string[]
  ferias: Ferias[]
  onSalvar: (agentes: string[], folgas: string[]) => void
  onFechar: () => void
}

function ModalDia({ data, selecionados, folgasSelecionadas, ferias, onSalvar, onFechar }: ModalDiaProps) {
  const [escolhidos, setEscolhidos] = useState<string[]>(selecionados)
  const [folgas, setFolgas] = useState<string[]>(folgasSelecionadas)
  const [, mesStr, diaStr] = data.split('-')
  const label = `${diaStr}/${mesStr} — Escala do dia`

  function toggleSobreaviso(nome: string) {
    setEscolhidos(prev => prev.includes(nome) ? prev.filter(n => n !== nome) : [...prev, nome])
    setFolgas(prev => prev.filter(n => n !== nome))
  }

  function toggleFolga(nome: string) {
    setFolgas(prev => prev.includes(nome) ? prev.filter(n => n !== nome) : [...prev, nome])
    setEscolhidos(prev => prev.filter(n => n !== nome))
  }

  function limparTudo() {
    setEscolhidos([])
    setFolgas([])
  }

  return (
    <div className="escala-modal-overlay" onClick={onFechar}>
      <div className="escala-modal" onClick={e => e.stopPropagation()}>
        <div className="escala-modal-header">
          <span className="escala-modal-titulo">{label}</span>
          <button className="escala-modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <p className="escala-modal-sub">📟 Sobreaviso (gera {HORAS_POR_DIA_SOBREAVISO}h no banco quando o dia passar):</p>
        <div className="escala-modal-lista">
          {AGENTES_SOBREAVISO.map(ag => {
            const emFerias = agenteEmFerias(ag.nome, data, ferias)
            const ativo = escolhidos.includes(ag.nome)
            return (
              <button
                key={`sb-${ag.nome}`}
                className={`escala-modal-agente ${ativo ? 'selecionado' : ''} ${emFerias ? 'em-ferias' : ''}`}
                style={ativo ? { background: ag.cor, borderColor: ag.cor, color: '#fff' } : { borderColor: ag.cor }}
                onClick={() => toggleSobreaviso(ag.nome)}
                disabled={emFerias}
              >
                <span className="escala-modal-iniciais" style={{ background: ativo ? 'rgba(255,255,255,0.25)' : ag.cor }}>
                  {ag.iniciais}
                </span>
                <span className="escala-modal-agente-nome">{ag.nome}</span>
                {emFerias && <span className="escala-modal-ferias-tag">🌴 Férias</span>}
                {ativo && !emFerias && <span className="escala-modal-ferias-tag">📟 Sobreaviso</span>}
              </button>
            )
          })}
        </div>

        <p className="escala-modal-sub" style={{ marginTop: 16 }}>🏠 Folga (desconta {HORAS_POR_FOLGA_BANCO}h do banco ao passar do dia):</p>
        <div className="escala-modal-lista">
          {AGENTES_ESCALA.map(ag => {
            const emFerias = agenteEmFerias(ag.nome, data, ferias)
            const ativo = folgas.includes(ag.nome)
            return (
              <button
                key={`folga-${ag.nome}`}
                className={`escala-modal-agente folga-toggle ${ativo ? 'selecionado' : ''} ${emFerias ? 'em-ferias' : ''}`}
                style={ativo
                  ? { background: '#16a34a', borderColor: '#16a34a', color: '#fff' }
                  : { borderColor: ag.cor }}
                onClick={() => toggleFolga(ag.nome)}
                disabled={emFerias}
              >
                <span className="escala-modal-iniciais" style={{ background: ativo ? 'rgba(255,255,255,0.25)' : ag.cor }}>
                  {ag.iniciais}
                </span>
                <span className="escala-modal-agente-nome">{ag.nome}</span>
                {emFerias && <span className="escala-modal-ferias-tag">🌴 Férias</span>}
                {ativo && !emFerias && <span className="escala-modal-ferias-tag">🏠 Folga</span>}
              </button>
            )
          })}
        </div>

        <div className="escala-modal-acoes">
          <button className="escala-modal-limpar" onClick={limparTudo}>Limpar</button>
          <button className="escala-modal-salvar" onClick={() => onSalvar(escolhidos, folgas)}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

// ── Painel de férias ──────────────────────────────────────────────
interface PainelFeriasProps {
  ferias: Ferias[]
  onChange: (novas: Ferias[]) => void
}

function PainelFerias({ ferias, onChange }: PainelFeriasProps) {
  const hoje = hojeStr()
  const [agente, setAgente] = useState(AGENTES_ESCALA[0].nome)
  const [inicio, setInicio] = useState(hoje)
  const [fim, setFim] = useState(hoje)
  const [erro, setErro] = useState('')

  function adicionar() {
    if (inicio > fim) { setErro('A data de início deve ser anterior ou igual ao fim.'); return }
    if (ferias.some(f => f.agente === agente && f.inicio === inicio && f.fim === fim)) {
      setErro('Este período já está cadastrado.'); return
    }
    setErro('')
    onChange([...ferias, { agente, inicio, fim }])
  }

  function remover(idx: number) {
    onChange(ferias.filter((_, i) => i !== idx))
  }

  return (
    <div className="escala-ferias-painel">
      <div className="escala-ferias-titulo"><span>🌴</span> Férias</div>
      <div className="escala-ferias-form">
        <select className="escala-ferias-select" value={agente} onChange={e => { setAgente(e.target.value); setErro('') }}>
          {AGENTES_ESCALA.map(ag => <option key={ag.nome} value={ag.nome}>{ag.nome}</option>)}
        </select>
        <div className="escala-ferias-datas">
          <div className="escala-ferias-data-campo">
            <label>De</label>
            <input type="date" value={inicio} onChange={e => { setInicio(e.target.value); setErro('') }} />
          </div>
          <div className="escala-ferias-data-campo">
            <label>Até</label>
            <input type="date" value={fim} onChange={e => { setFim(e.target.value); setErro('') }} />
          </div>
        </div>
        {erro && <span className="escala-ferias-erro">{erro}</span>}
        <button className="escala-ferias-add" onClick={adicionar}>+ Adicionar período</button>
      </div>

      {ferias.length > 0 ? (
        <div className="escala-ferias-lista">
          {ferias.map((f, i) => {
            const info = AGENTE_MAP[f.agente]
            return (
              <div key={i} className="escala-ferias-item">
                <span className="escala-ferias-cor" style={{ background: info?.cor ?? '#ccc' }} />
                <span className="escala-ferias-nome">{f.agente}</span>
                <span className="escala-ferias-periodo">{fmtDataLonga(f.inicio)} → {fmtDataLonga(f.fim)}</span>
                <button className="escala-ferias-remover" onClick={() => remover(i)}>✕</button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="escala-ferias-vazio">Nenhum período de férias cadastrado.</p>
      )}
    </div>
  )
}

// ── Calendário Unificado (Sobreaviso + Folga em um só) ────────────
interface CalendarioUnificadoProps {
  ano: number
  mes: number
  sobreavisoDiario: Record<string, string[]>
  folgas: Record<string, string[]>
  ferias: Ferias[]
  hoje: string
  editando: boolean
  feriadosCustom: string[]
  onDiaClick: (chave: string) => void
}

function CalendarioUnificado({ ano, mes, sobreavisoDiario, folgas, ferias, hoje, editando, feriadosCustom, onDiaClick }: CalendarioUnificadoProps) {
  const total = diasNoMes(ano, mes)
  const inicio = primeiroDiaSemana(ano, mes)
  const trailingCount = (7 - ((inicio + total) % 7)) % 7

  return (
    <div className="escala-calendario-bloco escala-bloco-unificado">
      <div className="escala-cal-grid">
        {DIAS_SEMANA_HDR.map((d, i) => (
          <div key={i} className="escala-cal-diahdr">{d}</div>
        ))}

        {Array.from({ length: inicio }).map((_, i) => (
          <div key={`lead-${i}`} className="escala-cal-vazio uni-vazio" />
        ))}

        {Array.from({ length: total }, (_, i) => i + 1).map(dia => {
          const chave = chaveData(ano, mes, dia)
          const isHoje = chave === hoje
          const isFerCustom = feriadosCustom.includes(chave)
          const isFeriadoFixo = (() => {
            const [y, m, d] = chave.split('-').map(Number)
            const mmdd = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
            const dt = new Date(y, m - 1, d)
            return dt.getDay() === 0 || FERIADOS_FIXOS.has(mmdd)
          })()
          const sobreavisoDoDia = sobreavisoDiario[chave] ?? []
          const folgasDoDia = (folgas[chave] ?? []).filter(nome => !agenteEmFerias(nome, chave, ferias))

          return (
            <button
              key={chave}
              className={`escala-cal-dia uni-dia ${isHoje ? 'hoje' : ''} ${editando ? 'editavel' : ''} ${isFerCustom ? 'feriado-custom' : ''} ${isFeriadoFixo && !isFerCustom ? 'feriado-fixo' : ''}`}
              onClick={() => editando && onDiaClick(chave)}
            >
              <span className="escala-cal-num">{dia}</span>
              {isFerCustom && <span className="escala-cal-fer-tag">📅</span>}
              {isFeriadoFixo && !isFerCustom && <span className="escala-cal-fer-tag">🏛️</span>}

              {sobreavisoDoDia.length > 0 && (
                <div className="uni-secao uni-sobreaviso" title={`Sobreaviso: ${sobreavisoDoDia.join(', ')}`}>
                  <span className="uni-secao-label">Sobreaviso</span>
                  {sobreavisoDoDia.map(nome => {
                    const info = AGENTE_MAP[nome]
                    return (
                      <span
                        key={nome}
                        className="uni-secao-nome"
                        style={{ color: info?.cor ?? '#7c3aed' }}
                      >
                        {nome}
                      </span>
                    )
                  })}
                </div>
              )}

              {folgasDoDia.length > 0 && (
                <div className="uni-secao uni-folga" title={`Folga: ${folgasDoDia.join(', ')}`}>
                  <span className="uni-secao-label">Folga</span>
                  {folgasDoDia.map(nome => {
                    const info = AGENTE_MAP[nome]
                    return (
                      <span
                        key={nome}
                        className="uni-secao-nome"
                        style={{ color: info?.cor ?? '#166534' }}
                      >
                        {nome}
                      </span>
                    )
                  })}
                </div>
              )}
            </button>
          )
        })}

        {Array.from({ length: trailingCount }).map((_, i) => (
          <div key={`tail-${i}`} className="escala-cal-vazio uni-vazio" />
        ))}
      </div>
    </div>
  )
}

// ── Legenda ───────────────────────────────────────────────────────
interface LegendaProps {
  ferias: Ferias[]
  mes: number
  ano: number
  editavel?: boolean
  onAgenteClick?: (nome: string) => void
}

function Legenda({ ferias, mes, ano, editavel = false, onAgenteClick }: LegendaProps) {
  const mesStr = String(mes + 1).padStart(2, '0')
  const anoStr = String(ano)

  const { ativos, deFerias } = useMemo(() => {
    const deFerias: Array<{ ag: typeof AGENTES_ESCALA[0]; periodos: Ferias[] }> = []
    const ativos: typeof AGENTES_ESCALA = []
    AGENTES_ESCALA.forEach(ag => {
      const periodos = ferias.filter(f =>
        f.agente === ag.nome &&
        f.inicio <= `${anoStr}-${mesStr}-31` &&
        f.fim >= `${anoStr}-${mesStr}-01`
      )
      if (periodos.length > 0) deFerias.push({ ag, periodos })
      else ativos.push(ag)
    })
    return { ativos, deFerias }
  }, [ferias, mes, ano, mesStr, anoStr])

  return (
    <div className="escala-legenda">
      <span className="escala-legenda-titulo">
        Legenda
        {editavel && <span className="escala-legenda-dica"> — toque num agente para escalar os dias dele</span>}
      </span>
      <div className="escala-legenda-lista">
        {ativos.map(ag =>
          editavel ? (
            <button
              type="button"
              key={ag.nome}
              className="escala-legenda-item escala-legenda-item--clicavel"
              onClick={() => onAgenteClick?.(ag.nome)}
              title={`Escalar dias de ${ag.nome}`}
            >
              <span className="escala-legenda-cor" style={{ background: ag.cor }} />
              <span className="escala-legenda-nome">{ag.nome}</span>
              <span className="escala-legenda-edit-icone">✏️</span>
            </button>
          ) : (
            <div key={ag.nome} className="escala-legenda-item">
              <span className="escala-legenda-cor" style={{ background: ag.cor }} />
              <span className="escala-legenda-nome">{ag.nome}</span>
            </div>
          )
        )}
      </div>
      {deFerias.length > 0 && (
        <div className="escala-legenda-ferias-bloco">
          <span className="escala-legenda-ferias-titulo">☀️🌊 De férias este mês</span>
          {deFerias.map(({ ag, periodos }) => (
            <div key={ag.nome} className="escala-legenda-ferias-row">
              <span className="escala-legenda-cor" style={{ background: ag.cor }} />
              <span className="escala-legenda-ferias-nome">{ag.nome}</span>
              <div className="escala-legenda-ferias-periodos">
                {periodos.map((p, i) => (
                  <span key={i} className="escala-legenda-ferias-periodo">
                    {fmtDataCurta(p.inicio)} → {fmtDataCurta(p.fim)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Painel de Regras do Banco de Horas (Moisés) ───────────────────
interface PainelRegrasProps {
  percDomingoFeriado: number
  percSobreaviso: number
  percSabado: number
  onChange: (percDomFer: number, percSb: number, percSabado: number) => void
}

function PainelRegras({ percDomingoFeriado, percSobreaviso, percSabado, onChange }: PainelRegrasProps) {
  const [domFer, setDomFer] = useState(percDomingoFeriado)
  const [sb, setSb] = useState(percSobreaviso)
  const [sab, setSab] = useState(percSabado)
  const [salvo, setSalvo] = useState(false)

  function aplicar() {
    onChange(Math.max(0, domFer), Math.max(0, sb), Math.max(0, sab))
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2000)
  }

  return (
    <div className="escala-regras-painel">
      <div className="escala-regras-titulo">⚙️ Regras do Banco de Horas</div>

      <div className="escala-regras-item">
        <div className="escala-regras-label">
          <span className="escala-regras-icone">☀️</span>
          <span>Domingos e Feriados</span>
        </div>
        <div className="escala-regras-input-wrap">
          <input
            type="number" min={0} max={500} step={5}
            value={domFer}
            onChange={e => setDomFer(Number(e.target.value))}
          />
          <span className="escala-regras-pct">%</span>
        </div>
        <span className="escala-regras-ex">
          Multiplicador: ×{(1 + domFer / 100).toFixed(2)} — a cada hora acionada vale {(1 + domFer / 100).toFixed(2)}h no banco
        </span>
      </div>

      <div className="escala-regras-item">
        <div className="escala-regras-label">
          <span className="escala-regras-icone">📟</span>
          <span>Sobreaviso (dias úteis)</span>
        </div>
        <div className="escala-regras-input-wrap">
          <input
            type="number" min={0} max={500} step={5}
            value={sb}
            onChange={e => setSb(Number(e.target.value))}
          />
          <span className="escala-regras-pct">%</span>
        </div>
        <span className="escala-regras-ex">
          Multiplicador: ×{(1 + sb / 100).toFixed(2)} — a cada hora acionada vale {(1 + sb / 100).toFixed(2)}h no banco
        </span>
      </div>

      <div className="escala-regras-item">
        <div className="escala-regras-label">
          <span className="escala-regras-icone">🗓️</span>
          <span>Sábado</span>
        </div>
        <div className="escala-regras-input-wrap">
          <input
            type="number" min={0} max={500} step={5}
            value={sab}
            onChange={e => setSab(Number(e.target.value))}
          />
          <span className="escala-regras-pct">%</span>
        </div>
        <span className="escala-regras-ex">
          Multiplicador: ×{(1 + sab / 100).toFixed(2)} — a cada hora acionada no sábado vale {(1 + sab / 100).toFixed(2)}h no banco
        </span>
      </div>

      <button
        className={`escala-regras-salvar ${salvo ? 'salvo' : ''}`}
        onClick={aplicar}
      >
        {salvo ? '✅ Regras salvas!' : 'Salvar regras'}
      </button>
    </div>
  )
}

// ── Painel de Feriados Municipais / Locais (Moisés) ───────────────
interface PainelFeriadosCustomProps {
  feriados: string[]
  onChange: (novas: string[]) => void
}

function PainelFeriadosCustom({ feriados, onChange }: PainelFeriadosCustomProps) {
  const [novoFeriado, setNovoFeriado] = useState(hojeStr())
  const [erro, setErro] = useState('')

  function adicionar() {
    if (!novoFeriado) { setErro('Selecione uma data.'); return }
    if (feriados.includes(novoFeriado)) { setErro('Esta data já está marcada.'); return }
    setErro('')
    onChange([...feriados, novoFeriado].sort())
  }

  function remover(data: string) {
    onChange(feriados.filter(d => d !== data))
  }

  return (
    <div className="escala-fer-custom-painel">
      <div className="escala-fer-custom-titulo">📅 Feriados Municipais / Locais</div>
      <p className="escala-fer-custom-desc">
        Marque datas específicas como feriado para que o multiplicador ☀️ Domingos/Feriados seja aplicado no banco de horas.
      </p>
      <div className="escala-fer-custom-form">
        <input
          type="date"
          value={novoFeriado}
          onChange={e => { setNovoFeriado(e.target.value); setErro('') }}
          className="escala-fer-custom-input"
        />
        <button className="escala-fer-custom-add" onClick={adicionar}>+ Marcar feriado</button>
      </div>
      {erro && <span className="escala-fer-custom-erro">{erro}</span>}

      {feriados.length > 0 ? (
        <div className="escala-fer-custom-lista">
          {feriados.map(data => (
            <div key={data} className="escala-fer-custom-item">
              <span className="escala-fer-custom-data">🗓️ {fmtDataLonga(data)}</span>
              <button className="escala-fer-custom-remover" onClick={() => remover(data)}>✕</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="escala-fer-custom-vazio">Nenhum feriado local marcado.</p>
      )}
    </div>
  )
}

// ── Modal: calendário de um único agente (clique na legenda) ──────
// Permite ao Moisés marcar, dentro de um mês, todos os dias em que o agente
// estará de sobreaviso ou de folga.
//   • Para agentes que fazem sobreaviso: cada toque no dia cicla
//       nada → 📟 sobreaviso → 🏠 folga → nada
//   • Para Talita / Cristiane / Sócrates (sem sobreaviso): toggle só de folga.
interface ModalAgenteCalendarioProps {
  agente: { nome: string; cor: string; iniciais: string }
  podeSobreaviso: boolean
  sobreaviso: Record<string, string[]>
  folgas: Record<string, string[]>
  ferias: Ferias[]
  feriadosCustom: string[]
  anoInicial: number
  mesInicial: number
  onSalvar: (
    novoSobreaviso: Record<string, string[]>,
    novasFolgas: Record<string, string[]>
  ) => void
  onFechar: () => void
}

function ModalAgenteCalendario({
  agente, podeSobreaviso, sobreaviso, folgas, ferias, feriadosCustom,
  anoInicial, mesInicial, onSalvar, onFechar,
}: ModalAgenteCalendarioProps) {
  const [mes, setMes] = useState(mesInicial)
  const [ano, setAno] = useState(anoInicial)
  const hoje = hojeStr()

  // Sets locais com TODAS as datas (qualquer mês) onde este agente já tem marcação
  const [localSb, setLocalSb] = useState<Set<string>>(() => {
    const s = new Set<string>()
    for (const [data, ags] of Object.entries(sobreaviso)) {
      if (ags.includes(agente.nome)) s.add(data)
    }
    return s
  })
  const [localFolga, setLocalFolga] = useState<Set<string>>(() => {
    const s = new Set<string>()
    for (const [data, ags] of Object.entries(folgas)) {
      if (ags.includes(agente.nome)) s.add(data)
    }
    return s
  })

  function mesAnt() {
    if (mes === 0) { setAno(a => a - 1); setMes(11) }
    else setMes(m => m - 1)
  }
  function mesProx() {
    if (mes === 11) { setAno(a => a + 1); setMes(0) }
    else setMes(m => m + 1)
  }

  function clickDia(chave: string) {
    if (agenteEmFerias(agente.nome, chave, ferias)) return
    const ehSb = localSb.has(chave)
    const ehFolga = localFolga.has(chave)
    if (podeSobreaviso) {
      if (!ehSb && !ehFolga) {
        const next = new Set(localSb); next.add(chave); setLocalSb(next)
      } else if (ehSb) {
        const a = new Set(localSb); a.delete(chave); setLocalSb(a)
        const b = new Set(localFolga); b.add(chave); setLocalFolga(b)
      } else {
        const b = new Set(localFolga); b.delete(chave); setLocalFolga(b)
      }
    } else {
      const b = new Set(localFolga)
      if (ehFolga) b.delete(chave); else b.add(chave)
      setLocalFolga(b)
    }
  }

  function limparMes() {
    const total = diasNoMes(ano, mes)
    const nSb = new Set(localSb)
    const nFolga = new Set(localFolga)
    for (let d = 1; d <= total; d++) {
      const k = chaveData(ano, mes, d)
      nSb.delete(k); nFolga.delete(k)
    }
    setLocalSb(nSb); setLocalFolga(nFolga)
  }

  function salvar() {
    // Reconstrói os mapas globais: tira o agente de todas as datas e re-adiciona
    // nas datas locais. Outros agentes em cada data ficam intactos.
    const novoSb: Record<string, string[]> = {}
    for (const [data, ags] of Object.entries(sobreaviso)) {
      const sem = ags.filter(a => a !== agente.nome)
      if (sem.length > 0) novoSb[data] = sem
    }
    for (const data of localSb) {
      novoSb[data] = [...(novoSb[data] ?? []), agente.nome]
    }
    const novasFolgas: Record<string, string[]> = {}
    for (const [data, ags] of Object.entries(folgas)) {
      const sem = ags.filter(a => a !== agente.nome)
      if (sem.length > 0) novasFolgas[data] = sem
    }
    for (const data of localFolga) {
      novasFolgas[data] = [...(novasFolgas[data] ?? []), agente.nome]
    }
    onSalvar(novoSb, novasFolgas)
  }

  const total = diasNoMes(ano, mes)
  const inicio = primeiroDiaSemana(ano, mes)
  const trailingCount = (7 - ((inicio + total) % 7)) % 7

  // Conta marcações só do mês visível (resumo do topo)
  let sbMes = 0
  let folgaMes = 0
  for (let d = 1; d <= total; d++) {
    const k = chaveData(ano, mes, d)
    if (localSb.has(k)) sbMes++
    if (localFolga.has(k)) folgaMes++
  }

  return (
    <div className="escala-modal-overlay" onClick={onFechar}>
      <div className="escala-modal modal-agente-calendario" onClick={e => e.stopPropagation()}>
        <div className="escala-modal-header">
          <span className="escala-modal-titulo">
            <span className="bh-edit-cor" style={{ background: agente.cor }} />
            Escalar {agente.nome}
          </span>
          <button className="escala-modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <p className="escala-modal-sub mac-instrucoes">
          {podeSobreaviso
            ? <>Toque num dia para alternar: <b>nada → 📟 Sobreaviso → 🏠 Folga → nada</b>.</>
            : <>Toque num dia para marcar/desmarcar 🏠 <b>Folga</b>.</>}
        </p>

        <div className="mac-nav-mes">
          <button className="mac-nav-btn" onClick={mesAnt}>‹</button>
          <span className="mac-nav-label">{MESES[mes]} {ano}</span>
          <button className="mac-nav-btn" onClick={mesProx}>›</button>
        </div>

        <div className="mac-resumo">
          {podeSobreaviso && (
            <span className="mac-chip mac-chip-sb">📟 {sbMes} dia{sbMes === 1 ? '' : 's'} de sobreaviso no mês</span>
          )}
          <span className="mac-chip mac-chip-folga">🏠 {folgaMes} dia{folgaMes === 1 ? '' : 's'} de folga no mês</span>
        </div>

        <div className="mac-cal-grid">
          {DIAS_SEMANA_HDR.map((d, i) => (
            <div key={`h-${i}`} className="escala-cal-diahdr">{d}</div>
          ))}
          {Array.from({ length: inicio }).map((_, i) => (
            <div key={`l-${i}`} className="escala-cal-vazio" />
          ))}
          {Array.from({ length: total }, (_, i) => i + 1).map(dia => {
            const chave = chaveData(ano, mes, dia)
            const isSb = localSb.has(chave)
            const isFolga = localFolga.has(chave)
            const isFerias = agenteEmFerias(agente.nome, chave, ferias)
            const isHoje = chave === hoje
            const isFerCustom = feriadosCustom.includes(chave)
            const [y, m, dd] = chave.split('-').map(Number)
            const mmdd = `${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
            const isFerFixo = new Date(y, m - 1, dd).getDay() === 0 || FERIADOS_FIXOS.has(mmdd)
            const cls = ['mac-dia']
            if (isHoje) cls.push('hoje')
            if (isSb) cls.push('mac-sb')
            if (isFolga) cls.push('mac-folga')
            if (isFerias) cls.push('mac-ferias')
            if (isFerCustom) cls.push('feriado-custom')
            if (isFerFixo && !isFerCustom) cls.push('feriado-fixo')
            return (
              <button
                key={chave}
                type="button"
                className={cls.join(' ')}
                style={isSb ? { background: agente.cor, borderColor: agente.cor, color: '#fff' } : undefined}
                onClick={() => clickDia(chave)}
                disabled={isFerias}
                title={
                  isFerias ? 'Em férias' :
                  isSb ? 'Sobreaviso — toque para mudar para folga' :
                  isFolga ? 'Folga — toque para limpar' :
                  podeSobreaviso ? 'Toque para marcar como sobreaviso' : 'Toque para marcar como folga'
                }
              >
                <span className="mac-dia-num">{dia}</span>
                <span className="mac-dia-tag">
                  {isFerias ? '🌴' : isSb ? '📟' : isFolga ? '🏠' : ''}
                </span>
              </button>
            )
          })}
          {Array.from({ length: trailingCount }).map((_, i) => (
            <div key={`t-${i}`} className="escala-cal-vazio" />
          ))}
        </div>

        <div className="escala-modal-acoes">
          <button className="escala-modal-limpar" onClick={limparMes}>
            Limpar este mês
          </button>
          <div className="bh-edit-acoes-direita">
            <button className="bh-edit-cancelar" onClick={onFechar}>Cancelar</button>
            <button className="escala-modal-salvar" onClick={salvar}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Exportação Excel da escala mensal ─────────────────────────────
async function exportarEscalaMensalExcel(dados: EscalaData, ano: number, mes: number) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Defesa Civil de Ouro Branco'
  wb.created = new Date()

  const nomeMes = MESES[mes]
  const diasNoMes = new Date(ano, mes + 1, 0).getDate()

  // ── Aba 1: Calendário do mês ────────────────────────────────────
  const wsCal = wb.addWorksheet(`Escala ${nomeMes}`, {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  })

  wsCal.mergeCells('A1:E1')
  const tit = wsCal.getCell('A1')
  tit.value = `Escala — ${nomeMes} de ${ano} — Defesa Civil de Ouro Branco`
  tit.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  tit.alignment = { vertical: 'middle', horizontal: 'center' }
  tit.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F4C81' } }
  wsCal.getRow(1).height = 28

  const headerRow = wsCal.addRow(['Data', 'Dia', 'Tipo', 'Sobreaviso (📟)', 'Folga (🏠)'])
  headerRow.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A4B8C' } }
    c.alignment = { vertical: 'middle', horizontal: 'center' }
    c.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } }
  })
  headerRow.height = 22

  for (let d = 1; d <= diasNoMes; d++) {
    const chave = chaveData(ano, mes, d)
    const dt = new Date(ano, mes, d)
    const dow = dt.getDay()
    const nomeDia = DIAS_SEMANA_NOMES[dow]
    let tipo = 'Útil'
    if (ehFeriadoOuDomingo(chave, dados.feriadosCustom)) tipo = dow === 0 ? 'Domingo' : 'Feriado'
    else if (ehSabadoComum(chave, dados.feriadosCustom)) tipo = 'Sábado'

    const sobre = (dados.sobreaviso[chave] ?? []).join(', ')
    const folga = (dados.folgas[chave] ?? []).join(', ')

    const r = wsCal.addRow([
      `${String(d).padStart(2, '0')}/${String(mes + 1).padStart(2, '0')}/${ano}`,
      nomeDia,
      tipo,
      sobre || '—',
      folga || '—',
    ])
    let bg: string | null = null
    if (tipo === 'Domingo' || tipo === 'Feriado') bg = 'FFFFE4E6'
    else if (tipo === 'Sábado') bg = 'FFFFF7E0'
    r.eachCell((c, colNumber) => {
      const centro = colNumber <= 3
      c.alignment = { vertical: 'middle', horizontal: centro ? 'center' : 'left', wrapText: true }
      c.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }
      if (bg) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
    })
  }

  wsCal.getColumn(1).width = 14
  wsCal.getColumn(2).width = 8
  wsCal.getColumn(3).width = 12
  wsCal.getColumn(4).width = 38
  wsCal.getColumn(5).width = 38

  // ── Aba 2: Banco de Horas ───────────────────────────────────────
  const wsBanco = wb.addWorksheet('Banco de Horas')
  wsBanco.mergeCells('A1:F1')
  const tb = wsBanco.getCell('A1')
  tb.value = `Banco de Horas — ${nomeMes} de ${ano}`
  tb.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  tb.alignment = { vertical: 'middle', horizontal: 'center' }
  tb.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F4C81' } }
  wsBanco.getRow(1).height = 28

  const hRow = wsBanco.addRow(['Agente', 'Tipo', 'Calculado (h)', 'Ajuste manual (h)', 'Total (h)', 'Dias de folga'])
  hRow.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A4B8C' } }
    c.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  hRow.height = 22

  const hoje = hojeStr()
  const linhas: { nome: string; tipo: string; calc: number; ajuste: number; total: number; dias: number }[] = []
  for (const ag of AGENTES_ESCALA) {
    const ehExtra = AGENTES_SEM_SOBREAVISO.has(ag.nome)
    let calc = 0
    if (ehExtra) {
      const horas = dados.horasExtrasSimples[ag.nome] ?? {}
      calc = Object.values(horas).reduce((a, h) => a + h, 0)
    } else {
      calc = calcularBancoHoras(
        ag.nome, dados.sobreaviso, dados.horasTrabalhadasSobreaviso,
        dados.percDomingoFeriado, dados.percSobreaviso, dados.percSabado,
        dados.feriadosCustom, dados.descontosFolgaBanco, dados.folgas, hoje,
      )
    }
    const ajuste = dados.ajustesBanco?.[ag.nome] ?? 0
    const total = calc + ajuste
    const dias = Math.max(0, total) / HORAS_POR_FOLGA_BANCO
    linhas.push({ nome: ag.nome, tipo: ehExtra ? 'Horas extras' : 'Sobreaviso', calc, ajuste, total, dias })
  }
  linhas.sort((a, b) => b.total - a.total)
  let totalGeral = 0
  for (const l of linhas) {
    totalGeral += l.total
    const r = wsBanco.addRow([
      l.nome,
      l.tipo,
      Number(l.calc.toFixed(2)),
      Number(l.ajuste.toFixed(2)),
      Number(l.total.toFixed(2)),
      Number(l.dias.toFixed(2)),
    ])
    r.eachCell((c, col) => {
      c.alignment = { vertical: 'middle', horizontal: col === 1 || col === 2 ? 'left' : 'center' }
      c.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }
    })
  }
  const totRow = wsBanco.addRow(['TOTAL', '', '', '', Number(totalGeral.toFixed(2)), Number((Math.max(0, totalGeral) / HORAS_POR_FOLGA_BANCO).toFixed(2))])
  totRow.eachCell(c => {
    c.font = { bold: true }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7EF' } }
  })

  wsBanco.getColumn(1).width = 16
  wsBanco.getColumn(2).width = 14
  wsBanco.getColumn(3).width = 16
  wsBanco.getColumn(4).width = 18
  wsBanco.getColumn(5).width = 14
  wsBanco.getColumn(6).width = 16

  // ── Download ────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `escala_${String(mes + 1).padStart(2, '0')}-${ano}_defesacivil_ourobranco.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── Componente principal ──────────────────────────────────────────
export default function EscalaAgentes() {
  const agora = new Date()
  const [ano, setAno] = useState(agora.getFullYear())
  const [mes, setMes] = useState(agora.getMonth())
  const [dados, setDados] = useState<EscalaData>(carregarDados)
  const [editando, setEditando] = useState(false)
  const [pedirSenha, setPedirSenha] = useState(false)
  const [modalDia, setModalDia] = useState<string | null>(null)
  // Modal por agente (clique na legenda) — substitui o clique-na-data
  const [agenteAberto, setAgenteAberto] = useState<string | null>(null)
  const valteirZeradoRef = useRef(false)

  const hoje = hojeStr()
  const agenteLogado = getAgenteLogado()
  const isMoises = agenteLogado === 'Moisés'
  const isSobreaviso = AGENTES_SOBREAVISO.some(a => a.nome === agenteLogado)
  const isHorasExtras = AGENTES_SEM_SOBREAVISO.has(agenteLogado)

  useEffect(() => {
    // Migrar dados da versão antiga se existir
    const old = localStorage.getItem('escala-data-v1')
    if (old && !localStorage.getItem(STORAGE_KEY)) {
      try {
        const p = JSON.parse(old)
        const migrado: EscalaData = {
          adm: p.adm ?? {},
          sobreaviso: p.sobreaviso ?? {},
          sobreavisoSemanal: {},
          folgas: {},
          ferias: p.ferias ?? [],
          horasSobreaviso: p.horasSobreaviso ?? {},
          horasTrabalhadasSobreaviso: {},
          feriadosCustom: [],
          percDomingoFeriado: 100,
          percSobreaviso: 50,
          percSabado: 50,
          descontosFolgaBanco: {},
          horasExtrasSimples: {},
          ajustesBanco: {},
        }
        salvarDados(migrado)
        setDados(migrado)
      } catch { /* */ }
    }
  }, [])

  // Sincroniza com Supabase ao montar: se houver estado remoto, usa ele
  useEffect(() => {
    let cancelado = false
    carregarDadosRemoto().then(remoto => {
      if (cancelado || !remoto) return
      // Não sobrescreve se o usuário já fez uma edição local recente
      // (proteção contra race condition: edição rápida antes do supabase responder).
      if (teveEdicaoLocalRecente()) return
      setDados(remoto)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remoto))
    })
    return () => { cancelado = true }
  }, [])

  // Reset único do banco do Valteir (pedido em abr/2026: zerar 4,5h)
  useEffect(() => {
    if (valteirZeradoRef.current) return
    const FLAG = 'banco-valteir-zerado-2026-04'
    if (localStorage.getItem(FLAG)) { valteirZeradoRef.current = true; return }
    const calc = calcularBancoHoras(
      'Valteir', dados.sobreaviso, dados.horasTrabalhadasSobreaviso,
      dados.percDomingoFeriado, dados.percSobreaviso, dados.percSabado,
      dados.feriadosCustom, dados.descontosFolgaBanco, dados.folgas, hojeStr(),
    )
    const ajusteAtual = dados.ajustesBanco?.['Valteir'] ?? 0
    const totalAtual = calc + ajusteAtual
    if (totalAtual !== 0) {
      const novosAjustes = { ...(dados.ajustesBanco ?? {}), Valteir: -calc }
      const novos = { ...dados, ajustesBanco: novosAjustes }
      setDados(novos)
      salvarDados(novos)
    }
    localStorage.setItem(FLAG, '1')
    valteirZeradoRef.current = true
  }, [dados])

  function mesAnterior() {
    if (mes === 0) { setAno(a => a - 1); setMes(11) }
    else setMes(m => m - 1)
  }

  function proximoMes() {
    if (mes === 11) { setAno(a => a + 1); setMes(0) }
    else setMes(m => m + 1)
  }

  const onDiaClick = useCallback((chave: string) => {
    setModalDia(chave)
  }, [])

  function salvarDia(agentesSobreaviso: string[], folgasDoDia: string[]) {
    if (!modalDia) return

    const novoSobreaviso = { ...dados.sobreaviso }
    if (agentesSobreaviso.length === 0) delete novoSobreaviso[modalDia]
    else novoSobreaviso[modalDia] = agentesSobreaviso

    const novasFolgas = { ...dados.folgas }
    if (folgasDoDia.length === 0) delete novasFolgas[modalDia]
    else novasFolgas[modalDia] = folgasDoDia

    const novos = { ...dados, sobreaviso: novoSobreaviso, folgas: novasFolgas }
    setDados(novos)
    salvarDados(novos)
    setModalDia(null)
  }

  function onFeriasChange(novasFerias: Ferias[]) {
    const novos = { ...dados, ferias: novasFerias }
    setDados(novos)
    salvarDados(novos)
  }

  function onFeriadosCustomChange(novosFeriados: string[]) {
    const novos = { ...dados, feriadosCustom: novosFeriados }
    setDados(novos)
    salvarDados(novos)
  }

  function onRegrasChange(percDomFer: number, percSb: number, percSabado: number) {
    const novos = { ...dados, percDomingoFeriado: percDomFer, percSobreaviso: percSb, percSabado }
    setDados(novos)
    salvarDados(novos)
  }

  function atualizarHorasTrabalhadasSobreaviso(data: string, horas: number) {
    const agenteHoras = { ...(dados.horasTrabalhadasSobreaviso[agenteLogado] ?? {}) }
    if (horas === 0) {
      delete agenteHoras[data]
    } else {
      agenteHoras[data] = horas
    }
    const novos = {
      ...dados,
      horasTrabalhadasSobreaviso: {
        ...dados.horasTrabalhadasSobreaviso,
        [agenteLogado]: agenteHoras,
      },
    }
    setDados(novos)
    salvarDados(novos)
  }

  function atualizarAjusteBanco(agente: string, ajuste: number) {
    const novosAjustes = { ...(dados.ajustesBanco ?? {}) }
    if (ajuste === 0) {
      delete novosAjustes[agente]
    } else {
      novosAjustes[agente] = ajuste
    }
    const novos = { ...dados, ajustesBanco: novosAjustes }
    setDados(novos)
    salvarDados(novos)
  }

  function atualizarHoraExtraSimples(data: string, horas: number) {
    const agenteHoras = { ...(dados.horasExtrasSimples[agenteLogado] ?? {}) }
    if (horas === 0) {
      delete agenteHoras[data]
    } else {
      agenteHoras[data] = horas
    }
    const novos = {
      ...dados,
      horasExtrasSimples: {
        ...dados.horasExtrasSimples,
        [agenteLogado]: agenteHoras,
      },
    }
    setDados(novos)
    salvarDados(novos)
  }

  return (
    <div className="escala-wrap">
      <div className="escala-em-desenvolvimento">🚧 Em desenvolvimento...</div>
      <div className="escala-nav-mes">
        <button className="escala-nav-btn" onClick={mesAnterior}>‹</button>
        <span className="escala-nav-label">{MESES[mes]} {ano}</span>
        <button className="escala-nav-btn" onClick={proximoMes}>›</button>
      </div>

      {isMoises && (
        <div className="escala-acoes-moises">
          <button
            className={`escala-btn-editar ${editando ? 'ativo' : ''}`}
            onClick={() => {
              if (editando) {
                setEditando(false)
                setModalDia(null)
              } else {
                setPedirSenha(true)
              }
            }}
          >
            {editando ? '✅ Concluir edição' : '✏️ Editar escala'}
          </button>
          <button
            className="escala-btn-exportar"
            onClick={() => {
              exportarEscalaMensalExcel(dados, ano, mes).catch(err => {
                console.error('Falha ao exportar Excel:', err)
                alert('Não foi possível gerar o arquivo Excel. Tente novamente.')
              })
            }}
            title={`Baixar a escala de ${MESES[mes]}/${ano} em Excel`}
          >
            📊 Exportar mês em Excel
          </button>
        </div>
      )}

      {pedirSenha && (
        <ModalSenha
          titulo="Editar Escala"
          senhaCorreta="2026"
          onConfirmar={() => { setPedirSenha(false); setEditando(true) }}
          onCancelar={() => setPedirSenha(false)}
        />
      )}

      {editando && isMoises && (
        <div className="escala-edit-aviso">
          👆 Toque no <strong>nome do agente na legenda abaixo</strong> para escolher os dias dele de sobreaviso (gera {HORAS_POR_DIA_SOBREAVISO}h/dia) e de folga (desconta {HORAS_POR_FOLGA_BANCO}h ao passar do dia).
        </div>
      )}

      {/* Calendário único: Sobreaviso + Folga (visualização — edição é feita pela legenda) */}
      <CalendarioUnificado
        ano={ano} mes={mes}
        sobreavisoDiario={dados.sobreaviso}
        folgas={dados.folgas}
        ferias={dados.ferias}
        hoje={hoje}
        editando={false}
        feriadosCustom={dados.feriadosCustom}
        onDiaClick={onDiaClick}
      />

      <Legenda
        ferias={dados.ferias}
        mes={mes}
        ano={ano}
        editavel={editando && isMoises}
        onAgenteClick={(nome) => setAgenteAberto(nome)}
      />

      {/* Banco de Horas — agente individual (sobreaviso) */}
      {!isMoises && isSobreaviso && (
        <BancoHorasAgente
          agente={agenteLogado}
          sobreavisoSemanal={dados.sobreaviso}
          horasTrabalhadasSobreaviso={dados.horasTrabalhadasSobreaviso}
          descontosFolgaBanco={dados.descontosFolgaBanco}
          folgas={dados.folgas}
          percDomingoFeriado={dados.percDomingoFeriado}
          percSobreaviso={dados.percSobreaviso}
          percSabado={dados.percSabado}
          feriadosCustom={dados.feriadosCustom}
          onUpdateHoras={atualizarHorasTrabalhadasSobreaviso}
        />
      )}

      {/* Banco de Horas Extras — Talita / Cristiane / Sócrates */}
      {!isMoises && isHorasExtras && (
        <BancoHorasExtraSimples
          agente={agenteLogado}
          horasExtrasSimples={dados.horasExtrasSimples}
          onUpdateHora={atualizarHoraExtraSimples}
        />
      )}

      {/* Banco de Horas — Moisés vê todos */}
      {isMoises && (
        <BancoHorasMoises
          sobreavisoSemanal={dados.sobreaviso}
          horasTrabalhadasSobreaviso={dados.horasTrabalhadasSobreaviso}
          descontosFolgaBanco={dados.descontosFolgaBanco}
          folgas={dados.folgas}
          percDomingoFeriado={dados.percDomingoFeriado}
          percSobreaviso={dados.percSobreaviso}
          percSabado={dados.percSabado}
          feriadosCustom={dados.feriadosCustom}
          horasExtrasSimples={dados.horasExtrasSimples}
          ajustesBanco={dados.ajustesBanco ?? {}}
          onAjusteChange={atualizarAjusteBanco}
          podeEditar={editando}
        />
      )}

      {/* Painéis exclusivos do Moisés em modo edição */}
      {editando && isMoises && (
        <>
          <PainelRegras
            percDomingoFeriado={dados.percDomingoFeriado}
            percSobreaviso={dados.percSobreaviso}
            percSabado={dados.percSabado}
            onChange={onRegrasChange}
          />
          <PainelFeriadosCustom
            feriados={dados.feriadosCustom}
            onChange={onFeriadosCustomChange}
          />
          <PainelFerias ferias={dados.ferias} onChange={onFeriasChange} />
        </>
      )}

      {/* Modal único do dia: Sobreaviso + Folga (legado, não aberto pelo fluxo atual) */}
      {modalDia && (
        <ModalDia
          data={modalDia}
          selecionados={dados.sobreaviso[modalDia] ?? []}
          folgasSelecionadas={dados.folgas[modalDia] ?? []}
          ferias={dados.ferias}
          onSalvar={salvarDia}
          onFechar={() => setModalDia(null)}
        />
      )}

      {/* Modal por agente: clique na legenda → calendário do agente */}
      {agenteAberto && editando && isMoises && (() => {
        const ag = AGENTES_ESCALA.find(a => a.nome === agenteAberto)
        if (!ag) return null
        const podeSb = !AGENTES_SEM_SOBREAVISO.has(ag.nome)
        return (
          <ModalAgenteCalendario
            agente={ag}
            podeSobreaviso={podeSb}
            sobreaviso={dados.sobreaviso}
            folgas={dados.folgas}
            ferias={dados.ferias}
            feriadosCustom={dados.feriadosCustom}
            anoInicial={ano}
            mesInicial={mes}
            onSalvar={(novoSb, novasFolgas) => {
              const novos = { ...dados, sobreaviso: novoSb, folgas: novasFolgas }
              setDados(novos)
              salvarDados(novos)
              setAgenteAberto(null)
            }}
            onFechar={() => setAgenteAberto(null)}
          />
        )
      })()}
    </div>
  )
}

void _diasDaSemana;
void _PainelEscalasSemanas;
void ModalEscalarSemana;
