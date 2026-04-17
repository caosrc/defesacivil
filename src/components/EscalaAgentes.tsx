import { useState, useCallback } from 'react'
import './EscalaAgentes.css'

const AGENTES = [
  { nome: 'Valteir',    cor: '#2563eb', iniciais: 'VA' },
  { nome: 'Arthur',     cor: '#16a34a', iniciais: 'AR' },
  { nome: 'Gustavo',    cor: '#dc2626', iniciais: 'GU' },
  { nome: 'Vânia',      cor: '#9333ea', iniciais: 'VÂ' },
  { nome: 'Graça',      cor: '#ea580c', iniciais: 'GR' },
  { nome: 'Talita',     cor: '#0891b2', iniciais: 'TA' },
  { nome: 'Cristiane',  cor: '#db2777', iniciais: 'CR' },
  { nome: 'Dyonathan',  cor: '#b45309', iniciais: 'DY' },
  { nome: 'Sócrates',   cor: '#475569', iniciais: 'SÓ' },
]

type TipoEscala = 'adm' | 'sobreaviso'

interface EscalaData {
  adm: Record<string, string[]>
  sobreaviso: Record<string, string[]>
}

const STORAGE_KEY = 'escala-data-v1'

function carregarDados(): EscalaData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* */ }
  return { adm: {}, sobreaviso: {} }
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

interface ModalSelecionarProps {
  data: string
  tipo: TipoEscala
  selecionados: string[]
  onSalvar: (agentes: string[]) => void
  onFechar: () => void
}

function ModalSelecionar({ data, tipo, selecionados, onSalvar, onFechar }: ModalSelecionarProps) {
  const [escolhidos, setEscolhidos] = useState<string[]>(selecionados)

  const [, mesStr, diaStr] = data.split('-')
  const label = `${diaStr}/${mesStr} — ${tipo === 'adm' ? 'Plantão ADM' : 'Sobreaviso'}`

  function toggle(nome: string) {
    setEscolhidos(prev =>
      prev.includes(nome) ? prev.filter(n => n !== nome) : [...prev, nome]
    )
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
          {AGENTES.map(ag => {
            const ativo = escolhidos.includes(ag.nome)
            return (
              <button
                key={ag.nome}
                className={`escala-modal-agente ${ativo ? 'selecionado' : ''}`}
                style={ativo ? { background: ag.cor, borderColor: ag.cor, color: '#fff' } : { borderColor: ag.cor }}
                onClick={() => toggle(ag.nome)}
              >
                <span className="escala-modal-iniciais" style={{ background: ativo ? 'rgba(255,255,255,0.25)' : ag.cor }}>
                  {ag.iniciais}
                </span>
                {ag.nome}
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

interface CalendarioProps {
  tipo: TipoEscala
  titulo: string
  icone: string
  ano: number
  mes: number
  dados: Record<string, string[]>
  hoje: string
  onDiaClick: (chave: string, tipo: TipoEscala) => void
}

function Calendario({ tipo, titulo, icone, ano, mes, dados, hoje, onDiaClick }: CalendarioProps) {
  const total = diasNoMes(ano, mes)
  const inicio = primeiroDiaSemana(ano, mes)

  const celulas: (number | null)[] = [
    ...Array(inicio).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ]

  const agenteMap: Record<string, { cor: string; iniciais: string }> = {}
  AGENTES.forEach(ag => { agenteMap[ag.nome] = { cor: ag.cor, iniciais: ag.iniciais } })

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

          return (
            <button
              key={chave}
              className={`escala-cal-dia ${isHoje ? 'hoje' : ''} ${agentes.length > 0 ? 'tem-agente' : ''}`}
              onClick={() => onDiaClick(chave, tipo)}
            >
              <span className="escala-cal-num">{dia}</span>
              <div className="escala-cal-dots">
                {agentes.slice(0, 4).map(nome => {
                  const info = agenteMap[nome]
                  return info ? (
                    <span
                      key={nome}
                      className="escala-cal-dot"
                      style={{ background: info.cor }}
                      title={nome}
                    />
                  ) : null
                })}
                {agentes.length > 4 && (
                  <span className="escala-cal-mais">+{agentes.length - 4}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function EscalaAgentes() {
  const agora = new Date()
  const [ano, setAno] = useState(agora.getFullYear())
  const [mes, setMes] = useState(agora.getMonth())
  const [dados, setDados] = useState<EscalaData>(carregarDados)
  const [modal, setModal] = useState<{ chave: string; tipo: TipoEscala } | null>(null)

  const hoje = chaveData(agora.getFullYear(), agora.getMonth(), agora.getDate())

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

  function salvarModal(agentes: string[]) {
    if (!modal) return
    const novos: EscalaData = {
      adm: { ...dados.adm },
      sobreaviso: { ...dados.sobreaviso },
    }
    if (agentes.length === 0) {
      delete novos[modal.tipo][modal.chave]
    } else {
      novos[modal.tipo][modal.chave] = agentes
    }
    setDados(novos)
    salvarDados(novos)
    setModal(null)
  }

  const modalSelecionados = modal
    ? (dados[modal.tipo][modal.chave] ?? [])
    : []

  return (
    <div className="escala-wrap">
      <div className="escala-nav-mes">
        <button className="escala-nav-btn" onClick={mesAnterior}>‹</button>
        <span className="escala-nav-label">{MESES[mes]} {ano}</span>
        <button className="escala-nav-btn" onClick={proximoMes}>›</button>
      </div>

      <Calendario
        tipo="adm"
        titulo="Plantão ADM"
        icone="🏢"
        ano={ano}
        mes={mes}
        dados={dados.adm}
        hoje={hoje}
        onDiaClick={onDiaClick}
      />

      <Calendario
        tipo="sobreaviso"
        titulo="Sobreaviso"
        icone="📟"
        ano={ano}
        mes={mes}
        dados={dados.sobreaviso}
        hoje={hoje}
        onDiaClick={onDiaClick}
      />

      <div className="escala-legenda">
        <span className="escala-legenda-titulo">Legenda</span>
        <div className="escala-legenda-lista">
          {AGENTES.map(ag => (
            <div key={ag.nome} className="escala-legenda-item">
              <span className="escala-legenda-cor" style={{ background: ag.cor }} />
              <span className="escala-legenda-nome">{ag.nome}</span>
            </div>
          ))}
        </div>
      </div>

      {modal && (
        <ModalSelecionar
          data={modal.chave}
          tipo={modal.tipo}
          selecionados={modalSelecionados}
          onSalvar={salvarModal}
          onFechar={() => setModal(null)}
        />
      )}
    </div>
  )
}
