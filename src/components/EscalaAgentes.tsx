import { useState, useCallback, useMemo, useEffect } from 'react'
import { getAgenteLogado } from './Login'
import './EscalaAgentes.css'

// ── Constantes ────────────────────────────────────────────────────
const AGENTES_ESCALA = [
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

// Apenas estes 6 participam do sobreaviso
const AGENTES_SOBREAVISO = [
  { nome: 'Valteir',   cor: '#2563eb', iniciais: 'VA' },
  { nome: 'Arthur',    cor: '#16a34a', iniciais: 'AR' },
  { nome: 'Gustavo',   cor: '#dc2626', iniciais: 'GU' },
  { nome: 'Vânia',     cor: '#9333ea', iniciais: 'VÂ' },
  { nome: 'Graça',     cor: '#ea580c', iniciais: 'GR' },
  { nome: 'Dyonathan', cor: '#b45309', iniciais: 'DY' },
]

const AGENTE_MAP: Record<string, { cor: string; iniciais: string }> = {}
AGENTES_ESCALA.forEach(ag => { AGENTE_MAP[ag.nome] = { cor: ag.cor, iniciais: ag.iniciais } })

const DIAS_SEMANA_HDR  = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const HORAS_POR_SEMANA_SOBREAVISO = 16

// ── Tipos ─────────────────────────────────────────────────────────
type TipoEscala = 'adm' | 'sobreaviso'

interface Ferias {
  agente: string
  inicio: string
  fim: string
}

interface EscalaData {
  adm: Record<string, string[]>
  sobreaviso: Record<string, string[]>           // legado — mantido por compat
  sobreavisoSemanal: Record<string, string[]>    // segunda-feira (YYYY-MM-DD) → lista de agentes
  ferias: Ferias[]
  horasSobreaviso: Record<string, Record<string, number>>  // legado
}

// ── Storage ───────────────────────────────────────────────────────
const STORAGE_KEY = 'escala-data-v3'

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
        ferias: p.ferias ?? [],
        horasSobreaviso: p.horasSobreaviso ?? {},
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
        ferias: p.ferias ?? [],
        horasSobreaviso: p.horasSobreaviso ?? {},
      }
    }
  } catch { /* */ }
  return { adm: {}, sobreaviso: {}, sobreavisoSemanal: {}, ferias: [], horasSobreaviso: {} }
}

function salvarDados(data: EscalaData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
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

// Semanas de sobreaviso feitas por um agente → banco de horas
function calcularBancoHoras(agente: string, sobreavisoSemanal: Record<string, string[]>): number {
  const semanas = Object.values(sobreavisoSemanal).filter(lista => lista.includes(agente)).length
  return semanas * HORAS_POR_SEMANA_SOBREAVISO
}

// Folgas do agente: segunda da semana APÓS cada sobreaviso
function folgasDoAgente(agente: string, sobreavisoSemanal: Record<string, string[]>): string[] {
  return Object.entries(sobreavisoSemanal)
    .filter(([, lista]) => lista.includes(agente))
    .map(([seg]) => proximaSegunda(seg))
}

// Verifica se o agente tem folga nesta semana (próxima semana ao sobreaviso)
function agenteTemFolga(agente: string, chave: string, sobreavisoSemanal: Record<string, string[]>): boolean {
  const seg = segundaDaSemana(chave)
  return folgasDoAgente(agente, sobreavisoSemanal).includes(seg)
}

// ── Modal: escalar agentes para uma semana (Moisés) ───────────────
interface ModalSemanaProps {
  segundaFeira: string
  agentesSelecionados: string[]
  ferias: Ferias[]
  onSalvar: (agentes: string[]) => void
  onFechar: () => void
}

function ModalEscalarSemana({ segundaFeira, agentesSelecionados, ferias, onSalvar, onFechar }: ModalSemanaProps) {
  const [escolhidos, setEscolhidos] = useState<string[]>(agentesSelecionados)
  const proximaSeg = proximaSegunda(segundaFeira)

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
              Seg {fmtDataCurta(segundaFeira)} 17h → Seg {fmtDataCurta(proximaSeg)} 07h
            </div>
          </div>
          <button className="escala-modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <div className="sb-semana-info-box">
          <span>⏰</span>
          <span>Pode selecionar mais de um agente. Cada um fica de sobreaviso das 17h até 07h do dia seguinte durante toda a semana.</span>
        </div>

        <div className="sb-modal-counter">
          {escolhidos.length === 0
            ? 'Nenhum selecionado'
            : `${escolhidos.length} selecionado${escolhidos.length > 1 ? 's' : ''}`}
        </div>

        <div className="escala-modal-lista">
          {AGENTES_SOBREAVISO.map(ag => {
            const emFerias = agenteEmFerias(ag.nome, segundaFeira, ferias)
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

function PainelEscalasSemanas({ sobreavisoSemanal, ferias, onEscalar }: PainelSemanasProps) {
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

// ── Calendário Sobreaviso (nomes, não bolinhas) ───────────────────
interface CalendarioSobreavisoProps {
  ano: number
  mes: number
  sobreavisoSemanal: Record<string, string[]>
  hoje: string
}

function CalendarioSobreaviso({ ano, mes, sobreavisoSemanal, hoje }: CalendarioSobreavisoProps) {
  const total = diasNoMes(ano, mes)
  const inicio = primeiroDiaSemana(ano, mes)

  const celulas: (number | null)[] = [
    ...Array(inicio).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ]

  const segHoje = segundaDaSemana(hoje)

  return (
    <div className="escala-calendario-bloco escala-bloco-sobreaviso">
      <div className="escala-bloco-header">
        <span className="escala-bloco-icone">📟</span>
        <span className="escala-bloco-titulo">Sobreaviso</span>
      </div>
      <div className="escala-cal-grid">
        {DIAS_SEMANA_HDR.map((d, i) => (
          <div key={i} className="escala-cal-diahdr">{d}</div>
        ))}
        {celulas.map((dia, i) => {
          if (dia === null) return <div key={`v-${i}`} className="escala-cal-vazio sb-vazio" />

          const chave = chaveData(ano, mes, dia)
          const seg = segundaDaSemana(chave)
          const agentes = sobreavisoSemanal[seg] ?? []
          const isHoje = chave === hoje
          const isSemanaAtual = seg === segHoje

          // Cor de fundo: usa a cor do primeiro agente como base
          const primeiraInfo = agentes.length > 0 ? AGENTE_MAP[agentes[0]] : null

          return (
            <div
              key={chave}
              className={`escala-cal-dia sb-dia ${isHoje ? 'hoje' : ''} ${agentes.length > 0 ? 'tem-agente' : ''} ${isSemanaAtual ? 'sb-semana-atual' : ''}`}
              style={primeiraInfo ? { backgroundColor: primeiraInfo.cor + '10', borderBottom: `2px solid ${primeiraInfo.cor}35` } : {}}
            >
              <span className="escala-cal-num">{dia}</span>
              <div className="sb-nomes-dia">
                {agentes.map(nome => {
                  const info = AGENTE_MAP[nome]
                  return info ? (
                    <span
                      key={nome}
                      className="sb-nome-dia"
                      style={{ color: info.cor }}
                      title={`${nome} de sobreaviso`}
                    >
                      {nome}
                    </span>
                  ) : null
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Banco de Horas: visão do agente ──────────────────────────────
interface BancoHorasAgenteProps {
  agente: string
  sobreavisoSemanal: Record<string, string[]>
}

function BancoHorasAgente({ agente, sobreavisoSemanal }: BancoHorasAgenteProps) {
  const info = AGENTE_MAP[agente]
  const hoje = hojeStr()
  const segHoje = segundaDaSemana(hoje)

  const totalHoras = calcularBancoHoras(agente, sobreavisoSemanal)

  // Folgas futuras (próximas semanas de folga)
  const folgas = folgasDoAgente(agente, sobreavisoSemanal)
  const proximaFolga = folgas.find(f => f >= segHoje) ?? null

  // Agrupar por mês (16h por semana, agrupado pelo mês da segunda-feira)
  const porMes = useMemo(() => {
    const mapa: Record<string, number> = {}
    Object.entries(sobreavisoSemanal)
      .filter(([, lista]) => lista.includes(agente))
      .forEach(([seg]) => {
        const chave = seg.slice(0, 7) // YYYY-MM
        mapa[chave] = (mapa[chave] ?? 0) + HORAS_POR_SEMANA_SOBREAVISO
      })
    return Object.entries(mapa).sort((a, b) => b[0].localeCompare(a[0]))
  }, [agente, sobreavisoSemanal])

  // Sobreaviso desta semana
  const estaDesobreaviso = (sobreavisoSemanal[segHoje] ?? []).includes(agente)

  return (
    <div className="bh-card">
      <div className="bh-card-header">
        <span className="bh-card-iniciais" style={{ background: info?.cor ?? '#64748b' }}>
          {info?.iniciais ?? agente.slice(0, 2).toUpperCase()}
        </span>
        <div className="bh-card-info">
          <span className="bh-card-nome">{agente}</span>
          <span className="bh-card-subtitulo">Banco de Horas — Sobreaviso</span>
        </div>
        <div className="bh-card-total">
          <span className="bh-card-horas">{totalHoras}</span>
          <span className="bh-card-h">h</span>
        </div>
      </div>

      {estaDesobreaviso && (
        <div className="bh-aviso-ativo">
          🟢 Você está de sobreaviso esta semana (17h às 07h)
        </div>
      )}

      {proximaFolga && (
        <div className="bh-aviso-folga">
          🏠 Folga na semana de {fmtDataCurta(proximaFolga)} — {fmtDataCurta(
            (() => {
              const [y, m, d] = proximaFolga.split('-').map(Number)
              const dt = new Date(y, m - 1, d)
              dt.setDate(dt.getDate() + 4)
              return chaveData(dt.getFullYear(), dt.getMonth(), dt.getDate())
            })()
          )} (Seg–Sex)
        </div>
      )}

      {porMes.length > 0 ? (
        <div className="bh-card-meses">
          {porMes.map(([mes, h]) => {
            const [y, m] = mes.split('-')
            return (
              <div key={mes} className="bh-card-mes-row">
                <span className="bh-card-mes-label">{MESES[Number(m) - 1]} {y}</span>
                <span className="bh-card-mes-h">{h}h</span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="bh-card-vazio">Nenhuma semana de sobreaviso registrada ainda.</p>
      )}
    </div>
  )
}

// ── Banco de Horas: painel do Moisés ─────────────────────────────
function BancoHorasMoises({ sobreavisoSemanal }: { sobreavisoSemanal: Record<string, string[]> }) {
  const hoje = hojeStr()
  const segHoje = segundaDaSemana(hoje)

  const lista = useMemo(() => {
    return AGENTES_SOBREAVISO.map(ag => {
      const total = calcularBancoHoras(ag.nome, sobreavisoSemanal)
      const semanas = Object.values(sobreavisoSemanal).filter(lista => lista.includes(ag.nome)).length
      const desobreaviso = (sobreavisoSemanal[segHoje] ?? []).includes(ag.nome)
      const folgas = folgasDoAgente(ag.nome, sobreavisoSemanal)
      const temFolga = folgas.includes(segHoje)
      return { ...ag, total, semanas, desobreaviso, temFolga }
    }).sort((a, b) => b.total - a.total)
  }, [sobreavisoSemanal, segHoje])

  const totalGeral = lista.reduce((s, ag) => s + ag.total, 0)

  return (
    <div className="bh-moises-painel">
      <div className="bh-moises-header">
        <span className="bh-moises-titulo">⏱️ Banco de Horas — Sobreaviso</span>
        <span className="bh-moises-total">{totalGeral}h total</span>
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
                <span className="bh-moises-badge-folga" title="De folga esta semana">🏠</span>
              )}
              <div className="bh-moises-horas-info">
                <span className="bh-moises-h">{ag.total}h</span>
                <span className="bh-moises-semanas">{ag.semanas} sem.</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="bh-moises-rodape">
        16h por semana de sobreaviso · Folga na semana seguinte (Seg–Sex)
      </div>
    </div>
  )
}

// ── Modal seleção de agentes por dia ADM (Moisés) ────────────────
interface ModalDiaProps {
  data: string
  tipo: TipoEscala
  selecionados: string[]
  ferias: Ferias[]
  onSalvar: (agentes: string[]) => void
  onFechar: () => void
}

function ModalDia({ data, tipo, selecionados, ferias, onSalvar, onFechar }: ModalDiaProps) {
  const [escolhidos, setEscolhidos] = useState<string[]>(selecionados)
  const [, mesStr, diaStr] = data.split('-')
  const label = `${diaStr}/${mesStr} — Plantão ADM`

  function toggle(nome: string) {
    setEscolhidos(prev => prev.includes(nome) ? prev.filter(n => n !== nome) : [...prev, nome])
  }

  return (
    <div className="escala-modal-overlay" onClick={onFechar}>
      <div className="escala-modal" onClick={e => e.stopPropagation()}>
        <div className="escala-modal-header">
          <span className="escala-modal-titulo">{label}</span>
          <button className="escala-modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <p className="escala-modal-sub">Selecione quem está escalado:</p>
        <div className="escala-modal-lista">
          {AGENTES_ESCALA.map(ag => {
            const emFerias = agenteEmFerias(ag.nome, data, ferias)
            const ativo = escolhidos.includes(ag.nome)
            return (
              <button
                key={ag.nome}
                className={`escala-modal-agente ${ativo ? 'selecionado' : ''} ${emFerias ? 'em-ferias' : ''}`}
                style={ativo ? { background: ag.cor, borderColor: ag.cor, color: '#fff' } : { borderColor: ag.cor }}
                onClick={() => toggle(ag.nome)}
                disabled={emFerias}
              >
                <span className="escala-modal-iniciais" style={{ background: ativo ? 'rgba(255,255,255,0.25)' : ag.cor }}>
                  {ag.iniciais}
                </span>
                <span className="escala-modal-agente-nome">{ag.nome}</span>
                {emFerias && <span className="escala-modal-ferias-tag">🌴 Férias</span>}
              </button>
            )
          })}
        </div>
        <div className="escala-modal-acoes">
          <button className="escala-modal-limpar" onClick={() => setEscolhidos([])}>Limpar</button>
          <button className="escala-modal-salvar" onClick={() => onSalvar(escolhidos)}>Salvar</button>
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
      <div className="escala-ferias-titulo"><span>🌴</span> Férias / Folga prolongada</div>
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

// ── Calendário ADM ────────────────────────────────────────────────
interface CalendarioProps {
  ano: number
  mes: number
  dados: Record<string, string[]>
  sobreavisoSemanal: Record<string, string[]>
  hoje: string
  editando: boolean
  onDiaClick: (chave: string) => void
}

function CalendarioADM({ ano, mes, dados, sobreavisoSemanal, hoje, editando, onDiaClick }: CalendarioProps) {
  const total = diasNoMes(ano, mes)
  const inicio = primeiroDiaSemana(ano, mes)

  // Nº de células de cauda (após o último dia) para completar a grade
  const trailingCount = (7 - ((inicio + total) % 7)) % 7

  // Retorna agentes de folga para a semana que contém 'chave'
  function agentesEmFolga(chave: string): string[] {
    const mapa = sobreavisoSemanal ?? {}
    const seg = segundaDaSemana(chave)
    const [y, m, d] = seg.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() - 7)
    const segAnterior = chaveData(dt.getFullYear(), dt.getMonth(), dt.getDate())
    const lista = mapa[segAnterior]
    return Array.isArray(lista) ? lista : []
  }

  // Folga se aplica apenas de Seg a Sex
  function diaUtil(chave: string): boolean {
    const [y, m, d] = chave.split('-').map(Number)
    const dow = new Date(y, m - 1, d).getDay()
    return dow >= 1 && dow <= 5
  }

  // Agentes de folga na última semana do mês (para exibir nas células de cauda)
  const ultimaChave = chaveData(ano, mes, total)
  const folgaUltimaSemana = agentesEmFolga(ultimaChave)

  return (
    <div className="escala-calendario-bloco escala-bloco-adm">
      <div className="escala-bloco-header">
        <span className="escala-bloco-icone">🏢</span>
        <span className="escala-bloco-titulo">ADM</span>
      </div>
      <div className="escala-cal-grid">
        {DIAS_SEMANA_HDR.map((d, i) => (
          <div key={i} className="escala-cal-diahdr">{d}</div>
        ))}

        {/* Células vazias de cabeça (antes do dia 1) */}
        {Array.from({ length: inicio }).map((_, i) => (
          <div key={`lead-${i}`} className="escala-cal-vazio" />
        ))}

        {/* Células de dias */}
        {Array.from({ length: total }, (_, i) => i + 1).map(dia => {
          const chave = chaveData(ano, mes, dia)
          const isHoje = chave === hoje
          const emFolga = diaUtil(chave) ? agentesEmFolga(chave) : []
          const agentes = (dados[chave] ?? []).filter(nome => !emFolga.includes(nome))
          const temAgente = agentes.length > 0

          return (
            <button
              key={chave}
              className={`escala-cal-dia ${isHoje ? 'hoje' : ''} ${temAgente ? 'tem-agente' : ''} ${editando ? 'editavel' : ''}`}
              onClick={() => editando && onDiaClick(chave)}
            >
              <span className="escala-cal-num">{dia}</span>
              <div className="escala-adm-nomes">
                {agentes.map(nome => {
                  const info = AGENTE_MAP[nome]
                  return (
                    <span
                      key={nome}
                      className="escala-adm-nome"
                      style={{ color: info?.cor ?? '#374151' }}
                    >
                      {nome}
                    </span>
                  )
                })}
              </div>
            </button>
          )
        })}

        {/* Células de cauda — mostram agentes de folga da última semana */}
        {Array.from({ length: trailingCount }).map((_, i) => {
          const agenteFolga = folgaUltimaSemana[i]
          if (agenteFolga) {
            const info = AGENTE_MAP[agenteFolga]
            return (
              <div key={`tail-${i}`} className="escala-cal-folga-cauda">
                <span className="escala-cal-folga-cauda-nome" style={{ color: info?.cor ?? '#6b7280' }}>
                  {agenteFolga} - Folga
                </span>
              </div>
            )
          }
          // Se tiver mais agentes de folga do que células, acumula no último
          if (i === trailingCount - 1 && folgaUltimaSemana.length > trailingCount) {
            const extras = folgaUltimaSemana.slice(i)
            return (
              <div key={`tail-${i}`} className="escala-cal-folga-cauda">
                {extras.map(nome => {
                  const info = AGENTE_MAP[nome]
                  return (
                    <span key={nome} className="escala-cal-folga-cauda-nome" style={{ color: info?.cor ?? '#6b7280' }}>
                      {nome} - Folga
                    </span>
                  )
                })}
              </div>
            )
          }
          return <div key={`tail-${i}`} className="escala-cal-vazio" />
        })}
      </div>
    </div>
  )
}

// ── Legenda ───────────────────────────────────────────────────────
function Legenda({ ferias, mes, ano }: { ferias: Ferias[]; mes: number; ano: number }) {
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
      <span className="escala-legenda-titulo">Legenda</span>
      <div className="escala-legenda-lista">
        {ativos.map(ag => (
          <div key={ag.nome} className="escala-legenda-item">
            <span className="escala-legenda-cor" style={{ background: ag.cor }} />
            <span className="escala-legenda-nome">{ag.nome}</span>
          </div>
        ))}
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

// ── Componente principal ──────────────────────────────────────────
export default function EscalaAgentes() {
  const agora = new Date()
  const [ano, setAno] = useState(agora.getFullYear())
  const [mes, setMes] = useState(agora.getMonth())
  const [dados, setDados] = useState<EscalaData>(carregarDados)
  const [editando, setEditando] = useState(false)
  const [modalDia, setModalDia] = useState<string | null>(null)
  const [modalSemana, setModalSemana] = useState<string | null>(null)

  const hoje = hojeStr()
  const agenteLogado = getAgenteLogado()
  const isMoises = agenteLogado === 'Moisés'
  const isSobreaviso = AGENTES_SOBREAVISO.some(a => a.nome === agenteLogado)

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
          ferias: p.ferias ?? [],
          horasSobreaviso: p.horasSobreaviso ?? {},
        }
        salvarDados(migrado)
        setDados(migrado)
      } catch { /* */ }
    }
  }, [])

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

  function salvarDiaADM(agentes: string[]) {
    if (!modalDia) return
    const novoAdm = { ...dados.adm }
    if (agentes.length === 0) delete novoAdm[modalDia]
    else novoAdm[modalDia] = agentes
    const novos = { ...dados, adm: novoAdm }
    setDados(novos)
    salvarDados(novos)
    setModalDia(null)
  }

  function salvarSobreavisoSemana(agentes: string[]) {
    if (!modalSemana) return
    const novoSemanal = { ...dados.sobreavisoSemanal }
    if (agentes.length === 0) delete novoSemanal[modalSemana]
    else novoSemanal[modalSemana] = agentes
    const novos = { ...dados, sobreavisoSemanal: novoSemanal }
    setDados(novos)
    salvarDados(novos)
    setModalSemana(null)
  }

  function onFeriasChange(novasFerias: Ferias[]) {
    const novos = { ...dados, ferias: novasFerias }
    setDados(novos)
    salvarDados(novos)
  }

  return (
    <div className="escala-wrap">
      <div className="escala-nav-mes">
        <button className="escala-nav-btn" onClick={mesAnterior}>‹</button>
        <span className="escala-nav-label">{MESES[mes]} {ano}</span>
        <button className="escala-nav-btn" onClick={proximoMes}>›</button>
      </div>

      {isMoises && (
        <button
          className={`escala-btn-editar ${editando ? 'ativo' : ''}`}
          onClick={() => { setEditando(e => !e); setModalDia(null) }}
        >
          {editando ? '✅ Concluir edição' : '✏️ Editar escala'}
        </button>
      )}

      {editando && isMoises && (
        <div className="escala-edit-aviso">
          Toque em qualquer dia no ADM para editar. Use o painel de escalas semanais para o Sobreaviso.
        </div>
      )}

      {/* Calendário ADM */}
      <CalendarioADM
        ano={ano} mes={mes}
        dados={dados.adm}
        sobreavisoSemanal={dados.sobreavisoSemanal}
        hoje={hoje}
        editando={editando && isMoises}
        onDiaClick={onDiaClick}
      />

      {/* Calendário Sobreaviso com nomes */}
      <CalendarioSobreaviso
        ano={ano} mes={mes}
        sobreavisoSemanal={dados.sobreavisoSemanal}
        hoje={hoje}
      />

      <Legenda ferias={dados.ferias} mes={mes} ano={ano} />

      {/* Painel de Escalas Semanais — Moisés escala aqui */}
      {isMoises && (
        <PainelEscalasSemanas
          sobreavisoSemanal={dados.sobreavisoSemanal}
          ferias={dados.ferias}
          onEscalar={(seg) => setModalSemana(seg)}
        />
      )}

      {/* Banco de Horas — agente individual (sobreaviso) */}
      {!isMoises && isSobreaviso && (
        <BancoHorasAgente
          agente={agenteLogado}
          sobreavisoSemanal={dados.sobreavisoSemanal}
        />
      )}

      {/* Banco de Horas — Moisés vê todos */}
      {isMoises && (
        <BancoHorasMoises sobreavisoSemanal={dados.sobreavisoSemanal} />
      )}

      {/* Painel de férias — só Moisés em edição */}
      {editando && isMoises && (
        <PainelFerias ferias={dados.ferias} onChange={onFeriasChange} />
      )}

      {/* Modal ADM por dia */}
      {modalDia && (
        <ModalDia
          data={modalDia}
          tipo="adm"
          selecionados={dados.adm[modalDia] ?? []}
          ferias={dados.ferias}
          onSalvar={salvarDiaADM}
          onFechar={() => setModalDia(null)}
        />
      )}

      {/* Modal sobreaviso semanal */}
      {modalSemana && (
        <ModalEscalarSemana
          segundaFeira={modalSemana}
          agentesSelecionados={dados.sobreavisoSemanal[modalSemana] ?? []}
          ferias={dados.ferias}
          onSalvar={salvarSobreavisoSemana}
          onFechar={() => setModalSemana(null)}
        />
      )}
    </div>
  )
}
