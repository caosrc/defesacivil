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

const AGENTE_MAP: Record<string, { cor: string; iniciais: string }> = {}
AGENTES_ESCALA.forEach(ag => { AGENTE_MAP[ag.nome] = { cor: ag.cor, iniciais: ag.iniciais } })

const DIAS_SEMANA_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const DIAS_SEMANA_HDR  = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// ── Tipos ─────────────────────────────────────────────────────────
type TipoEscala = 'adm' | 'sobreaviso'

interface Ferias {
  agente: string
  inicio: string
  fim: string
}

interface EscalaData {
  adm: Record<string, string[]>
  sobreaviso: Record<string, string[]>
  ferias: Ferias[]
  // agente -> data -> horas
  horasSobreaviso: Record<string, Record<string, number>>
}

// ── Storage ───────────────────────────────────────────────────────
const STORAGE_KEY = 'escala-data-v1'

function carregarDados(): EscalaData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const p = JSON.parse(raw)
      return {
        adm: p.adm ?? {},
        sobreaviso: p.sobreaviso ?? {},
        ferias: p.ferias ?? [],
        horasSobreaviso: p.horasSobreaviso ?? {},
      }
    }
  } catch { /* */ }
  return { adm: {}, sobreaviso: {}, ferias: [], horasSobreaviso: {} }
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

function fmtData(str: string) {
  const [, m, d] = str.split('-')
  return `${d}/${m}`
}

function fmtDataLonga(str: string) {
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

function diaSemanaLabel(str: string): string {
  const [y, m, d] = str.split('-').map(Number)
  const dow = new Date(y, m - 1, d).getDay()
  return DIAS_SEMANA_FULL[dow]
}

function semanaAtual(): { inicio: string; fim: string } {
  const hoje = new Date()
  const dow = hoje.getDay() // 0=Dom
  const seg = new Date(hoje)
  seg.setDate(hoje.getDate() - (dow === 0 ? 6 : dow - 1))
  const dom = new Date(seg)
  dom.setDate(seg.getDate() + 6)
  const fmt = (d: Date) => chaveData(d.getFullYear(), d.getMonth(), d.getDate())
  return { inicio: fmt(seg), fim: fmt(dom) }
}

function agenteEmFerias(nome: string, chave: string, ferias: Ferias[]): boolean {
  return ferias.some(f => f.agente === nome && chave >= f.inicio && chave <= f.fim)
}

function totalHorasAgente(agente: string, horas: Record<string, Record<string, number>>): number {
  const mapa = horas[agente] ?? {}
  return Object.values(mapa).reduce((s, h) => s + h, 0)
}

// ── Modal: registrar horas (agente) ──────────────────────────────
interface ModalHorasProps {
  agente: string
  diasPendentes: string[]
  diasJaRegistrados: string[]
  horasExistentes: Record<string, number>
  onSalvar: (entradas: Record<string, number>) => void
  onFechar: () => void
}

function ModalRegistrarHoras({ agente, diasPendentes, diasJaRegistrados, horasExistentes, onSalvar, onFechar }: ModalHorasProps) {
  const info = AGENTE_MAP[agente]
  const todosOsDias = [...diasPendentes, ...diasJaRegistrados].sort()

  const [valores, setValores] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {}
    todosOsDias.forEach(d => {
      v[d] = horasExistentes[d] !== undefined ? String(horasExistentes[d]) : ''
    })
    return v
  })

  function onChange(data: string, val: string) {
    setValores(prev => ({ ...prev, [data]: val }))
  }

  function salvar() {
    const entradas: Record<string, number> = {}
    Object.entries(valores).forEach(([data, val]) => {
      const n = parseFloat(val)
      if (!isNaN(n) && n > 0) entradas[data] = n
    })
    onSalvar(entradas)
  }

  const temAlgumValor = Object.values(valores).some(v => v !== '' && parseFloat(v) > 0)

  return (
    <div className="escala-modal-overlay" onClick={onFechar}>
      <div className="escala-modal" onClick={e => e.stopPropagation()}>
        <div className="escala-modal-header">
          <div className="bh-modal-agente">
            <span className="bh-modal-iniciais" style={{ background: info?.cor ?? '#64748b' }}>
              {info?.iniciais ?? agente.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <div className="bh-modal-nome">{agente}</div>
              <div className="bh-modal-sub">Registrar horas — Sobreaviso</div>
            </div>
          </div>
          <button className="escala-modal-fechar" onClick={onFechar}>✕</button>
        </div>

        {diasPendentes.length > 0 && (
          <div className="bh-pendentes-aviso">
            📋 {diasPendentes.length} dia{diasPendentes.length > 1 ? 's' : ''} com horas não registradas esta semana
          </div>
        )}

        <div className="bh-dias-lista">
          {todosOsDias.map(data => {
            const isPendente = diasPendentes.includes(data)
            return (
              <div key={data} className={`bh-dia-row ${isPendente ? 'pendente' : ''}`}>
                <div className="bh-dia-info">
                  <span className="bh-dia-dow">{diaSemanaLabel(data)}</span>
                  <span className="bh-dia-data">{fmtDataLonga(data)}</span>
                </div>
                <div className="bh-dia-input-wrap">
                  <input
                    className="bh-dia-input"
                    type="number"
                    min="0"
                    max="24"
                    step="0.5"
                    placeholder="0"
                    value={valores[data] ?? ''}
                    onChange={e => onChange(data, e.target.value)}
                  />
                  <span className="bh-dia-unidade">h</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="escala-modal-acoes">
          <button className="escala-modal-limpar" onClick={onFechar}>Fechar</button>
          <button
            className="escala-modal-salvar"
            onClick={salvar}
            disabled={!temAlgumValor}
          >
            Salvar horas
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Banco de Horas: card do agente ────────────────────────────────
interface BancoHorasAgenteProps {
  agente: string
  horas: Record<string, Record<string, number>>
  sobreaviso: Record<string, string[]>
  onRegistrar: () => void
}

function BancoHorasAgente({ agente, horas, sobreaviso, onRegistrar }: BancoHorasAgenteProps) {
  const info = AGENTE_MAP[agente]
  const mapaAgente = horas[agente] ?? {}
  const total = Object.values(mapaAgente).reduce((s, h) => s + h, 0)

  // Agrupar por mês
  const porMes = useMemo(() => {
    const mapa: Record<string, number> = {}
    Object.entries(mapaAgente).forEach(([data, h]) => {
      const chave = data.slice(0, 7) // YYYY-MM
      mapa[chave] = (mapa[chave] ?? 0) + h
    })
    return Object.entries(mapa).sort((a, b) => b[0].localeCompare(a[0]))
  }, [mapaAgente])

  const { inicio, fim } = semanaAtual()
  const hoje = hojeStr()

  const pendentes = useMemo(() => {
    return Object.entries(sobreaviso)
      .filter(([data, agentes]) =>
        data >= inicio && data <= hoje && agentes.includes(agente) && mapaAgente[data] === undefined
      )
      .map(([data]) => data)
      .sort()
  }, [sobreaviso, agente, mapaAgente, inicio, hoje])

  return (
    <div className="bh-card">
      <div className="bh-card-header">
        <span className="bh-card-iniciais" style={{ background: info?.cor ?? '#64748b' }}>
          {info?.iniciais ?? agente.slice(0, 2).toUpperCase()}
        </span>
        <div className="bh-card-info">
          <span className="bh-card-nome">{agente}</span>
          <span className="bh-card-subtitulo">Sobreaviso</span>
        </div>
        <div className="bh-card-total">
          <span className="bh-card-horas">{total % 1 === 0 ? total : total.toFixed(1)}</span>
          <span className="bh-card-h">h</span>
        </div>
      </div>

      {pendentes.length > 0 && (
        <button className="bh-card-aviso" onClick={onRegistrar}>
          ⚠️ {pendentes.length} dia{pendentes.length > 1 ? 's' : ''} sem registro esta semana — toque para registrar
        </button>
      )}

      {porMes.length > 0 && (
        <div className="bh-card-meses">
          {porMes.map(([mes, h]) => {
            const [y, m] = mes.split('-')
            return (
              <div key={mes} className="bh-card-mes-row">
                <span className="bh-card-mes-label">{MESES[Number(m) - 1]} {y}</span>
                <span className="bh-card-mes-h">{h % 1 === 0 ? h : h.toFixed(1)}h</span>
              </div>
            )
          })}
        </div>
      )}

      {total === 0 && pendentes.length === 0 && (
        <p className="bh-card-vazio">Nenhuma hora registrada ainda.</p>
      )}

      <button className="bh-card-btn-registrar" onClick={onRegistrar}>
        📝 Registrar horas
      </button>
    </div>
  )
}

// ── Banco de Horas: painel do Moisés (todos os agentes) ──────────
function BancoHorasMoises({ horas, sobreaviso }: { horas: Record<string, Record<string, number>>; sobreaviso: Record<string, string[]> }) {
  const { inicio, fim } = semanaAtual()
  const hoje = hojeStr()

  const ranking = useMemo(() => {
    return AGENTES_ESCALA.map(ag => {
      const total = totalHorasAgente(ag.nome, horas)
      const mapaAgente = horas[ag.nome] ?? {}
      const pendentes = Object.entries(sobreaviso)
        .filter(([data, agentes]) =>
          data >= inicio && data <= hoje && agentes.includes(ag.nome) && mapaAgente[data] === undefined
        ).length
      return { ...ag, total, pendentes }
    }).sort((a, b) => b.total - a.total)
  }, [horas, sobreaviso, inicio, hoje])

  const totalGeral = ranking.reduce((s, ag) => s + ag.total, 0)

  return (
    <div className="bh-moises-painel">
      <div className="bh-moises-header">
        <span className="bh-moises-titulo">⏱️ Banco de Horas — Sobreaviso</span>
        <span className="bh-moises-total">{totalGeral % 1 === 0 ? totalGeral : totalGeral.toFixed(1)}h total</span>
      </div>
      <div className="bh-moises-lista">
        {ranking.map((ag, idx) => (
          <div key={ag.nome} className="bh-moises-row">
            <span className="bh-moises-rank">#{idx + 1}</span>
            <span className="bh-moises-cor" style={{ background: ag.cor }} />
            <span className="bh-moises-nome">{ag.nome}</span>
            <div className="bh-moises-direita">
              {ag.pendentes > 0 && (
                <span className="bh-moises-pendente" title="Dias sem registro esta semana">⚠️{ag.pendentes}</span>
              )}
              <span className="bh-moises-h">
                {ag.total % 1 === 0 ? ag.total : ag.total.toFixed(1)}h
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Modal seleção de agentes por dia (Moisés) ────────────────────
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
  const label = `${diaStr}/${mesStr} — ${tipo === 'adm' ? 'Plantão ADM' : 'Sobreaviso'}`

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

// ── Painel de férias (Moisés) ─────────────────────────────────────
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

// ── Calendário ────────────────────────────────────────────────────
interface CalendarioProps {
  tipo: TipoEscala
  titulo: string
  icone: string
  ano: number
  mes: number
  dados: Record<string, string[]>
  hoje: string
  editando: boolean
  agenteLogado: string
  horasSobreaviso: Record<string, Record<string, number>>
  onDiaClick: (chave: string, tipo: TipoEscala) => void
}

function Calendario({ tipo, titulo, icone, ano, mes, dados, hoje, editando, agenteLogado, horasSobreaviso, onDiaClick }: CalendarioProps) {
  const total = diasNoMes(ano, mes)
  const inicio = primeiroDiaSemana(ano, mes)
  const isMoises = agenteLogado === 'Moisés'

  const celulas: (number | null)[] = [
    ...Array(inicio).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ]

  return (
    <div className={`escala-calendario-bloco escala-bloco-${tipo}`}>
      <div className="escala-bloco-header">
        <span className="escala-bloco-icone">{icone}</span>
        <span className="escala-bloco-titulo">{titulo}</span>
      </div>
      <div className="escala-cal-grid">
        {DIAS_SEMANA_HDR.map((d, i) => (
          <div key={i} className="escala-cal-diahdr">{d}</div>
        ))}
        {celulas.map((dia, i) => {
          if (dia === null) return <div key={`v-${i}`} className="escala-cal-vazio" />

          const chave = chaveData(ano, mes, dia)
          const agentes = dados[chave] ?? []
          const isHoje = chave === hoje

          // Para o agente: marcar o dia verde se tem horas, amarelo se pendente
          const estaEscalado = !isMoises && tipo === 'sobreaviso' && agentes.includes(agenteLogado)
          const temHoras = estaEscalado && (horasSobreaviso[agenteLogado]?.[chave] !== undefined)
          const ePendente = estaEscalado && chave <= hoje && !temHoras

          return (
            <button
              key={chave}
              className={`escala-cal-dia ${isHoje ? 'hoje' : ''} ${agentes.length > 0 ? 'tem-agente' : ''} ${editando ? 'editavel' : ''} ${ePendente ? 'bh-pendente' : ''} ${temHoras ? 'bh-registrado' : ''}`}
              onClick={() => editando && onDiaClick(chave, tipo)}
            >
              <span className="escala-cal-num">{dia}</span>
              <div className="escala-cal-dots">
                {agentes.slice(0, 3).map(nome => {
                  const info = AGENTE_MAP[nome]
                  return info ? (
                    <span key={nome} className="escala-cal-dot" style={{ background: info.cor }} title={nome} />
                  ) : null
                })}
                {agentes.length > 3 && <span className="escala-cal-mais">+{agentes.length - 3}</span>}
              </div>
              {temHoras && (
                <span className="bh-dia-h-badge">
                  {horasSobreaviso[agenteLogado][chave]}h
                </span>
              )}
            </button>
          )
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
                    {fmtData(p.inicio)} → {fmtData(p.fim)}
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
  const [modal, setModal] = useState<{ chave: string; tipo: TipoEscala } | null>(null)
  const [modalHoras, setModalHoras] = useState(false)

  const hoje = hojeStr()
  const agenteLogado = getAgenteLogado()
  const isMoises = agenteLogado === 'Moisés'
  const { inicio: semIni } = semanaAtual()

  // Dias da semana atual onde o agente está no sobreaviso e não tem horas
  const diasPendentesHoras = useMemo(() => {
    if (isMoises) return []
    const mapaAgente = dados.horasSobreaviso[agenteLogado] ?? {}
    return Object.entries(dados.sobreaviso)
      .filter(([data, agentes]) =>
        data >= semIni && data <= hoje && agentes.includes(agenteLogado) && mapaAgente[data] === undefined
      )
      .map(([data]) => data)
      .sort()
  }, [dados, agenteLogado, isMoises, semIni, hoje])

  // Dias já registrados na semana atual (para edição)
  const diasRegistradosHoras = useMemo(() => {
    if (isMoises) return []
    const mapaAgente = dados.horasSobreaviso[agenteLogado] ?? {}
    return Object.entries(dados.sobreaviso)
      .filter(([data, agentes]) =>
        data >= semIni && data <= hoje && agentes.includes(agenteLogado) && mapaAgente[data] !== undefined
      )
      .map(([data]) => data)
      .sort()
  }, [dados, agenteLogado, isMoises, semIni, hoje])

  // Abre modal automaticamente se há dias pendentes ao entrar na aba
  useEffect(() => {
    if (!isMoises && diasPendentesHoras.length > 0) {
      setModalHoras(true)
    }
  }, []) // só na montagem

  function mesAnterior() {
    if (mes === 0) { setAno(a => a - 1); setMes(11) }
    else setMes(m => m - 1)
  }

  function proximoMes() {
    if (mes === 11) { setAno(a => a + 1); setMes(0) }
    else setMes(m => m + 1)
  }

  const onDiaClick = useCallback((chave: string, tipo: TipoEscala) => {
    setModal({ chave, tipo })
  }, [])

  function salvarDia(agentes: string[]) {
    if (!modal) return
    const novos: EscalaData = { ...dados, [modal.tipo]: { ...dados[modal.tipo] } }
    if (agentes.length === 0) delete novos[modal.tipo][modal.chave]
    else novos[modal.tipo][modal.chave] = agentes
    setDados(novos)
    salvarDados(novos)
    setModal(null)
  }

  function salvarHoras(entradas: Record<string, number>) {
    const novoMapa = {
      ...dados.horasSobreaviso,
      [agenteLogado]: { ...(dados.horasSobreaviso[agenteLogado] ?? {}), ...entradas },
    }
    const novos = { ...dados, horasSobreaviso: novoMapa }
    setDados(novos)
    salvarDados(novos)
    setModalHoras(false)
  }

  function onFeriasChange(novasFerias: Ferias[]) {
    const novos = { ...dados, ferias: novasFerias }
    setDados(novos)
    salvarDados(novos)
  }

  const modalSelecionados = modal ? (dados[modal.tipo][modal.chave] ?? []) : []

  return (
    <div className="escala-wrap">
      <div className="escala-nav-mes">
        <button className="escala-nav-btn" onClick={mesAnterior}>‹</button>
        <span className="escala-nav-label">{MESES[mes]} {ano}</span>
        <button className="escala-nav-btn" onClick={proximoMes}>›</button>
      </div>

      {isMoises && (
        <button className={`escala-btn-editar ${editando ? 'ativo' : ''}`} onClick={() => { setEditando(e => !e); setModal(null) }}>
          {editando ? '✅ Concluir edição' : '✏️ Editar escala'}
        </button>
      )}

      {editando && isMoises && (
        <div className="escala-edit-aviso">
          Toque em qualquer dia nos calendários para editar quem está escalado.
        </div>
      )}

      <Calendario
        tipo="adm"
        titulo="Plantão ADM"
        icone="🏢"
        ano={ano} mes={mes}
        dados={dados.adm}
        hoje={hoje}
        editando={editando && isMoises}
        agenteLogado={agenteLogado}
        horasSobreaviso={dados.horasSobreaviso}
        onDiaClick={onDiaClick}
      />

      <Calendario
        tipo="sobreaviso"
        titulo="Sobreaviso"
        icone="📟"
        ano={ano} mes={mes}
        dados={dados.sobreaviso}
        hoje={hoje}
        editando={editando && isMoises}
        agenteLogado={agenteLogado}
        horasSobreaviso={dados.horasSobreaviso}
        onDiaClick={onDiaClick}
      />

      <Legenda ferias={dados.ferias} mes={mes} ano={ano} />

      {/* Banco de Horas — agente */}
      {!isMoises && (
        <BancoHorasAgente
          agente={agenteLogado}
          horas={dados.horasSobreaviso}
          sobreaviso={dados.sobreaviso}
          onRegistrar={() => setModalHoras(true)}
        />
      )}

      {/* Banco de Horas — Moisés vê todos */}
      {isMoises && (
        <BancoHorasMoises
          horas={dados.horasSobreaviso}
          sobreaviso={dados.sobreaviso}
        />
      )}

      {/* Painel de férias — só Moisés em edição */}
      {editando && isMoises && (
        <PainelFerias ferias={dados.ferias} onChange={onFeriasChange} />
      )}

      {/* Modal escala por dia */}
      {modal && (
        <ModalDia
          data={modal.chave}
          tipo={modal.tipo}
          selecionados={modalSelecionados}
          ferias={dados.ferias}
          onSalvar={salvarDia}
          onFechar={() => setModal(null)}
        />
      )}

      {/* Modal banco de horas */}
      {modalHoras && !isMoises && (
        <ModalRegistrarHoras
          agente={agenteLogado}
          diasPendentes={diasPendentesHoras}
          diasJaRegistrados={diasRegistradosHoras}
          horasExistentes={dados.horasSobreaviso[agenteLogado] ?? {}}
          onSalvar={salvarHoras}
          onFechar={() => setModalHoras(false)}
        />
      )}
    </div>
  )
}
