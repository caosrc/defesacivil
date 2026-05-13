import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getAgenteLogado } from './Login'
import { AGENTES } from '../types'

const ORGAOS_EMPENHO: { categoria: string; emoji: string; orgaos: { emoji: string; nome: string }[] }[] = [
  { categoria: 'Segurança Pública', emoji: '🚔', orgaos: [
    { emoji: '🚓', nome: 'Polícia Militar' },
    { emoji: '🚔', nome: 'Polícia Rodoviária' },
    { emoji: '👮', nome: 'Guarda Municipal' },
    { emoji: '🚨', nome: 'Polícia Civil' },
    { emoji: '🛡️', nome: 'Defesa Social' },
    { emoji: '🎖️', nome: 'Exército Brasileiro' },
    { emoji: '🛰️', nome: 'Inteligência/NIA' },
    { emoji: '🐕', nome: 'Canil Operacional' },
    { emoji: '🚁', nome: 'Apoio Aéreo' },
  ]},
  { categoria: 'Resgate e Emergência', emoji: '🚒', orgaos: [
    { emoji: '🚒', nome: 'Corpo de Bombeiros' },
    { emoji: '🚑', nome: 'SAMU' },
    { emoji: '🧯', nome: 'Brigada de Incêndio' },
    { emoji: '⛑️', nome: 'Defesa Civil' },
    { emoji: '🏥', nome: 'Equipe Médica' },
    { emoji: '🩺', nome: 'Vigilância Sanitária' },
    { emoji: '🛟', nome: 'Resgate Aquático' },
  ]},
  { categoria: 'Prefeitura', emoji: '🏛️', orgaos: [
    { emoji: '🏛️', nome: 'Prefeitura Municipal' },
    { emoji: '🚧', nome: 'Secretaria de Obras' },
    { emoji: '🌳', nome: 'Meio Ambiente' },
    { emoji: '🚦', nome: 'Trânsito' },
    { emoji: '💡', nome: 'Iluminação Pública' },
    { emoji: '🚛', nome: 'Limpeza Urbana' },
    { emoji: '🏠', nome: 'Habitação' },
    { emoji: '👨‍👩‍👧', nome: 'Assistência Social' },
    { emoji: '🏫', nome: 'Educação' },
    { emoji: '🩹', nome: 'Secretaria de Saúde' },
  ]},
  { categoria: 'Infraestrutura', emoji: '🏗️', orgaos: [
    { emoji: '💧', nome: 'COPASA' },
    { emoji: '⚡', nome: 'CEMIG' },
    { emoji: '📡', nome: 'Telecomunicações' },
    { emoji: '🛣️', nome: 'DER' },
    { emoji: '🚜', nome: 'Máquinas Pesadas' },
    { emoji: '🏗️', nome: 'Engenharia Municipal' },
    { emoji: '🌉', nome: 'Infraestrutura' },
  ]},
  { categoria: 'Empresas Privadas', emoji: '🏭', orgaos: [
    { emoji: '🏭', nome: 'Empresa Privada' },
    { emoji: '🚛', nome: 'Transportadora' },
    { emoji: '⛏️', nome: 'Mineração' },
    { emoji: '🏗️', nome: 'Construtora' },
    { emoji: '🚜', nome: 'Terraplanagem' },
    { emoji: '🛠️', nome: 'Manutenção Industrial' },
    { emoji: '🔌', nome: 'Energia Privada' },
  ]},
  { categoria: 'Apoio Operacional', emoji: '📦', orgaos: [
    { emoji: '🍞', nome: 'Alimentação' },
    { emoji: '🥤', nome: 'Distribuição Água' },
    { emoji: '⛺', nome: 'Apoio Logístico' },
    { emoji: '📦', nome: 'Almoxarifado' },
    { emoji: '🔋', nome: 'Geradores' },
    { emoji: '📢', nome: 'Comunicação' },
    { emoji: '📻', nome: 'Rádio Operação' },
  ]},
  { categoria: 'Eventos', emoji: '🎪', orgaos: [
    { emoji: '🎪', nome: 'Organização Evento' },
    { emoji: '🎤', nome: 'Produção Evento' },
    { emoji: '🎫', nome: 'Controle Acesso' },
    { emoji: '🧍', nome: 'Segurança Privada' },
    { emoji: '🚧', nome: 'Equipe Montagem' },
    { emoji: '🎵', nome: 'Apoio Técnico' },
  ]},
  { categoria: 'Trânsito e Mobilidade', emoji: '🚦', orgaos: [
    { emoji: '🚦', nome: 'Agentes de Trânsito' },
    { emoji: '🚌', nome: 'Transporte Público' },
    { emoji: '🚕', nome: 'Apoio Mobilidade' },
    { emoji: '🚧', nome: 'Interdição Viária' },
    { emoji: '🛣️', nome: 'Rotas Alternativas' },
  ]},
  { categoria: 'Ambiental', emoji: '🌱', orgaos: [
    { emoji: '🌧️', nome: 'Monitoramento Climático' },
    { emoji: '🌊', nome: 'Recursos Hídricos' },
    { emoji: '⛰️', nome: 'Geologia' },
    { emoji: '🌱', nome: 'Defesa Ambiental' },
    { emoji: '🪨', nome: 'Monitoramento Encostas' },
  ]},
  { categoria: 'Apoio Humanitário', emoji: '🤝', orgaos: [
    { emoji: '🏠', nome: 'Abrigos' },
    { emoji: '🍲', nome: 'Cozinha Solidária' },
    { emoji: '👶', nome: 'Apoio Crianças' },
    { emoji: '🛏️', nome: 'Assistência Humanitária' },
    { emoji: '🧥', nome: 'Distribuição Roupas' },
    { emoji: '🐶', nome: 'Resgate Animal' },
  ]},
  { categoria: 'Comunicação e Tecnologia', emoji: '📡', orgaos: [
    { emoji: '📡', nome: 'Centro Operacional' },
    { emoji: '🖥️', nome: 'Monitoramento' },
    { emoji: '📹', nome: 'Videomonitoramento' },
    { emoji: '🛰️', nome: 'Drone Operacional' },
    { emoji: '📱', nome: 'TI/Comunicação' },
    { emoji: '🔊', nome: 'Carro de Som' },
  ]},
  { categoria: 'Saúde', emoji: '🏥', orgaos: [
    { emoji: '🏥', nome: 'Hospital' },
    { emoji: '🩺', nome: 'UPA' },
    { emoji: '💉', nome: 'Vacinação' },
    { emoji: '🚑', nome: 'Ambulância Particular' },
    { emoji: '🧪', nome: 'Laboratório' },
  ]},
]
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

const PRE_LISTAS: { nome: string; emoji: string; itens: { emoji: string; label: string }[] }[] = [
  { nome: 'Segurança', emoji: '🛡️', itens: [
    { emoji: '🟧', label: 'Cones' },
    { emoji: '🚧', label: 'Fita zebrada' },
    { emoji: '🐴', label: 'Cavaletes' },
    { emoji: '🚏', label: 'Grades' },
    { emoji: '💡', label: 'Iluminação' },
    { emoji: '🧯', label: 'Extintores' },
    { emoji: '📻', label: 'Rádio HT' },
    { emoji: '🦺', label: 'EPI' },
    { emoji: '🛑', label: 'Barreiras' },
  ]},
  { nome: 'Trânsito', emoji: '🚦', itens: [
    { emoji: '🚧', label: 'Bloqueio de vias' },
    { emoji: '↪️',  label: 'Desvio' },
    { emoji: '🪧', label: 'Sinalização' },
    { emoji: '🪧', label: 'Placas' },
    { emoji: '🔶', label: 'Cones refletivos' },
    { emoji: '🚓', label: 'Viatura trânsito' },
    { emoji: '🗺️', label: 'Rota alternativa' },
  ]},
  { nome: 'Saúde', emoji: '🏥', itens: [
    { emoji: '🚑', label: 'Ambulância' },
    { emoji: '🚑', label: 'SAMU' },
    { emoji: '🏥', label: 'Posto médico' },
    { emoji: '🛏️', label: 'Maca' },
    { emoji: '❤️', label: 'DEA' },
    { emoji: '🧰', label: 'Kit primeiros socorros' },
    { emoji: '💧', label: 'Água potável' },
  ]},
  { nome: 'Estrutura', emoji: '🏗️', itens: [
    { emoji: '⛺', label: 'Tendas' },
    { emoji: '🏕️', label: 'Barracas' },
    { emoji: '🪑', label: 'Cadeiras' },
    { emoji: '🪑', label: 'Mesas' },
    { emoji: '🎤', label: 'Palco' },
    { emoji: '⚡', label: 'Gerador' },
    { emoji: '💡', label: 'Iluminação' },
    { emoji: '🚻', label: 'Banheiro químico' },
  ]},
  { nome: 'Apoio Operacional', emoji: '🤝', itens: [
    { emoji: '🛡️', label: 'Defesa Civil' },
    { emoji: '🚓', label: 'PM' },
    { emoji: '🚒', label: 'Bombeiros' },
    { emoji: '🚔', label: 'Guarda Municipal' },
    { emoji: '👷', label: 'Brigadistas' },
    { emoji: '🤲', label: 'Apoio social' },
  ]},
  { nome: 'Hidratação', emoji: '💧', itens: [
    { emoji: '🚰', label: 'Ponto de água' },
    { emoji: '🗃️', label: "Caixa d'água" },
    { emoji: '🥤', label: 'Copos' },
    { emoji: '💧', label: 'Distribuição água' },
  ]},
  { nome: 'Comunicação', emoji: '📡', itens: [
    { emoji: '📻', label: 'Rádio HT' },
    { emoji: '📡', label: 'Repetidora' },
    { emoji: '🌐', label: 'Internet' },
    { emoji: '📶', label: 'Ponto Wi-Fi' },
    { emoji: '📢', label: 'Megafone' },
    { emoji: '🔊', label: 'Carro som' },
  ]},
  { nome: 'Clima/Chuva', emoji: '🌧️', itens: [
    { emoji: '🟦', label: 'Lona' },
    { emoji: '🏠', label: 'Abrigo' },
    { emoji: '🌊', label: 'Drenagem' },
    { emoji: '💦', label: 'Bomba água' },
    { emoji: '🌡️', label: 'Monitoramento clima' },
  ]},
  { nome: 'Evacuação', emoji: '🚪', itens: [
    { emoji: '🏃', label: 'Rota fuga' },
    { emoji: '🚪', label: 'Saída emergência' },
    { emoji: '📍', label: 'Ponto encontro' },
    { emoji: '🔦', label: 'Iluminação emergência' },
  ]},
  { nome: 'Logística', emoji: '⚙️', itens: [
    { emoji: '⛽', label: 'Combustível' },
    { emoji: '🍱', label: 'Alimentação equipes' },
    { emoji: '🔌', label: 'Energia' },
    { emoji: '🔋', label: 'Carregadores' },
    { emoji: '🔧', label: 'Ferramentas' },
  ]},
]

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

function criarIconeCentro(): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center">
      <div style="width:20px;height:20px;background:rgba(26,75,140,0.18);border:2.5px dashed #1a4b8c;border-radius:50%;display:flex;align-items:center;justify-content:center">
        <div style="width:5px;height:5px;background:#1a4b8c;border-radius:50%"></div>
      </div>
    </div>`,
    className: '',
    iconAnchor: [16, 16],
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
        style={{ height: 240, width: '100%', borderRadius: 12 }}
        zoomControl={true}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClickHandler ativo={modoClick} onClique={(la, ln) => { onChange(la, ln); setModoClick(false) }} />
        {lat && lng ? (
          <Marker position={[lat, lng]} icon={criarIconePrincipal()}>
            <Popup>📍 Local do evento</Popup>
          </Marker>
        ) : (
          <Marker position={OURO_BRANCO_CENTER} icon={criarIconeCentro()}>
            <Popup>🏙️ Centro de Ouro Branco<br /><small>Toque no mapa para definir o local do evento</small></Popup>
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

// ── Painel de pré-listas de materiais ──────────────────────────────────
function PreListasPanel({ onAdicionarItens }: { onAdicionarItens: (itens: string[]) => void }) {
  const [aberto, setAberto] = useState(false)
  const [categoriaAtiva, setCategoriaAtiva] = useState<string | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [outrosTexto, setOutrosTexto] = useState('')

  function toggleItem(label: string) {
    setSelecionados(prev => {
      const novo = new Set(prev)
      novo.has(label) ? novo.delete(label) : novo.add(label)
      return novo
    })
  }

  function adicionarOutro() {
    const texto = outrosTexto.trim()
    if (!texto) return
    setSelecionados(prev => new Set(prev).add(texto))
    setOutrosTexto('')
  }

  function confirmar() {
    onAdicionarItens(Array.from(selecionados))
    setSelecionados(new Set())
    setOutrosTexto('')
    setCategoriaAtiva(null)
    setAberto(false)
  }

  const catAtiva = PRE_LISTAS.find(c => c.nome === categoriaAtiva)

  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        style={{ width: '100%', background: '#f0f4ff', border: '1.5px solid #bfdbfe', borderRadius: 8, padding: '0.5rem 0.85rem', fontSize: '0.82rem', fontWeight: 700, color: '#1e40af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <span>📋 Adicionar da pré-lista{selecionados.size > 0 ? ` (${selecionados.size} selecionados)` : ''}</span>
        <span style={{ fontSize: '0.7rem' }}>{aberto ? '▲ Fechar' : '▼ Abrir'}</span>
      </button>

      {aberto && (
        <div style={{ border: '1.5px solid #bfdbfe', borderTop: 'none', borderRadius: '0 0 10px 10px', background: '#f8faff', padding: '0.6rem' }}>
          {/* Botões de categoria */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.5rem' }}>
            {PRE_LISTAS.map(cat => (
              <button
                key={cat.nome}
                type="button"
                onClick={() => { setCategoriaAtiva(categoriaAtiva === cat.nome ? null : cat.nome); setOutrosTexto('') }}
                style={{
                  background: categoriaAtiva === cat.nome ? '#1e40af' : '#e0e7ff',
                  color: categoriaAtiva === cat.nome ? 'white' : '#1e40af',
                  border: 'none', borderRadius: 20,
                  padding: '0.28rem 0.65rem', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer',
                }}
              >
                {cat.emoji} {cat.nome}
              </button>
            ))}
          </div>

          {/* Itens da categoria selecionada */}
          {catAtiva && (
            <div style={{ background: 'white', borderRadius: 8, padding: '0.5rem 0.6rem', border: '1px solid #e0e7ff', marginBottom: '0.4rem' }}>
              {catAtiva.itens.map(item => (
                <label
                  key={item.label}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', padding: '0.32rem 0.3rem', borderRadius: 6, background: selecionados.has(item.label) ? '#dbeafe' : 'transparent' }}
                >
                  <input
                    type="checkbox"
                    checked={selecionados.has(item.label)}
                    onChange={() => toggleItem(item.label)}
                    style={{ width: 16, height: 16, accentColor: '#1e40af', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: '1rem', lineHeight: 1 }}>{item.emoji}</span>
                  <span style={{ fontSize: '0.82rem', color: '#1f2937' }}>{item.label}</span>
                </label>
              ))}

              {/* Separador e campo Outros */}
              <div style={{ borderTop: '1px dashed #cbd5e1', marginTop: '0.4rem', paddingTop: '0.4rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  ➕ Outros — adicionar item personalizado
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="text"
                    placeholder="Digite o item e pressione +"
                    value={outrosTexto}
                    onChange={e => setOutrosTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarOutro() } }}
                    style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1.5px solid #cbd5e1', borderRadius: 7, fontSize: '0.82rem', outline: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={adicionarOutro}
                    style={{ background: '#1e40af', color: 'white', border: 'none', borderRadius: 7, padding: '0.4rem 0.8rem', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                  >+</button>
                </div>
                {/* Mostra itens "outros" já adicionados nesta sessão */}
                {Array.from(selecionados).filter(s => !catAtiva.itens.some(i => i.label === s)).length > 0 && (
                  <div style={{ marginTop: '0.35rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {Array.from(selecionados)
                      .filter(s => !catAtiva.itens.some(i => i.label === s))
                      .map(s => (
                        <span
                          key={s}
                          style={{ background: '#fef3c7', color: '#92400e', borderRadius: 12, padding: '0.18rem 0.55rem', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                          ✏️ {s}
                          <button
                            type="button"
                            onClick={() => toggleItem(s)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', fontWeight: 900, fontSize: '0.75rem', padding: 0, lineHeight: 1 }}
                          >✕</button>
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {selecionados.size > 0 && (
            <button
              type="button"
              onClick={confirmar}
              style={{ width: '100%', background: '#1a4b8c', color: 'white', border: 'none', borderRadius: 8, padding: '0.5rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
            >
              ✅ Adicionar {selecionados.size} {selecionados.size === 1 ? 'item' : 'itens'} à lista
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sistema Integrado de Resposta Operacional ───────────────────────────
function OrgaosPanel({ selecionados, onChange }: { selecionados: string[]; onChange: (v: string[]) => void }) {
  const [aberto, setAberto] = useState(false)
  const [catAtiva, setCatAtiva] = useState<string | null>(null)
  const [outrosTexto, setOutrosTexto] = useState('')

  const key = (o: { emoji: string; nome: string }) => `${o.emoji} ${o.nome}`

  function toggle(k: string) {
    onChange(selecionados.includes(k) ? selecionados.filter(x => x !== k) : [...selecionados, k])
  }

  function adicionarOutro() {
    const t = outrosTexto.trim()
    if (!t || selecionados.includes(t)) return
    onChange([...selecionados, t])
    setOutrosTexto('')
  }

  const cat = ORGAOS_EMPENHO.find(c => c.categoria === catAtiva)
  const orgaosNaLista = new Set(ORGAOS_EMPENHO.flatMap(c => c.orgaos.map(key)))
  const extras = selecionados.filter(s => !orgaosNaLista.has(s))

  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        style={{ width: '100%', background: 'linear-gradient(135deg,#1a3a6b,#1e40af)', border: 'none', borderRadius: 10, padding: '0.6rem 0.9rem', fontSize: '0.85rem', fontWeight: 800, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', letterSpacing: '0.01em' }}
      >
        <span>🏛️ Sistema Integrado de Resposta Operacional{selecionados.length > 0 ? ` · ${selecionados.length} órgão${selecionados.length > 1 ? 's' : ''}` : ''}</span>
        <span style={{ fontSize: '0.7rem', opacity: 0.85 }}>{aberto ? '▲ Fechar' : '▼ Abrir'}</span>
      </button>

      {aberto && (
        <div style={{ border: '2px solid #1e40af', borderTop: 'none', borderRadius: '0 0 12px 12px', background: '#f0f4ff', padding: '0.65rem' }}>

          {/* Categorias */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.55rem' }}>
            {ORGAOS_EMPENHO.map(c => {
              const qtd = c.orgaos.filter(o => selecionados.includes(key(o))).length
              const ativo = catAtiva === c.categoria
              return (
                <button
                  key={c.categoria}
                  type="button"
                  onClick={() => { setCatAtiva(ativo ? null : c.categoria); setOutrosTexto('') }}
                  style={{ background: ativo ? '#1e40af' : '#dbeafe', color: ativo ? 'white' : '#1e3a8a', border: 'none', borderRadius: 20, padding: '0.28rem 0.65rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  {c.emoji} {c.categoria} {qtd > 0 && <span style={{ background: ativo ? 'rgba(255,255,255,0.3)' : '#1e40af', color: 'white', borderRadius: 10, padding: '0 5px', fontSize: '0.65rem' }}>{qtd}</span>}
                </button>
              )
            })}
          </div>

          {/* Órgãos da categoria ativa */}
          {cat && (
            <div style={{ background: 'white', borderRadius: 10, padding: '0.55rem 0.65rem', border: '1.5px solid #bfdbfe', marginBottom: '0.4rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#1e40af', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {cat.emoji} {cat.categoria}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.2rem' }}>
                {cat.orgaos.map(o => {
                  const k = key(o)
                  const sel = selecionados.includes(k)
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggle(k)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: sel ? '#1e40af' : '#f1f5ff', color: sel ? 'white' : '#1e3a8a', border: sel ? '1.5px solid #1e40af' : '1.5px solid #dbeafe', borderRadius: 8, padding: '0.38rem 0.55rem', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                    >
                      <span style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>{o.emoji}</span>
                      <span style={{ flex: 1, lineHeight: 1.2 }}>{o.nome}</span>
                      {sel && <span style={{ fontSize: '0.7rem', opacity: 0.9 }}>✓</span>}
                    </button>
                  )
                })}
              </div>

              {/* Outros */}
              <div style={{ borderTop: '1px dashed #cbd5e1', marginTop: '0.45rem', paddingTop: '0.4rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '0.28rem' }}>➕ Adicionar outro órgão</div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="text"
                    placeholder="Nome do órgão/empresa..."
                    value={outrosTexto}
                    onChange={e => setOutrosTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarOutro() } }}
                    style={{ flex: 1, padding: '0.38rem 0.6rem', border: '1.5px solid #cbd5e1', borderRadius: 7, fontSize: '0.8rem', outline: 'none' }}
                  />
                  <button type="button" onClick={adicionarOutro} style={{ background: '#1e40af', color: 'white', border: 'none', borderRadius: 7, padding: '0.38rem 0.8rem', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>+</button>
                </div>
              </div>
            </div>
          )}

          {/* Órgãos extras (não estão na lista) */}
          {extras.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.4rem' }}>
              {extras.map(s => (
                <span key={s} style={{ background: '#fef3c7', color: '#92400e', borderRadius: 12, padding: '0.2rem 0.55rem', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  ✏️ {s}
                  <button type="button" onClick={() => toggle(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', fontWeight: 900, fontSize: '0.75rem', padding: 0, lineHeight: 1 }}>✕</button>
                </span>
              ))}
            </div>
          )}

          {/* Selecionados resumo */}
          {selecionados.length > 0 && (
            <div style={{ background: '#eff6ff', borderRadius: 8, padding: '0.4rem 0.6rem', border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1e40af', marginBottom: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>✅ Órgãos empenhados ({selecionados.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem' }}>
                {selecionados.map(s => (
                  <span key={s} style={{ background: '#1e40af', color: 'white', borderRadius: 12, padding: '0.18rem 0.5rem', fontSize: '0.72rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    {s}
                    <button type="button" onClick={() => toggle(s)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.75)', fontWeight: 900, fontSize: '0.65rem', padding: 0, lineHeight: 1 }}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Exportação PDF ──────────────────────────────────────────────────────
function exportarPDF(plano: Plano) {
  const cfg = TIPOS_CONFIG[plano.tipo]
  const sc = STATUS_CONFIG[plano.status]
  const rc = RISCO_CONFIG[plano.risco]
  const agora = new Date()
  const dataEmissao = agora.toLocaleDateString('pt-BR') + ' às ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const linhaInfo = (label: string, valor: string) =>
    valor ? `<tr><td class="lbl">${label}</td><td>${valor}</td></tr>` : ''

  const materiaisHtml = plano.materiais.length === 0
    ? '<p style="color:#9ca3af;font-size:11px">Nenhum material cadastrado</p>'
    : `<table class="tbl"><thead><tr><th>#</th><th>Material</th><th>Qtd</th><th>Unid.</th></tr></thead><tbody>
        ${plano.materiais.map((m, i) => `<tr><td>${i + 1}</td><td>${m.nome}</td><td>${m.quantidade}</td><td>${m.unidade}</td></tr>`).join('')}
      </tbody></table>`

  const equipeHtml = (() => {
    if (plano.equipe.length === 0) return '<p style="color:#9ca3af;font-size:11px">Nenhum órgão empenhado</p>'
    const orgaosNaLista = new Map(ORGAOS_EMPENHO.flatMap(c => c.orgaos.map(o => [`${o.emoji} ${o.nome}`, { cat: c.categoria, catEmoji: c.emoji }])))
    const grupos: Record<string, { catEmoji: string; orgaos: string[] }> = {}
    const extras: string[] = []
    plano.equipe.forEach(e => {
      const info = orgaosNaLista.get(e)
      if (info) { if (!grupos[info.cat]) grupos[info.cat] = { catEmoji: info.catEmoji, orgaos: [] }; grupos[info.cat].orgaos.push(e) }
      else extras.push(e)
    })
    const partes: string[] = []
    Object.entries(grupos).forEach(([cat, { catEmoji, orgaos }]) => {
      partes.push(`<div style="margin-bottom:6px"><div style="font-size:10px;font-weight:700;color:#1a4b8c;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">${catEmoji} ${cat}</div><div>${orgaos.map(o => `<span class="chip">${o}</span>`).join(' ')}</div></div>`)
    })
    if (extras.length > 0) partes.push(`<div style="margin-bottom:6px"><div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px">✏️ Outros</div><div>${extras.map(o => `<span class="chip" style="background:#fef3c7;color:#92400e">${o}</span>`).join(' ')}</div></div>`)
    return partes.join('')
  })()

  const itensMapaHtml = plano.itensMapa.length === 0
    ? '<p style="color:#9ca3af;font-size:11px">Nenhum item posicionado</p>'
    : plano.itensMapa.map(it => `<span class="chip">${it.emoji} ${it.obs || it.tipo}</span>`).join(' ')

  const localizacao = plano.lat && plano.lng
    ? `${plano.lat.toFixed(5)}, ${plano.lng.toFixed(5)}`
    : plano.local || '—'

  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8">
<title>${plano.nome} — Defesa Civil Ouro Branco</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:12px;color:#1f2937;padding:28px 32px}
  .header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #1a4b8c;padding-bottom:12px;margin-bottom:18px}
  .header h1{font-size:18px;color:#1a4b8c;margin-bottom:4px}
  .header .sub{font-size:11px;color:#6b7280}
  .logo{font-size:2.2rem}
  .badges{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px}
  .badge{display:inline-block;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:700}
  .badge-status{background:#dbeafe;color:#1e40af}
  .badge-risco-baixo{background:#dcfce7;color:#16a34a}
  .badge-risco-medio{background:#fef3c7;color:#d97706}
  .badge-risco-alto{background:#fee2e2;color:#dc2626}
  .section{margin-bottom:18px}
  .section h2{font-size:12px;color:#1a4b8c;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;padding-bottom:4px;margin-bottom:8px}
  table.info{width:100%;border-collapse:collapse;font-size:11px}
  table.info td{padding:4px 6px;vertical-align:top}
  table.info td.lbl{font-weight:700;color:#4b5563;width:110px;white-space:nowrap}
  .tbl{width:100%;border-collapse:collapse;font-size:11px;margin-top:4px}
  .tbl th{background:#f3f4f6;text-align:left;padding:5px 8px;font-weight:700;color:#374151}
  .tbl td{padding:4px 8px;border-bottom:1px solid #f3f4f6}
  .tbl tr:nth-child(even) td{background:#fafafa}
  .chip{display:inline-block;background:#dbeafe;color:#1e40af;border-radius:10px;padding:2px 8px;font-size:10px;font-weight:600;margin:2px 2px 2px 0}
  .obs{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:11px;color:#374151;white-space:pre-wrap}
  .footer{margin-top:24px;border-top:1px solid #e5e7eb;padding-top:8px;font-size:9px;color:#9ca3af;display:flex;justify-content:space-between}
  @media print{body{padding:16px}@page{margin:12mm}}
</style></head><body>

<div class="header">
  <div>
    <h1>${cfg.emoji} ${plano.nome}</h1>
    <div class="sub">Defesa Civil Ouro Branco — ${cfg.label} | Emitido em ${dataEmissao}</div>
  </div>
  <div class="logo">🛡️</div>
</div>

<div class="badges">
  <span class="badge badge-status">${sc.emoji} ${sc.label}</span>
  <span class="badge badge-risco-${plano.risco}">⚠️ Risco ${rc.label}</span>
  <span class="badge" style="background:#f3f4f6;color:#374151">📋 ${cfg.label}</span>
</div>

<div class="section">
  <h2>📋 Informações gerais</h2>
  <table class="info">
    ${linhaInfo('Nome', plano.nome)}
    ${linhaInfo('Descrição', plano.descricao)}
    ${linhaInfo('Local', plano.local)}
    ${plano.lat && plano.lng ? linhaInfo('Coordenadas', localizacao) : ''}
    ${linhaInfo('Data início', plano.dataInicio ? new Date(plano.dataInicio + 'T12:00:00').toLocaleDateString('pt-BR') : '')}
    ${plano.dataFim && plano.dataFim !== plano.dataInicio ? linhaInfo('Data fim', new Date(plano.dataFim + 'T12:00:00').toLocaleDateString('pt-BR')) : ''}
    ${linhaInfo('Horário', plano.horario)}
    ${plano.publicoEstimado ? linhaInfo('Público estimado', plano.publicoEstimado + ' pessoas') : ''}
    ${linhaInfo('Criado por', plano.criadoPor + ' em ' + new Date(plano.criadoEm).toLocaleDateString('pt-BR'))}
  </table>
</div>

<div class="section">
  <h2>🏛️ Sistema Integrado de Resposta Operacional (${plano.equipe.length} órgão${plano.equipe.length !== 1 ? 's' : ''})</h2>
  ${equipeHtml}
</div>

<div class="section">
  <h2>📦 Materiais e recursos (${plano.materiais.length})</h2>
  ${materiaisHtml}
</div>

${plano.itensMapa.length > 0 ? `<div class="section">
  <h2>🗺️ Itens no mapa (${plano.itensMapa.length})</h2>
  ${itensMapaHtml}
</div>` : ''}

${plano.observacoes ? `<div class="section">
  <h2>📝 Observações</h2>
  <div class="obs">${plano.observacoes}</div>
</div>` : ''}

<div class="footer">
  <span>Defesa Civil Ouro Branco — Sistema de Gerenciamento de Ocorrências</span>
  <span>Emitido em ${dataEmissao}</span>
</div>

<script>setTimeout(()=>window.print(),400)</script>
</body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('Permita pop-ups para exportar o PDF'); return }
  w.document.write(html)
  w.document.close()
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

  function adicionarMateriais(nomes: string[]) {
    setMateriais(prev => {
      const existentes = new Set(prev.map(m => m.nome.toLowerCase()))
      const novos = nomes
        .filter(n => !existentes.has(n.toLowerCase()))
        .map(n => ({ id: gerarId(), nome: n, quantidade: 1, unidade: 'un' }))
      return [...prev, ...novos]
    })
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

          <div className="plan-form-secao">🏛️ Órgãos Empenhados</div>
          <OrgaosPanel selecionados={equipe} onChange={setEquipe} />

          <div className="plan-form-secao">📦 Materiais e recursos</div>
          <PreListasPanel onAdicionarItens={adicionarMateriais} />
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
          <button
            className="plan-detalhe-btn-acao"
            onClick={() => exportarPDF(planoLocal)}
            title="Exportar PDF"
            style={{ fontSize: '1rem' }}
          >📄</button>
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

        {/* Órgãos Empenhados */}
        {planoLocal.equipe.length > 0 && (
          <div className="plan-detalhe-card" style={{ overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#1a3a6b,#1e40af)', color: 'white', padding: '0.55rem 0.85rem', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.01em' }}>
              🏛️ Sistema Integrado de Resposta Operacional — {planoLocal.equipe.length} órgão{planoLocal.equipe.length > 1 ? 's' : ''} empenhado{planoLocal.equipe.length > 1 ? 's' : ''}
            </div>
            {/* Agrupa por categoria para exibição */}
            {(() => {
              const orgaosNaLista = new Map(ORGAOS_EMPENHO.flatMap(c => c.orgaos.map(o => [`${o.emoji} ${o.nome}`, c.categoria])))
              const grupos: Record<string, string[]> = {}
              const extras: string[] = []
              planoLocal.equipe.forEach(e => {
                const cat = orgaosNaLista.get(e)
                if (cat) { if (!grupos[cat]) grupos[cat] = []; grupos[cat].push(e) }
                else extras.push(e)
              })
              return (
                <div style={{ padding: '0.6rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {Object.entries(grupos).map(([cat, orgaos]) => {
                    const catInfo = ORGAOS_EMPENHO.find(c => c.categoria === cat)
                    return (
                      <div key={cat}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
                          {catInfo?.emoji} {cat}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {orgaos.map(o => (
                            <span key={o} style={{ background: '#dbeafe', color: '#1e3a8a', borderRadius: 12, padding: '0.22rem 0.6rem', fontSize: '0.78rem', fontWeight: 600 }}>{o}</span>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                  {extras.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>✏️ Outros</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {extras.map(o => (
                          <span key={o} style={{ background: '#fef3c7', color: '#92400e', borderRadius: 12, padding: '0.22rem 0.6rem', fontSize: '0.78rem', fontWeight: 600 }}>{o}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
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
