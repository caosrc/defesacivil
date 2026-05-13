import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getAgenteLogado } from './Login'
import { AGENTES } from '../types'
import './Planejamento.css'

const PlanoEmergencia = lazy(() => import('./PlanoEmergencia'))

// Corrige ícones do Leaflet com Vite
delete (L.Icon.Default.prototype as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ── Tipos ──────────────────────────────────────────────────────────────
type TipoPlano = 'evento' | 'operacao' | 'simulado' | 'emergencia'
type StatusPlano = 'planejado' | 'em_curso' | 'concluido' | 'cancelado'

interface MaterialPlano {
  id: string
  nome: string
  quantidade: number
  unidade: string
}

interface ItemMapa {
  id: string
  tipo: string
  emoji: string
  lat: number
  lng: number
  obs?: string
}

interface Plano {
  id: string
  tipo: TipoPlano
  nome: string
  descricao: string
  local: string
  dataInicio: string
  dataFim: string
  horario: string
  publicoEstimado: string
  status: StatusPlano
  equipe: string[]
  materiais: MaterialPlano[]
  itensMapa: ItemMapa[]
  lat: number | null
  lng: number | null
  observacoes: string
  risco: 'baixo' | 'medio' | 'alto'
  criadoPor: string
  criadoEm: string
}

// ── Constantes ──────────────────────────────────────────────────────────
const STORAGE_KEY = 'defesacivil-planejamentos-v1'

const TIPOS_CONFIG: Record<TipoPlano, { label: string; emoji: string; cor: string; descricao: string }> = {
  evento:     { label: 'Eventos',    emoji: '🎪', cor: '#1a6bbf', descricao: 'Festas, shows, feiras e grandes concentrações' },
  operacao:   { label: 'Operações',  emoji: '🚨', cor: '#dc2626', descricao: 'Resposta a enchentes, deslizamentos, incêndios' },
  simulado:   { label: 'Simulados',  emoji: '🧪', cor: '#7c3aed', descricao: 'Exercícios e treinamentos de emergência' },
  emergencia: { label: 'Emergencial', emoji: '⚠️', cor: '#ea580c', descricao: 'Plano de emergência municipal' },
}

const STATUS_CONFIG: Record<StatusPlano, { label: string; emoji: string; classe: string }> = {
  planejado: { label: 'Planejado',  emoji: '📋', classe: 'planejado' },
  em_curso:  { label: 'Em curso',   emoji: '🟢', classe: 'em_curso'  },
  concluido: { label: 'Concluído',  emoji: '✅', classe: 'concluido' },
  cancelado: { label: 'Cancelado',  emoji: '❌', classe: 'cancelado' },
}

const ITENS_POSICIONAR = [
  { tipo: 'tenda',       emoji: '⛺', label: 'Tenda' },
  { tipo: 'barraca',     emoji: '🏕️', label: 'Barraca' },
  { tipo: 'banheiro',    emoji: '🚻', label: 'Banheiro' },
  { tipo: 'agua',        emoji: '💧', label: 'Água' },
  { tipo: 'gerador',     emoji: '⚡', label: 'Gerador' },
  { tipo: 'pm',          emoji: '🚓', label: 'PM' },
  { tipo: 'guarda',      emoji: '🚔', label: 'G.M.' },
  { tipo: 'bombeiro',    emoji: '🚒', label: 'Bombeiro' },
  { tipo: 'samu',        emoji: '🚑', label: 'SAMU' },
  { tipo: 'interdicao',  emoji: '🚧', label: 'Interdição' },
  { tipo: 'cone',        emoji: '🟧', label: 'Cone' },
  { tipo: 'info',        emoji: '📢', label: 'Info' },
  { tipo: 'alimentacao', emoji: '🍞', label: 'Alimentação' },
  { tipo: 'medico',      emoji: '🏥', label: 'Apoio Méd.' },
  { tipo: 'extintor',    emoji: '🧯', label: 'Extintor' },
  { tipo: 'abrigo',      emoji: '🏠', label: 'Abrigo' },
]

const RISCO_CONFIG = {
  baixo: { label: 'Baixo', cor: '#16a34a', bg: '#dcfce7' },
  medio: { label: 'Médio', cor: '#d97706', bg: '#fef3c7' },
  alto:  { label: 'Alto',  cor: '#dc2626', bg: '#fee2e2' },
}

const OURO_BRANCO_CENTER: [number, number] = [-20.5195, -43.6983]

// ── Persistência ────────────────────────────────────────────────────────
function carregarPlanos(): Plano[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Plano[]
  } catch { return [] }
}

function salvarPlanos(planos: Plano[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(planos)) } catch { /* ignore */ }
}

function gerarId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function formatarData(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function pluralMat(n: number): string {
  return n === 1 ? '1 material' : `${n} materiais`
}

// ── Ícone personalizado para itens no mapa ──────────────────────────────
function criarIconeEmoji(emoji: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="font-size:1.6rem;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4))">${emoji}</div>`,
    className: '',
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
  })
}

function criarIconePrincipal(): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:28px;height:28px;background:#1a4b8c;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
    className: '',
    iconAnchor: [14, 14],
    popupAnchor: [0, -18],
  })
}

// ── Componente de clique no mapa ────────────────────────────────────────
function MapClickHandler({ onClique, ativo }: { onClique: (lat: number, lng: number) => void; ativo: boolean }) {
  useMapEvents({
    click(e) {
      if (ativo) onClique(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// ── Mapa no formulário (picker de localização) ──────────────────────────
function MapaPicker({
  lat, lng, onChange,
}: {
  lat: number | null
  lng: number | null
  onChange: (lat: number, lng: number) => void
}) {
  const [modoClick, setModoClick] = useState(false)
  const centro: [number, number] = lat && lng ? [lat, lng] : OURO_BRANCO_CENTER

  return (
    <div className="plan-mapa-container">
      {modoClick && (
        <div className="plan-mapa-picker-info">
          📍 Toque no mapa para definir o local
          <button onClick={() => setModoClick(false)}>Cancelar</button>
        </div>
      )}
      {!modoClick && (
        <div className="plan-mapa-toolbar" style={{ pointerEvents: 'auto' }}>
          <button
            style={{ background: '#1a4b8c', color: 'white', border: 'none', borderRadius: 8, padding: '0.3rem 0.8rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
            onClick={() => setModoClick(true)}
          >
            {lat && lng ? '✏️ Mover local' : '📍 Definir local no mapa'}
          </button>
        </div>
      )}
      <MapContainer
        center={centro}
        zoom={lat && lng ? 15 : 13}
        style={{ height: 220, width: '100%', borderRadius: 12 }}
        zoomControl={true}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClickHandler ativo={modoClick} onClique={(la, ln) => { onChange(la, ln); setModoClick(false) }} />
        {lat && lng && (
          <Marker position={[lat, lng]} icon={criarIconePrincipal()}>
            <Popup>Local do planejamento</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  )
}

// ── Mapa do detalhe (com itens posicionáveis) ───────────────────────────
function MapaDetalhe({
  plano,
  onAdicionarItem,
  onRemoverItem,
}: {
  plano: Plano
  onAdicionarItem: (item: ItemMapa) => void
  onRemoverItem: (id: string) => void
}) {
  const [itemSelecionado, setItemSelecionado] = useState<string | null>(null)
  const centro: [number, number] = plano.lat && plano.lng ? [plano.lat, plano.lng] : OURO_BRANCO_CENTER

  function handleCliqueMapa(lat: number, lng: number) {
    if (!itemSelecionado) return
    const cfg = ITENS_POSICIONAR.find(i => i.tipo === itemSelecionado)
    if (!cfg) return
    onAdicionarItem({
      id: gerarId(),
      tipo: cfg.tipo,
      emoji: cfg.emoji,
      lat,
      lng,
      obs: cfg.label,
    })
    setItemSelecionado(null)
  }

  return (
    <div className="plan-mapa-container" style={{ borderRadius: 12, overflow: 'hidden' }}>
      {itemSelecionado && (
        <div className="plan-mapa-picker-info">
          {ITENS_POSICIONAR.find(i => i.tipo === itemSelecionado)?.emoji} Toque no mapa para posicionar
          <button onClick={() => setItemSelecionado(null)}>Cancelar</button>
        </div>
      )}
      <MapContainer
        center={centro}
        zoom={plano.lat && plano.lng ? 15 : 13}
        style={{ height: 300, width: '100%' }}
        zoomControl={true}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClickHandler ativo={!!itemSelecionado} onClique={handleCliqueMapa} />
        {plano.lat && plano.lng && (
          <Marker position={[plano.lat, plano.lng]} icon={criarIconePrincipal()}>
            <Popup><strong>{plano.nome}</strong><br />Local principal</Popup>
          </Marker>
        )}
        {plano.itensMapa.map(item => (
          <Marker key={item.id} position={[item.lat, item.lng]} icon={criarIconeEmoji(item.emoji)}>
            <Popup>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '1.5rem' }}>{item.emoji}</span>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginTop: 4 }}>{item.obs || item.tipo}</div>
                <button
                  onClick={() => onRemoverItem(item.id)}
                  style={{ marginTop: 6, background: '#fee2e2', border: 'none', borderRadius: 6, padding: '0.2rem 0.7rem', color: '#b91c1c', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
                >
                  Remover
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <div style={{ background: '#f8fafc', borderTop: '1px solid #e5e7eb', padding: '0.5rem 0.85rem' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1a4b8c', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          🗺️ Posicionar no mapa
        </div>
        <div className="plan-itens-grid">
          {ITENS_POSICIONAR.map(item => (
            <button
              key={item.tipo}
              className={`plan-item-btn ${itemSelecionado === item.tipo ? 'ativo' : ''}`}
              onClick={() => setItemSelecionado(itemSelecionado === item.tipo ? null : item.tipo)}
            >
              <span className="pi-emoji">{item.emoji}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Formulário de criação/edição ────────────────────────────────────────
function FormularioPlano({
  tipo,
  planoEditando,
  onSalvar,
  onFechar,
}: {
  tipo: TipoPlano
  planoEditando?: Plano | null
  onSalvar: (plano: Plano) => void
  onFechar: () => void
}) {
  const agente = getAgenteLogado()
  const cfg = TIPOS_CONFIG[tipo]

  const [nome, setNome] = useState(planoEditando?.nome ?? '')
  const [descricao, setDescricao] = useState(planoEditando?.descricao ?? '')
  const [local, setLocal] = useState(planoEditando?.local ?? '')
  const [dataInicio, setDataInicio] = useState(planoEditando?.dataInicio ?? '')
  const [dataFim, setDataFim] = useState(planoEditando?.dataFim ?? '')
  const [horario, setHorario] = useState(planoEditando?.horario ?? '')
  const [publicoEstimado, setPublicoEstimado] = useState(planoEditando?.publicoEstimado ?? '')
  const [risco, setRisco] = useState<'baixo' | 'medio' | 'alto'>(planoEditando?.risco ?? 'baixo')
  const [equipe, setEquipe] = useState<string[]>(planoEditando?.equipe ?? [])
  const [materiais, setMateriais] = useState<MaterialPlano[]>(planoEditando?.materiais ?? [])
  const [observacoes, setObservacoes] = useState(planoEditando?.observacoes ?? '')
  const [lat, setLat] = useState<number | null>(planoEditando?.lat ?? null)
  const [lng, setLng] = useState<number | null>(planoEditando?.lng ?? null)

  const [novoMat, setNovoMat] = useState('')
  const [novoMatQtd, setNovoMatQtd] = useState('1')
  const [novoMatUnd, setNovoMatUnd] = useState('un')

  function toggleEquipe(nome: string) {
    setEquipe(prev => prev.includes(nome) ? prev.filter(n => n !== nome) : [...prev, nome])
  }

  function adicionarMaterial() {
    if (!novoMat.trim()) return
    setMateriais(prev => [...prev, {
      id: gerarId(),
      nome: novoMat.trim(),
      quantidade: Math.max(1, parseInt(novoMatQtd) || 1),
      unidade: novoMatUnd || 'un',
    }])
    setNovoMat('')
    setNovoMatQtd('1')
  }

  function removerMaterial(id: string) {
    setMateriais(prev => prev.filter(m => m.id !== id))
  }

  function salvar() {
    if (!nome.trim()) return
    const plano: Plano = {
      id: planoEditando?.id ?? gerarId(),
      tipo,
      nome: nome.trim(),
      descricao: descricao.trim(),
      local: local.trim(),
      dataInicio,
      dataFim,
      horario,
      publicoEstimado,
      status: planoEditando?.status ?? 'planejado',
      equipe,
      materiais,
      itensMapa: planoEditando?.itensMapa ?? [],
      lat,
      lng,
      observacoes: observacoes.trim(),
      risco,
      criadoPor: planoEditando?.criadoPor ?? agente,
      criadoEm: planoEditando?.criadoEm ?? new Date().toISOString(),
    }
    onSalvar(plano)
  }

  return (
    <div className="plan-modal-overlay" onClick={e => e.target === e.currentTarget && onFechar()}>
      <div className="plan-modal">
        <div className="plan-modal-header">
          <span className="plan-modal-titulo">
            {cfg.emoji} {planoEditando ? 'Editar' : 'Novo'} {cfg.label.slice(0, -1).replace(/s$/, '')}
          </span>
          <button className="plan-modal-fechar" onClick={onFechar}>✕</button>
        </div>

        <div className="plan-modal-body">
          <div className="plan-form-secao">📋 Informações gerais</div>

          <div className="plan-form-group">
            <label className="plan-form-label">Nome *</label>
            <input
              className="plan-form-input"
              placeholder={`Ex: ${tipo === 'evento' ? 'Festa Junina 2026' : tipo === 'operacao' ? 'Operação Chuvas Dezembro' : 'Simulado Barragem 2026'}`}
              value={nome}
              onChange={e => setNome(e.target.value)}
            />
          </div>

          <div className="plan-form-group">
            <label className="plan-form-label">Descrição</label>
            <textarea
              className="plan-form-textarea"
              placeholder="Descreva o objetivo e contexto..."
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              rows={2}
            />
          </div>

          <div className="plan-form-group">
            <label className="plan-form-label">Local</label>
            <input
              className="plan-form-input"
              placeholder="Ex: Praça Central, Ginásio Municipal..."
              value={local}
              onChange={e => setLocal(e.target.value)}
            />
          </div>

          <div className="plan-form-row">
            <div className="plan-form-group">
              <label className="plan-form-label">Data início</label>
              <input className="plan-form-input" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div className="plan-form-group">
              <label className="plan-form-label">Data fim</label>
              <input className="plan-form-input" type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
          </div>

          <div className="plan-form-row">
            <div className="plan-form-group">
              <label className="plan-form-label">Horário</label>
              <input className="plan-form-input" type="time" value={horario} onChange={e => setHorario(e.target.value)} />
            </div>
            {tipo === 'evento' && (
              <div className="plan-form-group">
                <label className="plan-form-label">Público estimado</label>
                <input className="plan-form-input" placeholder="Ex: 5.000" value={publicoEstimado} onChange={e => setPublicoEstimado(e.target.value)} />
              </div>
            )}
          </div>

          <div className="plan-form-group">
            <label className="plan-form-label">Nível de risco</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {(['baixo', 'medio', 'alto'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRisco(r)}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    border: `2px solid ${risco === r ? RISCO_CONFIG[r].cor : '#e5e7eb'}`,
                    borderRadius: 8,
                    background: risco === r ? RISCO_CONFIG[r].bg : '#f9fafb',
                    color: risco === r ? RISCO_CONFIG[r].cor : '#6b7280',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  {RISCO_CONFIG[r].label}
                </button>
              ))}
            </div>
          </div>

          <div className="plan-form-secao">📍 Localização no mapa</div>
          <MapaPicker lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln) }} />
          {lat && lng && (
            <div style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center', marginTop: -4 }}>
              📍 {lat.toFixed(5)}, {lng.toFixed(5)}
              <button style={{ marginLeft: 8, background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer' }} onClick={() => { setLat(null); setLng(null) }}>Remover</button>
            </div>
          )}

          <div className="plan-form-secao">👥 Equipe</div>
          <div className="plan-equipe-grid">
            {AGENTES.map(ag => (
              <button
                key={ag}
                type="button"
                className={`plan-equipe-btn ${equipe.includes(ag) ? 'selecionado' : ''}`}
                onClick={() => toggleEquipe(ag)}
              >
                {equipe.includes(ag) ? '✓ ' : ''}{ag}
              </button>
            ))}
          </div>

          <div className="plan-form-secao">📦 Materiais e recursos</div>
          {materiais.length > 0 && (
            <div className="plan-mat-lista">
              {materiais.map(m => (
                <div key={m.id} className="plan-mat-item">
                  <span className="plan-mat-item-nome">{m.nome}</span>
                  <span className="plan-mat-item-qtd">{m.quantidade} {m.unidade}</span>
                  <button className="plan-mat-item-del" onClick={() => removerMaterial(m.id)}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div className="plan-mat-adicionar">
            <input
              placeholder="Nome do material..."
              value={novoMat}
              onChange={e => setNovoMat(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarMaterial() } }}
            />
            <input
              className="qtd"
              type="number"
              min={1}
              placeholder="Qtd"
              value={novoMatQtd}
              onChange={e => setNovoMatQtd(e.target.value)}
            />
            <select
              style={{ width: 60, padding: '0.55rem 0.3rem', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: '0.82rem', background: '#f9fafb' }}
              value={novoMatUnd}
              onChange={e => setNovoMatUnd(e.target.value)}
            >
              <option value="un">un</option>
              <option value="kit">kit</option>
              <option value="cx">cx</option>
              <option value="rolo">rolo</option>
              <option value="lt">lt</option>
            </select>
            <button className="plan-btn-add" onClick={adicionarMaterial}>+ Add</button>
          </div>

          <div className="plan-form-secao">📝 Observações</div>
          <div className="plan-form-group">
            <textarea
              className="plan-form-textarea"
              placeholder="Observações gerais, pontos de atenção, contatos importantes..."
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="plan-modal-footer">
          <button className="plan-btn-cancelar" onClick={onFechar}>Cancelar</button>
          <button className="plan-btn-salvar" onClick={salvar} disabled={!nome.trim()}>
            💾 Salvar planejamento
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tela de detalhe do planejamento ────────────────────────────────────
function DetalheP({
  plano,
  onVoltar,
  onAtualizar,
  onDeletar,
}: {
  plano: Plano
  onVoltar: () => void
  onAtualizar: (p: Plano) => void
  onDeletar: (id: string) => void
}) {
  const cfg = TIPOS_CONFIG[plano.tipo]
  const [editando, setEditando] = useState(false)
  const [planoLocal, setPlanoLocal] = useState(plano)

  function mudarStatus(status: StatusPlano) {
    const atualizado = { ...planoLocal, status }
    setPlanoLocal(atualizado)
    onAtualizar(atualizado)
  }

  function adicionarItem(item: ItemMapa) {
    const atualizado = { ...planoLocal, itensMapa: [...planoLocal.itensMapa, item] }
    setPlanoLocal(atualizado)
    onAtualizar(atualizado)
  }

  function removerItem(id: string) {
    const atualizado = { ...planoLocal, itensMapa: planoLocal.itensMapa.filter(i => i.id !== id) }
    setPlanoLocal(atualizado)
    onAtualizar(atualizado)
  }

  function confirmarDeletar() {
    if (window.confirm(`Excluir "${planoLocal.nome}"? Esta ação não pode ser desfeita.`)) {
      onDeletar(planoLocal.id)
    }
  }

  const riscoCfg = RISCO_CONFIG[planoLocal.risco]

  return (
    <div className="plan-detalhe-overlay">
      <div className="plan-detalhe-header">
        <button className="plan-detalhe-voltar" onClick={onVoltar}>‹</button>
        <div className="plan-detalhe-titulo">
          <strong>{cfg.emoji} {planoLocal.nome}</strong>
          <span>{cfg.label}</span>
        </div>
        <div className="plan-detalhe-acoes">
          <button className="plan-detalhe-btn-acao" onClick={() => setEditando(true)} title="Editar">✏️</button>
        </div>
      </div>

      <div className="plan-detalhe-body">
        {/* Status */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {(Object.keys(STATUS_CONFIG) as StatusPlano[]).map(s => {
            const sc = STATUS_CONFIG[s]
            return (
              <button
                key={s}
                className={`plan-status-pill ${sc.classe} ${planoLocal.status === s ? 'ativo-pill' : ''}`}
                onClick={() => mudarStatus(s)}
              >
                {sc.emoji} {sc.label}
              </button>
            )
          })}
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', fontWeight: 700, padding: '0.3rem 0.7rem', borderRadius: 20, background: riscoCfg.bg, color: riscoCfg.cor }}>
            ⚠️ Risco {riscoCfg.label}
          </span>
        </div>

        {/* Informações */}
        <div className="plan-detalhe-card">
          <div className="plan-detalhe-card-header">📋 Informações</div>
          <div className="plan-detalhe-card-body">
            {planoLocal.local && (
              <div className="plan-detalhe-info-row">
                <span className="plan-detalhe-info-label">📍 Local</span>
                <span className="plan-detalhe-info-val">{planoLocal.local}</span>
              </div>
            )}
            {planoLocal.dataInicio && (
              <div className="plan-detalhe-info-row">
                <span className="plan-detalhe-info-label">📅 Data</span>
                <span className="plan-detalhe-info-val">
                  {formatarData(planoLocal.dataInicio)}
                  {planoLocal.dataFim && planoLocal.dataFim !== planoLocal.dataInicio && ` → ${formatarData(planoLocal.dataFim)}`}
                  {planoLocal.horario && ` às ${planoLocal.horario}`}
                </span>
              </div>
            )}
            {planoLocal.publicoEstimado && (
              <div className="plan-detalhe-info-row">
                <span className="plan-detalhe-info-label">👥 Público</span>
                <span className="plan-detalhe-info-val">{planoLocal.publicoEstimado} pessoas</span>
              </div>
            )}
            {planoLocal.descricao && (
              <div className="plan-detalhe-info-row">
                <span className="plan-detalhe-info-label">📝 Desc.</span>
                <span className="plan-detalhe-info-val">{planoLocal.descricao}</span>
              </div>
            )}
            <div className="plan-detalhe-info-row">
              <span className="plan-detalhe-info-label">👤 Criado</span>
              <span className="plan-detalhe-info-val">{planoLocal.criadoPor} · {new Date(planoLocal.criadoEm).toLocaleDateString('pt-BR')}</span>
            </div>
          </div>
        </div>

        {/* Mapa tático */}
        <div className="plan-detalhe-card">
          <div className="plan-detalhe-card-header">
            🗺️ Mapa tático
            {planoLocal.itensMapa.length > 0 && (
              <span style={{ marginLeft: 'auto', fontWeight: 600, fontSize: '0.72rem', color: '#6b7280' }}>
                {planoLocal.itensMapa.length} {planoLocal.itensMapa.length === 1 ? 'item' : 'itens'}
              </span>
            )}
          </div>
          <MapaDetalhe plano={planoLocal} onAdicionarItem={adicionarItem} onRemoverItem={removerItem} />
        </div>

        {/* Equipe */}
        {planoLocal.equipe.length > 0 && (
          <div className="plan-detalhe-card">
            <div className="plan-detalhe-card-header">👥 Equipe ({planoLocal.equipe.length} agentes)</div>
            <div className="plan-equipe-chips">
              {planoLocal.equipe.map(ag => (
                <span key={ag} className="plan-equipe-chip">{ag}</span>
              ))}
            </div>
          </div>
        )}

        {/* Materiais */}
        {planoLocal.materiais.length > 0 && (
          <div className="plan-detalhe-card">
            <div className="plan-detalhe-card-header">📦 Materiais ({pluralMat(planoLocal.materiais.length)})</div>
            <div className="plan-mat-detalhe">
              {planoLocal.materiais.map(m => (
                <div key={m.id} className="plan-mat-detalhe-item">
                  <span className="plan-mat-detalhe-nome">{m.nome}</span>
                  <span className="plan-mat-detalhe-qtd">{m.quantidade} {m.unidade}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Observações */}
        {planoLocal.observacoes && (
          <div className="plan-detalhe-card">
            <div className="plan-detalhe-card-header">📝 Observações</div>
            <p className="plan-obs-texto">{planoLocal.observacoes}</p>
          </div>
        )}

        <button className="plan-btn-deletar" onClick={confirmarDeletar}>
          🗑️ Excluir planejamento
        </button>
      </div>

      {editando && (
        <FormularioPlano
          tipo={planoLocal.tipo}
          planoEditando={planoLocal}
          onSalvar={p => { setPlanoLocal(p); onAtualizar(p); setEditando(false) }}
          onFechar={() => setEditando(false)}
        />
      )}
    </div>
  )
}

// ── Lista de planos por tipo ────────────────────────────────────────────
function ListaPlanos({
  tipo,
  planos,
  onNovo,
  onAbrir,
}: {
  tipo: TipoPlano
  planos: Plano[]
  onNovo: () => void
  onAbrir: (p: Plano) => void
}) {
  const cfg = TIPOS_CONFIG[tipo]
  const lista = planos.filter(p => p.tipo === tipo).sort((a, b) => {
    const ordem: Record<StatusPlano, number> = { em_curso: 0, planejado: 1, concluido: 2, cancelado: 3 }
    if (ordem[a.status] !== ordem[b.status]) return ordem[a.status] - ordem[b.status]
    return b.criadoEm.localeCompare(a.criadoEm)
  })

  return (
    <div className="plan-secao">
      <div className="plan-secao-header">
        <div className="plan-secao-titulo">
          <strong>{cfg.emoji} {cfg.label}</strong>
          <span>{cfg.descricao}</span>
        </div>
        <button className="plan-btn-novo" onClick={onNovo}>
          + Novo
        </button>
      </div>

      {lista.length === 0 ? (
        <div className="plan-vazio">
          <div className="plan-vazio-emoji">{cfg.emoji}</div>
          <div className="plan-vazio-texto">Nenhum {cfg.label.slice(0, -1).toLowerCase()} cadastrado ainda</div>
          <button className="plan-btn-criar-vazio" onClick={onNovo}>
            + Criar primeiro planejamento
          </button>
        </div>
      ) : (
        lista.map(p => {
          const sc = STATUS_CONFIG[p.status]
          const rc = RISCO_CONFIG[p.risco]
          const corTipo = cfg.cor
          return (
            <div key={p.id} className="plan-card" onClick={() => onAbrir(p)}>
              <div className="plan-card-topo">
                <div className="plan-card-cor" style={{ background: corTipo }} />
                <div className="plan-card-corpo">
                  <div className="plan-card-linha1">
                    <span className="plan-card-nome">{p.nome}</span>
                    <span className="plan-card-data">{p.dataInicio ? formatarData(p.dataInicio) : '—'}</span>
                  </div>
                  {p.local && (
                    <div className="plan-card-local">📍 {p.local}</div>
                  )}
                  <div className="plan-card-badges">
                    <span className={`plan-badge plan-badge-${sc.classe}`}>
                      {sc.emoji} {sc.label}
                    </span>
                    <span className="plan-badge plan-badge-info" style={{ background: rc.bg, color: rc.cor }}>
                      ⚠️ {rc.label}
                    </span>
                    {p.equipe.length > 0 && (
                      <span className="plan-badge plan-badge-eq">👥 {p.equipe.length}</span>
                    )}
                    {p.materiais.length > 0 && (
                      <span className="plan-badge plan-badge-mat">📦 {p.materiais.length}</span>
                    )}
                    {p.itensMapa.length > 0 && (
                      <span className="plan-badge plan-badge-info">🗺️ {p.itensMapa.length}</span>
                    )}
                  </div>
                </div>
                <div className="plan-card-seta">›</div>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

// ── Componente principal ────────────────────────────────────────────────
export default function Planejamento() {
  const [subAba, setSubAba] = useState<TipoPlano>('evento')
  const [planos, setPlanos] = useState<Plano[]>(() => carregarPlanos())
  const [criando, setCriando] = useState(false)
  const [aberto, setAberto] = useState<Plano | null>(null)

  useEffect(() => { salvarPlanos(planos) }, [planos])

  const salvarPlano = useCallback((plano: Plano) => {
    setPlanos(prev => {
      const existe = prev.findIndex(p => p.id === plano.id)
      if (existe >= 0) {
        const novo = [...prev]
        novo[existe] = plano
        return novo
      }
      return [plano, ...prev]
    })
    setCriando(false)
    setAberto(plano)
  }, [])

  const atualizarPlano = useCallback((plano: Plano) => {
    setPlanos(prev => prev.map(p => p.id === plano.id ? plano : p))
    setAberto(plano)
  }, [])

  const deletarPlano = useCallback((id: string) => {
    setPlanos(prev => prev.filter(p => p.id !== id))
    setAberto(null)
  }, [])

  const totalPorTipo = (t: TipoPlano) => planos.filter(p => p.tipo === t).length

  return (
    <div className="plan-wrap">
      <div className="plan-subtabs">
        {(['evento', 'operacao', 'simulado', 'emergencia'] as TipoPlano[]).map(t => {
          const c = TIPOS_CONFIG[t]
          const total = t !== 'emergencia' ? totalPorTipo(t) : 0
          return (
            <button
              key={t}
              className={`plan-subtab ${subAba === t ? 'ativo' : ''}`}
              onClick={() => setSubAba(t)}
            >
              <span className="st-emoji">{c.emoji}</span>
              {c.label}
              {total > 0 && (
                <span style={{
                  background: subAba === t ? '#1a4b8c' : '#e5e7eb',
                  color: subAba === t ? 'white' : '#6b7280',
                  borderRadius: '10px',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '0 5px',
                  lineHeight: '1.4',
                }}>
                  {total}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {subAba === 'emergencia' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Carregando...</div>}>
            <PlanoEmergencia />
          </Suspense>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <ListaPlanos
            tipo={subAba}
            planos={planos}
            onNovo={() => setCriando(true)}
            onAbrir={p => setAberto(p)}
          />
        </div>
      )}

      {subAba !== 'emergencia' && criando && (
        <FormularioPlano
          tipo={subAba}
          onSalvar={salvarPlano}
          onFechar={() => setCriando(false)}
        />
      )}

      {subAba !== 'emergencia' && aberto && (
        <DetalheP
          plano={aberto}
          onVoltar={() => setAberto(null)}
          onAtualizar={atualizarPlano}
          onDeletar={deletarPlano}
        />
      )}
    </div>
  )
}
