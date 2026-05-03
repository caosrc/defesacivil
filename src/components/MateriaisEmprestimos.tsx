import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { getAgenteLogado } from './Login'
import { parseExcelPatrimonio, type ItemImportado, type ResultadoParse } from '../importarExcelPatrimonio'

// ─── Tipos ─────────────────────────────────────────────────────────────────
interface Material {
  id: string
  nome: string
  descricao: string | null
  observacoes: string | null
  foto: string | null
  foto_placa: string | null
  quantidade: number | null
  created_at: string
}

interface Emprestimo {
  id: number
  material_id: string
  material_codigo: string
  material_nome: string
  responsavel: string
  cpf: string | null
  secretaria: string | null
  prazo_dias: number
  quantidade: number | null
  data_emprestimo: string
  data_devolucao_prevista: string | null
  condicao_equipamento: string | null
  observacoes: string | null
  agente_emprestador: string | null
  assinatura_data: string | null
  devolvido_em: string | null
  devolvido_obs: string | null
  devolvido_recebedor: string | null
  devolvido_foto: string | null
  created_at: string
}

interface EquipamentoCampo {
  id: number
  material_id: string | null
  material_nome: string | null
  fotos: string[] | null
  latitude: number | null
  longitude: number | null
  rua: string | null
  numero: string | null
  bairro: string | null
  observacao: string | null
  quantidade: number | null
  prazo_dias: number | null
  data_recolha_prevista: string | null
  status: 'ativo' | 'devolvido'
  agente: string | null
  created_at: string
}

type Modo =
  | 'inicial'
  | 'materiais'
  | 'detalheMaterial'
  | 'formMaterial'
  | 'editarMaterial'
  | 'emprestimos'
  | 'novoEmprestimo'
  | 'devolucao'
  | 'campo'
  | 'formCampo'
  | 'detalheCampo'

// ─── Helpers ───────────────────────────────────────────────────────────────
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function dataExtenso(d: Date): string {
  return `Ouro Branco, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`
}

function formatarDataBr(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso)
  return d.toLocaleDateString('pt-BR')
}

function formatarCpf(v: string): string {
  const num = v.replace(/\D/g, '').slice(0, 11)
  if (num.length <= 3) return num
  if (num.length <= 6) return `${num.slice(0, 3)}.${num.slice(3)}`
  if (num.length <= 9) return `${num.slice(0, 3)}.${num.slice(3, 6)}.${num.slice(6)}`
  return `${num.slice(0, 3)}.${num.slice(3, 6)}.${num.slice(6, 9)}-${num.slice(9)}`
}

function htmlEscape(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c] || c
  ))
}

function calcularDevolucaoPrevista(prazoDias: number, base: Date = new Date()): Date {
  const d = new Date(base)
  d.setDate(d.getDate() + prazoDias)
  return d
}

function statusEmprestimo(e: Emprestimo): 'devolvido' | 'atrasado' | 'proximo' | 'no_prazo' {
  if (e.devolvido_em) return 'devolvido'
  if (!e.data_devolucao_prevista) return 'no_prazo'
  const prevista = new Date(e.data_devolucao_prevista + 'T23:59:59')
  const hoje = new Date()
  const diffDias = Math.ceil((prevista.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDias < 0) return 'atrasado'
  if (diffDias <= 2) return 'proximo'
  return 'no_prazo'
}

function redimensionarImagem(dataUrl: string, maxW: number, maxH: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let w = img.width, h = img.height
      if (w > maxW) { h = (h * maxW) / w; w = maxW }
      if (h > maxH) { w = (w * maxH) / h; h = maxH }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.src = dataUrl
  })
}

async function lerArquivoComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('falha ao ler arquivo'))
    r.readAsDataURL(file)
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════
export default function MateriaisEmprestimos({ onIrParaMapa }: { onIrParaMapa?: (lat: number, lng: number) => void } = {}) {
  const [modo, setModo] = useState<Modo>('inicial')
  const [carregando, setCarregando] = useState(true)
  const [materiais, setMateriais] = useState<Material[]>([])
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([])
  const [equipamentosCampo, setEquipamentosCampo] = useState<EquipamentoCampo[]>([])
  const [materialSelecionado, setMaterialSelecionado] = useState<Material | null>(null)
  const [emprestimoSelecionado, setEmprestimoSelecionado] = useState<Emprestimo | null>(null)
  const [campoSelecionado, setCampoSelecionado] = useState<EquipamentoCampo | null>(null)
  const [mostrarDevolvidos, setMostrarDevolvidos] = useState(false)
  const [abaCampo, setAbaCampo] = useState<'ativos' | 'devolvidos'>('ativos')
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'disponivel' | 'emprestado'>('todos')
  const [toast, setToast] = useState('')
  const [mostrarImport, setMostrarImport] = useState(false)
  const [notificacoesPrazo, setNotificacoesPrazo] = useState<Emprestimo[]>([])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [rm, re, rc] = await Promise.all([
        fetch('/api/materiais').then(r => r.ok ? r.json() : []),
        fetch('/api/emprestimos').then(r => r.ok ? r.json() : []),
        fetch('/api/equipamentos-campo').then(r => r.ok ? r.json() : []),
      ])
      setMateriais((Array.isArray(rm) ? rm : []) as Material[])
      setEmprestimos((Array.isArray(re) ? re : []) as Emprestimo[])
      setEquipamentosCampo((Array.isArray(rc) ? rc : []) as EquipamentoCampo[])
    } catch (err) {
      console.warn('[Materiais] erro ao carregar:', err)
    }
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Verifica prazos vencidos/hoje e dispara notificação do navegador
  useEffect(() => {
    if (emprestimos.length === 0 && equipamentosCampo.length === 0) return
    const hoje = new Date().toISOString().slice(0, 10)

    const empVencidos = emprestimos.filter(e =>
      !e.devolvido_em &&
      e.data_devolucao_prevista &&
      e.data_devolucao_prevista <= hoje
    )
    const campoVencidos = equipamentosCampo.filter(c =>
      c.status === 'ativo' &&
      c.data_recolha_prevista &&
      c.data_recolha_prevista <= hoje
    )

    if (empVencidos.length === 0 && campoVencidos.length === 0) return
    if (!('Notification' in window)) return

    function disparar() {
      empVencidos.forEach(e => {
        new Notification('📦 Prazo de devolução — Defesa Civil', {
          body: `${e.material_nome} emprestado a ${e.responsavel} está no prazo de devolução.`,
          tag: `emp-prazo-${e.id}`,
          icon: '/icons/icon-192.png',
        })
      })
      campoVencidos.forEach(c => {
        new Notification('🚧 Prazo de recolha — Defesa Civil', {
          body: `${c.material_nome ?? 'Equipamento'} em campo atingiu o prazo de recolha.`,
          tag: `campo-prazo-${c.id}`,
          icon: '/icons/icon-192.png',
        })
      })
    }

    if (Notification.permission === 'granted') {
      disparar()
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => { if (p === 'granted') disparar() })
    }
  }, [emprestimos, equipamentosCampo])

  // Realtime via WebSocket: recarrega quando o servidor sinaliza atualização.
  useEffect(() => {
    function onMsg(e: Event) {
      try {
        const m = JSON.parse((e as MessageEvent).data)
        if (m?.tipo === 'materiais_atualizados' || m?.tipo === 'emprestimos_atualizados' || m?.tipo === 'campo_atualizado') {
          carregar()
        }
      } catch { /* ignore */ }
    }
    window.addEventListener('ws-message', onMsg)
    return () => window.removeEventListener('ws-message', onMsg)
  }, [carregar])

  // mapa materialId → empréstimo ativo (não devolvido)
  const emprestimoAtivoPorMaterial = useMemo(() => {
    const m = new Map<string, Emprestimo>()
    for (const e of emprestimos) {
      if (!e.devolvido_em && !m.has(e.material_id)) m.set(e.material_id, e)
    }
    return m
  }, [emprestimos])

  function emprestimoAtivoDe(materialId: string): Emprestimo | undefined {
    return emprestimoAtivoPorMaterial.get(materialId)
  }

  // Calcula quantidade disponível de um material
  // disponível = total - em empréstimo ativo - em campo ativo
  function qtdDisponivel(mat: Material): number {
    const total = mat.quantidade ?? 1
    const emprestada = emprestimos
      .filter(e => e.material_id === mat.id && !e.devolvido_em)
      .reduce((s, e) => s + (e.quantidade ?? 1), 0)
    const campo = equipamentosCampo
      .filter(c => c.material_id === mat.id && c.status === 'ativo')
      .reduce((s, c) => s + (c.quantidade ?? 1), 0)
    return Math.max(0, total - emprestada - campo)
  }

  // ─── Notificações de prazo ───────────────────────────────────────────────
  useEffect(() => {
    const hoje = new Date().toISOString().slice(0, 10)
    const vencendoHoje = emprestimos.filter((e) =>
      !e.devolvido_em &&
      e.data_devolucao_prevista &&
      e.data_devolucao_prevista.slice(0, 10) === hoje
    )
    setNotificacoesPrazo(vencendoHoje)
  }, [emprestimos])

  // ─── TELA INICIAL ────────────────────────────────────────────────────────
  if (modo === 'inicial') {
    const totalMateriais = materiais.length
    const totalEmprestados = emprestimoAtivoPorMaterial.size
    const totalAtrasados = emprestimos.filter((e) => statusEmprestimo(e) === 'atrasado').length
    const totalCampoAtivos = equipamentosCampo.filter(c => c.status === 'ativo').length

    return (
      <div className="mat-tela mat-inicial">
        {toast && <div className="toast">{toast}</div>}

        {notificacoesPrazo.length > 0 && (
          <div className="mat-notif-prazo" onClick={() => { setMostrarDevolvidos(false); setModo('emprestimos') }}>
            <span className="mat-notif-icone">⏰</span>
            <div className="mat-notif-texto">
              <strong>Prazo de devolução hoje!</strong>
              <div>
                {notificacoesPrazo.map(e => (
                  <span key={e.id} className="mat-notif-item">{e.material_nome} → {e.responsavel}</span>
                ))}
              </div>
            </div>
            <span className="mat-notif-seta">›</span>
          </div>
        )}

        <div className="mat-header-inicial">
          <span className="mat-emoji-grande">📦</span>
          <h2>Materiais e Equipamentos</h2>
          <p>Controle de empréstimo e devolução</p>
        </div>

        <div className="mat-resumo">
          <div className="mat-resumo-item">
            <span className="mat-resumo-num">{totalMateriais}</span>
            <span className="mat-resumo-label">Cadastrados</span>
          </div>
          <div className="mat-resumo-item mat-resumo-empr">
            <span className="mat-resumo-num">{totalEmprestados}</span>
            <span className="mat-resumo-label">Emprestados</span>
          </div>
          <div className="mat-resumo-item mat-resumo-atr">
            <span className="mat-resumo-num">{totalAtrasados}</span>
            <span className="mat-resumo-label">Atrasados</span>
          </div>
        </div>

        <div className="mat-botoes-grandes">
          <button className="mat-btn-grande mat-btn-azul" onClick={() => setModo('materiais')}>
            <span className="mat-btn-emoji">📋</span>
            <span className="mat-btn-titulo">Patrimônio</span>
            <span className="mat-btn-sub">Catálogo e cadastro</span>
          </button>

          <button className="mat-btn-grande mat-btn-laranja" onClick={() => { setMostrarDevolvidos(false); setModo('emprestimos') }}>
            <span className="mat-btn-emoji">🔄</span>
            <span className="mat-btn-titulo">Empréstimos</span>
            <span className="mat-btn-sub">{totalEmprestados} ativo(s){totalAtrasados > 0 ? ` · ${totalAtrasados} atrasado(s)` : ''}</span>
          </button>

          <button className="mat-btn-grande mat-btn-verde" onClick={() => { setAbaCampo('ativos'); setModo('campo') }}>
            <span className="mat-btn-emoji">🚧</span>
            <span className="mat-btn-titulo">Equipamentos em Campo</span>
            <span className="mat-btn-sub">{totalCampoAtivos > 0 ? `${totalCampoAtivos} ativo(s) na cidade` : 'Rastreie o que está implantado'}</span>
          </button>
        </div>
      </div>
    )
  }

  // ─── LISTA DE MATERIAIS ──────────────────────────────────────────────────
  if (modo === 'materiais') {
    const buscaLow = busca.trim().toLowerCase()
    const totalDisponiveis = materiais.filter(m => !emprestimoAtivoDe(m.id)).length
    const totalEmprestadosFiltro = materiais.filter(m => !!emprestimoAtivoDe(m.id)).length
    const filtrados = materiais.filter((m) => {
      if (buscaLow && !m.id.toLowerCase().includes(buscaLow) && !m.nome.toLowerCase().includes(buscaLow)) return false
      if (filtroStatus === 'disponivel' && emprestimoAtivoDe(m.id)) return false
      if (filtroStatus === 'emprestado' && !emprestimoAtivoDe(m.id)) return false
      return true
    })
    return (
      <div className="mat-tela">
        {toast && <div className="toast">{toast}</div>}
        <div className="mat-subheader">
          <button className="btn-voltar" onClick={() => { setBusca(''); setModo('inicial') }}>‹</button>
          <h2>📋 Materiais ({materiais.length})</h2>
          <button className="mat-btn-add" onClick={() => { setMaterialSelecionado(null); setModo('formMaterial') }}>+</button>
        </div>

        <div className="mat-busca-wrap">
          <input
            className="busca-input"
            type="text"
            placeholder="🔍 Buscar por código ou nome..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <div className="mat-filtros-wrap">
          <button
            className={`mat-filtro-pill ${filtroStatus === 'todos' ? 'ativo' : ''}`}
            onClick={() => setFiltroStatus('todos')}
          >Todos ({materiais.length})</button>
          <button
            className={`mat-filtro-pill mat-filtro-verde ${filtroStatus === 'disponivel' ? 'ativo' : ''}`}
            onClick={() => setFiltroStatus('disponivel')}
          >✅ Disponível ({totalDisponiveis})</button>
          <button
            className={`mat-filtro-pill mat-filtro-laranja ${filtroStatus === 'emprestado' ? 'ativo' : ''}`}
            onClick={() => setFiltroStatus('emprestado')}
          >🔄 Emprestado ({totalEmprestadosFiltro})</button>
        </div>


        {carregando ? (
          <div className="carregando">⏳ Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="lista-vazia">
            <div style={{ fontSize: '3rem' }}>📦</div>
            <div>
              {busca || filtroStatus !== 'todos'
                ? 'Nenhum material encontrado para este filtro.'
                : 'Nenhum material cadastrado ainda.'}
            </div>
            {!busca && filtroStatus !== 'todos' && (
              <button className="btn-nova-vazia" onClick={() => { setBusca(''); setFiltroStatus('todos') }}>
                Limpar filtros
              </button>
            )}
            {!busca && filtroStatus === 'todos' && (
              <button className="btn-nova-vazia" onClick={() => { setMaterialSelecionado(null); setModo('formMaterial') }}>
                + Cadastrar primeiro material
              </button>
            )}
          </div>
        ) : (
          <div className="mat-lista">
            {filtrados.map((m) => {
              const empr = emprestimoAtivoDe(m.id)
              const total = m.quantidade ?? 1
              const disp = qtdDisponivel(m)
              return (
                <button key={m.id} className="mat-card" onClick={() => { setMaterialSelecionado(m); setModo('detalheMaterial') }}>
                  <div className="mat-card-foto">
                    {(m.foto || m.foto_placa)
                      ? <img src={m.foto || m.foto_placa!} alt={m.nome} />
                      : <span>📦</span>}
                  </div>
                  <div className="mat-card-corpo">
                    <div className="mat-card-codigo">{m.id}</div>
                    <div className="mat-card-nome">{m.nome}</div>
                    <div className={`mat-card-status mat-status-${disp > 0 ? 'disponivel' : 'emprestado'}`}>
                      {disp > 0
                        ? `✅ ${disp}/${total} disponível${disp !== 1 ? 'is' : ''}`
                        : empr
                          ? `❌ Tudo emprestado a ${empr.responsavel}`
                          : '❌ Nenhum disponível'}
                    </div>
                  </div>
                  <div className="mat-card-qtd-badge" style={{
                    background: disp > 0 ? '#dcfce7' : '#fef2f2',
                    color: disp > 0 ? '#15803d' : '#991b1b',
                  }}>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>{disp}</span>
                    <span style={{ fontSize: '0.65rem', lineHeight: 1 }}>disp</span>
                  </div>
                  <span className="mat-card-seta">›</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ─── DETALHE DO MATERIAL ─────────────────────────────────────────────────
  if (modo === 'detalheMaterial' && materialSelecionado) {
    return (
      <DetalheMaterial
        material={materialSelecionado}
        emprestimoAtivo={emprestimoAtivoDe(materialSelecionado.id)}
        onVoltar={() => setModo('materiais')}
        onEditar={() => setModo('editarMaterial')}
        onExcluir={async () => {
          if (!confirm(`Excluir definitivamente o material "${materialSelecionado.nome}"?\nIsso apaga TODOS os empréstimos relacionados.`)) return
          try {
            const resp = await fetch(`/api/materiais/${materialSelecionado.id}`, { method: 'DELETE' })
            if (!resp.ok) { const e = await resp.json().catch(() => ({})); alert('Erro: ' + (e.error || resp.status)); return }
          } catch (err: any) {
            alert('Erro: ' + (err?.message || 'falha de rede')); return
          }
          showToast('🗑️ Material excluído.')
          await carregar()
          setMaterialSelecionado(null)
          setModo('materiais')
        }}
      />
    )
  }

  // ─── FORMULÁRIO DE NOVO MATERIAL ─────────────────────────────────────────
  if (modo === 'formMaterial') {
    return (
      <FormMaterial
        existentes={materiais.map((m) => m.id)}
        onCancelar={() => setModo('materiais')}
        onSalvo={async () => {
          showToast('✅ Material cadastrado!')
          await carregar()
          setModo('materiais')
        }}
      />
    )
  }

  // ─── EDITAR MATERIAL ─────────────────────────────────────────────────────
  if (modo === 'editarMaterial' && materialSelecionado) {
    return (
      <FormMaterial
        existentes={materiais.map((m) => m.id)}
        materialInicial={materialSelecionado}
        onCancelar={() => setModo('detalheMaterial')}
        onSalvo={async (atualizado) => {
          if (atualizado) setMaterialSelecionado(atualizado)
          showToast('✅ Material atualizado!')
          await carregar()
          setModo('detalheMaterial')
        }}
      />
    )
  }

  // ─── LISTA DE EMPRÉSTIMOS ────────────────────────────────────────────────
  if (modo === 'emprestimos') {
    const filtrados = emprestimos.filter((e) => mostrarDevolvidos ? !!e.devolvido_em : !e.devolvido_em)
    return (
      <div className="mat-tela">
        {toast && <div className="toast">{toast}</div>}
        <div className="mat-subheader">
          <button className="btn-voltar" onClick={() => setModo('inicial')}>‹</button>
          <h2>🔄 Empréstimos</h2>
          <button className="mat-btn-add" onClick={() => setModo('novoEmprestimo')} disabled={materiais.length === 0}>+</button>
        </div>

        <div className="mat-toggle-row">
          <button
            className={`mat-toggle-btn ${!mostrarDevolvidos ? 'ativo' : ''}`}
            onClick={() => setMostrarDevolvidos(false)}
          >
            🔴 Ativos ({emprestimos.filter((e) => !e.devolvido_em).length})
          </button>
          <button
            className={`mat-toggle-btn ${mostrarDevolvidos ? 'ativo' : ''}`}
            onClick={() => setMostrarDevolvidos(true)}
          >
            ✅ Devolvidos ({emprestimos.filter((e) => !!e.devolvido_em).length})
          </button>
        </div>

        {carregando ? (
          <div className="carregando">⏳ Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="lista-vazia">
            <div style={{ fontSize: '3rem' }}>🔄</div>
            <div>
              {mostrarDevolvidos ? 'Nenhuma devolução registrada ainda.' : 'Nenhum empréstimo ativo no momento.'}
            </div>
            {!mostrarDevolvidos && materiais.length > 0 && (
              <button className="btn-nova-vazia" onClick={() => setModo('novoEmprestimo')}>+ Registrar empréstimo</button>
            )}
          </div>
        ) : (
          <div className="mat-lista">
            {filtrados.map((e) => {
              const st = statusEmprestimo(e)
              return (
                <div key={e.id} className={`mat-card-empr mat-empr-${st}`}>
                  <div className="mat-empr-cab">
                    <div>
                      <div className="mat-empr-mat">📦 {e.material_codigo} — {e.material_nome}{(e.quantidade ?? 1) > 1 ? ` (${e.quantidade} un.)` : ''}</div>
                      <div className="mat-empr-quem">👤 {e.responsavel}{e.secretaria ? ` · ${e.secretaria}` : ''}</div>
                    </div>
                    <span className={`mat-empr-tag mat-empr-tag-${st}`}>
                      {st === 'devolvido' ? '✅ Devolvido' :
                       st === 'atrasado' ? '🔴 Atrasado' :
                       st === 'proximo' ? '🟡 Vence em breve' : '🟢 No prazo'}
                    </span>
                  </div>
                  <div className="mat-empr-meta">
                    <span>📅 Saiu: {formatarDataBr(e.data_emprestimo)}</span>
                    {e.devolvido_em
                      ? <span>↩️ Devolvido: {formatarDataBr(e.devolvido_em)}</span>
                      : <span>⏰ Devolução prevista: {formatarDataBr(e.data_devolucao_prevista)} ({e.prazo_dias} dia{e.prazo_dias !== 1 ? 's' : ''})</span>
                    }
                  </div>
                  <div className="mat-empr-acoes">
                    <button className="mat-btn-acao" onClick={() => gerarTermoEmprestimoPdf(e)}>
                      📄 Gerar Termo
                    </button>
                    {!e.devolvido_em && (
                      <button className="mat-btn-acao mat-btn-acao-verde" onClick={() => { setEmprestimoSelecionado(e); setModo('devolucao') }}>
                        ↩️ Registrar Devolução
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ─── NOVO EMPRÉSTIMO (formulário + termo) ────────────────────────────────
  if (modo === 'novoEmprestimo') {
    return (
      <FormNovoEmprestimo
        materiais={materiais}
        emprestimos={emprestimos}
        equipamentos={equipamentosCampo}
        onCancelar={() => setModo('inicial')}
        onSalvo={async (novo) => {
          showToast('✅ Empréstimo registrado!')
          await carregar()
          gerarTermoEmprestimoPdf(novo)
          setModo('emprestimos')
        }}
      />
    )
  }

  // ─── REGISTRAR DEVOLUÇÃO ─────────────────────────────────────────────────
  if (modo === 'devolucao' && emprestimoSelecionado) {
    return (
      <FormDevolucao
        emprestimo={emprestimoSelecionado}
        onCancelar={() => { setEmprestimoSelecionado(null); setModo('emprestimos') }}
        onSalvo={async () => {
          showToast('✅ Devolução registrada!')
          await carregar()
          setEmprestimoSelecionado(null)
          setModo('emprestimos')
        }}
      />
    )
  }

  // ─── EQUIPAMENTOS EM CAMPO (lista) ───────────────────────────────────────
  if (modo === 'campo') {
    const ativos    = equipamentosCampo.filter(c => c.status === 'ativo')
    const devolvidos = equipamentosCampo.filter(c => c.status === 'devolvido')
    const lista = abaCampo === 'ativos' ? ativos : devolvidos

    return (
      <div className="mat-tela">
        {toast && <div className="toast">{toast}</div>}
        <div className="mat-subheader">
          <button className="btn-voltar" onClick={() => setModo('inicial')}>‹</button>
          <h2>🚧 Equipamentos em Campo</h2>
          <button className="mat-btn-add" onClick={() => setModo('formCampo')}>+</button>
        </div>

        <div className="mat-toggle-row">
          <button
            className={`mat-toggle-btn ${abaCampo === 'ativos' ? 'ativo' : ''}`}
            onClick={() => setAbaCampo('ativos')}
          >🔴 Ativos ({ativos.length})</button>
          <button
            className={`mat-toggle-btn ${abaCampo === 'devolvidos' ? 'ativo' : ''}`}
            onClick={() => setAbaCampo('devolvidos')}
          >✅ Devolvidos ({devolvidos.length})</button>
        </div>

        {lista.length === 0 ? (
          <div className="lista-vazia">
            <div style={{ fontSize: '3rem' }}>🚧</div>
            <div>{abaCampo === 'ativos' ? 'Nenhum equipamento ativo no campo.' : 'Nenhum equipamento devolvido ainda.'}</div>
            {abaCampo === 'ativos' && (
              <button className="btn-nova-vazia" onClick={() => setModo('formCampo')}>+ Registrar em campo</button>
            )}
          </div>
        ) : (
          <div className="mat-lista">
            {lista.map(c => (
              <button key={c.id} className="mat-card mat-card-campo" onClick={() => { setCampoSelecionado(c); setModo('detalheCampo') }}>
                <div className="mat-card-foto mat-card-foto-campo">
                  {c.fotos && c.fotos[0]
                    ? <img src={c.fotos[0]} alt={c.material_nome ?? ''} />
                    : <span>🚧</span>}
                </div>
                <div className="mat-card-corpo">
                  <div className="mat-card-codigo">{c.material_id ?? '—'}</div>
                  <div className="mat-card-nome">{c.material_nome ?? 'Sem material'}{(c.quantidade ?? 1) > 1 ? <span style={{ fontSize: '0.75rem', fontWeight: 600, marginLeft: '0.3rem', color: '#b45309' }}>{c.quantidade} un.</span> : null}</div>
                  {(c.rua || c.bairro) && (
                    <div className="mat-card-status" style={{ color: '#374151', fontSize: '0.8rem' }}>
                      📍 {[c.rua, c.numero, c.bairro].filter(Boolean).join(', ')}
                    </div>
                  )}
                  <div className={`mat-card-status ${c.status === 'ativo' ? 'mat-status-emprestado' : 'mat-status-disponivel'}`}>
                    {c.status === 'ativo' ? '🔴 Em campo' : '✅ Devolvido'}
                  </div>
                </div>
                {c.latitude && c.longitude && (
                  <span className="mat-campo-gps-badge" title="Tem GPS">📡</span>
                )}
                <span className="mat-card-seta">›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ─── FORM CAMPO ───────────────────────────────────────────────────────────
  if (modo === 'formCampo') {
    return (
      <FormCampo
        materiais={materiais}
        onCancelar={() => setModo('campo')}
        onSalvo={async () => {
          showToast('✅ Equipamento registrado em campo!')
          await carregar()
          setModo('campo')
        }}
      />
    )
  }

  // ─── DETALHE CAMPO ────────────────────────────────────────────────────────
  if (modo === 'detalheCampo' && campoSelecionado) {
    return (
      <DetalheCampo
        item={campoSelecionado}
        onVoltar={() => { setCampoSelecionado(null); setModo('campo') }}
        onIrParaMapa={onIrParaMapa}
        onDevolver={async () => {
          const resp = await fetch(`/api/equipamentos-campo/${campoSelecionado.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'devolvido' }),
          })
          if (!resp.ok) { const e = await resp.json().catch(() => ({})); alert('Erro: ' + (e.error || resp.status)); return }
          showToast('✅ Equipamento marcado como devolvido!')
          await carregar()
          setCampoSelecionado(null)
          setModo('campo')
        }}
        onExcluir={async () => {
          if (!confirm('Excluir este registro de equipamento em campo?')) return
          await fetch(`/api/equipamentos-campo/${campoSelecionado.id}`, { method: 'DELETE' })
          showToast('🗑️ Registro excluído.')
          await carregar()
          setCampoSelecionado(null)
          setModo('campo')
        }}
      />
    )
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTES
// ═══════════════════════════════════════════════════════════════════════════

function DetalheMaterial({
  material, emprestimoAtivo, onVoltar, onEditar, onExcluir,
}: {
  material: Material
  emprestimoAtivo: Emprestimo | undefined
  onVoltar: () => void
  onEditar: () => void
  onExcluir: () => void
}) {
  return (
    <div className="mat-tela">
      <div className="mat-subheader">
        <button className="btn-voltar" onClick={onVoltar}>‹</button>
        <h2>📦 {material.id}</h2>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button className="mat-btn-editar" onClick={onEditar} title="Editar material">✏️</button>
          <button className="mat-btn-excluir" onClick={onExcluir} title="Excluir material">🗑️</button>
        </div>
      </div>

      <div className="mat-detalhe">
        {(material.foto || material.foto_placa) && (
          <div className="mat-detalhe-fotos">
            {material.foto_placa && (
              <div className="mat-detalhe-foto-wrap">
                <span className="mat-foto-label">🏷️ Placa do patrimônio</span>
                <img src={material.foto_placa} alt="Placa do patrimônio" />
              </div>
            )}
            {material.foto && (
              <div className="mat-detalhe-foto-wrap">
                <span className="mat-foto-label">📸 Foto do item</span>
                <img src={material.foto} alt={material.nome} />
              </div>
            )}
          </div>
        )}

        <div className="mat-detalhe-bloco">
          <span className="mat-detalhe-label">Nome</span>
          <span className="mat-detalhe-valor">{material.nome}</span>
        </div>

        {material.descricao && (
          <div className="mat-detalhe-bloco">
            <span className="mat-detalhe-label">Descrição</span>
            <span className="mat-detalhe-valor">{material.descricao}</span>
          </div>
        )}

        {material.observacoes && (
          <div className="mat-detalhe-bloco">
            <span className="mat-detalhe-label">Observações</span>
            <span className="mat-detalhe-valor">{material.observacoes}</span>
          </div>
        )}

        <div className={`mat-detalhe-status ${emprestimoAtivo ? 'mat-status-emprestado' : 'mat-status-disponivel'}`}>
          {emprestimoAtivo ? (
            <>
              <strong>❌ Emprestado</strong>
              <div>Para: <strong>{emprestimoAtivo.responsavel}</strong></div>
              {emprestimoAtivo.secretaria && <div>Secretaria: {emprestimoAtivo.secretaria}</div>}
              <div>Devolução prevista: <strong>{formatarDataBr(emprestimoAtivo.data_devolucao_prevista)}</strong> ({emprestimoAtivo.prazo_dias} dias)</div>
              <button className="mat-btn-acao" style={{ marginTop: '0.7rem' }} onClick={() => gerarTermoEmprestimoPdf(emprestimoAtivo)}>
                📄 Gerar Termo deste empréstimo
              </button>
            </>
          ) : (
            <strong>✅ Disponível</strong>
          )}
        </div>
      </div>
    </div>
  )
}

function FormMaterial({
  existentes, materialInicial, onCancelar, onSalvo,
}: {
  existentes: string[]
  materialInicial?: Material
  onCancelar: () => void
  onSalvo: (atualizado?: Material) => void
}) {
  const editando = !!materialInicial
  const [codigo, setCodigo] = useState(materialInicial?.id ?? '')
  const [nome, setNome] = useState(materialInicial?.nome ?? '')
  const [descricao, setDescricao] = useState(materialInicial?.descricao ?? '')
  const [observacoes, setObservacoes] = useState(materialInicial?.observacoes ?? '')
  const [foto, setFoto] = useState<string | null>(materialInicial?.foto ?? null)
  const [quantidade, setQuantidade] = useState(materialInicial?.quantidade ?? 1)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const raw = await lerArquivoComoDataUrl(file)
      const redim = await redimensionarImagem(raw, 1000, 1000)
      setFoto(redim)
    } catch {
      alert('Não consegui carregar a foto. Tente outra.')
    }
    e.target.value = ''
  }

  async function salvar() {
    const nm = nome.trim()
    if (!nm) { setErro('Informe o nome do material.'); return }
    setSalvando(true); setErro('')
    try {
      if (editando && materialInicial) {
        const resp = await fetch(`/api/materiais/${materialInicial.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: nm,
            descricao: descricao.trim() || null,
            observacoes: observacoes.trim() || null,
            foto,
            quantidade: Math.max(1, quantidade),
          }),
        })
        if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || `HTTP ${resp.status}`) }
        const data = await resp.json()
        onSalvo(data as Material)
      } else {
        const cod = codigo.trim().toUpperCase()
        if (!cod) { setErro('Informe o código do material.'); setSalvando(false); return }
        if (existentes.includes(cod)) { setErro(`Já existe um material com código "${cod}".`); setSalvando(false); return }
        const resp = await fetch('/api/materiais', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: cod, nome: nm,
            descricao: descricao.trim() || null,
            observacoes: observacoes.trim() || null,
            foto,
            quantidade: Math.max(1, quantidade),
          }),
        })
        if (!resp.ok) {
          const e = await resp.json().catch(() => ({}))
          throw new Error(e.error || `HTTP ${resp.status}`)
        }
        onSalvo()
      }
    } catch (e: any) {
      setErro(`Erro ao salvar: ${e?.message ?? 'tente novamente'}`)
    }
    setSalvando(false)
  }

  return (
    <div className="mat-tela">
      <div className="mat-subheader">
        <button className="btn-voltar" onClick={onCancelar}>‹</button>
        <h2>{editando ? '✏️ Editar Material' : '➕ Novo Material'}</h2>
        <span style={{ width: '2rem' }} />
      </div>

      <div className="mat-form">
        {!editando && (
          <div className="campo">
            <label className="campo-label">Código *</label>
            <input
              className="campo-input"
              type="text"
              placeholder="Ex: DC-001"
              value={codigo}
              onChange={(e) => { setCodigo(e.target.value); setErro('') }}
              autoCapitalize="characters"
            />
            <span className="campo-label-sub">Identificador único do item.</span>
          </div>
        )}

        {editando && (
          <div className="campo">
            <label className="campo-label">Código</label>
            <input className="campo-input" type="text" value={codigo} disabled style={{ opacity: 0.5 }} />
            <span className="campo-label-sub">O código não pode ser alterado.</span>
          </div>
        )}

        <div className="campo">
          <label className="campo-label">Nome *</label>
          <input
            className="campo-input"
            type="text"
            placeholder="Ex: Motobomba"
            value={nome}
            onChange={(e) => { setNome(e.target.value); setErro('') }}
          />
        </div>

        <div className="campo">
          <label className="campo-label">Quantidade em estoque *</label>
          <input
            className="campo-input"
            type="number"
            min={1}
            max={9999}
            value={quantidade}
            onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
          />
          <span className="campo-label-sub">Quantas unidades deste item existem no total.</span>
        </div>

        <div className="campo">
          <label className="campo-label">Descrição</label>
          <textarea
            className="campo-textarea"
            placeholder="Marca, modelo, características..."
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>

        <div className="campo">
          <label className="campo-label">Observações</label>
          <textarea
            className="campo-textarea"
            placeholder="Cuidados, defeitos conhecidos, etc."
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        </div>

        <div className="campo">
          <label className="campo-label">Foto</label>
          {foto ? (
            <div className="mat-foto-preview">
              <img src={foto} alt="material" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 8 }} />
              <button type="button" className="mat-foto-remover" onClick={() => setFoto(null)}>Remover foto</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <label className="btn-add-foto" style={{ cursor: 'pointer' }}>
                <span className="btn-foto-emoji">📷</span>
                <span>Tirar Foto</span>
                <input type="file" accept="image/*" capture="environment" onChange={escolherFoto} style={{ display: 'none' }} />
              </label>
              <label className="btn-add-foto" style={{ cursor: 'pointer' }}>
                <span className="btn-foto-emoji">🖼️</span>
                <span>Galeria</span>
                <input type="file" accept="image/*" onChange={escolherFoto} style={{ display: 'none' }} />
              </label>
            </div>
          )}
        </div>

        {erro && <div className="login-erro" style={{ marginBottom: '0.8rem' }}>{erro}</div>}

        <button className="btn-salvar" onClick={salvar} disabled={salvando}>
          {salvando ? '⏳ Salvando...' : editando ? '💾 Salvar Alterações' : '💾 Salvar Material'}
        </button>
      </div>
    </div>
  )
}

function FormNovoEmprestimo({
  materiais, emprestimos, equipamentos, onCancelar, onSalvo,
}: {
  materiais: Material[]
  emprestimos: Emprestimo[]
  equipamentos: EquipamentoCampo[]
  onCancelar: () => void
  onSalvo: (novo: Emprestimo) => void
}) {
  const [materialId, setMaterialId] = useState('')
  const [quantidade, setQuantidade] = useState(1)
  const [responsavel, setResponsavel] = useState('')
  const [cpf, setCpf] = useState('')
  const [secretaria, setSecretaria] = useState('')
  const [prazoDias, setPrazoDias] = useState<number | ''>('' )
  const [condicao, setCondicao] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [assinaturaData, setAssinaturaData] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const agente = getAgenteLogado() || ''
  const material = materiais.find((m) => m.id === materialId)
  const dataPrevista = useMemo(() => typeof prazoDias === 'number' && prazoDias >= 1 ? calcularDevolucaoPrevista(prazoDias) : null, [prazoDias])

  // ── Assinatura digital (canvas) ──
  const assinaturaRef = useRef<HTMLCanvasElement>(null)
  const assinandoRef = useRef(false)

  useEffect(() => { setTimeout(() => ajustarCanvasAssinatura(), 50) }, [])

  function ajustarCanvasAssinatura() {
    const canvas = assinaturaRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    const w = Math.max(1, Math.floor(rect.width * ratio))
    const h = Math.max(1, Math.floor(rect.height * ratio))
    if (canvas.width === w && canvas.height === h) return
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
  }

  function pontoAssinatura(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = assinaturaRef.current!
    const rect = canvas.getBoundingClientRect()
    const toque = 'touches' in e ? e.touches[0] || e.changedTouches[0] : null
    const me = e as React.MouseEvent<HTMLCanvasElement>
    const x = (toque ? toque.clientX : me.clientX) - rect.left
    const y = (toque ? toque.clientY : me.clientY) - rect.top
    return { x, y }
  }

  function iniciarAssinatura(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault()
    ajustarCanvasAssinatura()
    const ctx = assinaturaRef.current?.getContext('2d')
    if (!ctx) return
    const p = pontoAssinatura(e)
    assinandoRef.current = true
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  function moverAssinatura(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!assinandoRef.current) return
    e.preventDefault()
    const ctx = assinaturaRef.current?.getContext('2d')
    if (!ctx) return
    const p = pontoAssinatura(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setAssinaturaData(assinaturaRef.current?.toDataURL('image/png') || '')
  }

  function finalizarAssinatura() {
    if (!assinandoRef.current) return
    assinandoRef.current = false
    setAssinaturaData(assinaturaRef.current?.toDataURL('image/png') || '')
  }

  function limparAssinatura() {
    const canvas = assinaturaRef.current
    if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setAssinaturaData('')
  }

  async function salvar() {
    if (!material) { setErro('Selecione um material.'); return }
    if (!responsavel.trim()) { setErro('Informe o nome de quem está pegando.'); return }
    if (!prazoDias || prazoDias < 1) { setErro('Prazo deve ser de pelo menos 1 dia.'); return }
    if (!assinaturaData) { setErro('A assinatura digital é obrigatória.'); return }
    setSalvando(true); setErro('')
    try {
      const dataPrev = dataPrevista ? dataPrevista.toISOString().slice(0, 10) : null
      const resp = await fetch('/api/emprestimos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material_id: material.id,
          material_codigo: material.id,
          material_nome: material.nome,
          responsavel: responsavel.trim(),
          cpf: cpf.trim() || null,
          secretaria: secretaria.trim() || null,
          prazo_dias: typeof prazoDias === 'number' ? prazoDias : null,
          quantidade: Math.max(1, quantidade),
          data_devolucao_prevista: dataPrev,
          condicao_equipamento: condicao.trim() || null,
          observacoes: observacoes.trim() || null,
          agente_emprestador: agente || null,
          assinatura_data: assinaturaData,
        }),
      })
      if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || `HTTP ${resp.status}`) }
      const data = await resp.json()
      onSalvo(data as Emprestimo)
    } catch (e: any) {
      setErro(`Erro ao salvar: ${e?.message ?? 'tente novamente'}`)
    }
    setSalvando(false)
  }

  return (
    <div className="mat-tela">
      <div className="mat-subheader">
        <button className="btn-voltar" onClick={onCancelar}>‹</button>
        <h2>➕ Novo Empréstimo</h2>
        <span style={{ width: '2rem' }} />
      </div>

      <div className="mat-form">
        {materiais.length === 0 ? (
          <div className="lista-vazia" style={{ padding: '2rem 1rem' }}>
            <div style={{ fontSize: '2.5rem' }}>📦</div>
            <div>Nenhum material disponível para empréstimo.</div>
          </div>
        ) : (
          <>
            <div className="campo">
              <label className="campo-label">Material *</label>
              <select
                className="campo-select"
                value={materialId}
                onChange={(e) => {
                  setMaterialId(e.target.value)
                  setQuantidade(1)
                  setErro('')
                }}
              >
                <option value="">— Escolha o item —</option>
                {materiais.map((m) => {
                  const disp = m.quantidade != null
                    ? Math.max(0, (m.quantidade ?? 1)
                        - emprestimos.filter(e2 => e2.material_id === m.id && !e2.devolvido_em).reduce((s, e2) => s + (e2.quantidade ?? 1), 0)
                        - equipamentos.filter(c => c.material_id === m.id && c.status === 'ativo').reduce((s, c) => s + (c.quantidade ?? 1), 0))
                    : null
                  const label = disp != null ? `${m.id} — ${m.nome} (${disp} disp.)` : `${m.id} — ${m.nome}`
                  return <option key={m.id} value={m.id} disabled={disp === 0}>{label}</option>
                })}
              </select>
            </div>

            {materialId && (
              <div className="campo">
                <label className="campo-label">Quantidade a emprestar *</label>
                <input
                  className="campo-input"
                  type="number"
                  min={1}
                  max={
                    (() => {
                      const mat = materiais.find(m => m.id === materialId)
                      if (!mat || mat.quantidade == null) return 9999
                      return Math.max(1, (mat.quantidade ?? 1)
                        - emprestimos.filter(e2 => e2.material_id === materialId && !e2.devolvido_em).reduce((s, e2) => s + (e2.quantidade ?? 1), 0)
                        - equipamentos.filter(c => c.material_id === materialId && c.status === 'ativo').reduce((s, c) => s + (c.quantidade ?? 1), 0))
                    })()
                  }
                  value={quantidade}
                  onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
                />
                <span className="campo-label-sub">Quantas unidades serão emprestadas.</span>
              </div>
            )}

            <div className="campo">
              <label className="campo-label">Para (responsável) *</label>
              <input
                className="campo-input"
                type="text"
                placeholder="Nome de quem está pegando"
                value={responsavel}
                onChange={(e) => { setResponsavel(e.target.value); setErro('') }}
              />
            </div>

            <div className="campo">
              <label className="campo-label">CPF</label>
              <input
                className="campo-input"
                type="text"
                inputMode="numeric"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(formatarCpf(e.target.value))}
                maxLength={14}
              />
            </div>

            <div className="campo">
              <label className="campo-label">Secretaria / Órgão</label>
              <input
                className="campo-input"
                type="text"
                placeholder="Ex: Secretaria de Obras"
                value={secretaria}
                onChange={(e) => setSecretaria(e.target.value)}
              />
            </div>

            <div className="campo">
              <label className="campo-label">Prazo (em dias) *</label>
              <input
                className="campo-input"
                type="number"
                min={1}
                max={365}
                value={prazoDias}
                onChange={(e) => { const v = e.target.value; setPrazoDias(v === '' ? '' : Math.max(1, parseInt(v) || 1)) }}
              />
              {dataPrevista && (
                <span className="campo-label-sub">
                  📅 Devolução prevista: <strong>{dataPrevista.toLocaleDateString('pt-BR')}</strong>
                </span>
              )}
            </div>

            <div className="campo">
              <label className="campo-label">Condição do equipamento</label>
              <textarea
                className="campo-textarea"
                placeholder="Ex: Em perfeito estado de funcionamento, sem avarias visíveis."
                value={condicao}
                onChange={(e) => setCondicao(e.target.value)}
              />
            </div>

            <div className="campo">
              <label className="campo-label">Observações</label>
              <textarea
                className="campo-textarea"
                placeholder="Anotações internas (opcional)"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>

            <div className="campo">
              <label className="campo-label">Emprestador (cedente)</label>
              <input className="campo-input" type="text" value={agente} disabled />
              <span className="campo-label-sub">Preenchido automaticamente com o agente logado.</span>
            </div>

            <div className="campo">
              <label className="campo-label">Assinatura de quem pegou *</label>
              <div className="ck-assinatura-box">
                <canvas
                  ref={assinaturaRef}
                  className="ck-assinatura-canvas"
                  onMouseDown={iniciarAssinatura}
                  onMouseMove={moverAssinatura}
                  onMouseUp={finalizarAssinatura}
                  onMouseLeave={finalizarAssinatura}
                  onTouchStart={iniciarAssinatura}
                  onTouchMove={moverAssinatura}
                  onTouchEnd={finalizarAssinatura}
                />
                {!assinaturaData && <span className="ck-assinatura-placeholder">Assine aqui com o dedo</span>}
              </div>
              <button type="button" className="ck-assinatura-limpar" onClick={limparAssinatura}>Limpar assinatura</button>
            </div>

            {agente && (
              <div className="campo">
                <label className="campo-label">Cedente (emprestador) — nome impresso</label>
                <div className="ck-assinatura-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 56, background: '#f0f4ff' }}>
                  <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1a4b8c', letterSpacing: '0.03em' }}>{agente}</span>
                </div>
                <span className="campo-label-sub">Nome do agente que está cedendo o equipamento.</span>
              </div>
            )}

            {erro && <div className="login-erro" style={{ marginBottom: '0.8rem' }}>{erro}</div>}

            <button className="btn-salvar" onClick={salvar} disabled={salvando}>
              {salvando ? '⏳ Registrando...' : '✅ Registrar Empréstimo + Gerar Termo'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function FormDevolucao({
  emprestimo, onCancelar, onSalvo,
}: {
  emprestimo: Emprestimo
  onCancelar: () => void
  onSalvo: () => void
}) {
  const hoje = new Date().toISOString().slice(0, 10)
  const agente = getAgenteLogado() || ''
  const [data, setData] = useState(hoje)
  const [obs, setObs] = useState('')
  const [recebedor, setRecebedor] = useState(agente)
  const [foto, setFoto] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const raw = await lerArquivoComoDataUrl(file)
      const redim = await redimensionarImagem(raw, 1000, 1000)
      setFoto(redim)
    } catch {
      alert('Não consegui carregar a foto.')
    }
    e.target.value = ''
  }

  async function salvar() {
    if (!recebedor.trim()) { setErro('Informe quem recebeu o equipamento.'); return }
    setSalvando(true); setErro('')
    try {
      const resp = await fetch(`/api/emprestimos/${emprestimo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          devolvido_em: new Date(data + 'T12:00:00').toISOString(),
          devolvido_obs: obs.trim() || null,
          devolvido_recebedor: recebedor.trim(),
          devolvido_foto: foto,
        }),
      })
      if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || `HTTP ${resp.status}`) }
      onSalvo()
    } catch (e: any) {
      setErro(`Erro ao salvar: ${e?.message ?? 'tente novamente'}`)
    }
    setSalvando(false)
  }

  return (
    <div className="mat-tela">
      <div className="mat-subheader">
        <button className="btn-voltar" onClick={onCancelar}>‹</button>
        <h2>↩️ Registrar Devolução</h2>
        <span style={{ width: '2rem' }} />
      </div>

      <div className="mat-form">
        <div className="mat-empr-cab" style={{ marginBottom: '1rem' }}>
          <div>
            <div className="mat-empr-mat">📦 {emprestimo.material_codigo} — {emprestimo.material_nome}</div>
            <div className="mat-empr-quem">👤 {emprestimo.responsavel}{emprestimo.secretaria ? ` · ${emprestimo.secretaria}` : ''}</div>
          </div>
        </div>

        <div className="campo">
          <label className="campo-label">Data da devolução *</label>
          <input className="campo-input" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </div>

        <div className="campo">
          <label className="campo-label">Observação</label>
          <textarea
            className="campo-textarea"
            placeholder="Ex: Equipamento devolvido em perfeito estado."
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </div>

        <div className="campo">
          <label className="campo-label">Foto da devolução</label>
          {foto ? (
            <div className="mat-foto-preview">
              <img src={foto} alt="devolução" />
              <button type="button" className="mat-foto-remover" onClick={() => setFoto(null)}>Remover foto</button>
            </div>
          ) : (
            <label className="btn-add-foto">
              <span className="btn-foto-emoji">📷</span>
              <span>Adicionar foto (opcional)</span>
              <input type="file" accept="image/*" capture="environment" onChange={escolherFoto} style={{ display: 'none' }} />
            </label>
          )}
        </div>

        <div className="campo">
          <label className="campo-label">Quem recebeu *</label>
          <input
            className="campo-input"
            type="text"
            value={recebedor}
            onChange={(e) => { setRecebedor(e.target.value); setErro('') }}
          />
          <span className="campo-label-sub">Por padrão é o agente logado.</span>
        </div>

        {erro && <div className="login-erro" style={{ marginBottom: '0.8rem' }}>{erro}</div>}

        <button className="btn-salvar" onClick={salvar} disabled={salvando}>
          {salvando ? '⏳ Salvando...' : '✅ Confirmar Devolução'}
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// GERAÇÃO DO TERMO DE EMPRÉSTIMO (PDF via window.print)
// ═══════════════════════════════════════════════════════════════════════════
function gerarTermoEmprestimoPdf(e: Emprestimo) {
  const dataE = new Date(e.data_emprestimo)
  const win = window.open('', '_blank')
  if (!win) {
    alert('Permita pop-ups neste site para gerar o termo.')
    return
  }
  const css = `
    body{font-family:'Times New Roman',Georgia,serif;color:#111827;margin:0;padding:30px 40px;max-width:800px;margin:auto;line-height:1.55}
    .cabecalho{display:flex;align-items:center;gap:14px;border-bottom:3px double #1a4b8c;padding-bottom:10px;margin-bottom:18px}
    .cabecalho img{width:64px;height:64px;object-fit:contain}
    .cabecalho-textos strong{display:block;font-size:15px;color:#1a4b8c;letter-spacing:0.5px}
    .cabecalho-textos span{font-size:11px;color:#374151}
    h1{text-align:center;font-size:20px;letter-spacing:2px;margin:18px 0 22px;color:#1a4b8c;text-transform:uppercase}
    .linha{margin:0.55rem 0;font-size:14px}
    .linha strong{display:inline-block;min-width:130px;color:#374151;font-weight:bold}
    .condicao-box{border:1px solid #6b7280;border-radius:4px;padding:12px 14px;margin:18px 0;background:#f9fafb;min-height:80px}
    .condicao-box strong{display:block;margin-bottom:6px;color:#1a4b8c;font-size:13px}
    .condicao-box p{margin:0;font-size:13px;white-space:pre-wrap}
    .local-data{margin-top:34px;text-align:right;font-size:14px}
    .assinaturas{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:50px}
    .assinatura{text-align:center}
    .assinatura .img-wrap{height:80px;display:flex;align-items:flex-end;justify-content:center;border-bottom:1px solid #111827;margin-bottom:6px}
    .assinatura img{max-height:75px;max-width:100%;object-fit:contain}
    .assinatura strong{font-size:13px;display:block;margin-top:4px}
    .assinatura .nome{font-size:12px;color:#374151;margin-top:2px}
    .rodape{margin-top:40px;font-size:10px;color:#6b7280;text-align:center;border-top:1px solid #d1d5db;padding-top:8px}
    button{position:fixed;right:18px;top:18px;padding:10px 16px;background:#166534;color:white;border:0;border-radius:8px;font-weight:bold;cursor:pointer;font-family:Arial,sans-serif;font-size:14px}
    @media print{button{display:none}body{margin:0;padding:18mm}}
  `
  const html = `<!doctype html><html lang="pt-br"><head>
<meta charset="utf-8"/><title>Termo de Empréstimo #${e.id}</title>
<style>${css}</style>
</head><body>
  <button onclick="window.print()">🖨️ Salvar em PDF</button>
  <div class="cabecalho">
    <img src="/logo-dc.jpg" alt="Defesa Civil" onerror="this.style.display='none'"/>
    <div class="cabecalho-textos">
      <strong>DEFESA CIVIL DE OURO BRANCO — MG</strong>
      <span>Coordenadoria Municipal de Proteção e Defesa Civil</span>
    </div>
  </div>

  <h1>Termo de Empréstimo</h1>

  <div class="linha"><strong>Empréstimo de:</strong> ${htmlEscape(e.material_nome)}${e.material_codigo ? ` (cód. ${htmlEscape(e.material_codigo)})` : ''}${(e.quantidade ?? 1) > 1 ? ` — Qtd: ${e.quantidade}` : ''}</div>
  <div class="linha"><strong>Para:</strong> ${htmlEscape(e.responsavel)}</div>
  <div class="linha"><strong>CPF nº:</strong> ${htmlEscape(e.cpf || '—')}</div>
  <div class="linha"><strong>Secretaria:</strong> ${htmlEscape(e.secretaria || '—')}</div>
  <div class="linha"><strong>Prazo:</strong> ${e.prazo_dias} dia${e.prazo_dias !== 1 ? 's' : ''}${e.data_devolucao_prevista ? ` (devolução prevista até ${formatarDataBr(e.data_devolucao_prevista)})` : ''}</div>

  <div class="condicao-box">
    <strong>O equipamento encontra-se nas seguintes condições:</strong>
    <p>${htmlEscape(e.condicao_equipamento || '—')}</p>
  </div>

  <div class="local-data">${htmlEscape(dataExtenso(dataE))}.</div>

  <div class="assinaturas">
    <div class="assinatura">
      <div class="img-wrap" style="align-items:center;justify-content:center;padding-bottom:8px">
        <span style="font-size:13px;font-style:italic;color:#374151">${htmlEscape(e.agente_emprestador || '—')}</span>
      </div>
      <strong>Emprestador (cedente)</strong>
      <div class="nome">${htmlEscape(e.agente_emprestador || '—')}</div>
    </div>
    <div class="assinatura">
      <div class="img-wrap">
        ${e.assinatura_data ? `<img src="${e.assinatura_data}" alt="assinatura"/>` : ''}
      </div>
      <strong>Emprestado (solicitante)</strong>
      <div class="nome">${htmlEscape(e.responsavel)}</div>
    </div>
  </div>

  ${e.observacoes ? `<div class="condicao-box" style="margin-top:30px"><strong>Observações:</strong><p>${htmlEscape(e.observacoes)}</p></div>` : ''}

  <div class="rodape">Termo gerado pelo aplicativo da Defesa Civil de Ouro Branco — registro nº ${e.id}.</div>
</body></html>`
  win.document.write(html)
  win.document.close()
  win.focus()
}

// ════════════════════════════════════════════════════════════════════════════
// MODAL DE IMPORTAÇÃO DE EXCEL (Controle Patrimonial)
// ════════════════════════════════════════════════════════════════════════════
function ImportarExcelModal({
  onFechar,
  onConcluido,
}: {
  onFechar: () => void
  onConcluido: (mensagem: string) => void
}) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [analisando, setAnalisando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoParse | null>(null)
  const [erro, setErro] = useState('')
  const [idsExistentes, setIdsExistentes] = useState<Set<string>>(new Set())
  const [atualizarExistentes, setAtualizarExistentes] = useState(true)

  const [importando, setImportando] = useState(false)
  const [progressoAtual, setProgressoAtual] = useState(0)
  const [progressoLabel, setProgressoLabel] = useState('')

  // Carrega lista atual de materiais para detectar duplicatas
  useEffect(() => {
    fetch('/api/materiais')
      .then(r => r.ok ? r.json() : [])
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          setIdsExistentes(new Set(data.map((m: { id: string }) => m.id)))
        }
      })
      .catch(() => { /* ignore */ })
  }, [])

  async function selecionarArquivo(f: File) {
    setArquivo(f)
    setErro('')
    setResultado(null)
    setAnalisando(true)
    try {
      const r = await parseExcelPatrimonio(f)
      if (r.itens.length === 0) {
        setErro('Nenhum item válido encontrado na planilha. Confira se há códigos preenchidos na coluna A.')
      } else {
        setResultado(r)
      }
    } catch (e) {
      console.error('[ImportarExcel] erro de parse:', e)
      setErro('Não foi possível ler a planilha. Verifique se o arquivo é um .xlsx válido.')
    }
    setAnalisando(false)
  }

  async function confirmarImport() {
    if (!resultado) return
    setImportando(true)
    setErro('')

    const total = resultado.itens.length
    let criados = 0
    let atualizados = 0
    let ignorados = 0
    let falhas = 0

    for (let i = 0; i < total; i++) {
      const item = resultado.itens[i]
      setProgressoAtual(i + 1)
      setProgressoLabel(`${item.id} — ${item.nome}`)

      const jaExiste = idsExistentes.has(item.id)

      try {
        if (!jaExiste) {
          const resp = await fetch('/api/materiais', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: item.id, nome: item.nome, descricao: item.descricao, observacoes: item.observacoes, foto: item.foto }),
          })
          if (resp.ok) criados++
          else if (resp.status === 409) ignorados++
          else falhas++
        } else if (atualizarExistentes) {
          const resp = await fetch(`/api/materiais/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: item.nome, descricao: item.descricao, observacoes: item.observacoes, foto: item.foto }),
          })
          if (resp.ok) atualizados++
          else falhas++
        } else {
          ignorados++
        }
      } catch (e) {
        console.warn('[ImportarExcel] falha em', item.id, e)
        falhas++
      }
    }

    setImportando(false)
    const partes: string[] = []
    if (criados) partes.push(`${criados} criado(s)`)
    if (atualizados) partes.push(`${atualizados} atualizado(s)`)
    if (ignorados) partes.push(`${ignorados} ignorado(s)`)
    if (falhas) partes.push(`${falhas} falha(s)`)
    onConcluido(`✅ Importação concluída — ${partes.join(', ')}`)
  }

  const novosCount = resultado
    ? resultado.itens.filter((i) => !idsExistentes.has(i.id)).length
    : 0
  const existentesCount = resultado ? resultado.itens.length - novosCount : 0
  const comFotoCount = resultado
    ? resultado.itens.filter((i) => i.foto).length
    : 0

  function listarItens(itens: ItemImportado[]) {
    return itens.map((it) => {
      const existe = idsExistentes.has(it.id)
      return (
        <div key={it.id} className="mat-import-preview-item">
          <div className="mat-import-preview-foto">
            {it.foto ? <img src={it.foto} alt={it.nome} /> : '📦'}
          </div>
          <div className="mat-import-preview-info">
            <div className="mat-import-preview-cod">{it.id}</div>
            <div className="mat-import-preview-nome">{it.nome}</div>
          </div>
          <span className={`mat-import-preview-status${existe ? ' existente' : ''}`}>
            {existe ? 'já existe' : 'novo'}
          </span>
        </div>
      )
    })
  }

  return (
    <div className="mat-import-overlay" onClick={(e) => { if (e.target === e.currentTarget && !importando) onFechar() }}>
      <div className="mat-import-modal">
        <div className="mat-import-head">
          <h3>📥 Importar do Excel</h3>
          <button onClick={onFechar} disabled={importando} aria-label="Fechar">✕</button>
        </div>

        <div className="mat-import-body">
          {!resultado && !analisando && (
            <>
              <div className="mat-import-info">
                Selecione a planilha <strong>Controle Patrimonial</strong> (.xlsx).
                <br />
                Cada linha da primeira aba vira um material; as fotos da aba <strong>“Fotos”</strong> são associadas pelo número do patrimônio.
              </div>
              <label className="mat-import-drop">
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) selecionarArquivo(f)
                  }}
                />
                <div className="mat-import-drop-icon">📊</div>
                <div className="mat-import-drop-text">Clique para escolher um arquivo</div>
                <div className="mat-import-drop-sub">apenas arquivos .xlsx</div>
              </label>
            </>
          )}

          {analisando && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#1a4b8c' }}>
              ⏳ Analisando planilha e extraindo fotos…
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.4rem' }}>
                Pode demorar alguns segundos para arquivos grandes.
              </div>
            </div>
          )}

          {erro && <div className="mat-import-erro">{erro}</div>}

          {resultado && !importando && (
            <>
              <div className="mat-import-resumo">
                <h4>📋 Resumo da planilha</h4>
                <div className="mat-import-resumo-grid">
                  <div><strong>{resultado.itens.length}</strong>itens encontrados</div>
                  <div><strong>{comFotoCount}</strong>com foto</div>
                  <div><strong>{novosCount}</strong>novos</div>
                  <div><strong>{existentesCount}</strong>já cadastrados</div>
                </div>
              </div>

              {existentesCount > 0 && (
                <label className="mat-import-checkbox">
                  <input
                    type="checkbox"
                    checked={atualizarExistentes}
                    onChange={(e) => setAtualizarExistentes(e.target.checked)}
                  />
                  Atualizar nome / descrição / foto dos {existentesCount} itens já cadastrados
                </label>
              )}

              <div className="mat-import-preview">
                {listarItens(resultado.itens)}
              </div>
            </>
          )}

          {importando && (
            <div className="mat-import-progresso">
              <div className="mat-import-progresso-text">
                Importando {progressoAtual} de {resultado!.itens.length}…
              </div>
              <div className="mat-import-progresso-barra">
                <div
                  className="mat-import-progresso-fill"
                  style={{ width: `${(progressoAtual / resultado!.itens.length) * 100}%` }}
                />
              </div>
              <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.3rem' }}>
                {progressoLabel}
              </div>
            </div>
          )}
        </div>

        <div className="mat-import-foot">
          <button className="mat-btn-cancelar" onClick={onFechar} disabled={importando}>
            {resultado ? 'Cancelar' : 'Fechar'}
          </button>
          {resultado && (
            <button
              className="mat-btn-confirmar"
              onClick={confirmarImport}
              disabled={importando || (!atualizarExistentes && novosCount === 0)}
            >
              {importando ? 'Importando…' : `Importar ${atualizarExistentes ? resultado.itens.length : novosCount} item(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── FORM CAMPO ─────────────────────────────────────────────────────────────
function FormCampo({
  materiais,
  onCancelar,
  onSalvo,
}: {
  materiais: Material[]
  onCancelar: () => void
  onSalvo: () => void
}) {
  const agente = getAgenteLogado() || ''
  const [materialId, setMaterialId] = useState('')
  const [materialNome, setMaterialNome] = useState('')
  const [quantidade, setQuantidade] = useState(1)
  const [prazoCampoDias, setPrazoCampoDias] = useState<number | ''>('' )
  const [fotos, setFotos] = useState<string[]>([])
  const [latitude, setLatitude] = useState<number | null>(null)
  const [longitude, setLongitude] = useState<number | null>(null)
  const [obtendoGps, setObtendoGps] = useState(false)
  const [erroGps, setErroGps] = useState('')
  const [rua, setRua] = useState('')
  const [numero, setNumero] = useState('')
  const [bairro, setBairro] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const fotoInputRef = useRef<HTMLInputElement>(null)

  function handleMaterial(id: string) {
    setMaterialId(id)
    const m = materiais.find(x => x.id === id)
    setMaterialNome(m?.nome ?? '')
    setQuantidade(1)
  }

  async function adicionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    for (const file of files) {
      try {
        const raw = await lerArquivoComoDataUrl(file)
        const redim = await redimensionarImagem(raw, 1200, 1200)
        setFotos(prev => [...prev, redim])
      } catch { /* ignora */ }
    }
    e.target.value = ''
  }

  function obterGps() {
    setObtendoGps(true)
    setErroGps('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude)
        setLongitude(pos.coords.longitude)
        setObtendoGps(false)
      },
      (err) => {
        setErroGps('Não foi possível obter o GPS: ' + err.message)
        setObtendoGps(false)
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  async function salvar() {
    if (!materialId) { setErro('Selecione o material.'); return }
    setSalvando(true); setErro('')
    try {
      const dataRecolha = new Date()
      dataRecolha.setDate(dataRecolha.getDate() + Math.max(1, typeof prazoCampoDias === 'number' ? prazoCampoDias : 1))
      const resp = await fetch('/api/equipamentos-campo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material_id: materialId,
          material_nome: materialNome,
          fotos: fotos.length > 0 ? fotos : null,
          latitude,
          longitude,
          rua: rua.trim() || null,
          numero: numero.trim() || null,
          bairro: bairro.trim() || null,
          observacao: observacao.trim() || null,
          quantidade: Math.max(1, quantidade),
          prazo_dias: typeof prazoCampoDias === 'number' ? Math.max(1, prazoCampoDias) : null,
          data_recolha_prevista: dataRecolha.toISOString().slice(0, 10),
          status: 'ativo',
          agente,
        }),
      })
      if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.error || `HTTP ${resp.status}`) }
      onSalvo()
    } catch (e: any) {
      setErro('Erro ao salvar: ' + (e?.message ?? 'tente novamente'))
    }
    setSalvando(false)
  }

  return (
    <div className="mat-tela">
      <div className="mat-subheader">
        <button className="btn-voltar" onClick={onCancelar}>‹</button>
        <h2>🚧 Registrar em Campo</h2>
        <span style={{ width: '2rem' }} />
      </div>

      <div className="mat-form">
        <div className="campo">
          <label className="campo-label">Material *</label>
          <select className="campo-select" value={materialId} onChange={(e) => { handleMaterial(e.target.value); setErro('') }}>
            <option value="">— Escolha o material —</option>
            {materiais.map(m => (
              <option key={m.id} value={m.id}>{m.id} — {m.nome}</option>
            ))}
          </select>
        </div>

        {materialId && (
          <div className="campo">
            <label className="campo-label">Quantidade em campo *</label>
            <input
              className="campo-input"
              type="number"
              min={1}
              max={materiais.find(m => m.id === materialId)?.quantidade ?? 9999}
              value={quantidade}
              onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
            />
            <span className="campo-label-sub">Quantas unidades estão sendo enviadas ao campo.</span>
          </div>
        )}

        <div className="campo">
          <label className="campo-label">Prazo em campo (dias) *</label>
          <input
            className="campo-input"
            type="number"
            min={1}
            max={365}
            value={prazoCampoDias}
            onChange={(e) => { const v = e.target.value; setPrazoCampoDias(v === '' ? '' : Math.max(1, parseInt(v) || 1)) }}
          />
          {typeof prazoCampoDias === 'number' && prazoCampoDias >= 1 && (
            <span className="campo-label-sub">
              Recolha prevista: {(() => {
                const d = new Date()
                d.setDate(d.getDate() + prazoCampoDias)
                return d.toLocaleDateString('pt-BR')
              })()}
            </span>
          )}
        </div>

        <div className="campo">
          <label className="campo-label">Fotos</label>
          <div className="fotos-grid">
            {fotos.map((f, i) => (
              <div key={i} className="foto-thumb-wrap">
                <img src={f} alt="" className="foto-thumb" />
                <button className="foto-remover" onClick={() => setFotos(prev => prev.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button className="foto-add-btn" onClick={() => fotoInputRef.current?.click()}>
              <span>📷</span>
              <span>Adicionar foto</span>
            </button>
          </div>
          <input ref={fotoInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={adicionarFoto} />
        </div>

        <div className="campo">
          <label className="campo-label">Localização GPS</label>
          {latitude && longitude ? (
            <div className="campo-gps-ok">
              <span>📡 GPS obtido: {latitude.toFixed(6)}, {longitude.toFixed(6)}</span>
              <button className="mat-btn-acao" onClick={() => { setLatitude(null); setLongitude(null) }}>Limpar</button>
            </div>
          ) : (
            <button className="mat-btn-acao mat-btn-acao-gps" onClick={obterGps} disabled={obtendoGps}>
              {obtendoGps ? '⏳ Obtendo GPS...' : '📡 Obter localização GPS'}
            </button>
          )}
          {erroGps && <div className="campo-erro">{erroGps}</div>}
        </div>

        <div className="campo">
          <label className="campo-label">Endereço</label>
          <input className="campo-input" type="text" placeholder="Rua / Av." value={rua} onChange={(e) => setRua(e.target.value)} />
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
            <input className="campo-input" style={{ flex: '0 0 5rem' }} type="text" placeholder="Nº" value={numero} onChange={(e) => setNumero(e.target.value)} />
            <input className="campo-input" style={{ flex: 1 }} type="text" placeholder="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
          </div>
        </div>

        <div className="campo">
          <label className="campo-label">Observação</label>
          <textarea className="campo-textarea" placeholder="Descreva o local, condição do equipamento, etc." value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </div>

        {erro && <div className="mat-form-erro">{erro}</div>}

        <button className="mat-btn-confirmar" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando…' : '✅ Registrar em Campo'}
        </button>
      </div>
    </div>
  )
}

// ─── DETALHE CAMPO ───────────────────────────────────────────────────────────
function DetalheCampo({
  item,
  onVoltar,
  onIrParaMapa,
  onDevolver,
  onExcluir,
}: {
  item: EquipamentoCampo
  onVoltar: () => void
  onIrParaMapa?: (lat: number, lng: number) => void
  onDevolver: () => void
  onExcluir: () => void
}) {
  const [fotoIdx, setFotoIdx] = useState(0)
  const fotos = item.fotos ?? []

  return (
    <div className="mat-tela">
      <div className="mat-subheader">
        <button className="btn-voltar" onClick={onVoltar}>‹</button>
        <h2>🚧 Detalhe em Campo</h2>
        <button className="mat-btn-excluir" onClick={onExcluir} title="Excluir registro">🗑️</button>
      </div>

      <div className="mat-detalhe">
        {fotos.length > 0 && (
          <div className="mat-campo-fotos-wrap">
            <img src={fotos[fotoIdx]} alt="" className="mat-campo-foto-principal" />
            {fotos.length > 1 && (
              <div className="mat-campo-fotos-miniaturas">
                {fotos.map((f, i) => (
                  <button key={i} className={`mat-campo-miniatura ${fotoIdx === i ? 'ativa' : ''}`} onClick={() => setFotoIdx(i)}>
                    <img src={f} alt="" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mat-detalhe-bloco">
          <span className="mat-detalhe-label">Material</span>
          <span className="mat-detalhe-valor">{item.material_id} — {item.material_nome}</span>
        </div>

        <div className={`mat-detalhe-status ${item.status === 'ativo' ? 'mat-status-emprestado' : 'mat-status-disponivel'}`}>
          {item.status === 'ativo' ? <strong>🔴 Em campo (Ativo)</strong> : <strong>✅ Devolvido</strong>}
        </div>

        {(item.rua || item.bairro) && (
          <div className="mat-detalhe-bloco">
            <span className="mat-detalhe-label">Endereço</span>
            <span className="mat-detalhe-valor">{[item.rua, item.numero, item.bairro].filter(Boolean).join(', ')}</span>
          </div>
        )}

        {item.latitude && item.longitude && (
          <div className="mat-detalhe-bloco">
            <span className="mat-detalhe-label">GPS</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginTop: '0.2rem' }}>
              <span className="mat-detalhe-valor" style={{ flex: 1 }}>
                {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
              </span>
              {onIrParaMapa && (
                <button className="mat-btn-acao mat-btn-acao-gps" onClick={() => onIrParaMapa(item.latitude!, item.longitude!)}>
                  🗺️ Ver no Mapa
                </button>
              )}
            </div>
          </div>
        )}

        {item.observacao && (
          <div className="mat-detalhe-bloco">
            <span className="mat-detalhe-label">Observação</span>
            <span className="mat-detalhe-valor">{item.observacao}</span>
          </div>
        )}

        {item.agente && (
          <div className="mat-detalhe-bloco">
            <span className="mat-detalhe-label">Registrado por</span>
            <span className="mat-detalhe-valor">{item.agente}</span>
          </div>
        )}

        <div className="mat-detalhe-bloco">
          <span className="mat-detalhe-label">Data</span>
          <span className="mat-detalhe-valor">{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
        </div>

        {item.status === 'ativo' && (
          <button className="mat-btn-confirmar" style={{ marginTop: '0.5rem' }} onClick={onDevolver}>
            ✅ Marcar como Devolvido
          </button>
        )}
      </div>
    </div>
  )
}

