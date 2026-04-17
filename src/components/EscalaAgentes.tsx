import { useState, useCallback, useMemo } from 'react'
import { getAgenteLogado } from './Login'
import './EscalaAgentes.css'

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
}

const STORAGE_KEY = 'escala-data-v1'

function carregarDados(): EscalaData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        adm: parsed.adm ?? {},
        sobreaviso: parsed.sobreaviso ?? {},
        ferias: parsed.ferias ?? [],
      }
    }
  } catch { /* */ }
  return { adm: {}, sobreaviso: {}, ferias: [] }
}

function salvarDados(data: EscalaData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function chaveData(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes + 1, 0).getDate()
}

function primeiroDiaSemana(ano: number, mes: number): number {
  return new Date(ano, mes, 1).getDay()
}

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function agenteEmFerias(nome: string, chave: string, ferias: Ferias[]): boolean {
  return ferias.some(f => f.agente === nome && chave >= f.inicio && chave <= f.fim)
}

// ── Modal seleção de agentes por dia ─────────────────────────────
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

// ── Painel de gestão de férias ────────────────────────────────────
interface PainelFeriasProps {
  ferias: Ferias[]
  onChange: (novas: Ferias[]) => void
}

function PainelFerias({ ferias, onChange }: PainelFeriasProps) {
  const hoje = new Date().toISOString().slice(0, 10)
  const [agente, setAgente] = useState(AGENTES_ESCALA[0].nome)
  const [inicio, setInicio] = useState(hoje)
  const [fim, setFim] = useState(hoje)
  const [erro, setErro] = useState('')

  function adicionar() {
    if (inicio > fim) { setErro('A data de início deve ser anterior ou igual ao fim.'); return }
    const jaExiste = ferias.some(f => f.agente === agente && f.inicio === inicio && f.fim === fim)
    if (jaExiste) { setErro('Este período já está cadastrado.'); return }
    setErro('')
    onChange([...ferias, { agente, inicio, fim }])
  }

  function remover(idx: number) {
    onChange(ferias.filter((_, i) => i !== idx))
  }

  function formatarData(str: string) {
    const [y, m, d] = str.split('-')
    return `${d}/${m}/${y}`
  }

  return (
    <div className="escala-ferias-painel">
      <div className="escala-ferias-titulo">
        <span>🌴</span> Férias / Folga prolongada
      </div>

      <div className="escala-ferias-form">
        <select
          className="escala-ferias-select"
          value={agente}
          onChange={e => { setAgente(e.target.value); setErro('') }}
        >
          {AGENTES_ESCALA.map(ag => (
            <option key={ag.nome} value={ag.nome}>{ag.nome}</option>
          ))}
        </select>
        <div className="escala-ferias-datas">
          <div className="escala-ferias-data-campo">
            <label>De</label>
            <input
              type="date"
              value={inicio}
              onChange={e => { setInicio(e.target.value); setErro('') }}
            />
          </div>
          <div className="escala-ferias-data-campo">
            <label>Até</label>
            <input
              type="date"
              value={fim}
              onChange={e => { setFim(e.target.value); setErro('') }}
            />
          </div>
        </div>
        {erro && <span className="escala-ferias-erro">{erro}</span>}
        <button className="escala-ferias-add" onClick={adicionar}>+ Adicionar período</button>
      </div>

      {ferias.length > 0 && (
        <div className="escala-ferias-lista">
          {ferias.map((f, i) => {
            const info = AGENTE_MAP[f.agente]
            return (
              <div key={i} className="escala-ferias-item">
                <span
                  className="escala-ferias-cor"
                  style={{ background: info?.cor ?? '#ccc' }}
                />
                <span className="escala-ferias-nome">{f.agente}</span>
                <span className="escala-ferias-periodo">
                  {formatarData(f.inicio)} → {formatarData(f.fim)}
                </span>
                <button className="escala-ferias-remover" onClick={() => remover(i)}>✕</button>
              </div>
            )
          })}
        </div>
      )}

      {ferias.length === 0 && (
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
  ferias: Ferias[]
  hoje: string
  editando: boolean
  onDiaClick: (chave: string, tipo: TipoEscala) => void
}

function Calendario({ tipo, titulo, icone, ano, mes, dados, ferias, hoje, editando, onDiaClick }: CalendarioProps) {
  const total = diasNoMes(ano, mes)
  const inicio = primeiroDiaSemana(ano, mes)

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
        {DIAS_SEMANA.map((d, i) => (
          <div key={i} className="escala-cal-diahdr">{d}</div>
        ))}

        {celulas.map((dia, i) => {
          if (dia === null) return <div key={`v-${i}`} className="escala-cal-vazio" />

          const chave = chaveData(ano, mes, dia)
          const agentes = dados[chave] ?? []
          const isHoje = chave === hoje
          const agentesEmFerias = AGENTES_ESCALA.filter(ag => agenteEmFerias(ag.nome, chave, ferias))

          return (
            <button
              key={chave}
              className={`escala-cal-dia ${isHoje ? 'hoje' : ''} ${agentes.length > 0 ? 'tem-agente' : ''} ${editando ? 'editavel' : ''}`}
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
              {agentesEmFerias.length > 0 && (
                <div className="escala-cal-ferias">
                  {agentesEmFerias.slice(0, 2).map(ag => (
                    <span key={ag.nome} className="escala-cal-ferias-dot" style={{ background: ag.cor }} title={`${ag.nome} — Férias`} />
                  ))}
                  {agentesEmFerias.length > 2 && <span className="escala-cal-mais">+{agentesEmFerias.length - 2}</span>}
                </div>
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
  const emFeriasNoMes = useMemo(() => {
    return AGENTES_ESCALA.filter(ag =>
      ferias.some(f =>
        f.agente === ag.nome &&
        f.inicio <= `${anoStr}-${mesStr}-31` &&
        f.fim >= `${anoStr}-${mesStr}-01`
      )
    )
  }, [ferias, mes, ano, mesStr, anoStr])

  return (
    <div className="escala-legenda">
      <span className="escala-legenda-titulo">Legenda</span>
      <div className="escala-legenda-lista">
        {AGENTES_ESCALA.map(ag => {
          const emFerias = emFeriasNoMes.some(a => a.nome === ag.nome)
          return (
            <div key={ag.nome} className={`escala-legenda-item ${emFerias ? 'em-ferias' : ''}`}>
              <span className="escala-legenda-cor" style={{ background: ag.cor }} />
              <span className="escala-legenda-nome">{ag.nome}</span>
              {emFerias && <span className="escala-legenda-ferias">🌴</span>}
            </div>
          )
        })}
      </div>
      <div className="escala-legenda-refs">
        <div className="escala-legenda-ref-item">
          <span className="escala-legenda-ref-dot escala-ref-escalado" />
          <span>Escalado</span>
        </div>
        <div className="escala-legenda-ref-item">
          <span className="escala-legenda-ref-dot escala-ref-ferias" />
          <span>Férias (linha inferior)</span>
        </div>
      </div>
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

  const hoje = chaveData(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const isMoises = getAgenteLogado() === 'Moisés'

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
    const novos: EscalaData = {
      ...dados,
      [modal.tipo]: { ...dados[modal.tipo] },
    }
    if (agentes.length === 0) delete novos[modal.tipo][modal.chave]
    else novos[modal.tipo][modal.chave] = agentes
    setDados(novos)
    salvarDados(novos)
    setModal(null)
  }

  function onFeriasChange(novasFerias: Ferias[]) {
    const novos = { ...dados, ferias: novasFerias }
    setDados(novos)
    salvarDados(novos)
  }

  function toggleEdicao() {
    setEditando(e => !e)
    setModal(null)
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
        <button
          className={`escala-btn-editar ${editando ? 'ativo' : ''}`}
          onClick={toggleEdicao}
        >
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
        ano={ano}
        mes={mes}
        dados={dados.adm}
        ferias={dados.ferias}
        hoje={hoje}
        editando={editando && isMoises}
        onDiaClick={onDiaClick}
      />

      <Calendario
        tipo="sobreaviso"
        titulo="Sobreaviso"
        icone="📟"
        ano={ano}
        mes={mes}
        dados={dados.sobreaviso}
        ferias={dados.ferias}
        hoje={hoje}
        editando={editando && isMoises}
        onDiaClick={onDiaClick}
      />

      <Legenda ferias={dados.ferias} mes={mes} ano={ano} />

      {editando && isMoises && (
        <PainelFerias ferias={dados.ferias} onChange={onFeriasChange} />
      )}

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
    </div>
  )
}
