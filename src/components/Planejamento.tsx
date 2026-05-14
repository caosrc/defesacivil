import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Circle } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getAgenteLogado } from './Login'
import { AGENTES } from '../types'
import { wsOn, wsSend } from '../wsClient'
import { ativarGps, desativarGps, subscribeGps, getEstadoGps, getDispositivoIdGlobal, getNomeAgenteGlobal } from '../gpsService'
import { supabase } from '../supabaseClient'

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

interface PontoExtra {
  id: string
  lat: number
  lng: number
  label: string
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
  horarioFim: string
  publicoEstimado: string
  status: StatusPlano
  equipe: string[]
  agentesDefesaCivil?: string[]
  materiais: MaterialPlano[]
  itensMapa: ItemMapa[]
  pontosExtras: PontoExtra[]
  lat: number | null
  lng: number | null
  observacoes: string
  risco: 'baixo' | 'medio' | 'alto'
  criadoPor: string
  criadoEm: string
}

// ── Conversão GMS (Graus, Minutos, Segundos) ─────────────────────────────
function decimalParaGMS(decimal: number, tipo: 'lat' | 'lng'): string {
  const abs = Math.abs(decimal)
  const graus = Math.floor(abs)
  const minRaw = (abs - graus) * 60
  const minutos = Math.floor(minRaw)
  const segundos = ((minRaw - minutos) * 60).toFixed(1)
  const dir = tipo === 'lat' ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'L' : 'O')
  return `${graus}°${minutos}'${segundos}"${dir}`
}

function gmsParaDecimal(gms: string): number | null {
  const s = gms.trim().replace(',', '.')
  const m = s.match(/^(\d+)[°\s](\d+)['´\s](\d+\.?\d*)["'`\s]*([NSnsEeOoWwLl])?/)
  if (!m) {
    const d = parseFloat(s)
    return isNaN(d) ? null : d
  }
  const dec = parseInt(m[1]) + parseInt(m[2]) / 60 + parseFloat(m[3]) / 3600
  return (m[4] && 'SsOoWw'.includes(m[4])) ? -dec : dec
}

// ── Mapeamento Plano ↔ Supabase ─────────────────────────────────────────
function planoParaSB(p: Plano): Record<string, unknown> {
  return {
    id: p.id, tipo: p.tipo, nome: p.nome, descricao: p.descricao, local: p.local,
    data_inicio: p.dataInicio, data_fim: p.dataFim, horario: p.horario,
    horario_fim: p.horarioFim, publico_estimado: p.publicoEstimado,
    status: p.status, equipe: p.equipe,
    agentes_defesa_civil: p.agentesDefesaCivil ?? [],
    materiais: p.materiais, itens_mapa: p.itensMapa, pontos_extras: p.pontosExtras,
    lat: p.lat, lng: p.lng, observacoes: p.observacoes, risco: p.risco,
    criado_por: p.criadoPor, criado_em: p.criadoEm,
  }
}

function sbParaPlano(row: Record<string, unknown>): Plano {
  return {
    id: row.id as string, tipo: row.tipo as TipoPlano, nome: row.nome as string,
    descricao: (row.descricao as string) ?? '', local: (row.local as string) ?? '',
    dataInicio: (row.data_inicio as string) ?? '', dataFim: (row.data_fim as string) ?? '',
    horario: (row.horario as string) ?? '', horarioFim: (row.horario_fim as string) ?? '',
    publicoEstimado: (row.publico_estimado as string) ?? '',
    status: (row.status as StatusPlano) ?? 'planejado',
    equipe: (row.equipe as string[]) ?? [],
    agentesDefesaCivil: (row.agentes_defesa_civil as string[]) ?? [],
    materiais: (row.materiais as MaterialPlano[]) ?? [],
    itensMapa: (row.itens_mapa as ItemMapa[]) ?? [],
    pontosExtras: (row.pontos_extras as PontoExtra[]) ?? [],
    lat: (row.lat as number) ?? null, lng: (row.lng as number) ?? null,
    observacoes: (row.observacoes as string) ?? '',
    risco: (row.risco as 'baixo' | 'medio' | 'alto') ?? 'baixo',
    criadoPor: (row.criado_por as string) ?? '',
    criadoEm: (row.criado_em as string) ?? new Date().toISOString(),
  }
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
function criarIconeAgente(nome: string): L.DivIcon {
  const iniciais = nome.split(' ').map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('') || '?'
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;">
      <div style="
        background:#059669;width:36px;height:36px;border-radius:50%;
        border:2.5px solid white;
        box-shadow:0 0 0 2.5px #059669,0 3px 10px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;
        color:white;font-weight:800;font-size:12px;font-family:sans-serif;
        letter-spacing:-0.02em;
      ">${iniciais}</div>
      <div style="position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);
        background:rgba(5,150,105,0.92);color:white;font-size:7px;padding:1px 5px;
        border-radius:3px;white-space:nowrap;font-family:sans-serif;max-width:64px;
        overflow:hidden;text-overflow:ellipsis;font-weight:700;line-height:1.4;">
        ${nome.split(' ')[0]}
      </div>
    </div>`,
    iconSize: [36, 54],
    iconAnchor: [18, 36],
    popupAnchor: [0, -40],
  })
}

function criarIconeAgentePlanejado(nome: string): L.DivIcon {
  const iniciais = nome.split(' ').map(w => w[0]?.toUpperCase() || '').slice(0, 2).join('') || '?'
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;">
      <div style="
        background:#1a4b8c;width:36px;height:36px;border-radius:50%;
        border:2.5px solid white;
        box-shadow:0 0 0 2.5px #1a4b8c,0 3px 10px rgba(0,0,0,0.4);
        display:flex;align-items:center;justify-content:center;
        color:white;font-weight:800;font-size:12px;font-family:sans-serif;
        letter-spacing:-0.02em;
      ">${iniciais}</div>
      <div style="position:absolute;bottom:-16px;left:50%;transform:translateX(-50%);
        background:rgba(26,75,140,0.92);color:white;font-size:7px;padding:1px 5px;
        border-radius:3px;white-space:nowrap;font-family:sans-serif;max-width:64px;
        overflow:hidden;text-overflow:ellipsis;font-weight:700;line-height:1.4;">
        ${nome.split(' ')[0]}
      </div>
    </div>`,
    iconSize: [36, 54],
    iconAnchor: [18, 36],
    popupAnchor: [0, -40],
  })
}

function MapClickHandler({ onClique, ativo }: { onClique: (lat: number, lng: number) => void; ativo: boolean }) {
  useMapEvents({
    click(e) {
      if (ativo) onClique(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function FlyToMarca({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()
  useEffect(() => { map.flyTo([lat, lng], 15, { duration: 1.2 }) }, [lat, lng, map])
  return null
}

function InputGMS({
  valor, tipo, onChange,
}: {
  valor: number | null
  tipo: 'lat' | 'lng'
  onChange: (v: number | null) => void
}) {
  const [texto, setTexto] = useState(() => valor != null ? decimalParaGMS(valor, tipo) : '')
  const [erro, setErro] = useState(false)

  useEffect(() => {
    if (valor != null) setTexto(decimalParaGMS(valor, tipo))
    else setTexto('')
  }, [valor, tipo])

  function handleBlur() {
    if (!texto.trim()) { onChange(null); setErro(false); return }
    const dec = gmsParaDecimal(texto)
    if (dec === null) { setErro(true); return }
    setErro(false)
    onChange(dec)
    setTexto(decimalParaGMS(dec, tipo))
  }

  return (
    <input
      type="text"
      value={texto}
      onChange={e => { setTexto(e.target.value); setErro(false) }}
      onBlur={handleBlur}
      placeholder={tipo === 'lat' ? "20°31'10.5\"S" : "43°41'54.3\"O"}
      style={{
        width: '100%', padding: '0.38rem 0.5rem',
        border: `1.5px solid ${erro ? '#ef4444' : '#cbd5e1'}`,
        borderRadius: 7, fontSize: '0.8rem', outline: 'none', fontFamily: 'monospace',
        background: erro ? '#fff1f2' : undefined,
      }}
    />
  )
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
  const [iconesExpandidos, setIconesExpandidos] = useState(false)
  const centro: [number, number] = plano.lat && plano.lng ? [plano.lat, plano.lng] : OURO_BRANCO_CENTER

  // ── Prontidão: rastreia quem está de prontidão + posições GPS ──────────
  const [agProntidao, setAgProntidao] = useState<Map<string, string>>(new Map()) // id → nome
  const [posicoesPront, setPosicoesPront] = useState<Map<string, { nome: string; lat: number; lng: number; precisao: number; ts: number; emProntidao: boolean }>>(new Map())
  const agProntRef = useRef(agProntidao)
  useEffect(() => { agProntRef.current = agProntidao }, [agProntidao])

  // Função auxiliar: verifica se um nome de agente pertence a este plano
  const nomeEhAgenteDoPlano = (nome: string) => {
    const agentes = plano.agentesDefesaCivil ?? []
    if (agentes.length === 0) return false
    const n = nome.toLowerCase()
    return agentes.some(ag => {
      const a = ag.toLowerCase()
      return a === n || n.startsWith(a.split(' ')[0]) || a.split(' ')[0] === n.split(' ')[0]
    })
  }

  useEffect(() => {
    const planoId = plano.id
    const meuId = getDispositivoIdGlobal()

    const offIniciais = wsOn('prontidao_iniciais', (msg) => {
      const lista = Array.isArray(msg.agentes) ? msg.agentes as { id: string; nome: string; planoId: string }[] : []
      setAgProntidao(prev => {
        const m = new Map(prev)
        for (const ag of lista) {
          if (ag.planoId === planoId) m.set(ag.id, ag.nome || ag.id)
        }
        return m
      })
    })

    const offPront = wsOn('prontidao', (msg) => {
      if (String(msg.planoId) !== planoId) return
      const id = String(msg.id)
      setAgProntidao(prev => { const m = new Map(prev); m.set(id, String(msg.nome || id)); return m })
    })

    const offSair = wsOn('prontidao_sair', (msg) => {
      if (String(msg.planoId) !== planoId) return
      const id = String(msg.id)
      setAgProntidao(prev => { const m = new Map(prev); m.delete(id); return m })
      // Só remove do mapa se não tiver GPS ativo independente
      setPosicoesPront(prev => {
        const m = new Map(prev)
        const pos = m.get(id)
        if (pos) m.set(id, { ...pos, emProntidao: false })
        return m
      })
    })

    const offPosicao = wsOn('posicao', (msg) => {
      const id = String(msg.id)
      if (id === meuId) return
      const nome = String(msg.nome || id)
      const emProntidao = agProntRef.current.has(id)
      // Aceita: agentes em prontidão deste plano OU agentes da lista do plano com GPS ativo
      if (!emProntidao && !nomeEhAgenteDoPlano(nome)) return
      setPosicoesPront(prev => {
        const m = new Map(prev)
        m.set(id, { nome, lat: Number(msg.lat), lng: Number(msg.lng), precisao: Number(msg.precisao || 0), ts: Date.now(), emProntidao })
        return m
      })
    })

    const offPosIniciais = wsOn('posicoes_iniciais', (msg) => {
      const lista = Array.isArray(msg.posicoes) ? msg.posicoes as { id: string; nome: string; lat: number; lng: number; precisao: number }[] : []
      setPosicoesPront(prev => {
        const m = new Map(prev)
        for (const p of lista) {
          if (p.id === meuId) continue
          const emProntidao = agProntRef.current.has(p.id)
          if (!emProntidao && !nomeEhAgenteDoPlano(p.nome)) continue
          m.set(p.id, { nome: p.nome, lat: p.lat, lng: p.lng, precisao: p.precisao || 0, ts: Date.now(), emProntidao })
        }
        return m
      })
    })

    const offRemover = wsOn('remover', (msg) => {
      const id = String(msg.id)
      setPosicoesPront(prev => { const m = new Map(prev); m.delete(id); return m })
    })

    const ttl = setInterval(() => {
      const limite = Date.now() - 15_000
      setPosicoesPront(prev => {
        let mudou = false
        const m = new Map(prev)
        for (const [id, p] of m) { if (p.ts < limite) { m.delete(id); mudou = true } }
        return mudou ? m : prev
      })
    }, 5000)

    return () => { offIniciais(); offPront(); offSair(); offPosicao(); offPosIniciais(); offRemover(); clearInterval(ttl) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plano.id])

  function handleCliqueMapa(lat: number, lng: number) {
    if (!itemSelecionado) return
    // Check in ITENS_POSICIONAR
    const cfgIcon = ITENS_POSICIONAR.find(i => i.tipo === itemSelecionado)
    if (cfgIcon) {
      onAdicionarItem({ id: gerarId(), tipo: cfgIcon.tipo, emoji: cfgIcon.emoji, lat, lng, obs: cfgIcon.label })
      setItemSelecionado(null)
      return
    }
    // Check as organ (tipo starts with 'orgao:')
    if (itemSelecionado.startsWith('orgao:')) {
      const nomeOrgao = itemSelecionado.slice(6)
      const orgaoInfo = ORGAOS_EMPENHO.flatMap(c => c.orgaos).find(o => `${o.emoji} ${o.nome}` === nomeOrgao)
      const emoji = orgaoInfo?.emoji ?? '🏛️'
      onAdicionarItem({ id: gerarId(), tipo: 'orgao', emoji, lat, lng, obs: nomeOrgao })
      setItemSelecionado(null)
      return
    }
    // Check as material (tipo starts with 'mat:')
    if (itemSelecionado.startsWith('mat:')) {
      const nomeMat = itemSelecionado.slice(4)
      onAdicionarItem({ id: gerarId(), tipo: 'material', emoji: '📦', lat, lng, obs: nomeMat })
      setItemSelecionado(null)
      return
    }
    // Check as DC agent (tipo starts with 'agente:')
    if (itemSelecionado.startsWith('agente:')) {
      const nomeAgente = itemSelecionado.slice(7)
      onAdicionarItem({ id: gerarId(), tipo: 'agente_dc', emoji: '🧑‍🚒', lat, lng, obs: nomeAgente })
      setItemSelecionado(null)
      return
    }
  }

  const labelSelecionado = (() => {
    if (!itemSelecionado) return ''
    if (itemSelecionado.startsWith('orgao:')) return itemSelecionado.slice(6)
    if (itemSelecionado.startsWith('mat:')) return itemSelecionado.slice(4)
    if (itemSelecionado.startsWith('agente:')) return itemSelecionado.slice(7)
    return ITENS_POSICIONAR.find(i => i.tipo === itemSelecionado)?.label ?? ''
  })()

  return (
    <div className="plan-mapa-container" style={{ borderRadius: 12, overflow: 'hidden' }}>
      {itemSelecionado && (
        <div className="plan-mapa-picker-info">
          📍 Toque no mapa para posicionar: <strong>{labelSelecionado}</strong>
          <button onClick={() => setItemSelecionado(null)}>Cancelar</button>
        </div>
      )}
      <MapContainer
        center={centro}
        zoom={plano.lat && plano.lng ? 15 : 13}
        style={{ height: 'min(58vh, 540px)', minHeight: 380, width: '100%' }}
        zoomControl={true}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClickHandler ativo={!!itemSelecionado} onClique={handleCliqueMapa} />
        {plano.lat && plano.lng && (
          <Marker position={[plano.lat, plano.lng]} icon={criarIconePrincipal()}>
            <Popup><strong>{plano.nome}</strong><br />📍 Local principal</Popup>
          </Marker>
        )}
        {(plano.pontosExtras ?? []).map(p => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={criarIconeEmoji('📌')}>
            <Popup><strong>📌 {p.label || 'Ponto extra'}</strong><br />{p.lat.toFixed(5)}, {p.lng.toFixed(5)}</Popup>
          </Marker>
        ))}
        {plano.itensMapa.map(item => (
          <Marker
            key={item.id}
            position={[item.lat, item.lng]}
            icon={item.tipo === 'agente_dc' ? criarIconeAgentePlanejado(item.obs || item.tipo) : criarIconeEmoji(item.emoji)}
          >
            <Popup>
              <div style={{ textAlign: 'center' }}>
                {item.tipo === 'agente_dc'
                  ? <span style={{ fontSize: '1.2rem' }}>🧑‍🚒</span>
                  : <span style={{ fontSize: '1.5rem' }}>{item.emoji}</span>
                }
                <div style={{ fontWeight: 700, fontSize: '0.85rem', marginTop: 4 }}>{item.obs || item.tipo}</div>
                {item.tipo === 'agente_dc' && (
                  <div style={{ fontSize: '0.72rem', color: '#1a4b8c', fontWeight: 600, marginBottom: 4 }}>👷 Agente planejado</div>
                )}
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

        {/* Agentes com GPS ativo (prontidão ou só GPS) */}
        {Array.from(posicoesPront.entries()).map(([id, p]) => (
          <Marker key={`ag-${id}`} position={[p.lat, p.lng]} icon={criarIconeAgente(p.nome)}>
            <Popup>
              <div style={{ textAlign: 'center', minWidth: 120 }}>
                <div style={{ fontSize: '1.2rem' }}>🧑‍🚒</div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{p.nome}</div>
                {p.emProntidao
                  ? <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600, marginTop: 2 }}>✅ Em prontidão · GPS ativo</div>
                  : <div style={{ fontSize: '0.75rem', color: '#1a4b8c', fontWeight: 600, marginTop: 2 }}>📡 GPS ativo · posição em tempo real</div>
                }
                {p.precisao > 0 && p.precisao < 500 && <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 1 }}>±{Math.round(p.precisao)}m</div>}
              </div>
            </Popup>
            {p.precisao > 0 && p.precisao < 300 && (
              <Circle center={[p.lat, p.lng]} radius={p.precisao} pathOptions={{ color: p.emProntidao ? '#059669' : '#1a4b8c', fillColor: p.emProntidao ? '#059669' : '#1a4b8c', fillOpacity: 0.1, weight: 1.5 }} />
            )}
          </Marker>
        ))}
      </MapContainer>

      {(agProntidao.size > 0 || posicoesPront.size > 0) && (
        <div style={{ background: '#f0fdf4', borderTop: '1px solid #bbf7d0', padding: '0.4rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          {/* Agentes em prontidão */}
          {agProntidao.size > 0 && (
            <>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669' }}>🛡️ Prontidão:</span>
              {Array.from(agProntidao.entries()).map(([id, nome]) => {
                const temGps = posicoesPront.has(id)
                return (
                  <span key={id} style={{ background: temGps ? '#dcfce7' : '#f3f4f6', color: temGps ? '#166534' : '#6b7280', borderRadius: 12, padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 600 }}>
                    {temGps ? '📡' : '📵'} {nome.split(' ')[0]}
                  </span>
                )
              })}
            </>
          )}
          {/* Agentes só com GPS (não estão em prontidão formal) */}
          {Array.from(posicoesPront.entries()).filter(([id, p]) => !p.emProntidao).length > 0 && (
            <>
              {agProntidao.size > 0 && <span style={{ color: '#d1d5db', fontSize: '0.8rem' }}>·</span>}
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1a4b8c' }}>📡 GPS ativo:</span>
              {Array.from(posicoesPront.entries())
                .filter(([, p]) => !p.emProntidao)
                .map(([id, p]) => (
                  <span key={id} style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 12, padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 600 }}>
                    📡 {p.nome.split(' ')[0]}
                  </span>
                ))
              }
            </>
          )}
        </div>
      )}

      {/* ── Painel: adicionar ao mapa ───────────────────────────── */}
      <div style={{ background: '#f8fafc', borderTop: '1.5px solid #e5e7eb' }}>

        {/* Cabeçalho + banner de posicionamento */}
        <div style={{ padding: '0.5rem 0.85rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#1a4b8c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            🗺️ Adicionar ao mapa
          </span>
          <span style={{ fontSize: '0.67rem', color: '#6b7280', marginLeft: 'auto' }}>
            Selecione um item e toque no mapa
          </span>
        </div>

        {itemSelecionado && (
          <div style={{ margin: '0.4rem 0.85rem 0', background: '#fef3c7', border: '1.5px solid #fbbf24', borderRadius: 8, padding: '0.38rem 0.7rem', fontSize: '0.8rem', fontWeight: 700, color: '#92400e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📍 Toque no mapa: <strong>{labelSelecionado}</strong></span>
            <button onClick={() => setItemSelecionado(null)} style={{ background: 'none', border: 'none', color: '#b45309', cursor: 'pointer', fontWeight: 900, fontSize: '1rem', lineHeight: 1, padding: '0 0.2rem' }}>✕</button>
          </div>
        )}

        {/* ── Seção: Órgãos Empenhados ── */}
        <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '0.45rem' }}>
          <div style={{ padding: '0.35rem 0.85rem', background: 'linear-gradient(90deg,#1a3a6b,#1e40af)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'white', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🏛️ Órgãos Empenhados</span>
            <span style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.18)', color: 'white', borderRadius: 10, fontSize: '0.65rem', fontWeight: 700, padding: '0.05rem 0.45rem' }}>
              {plano.equipe.length} {plano.equipe.length === 1 ? 'órgão' : 'órgãos'}
            </span>
          </div>
          <div style={{ padding: '0.45rem 0.75rem' }}>
            {plano.equipe.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', padding: '0.3rem 0' }}>
                Nenhum órgão empenhado · edite o plano para adicionar
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {plano.equipe.map(orgao => {
                  const key = `orgao:${orgao}`
                  const orgaoInfo = ORGAOS_EMPENHO.flatMap(c => c.orgaos).find(o => `${o.emoji} ${o.nome}` === orgao)
                  const emoji = orgaoInfo?.emoji ?? '🏛️'
                  const ativo = itemSelecionado === key
                  return (
                    <button
                      key={orgao}
                      onClick={() => setItemSelecionado(ativo ? null : key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        background: ativo ? '#1e40af' : '#dbeafe',
                        color: ativo ? 'white' : '#1e3a8a',
                        border: ativo ? '1.5px solid #1e40af' : '1.5px solid #bfdbfe',
                        borderRadius: 20, padding: '0.28rem 0.7rem',
                        fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                        boxShadow: ativo ? '0 0 0 2px #93c5fd' : 'none',
                        transition: 'all 0.12s',
                      }}
                    >
                      {orgaoInfo?.nome === 'Defesa Civil'
                        ? <img src="/logo-dc.png" style={{ width: 16, height: 16, objectFit: 'contain' }} alt="" />
                        : <span style={{ fontSize: '0.95rem' }}>{emoji}</span>
                      }
                      {orgaoInfo?.nome ?? orgao}
                      {ativo && <span style={{ fontSize: '0.65rem', marginLeft: 2 }}>📍</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Seção: Agentes da Defesa Civil ── */}
        <div style={{ borderTop: '1px solid #e5e7eb' }}>
          <div style={{ padding: '0.35rem 0.85rem', background: 'linear-gradient(90deg,#065f46,#059669)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'white', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🧑‍🚒 Agentes da Defesa Civil</span>
            <span style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.18)', color: 'white', borderRadius: 10, fontSize: '0.65rem', fontWeight: 700, padding: '0.05rem 0.45rem' }}>
              {(plano.agentesDefesaCivil ?? []).length} {(plano.agentesDefesaCivil ?? []).length === 1 ? 'agente' : 'agentes'}
            </span>
          </div>
          <div style={{ padding: '0.45rem 0.75rem' }}>
            {(plano.agentesDefesaCivil ?? []).length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', padding: '0.3rem 0' }}>
                Nenhum agente escalado · edite o plano para adicionar
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {(plano.agentesDefesaCivil ?? []).map(ag => {
                  const key = `agente:${ag}`
                  const ativo = itemSelecionado === key
                  return (
                    <button
                      key={ag}
                      onClick={() => setItemSelecionado(ativo ? null : key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        background: ativo ? '#059669' : '#dcfce7',
                        color: ativo ? 'white' : '#166534',
                        border: ativo ? '1.5px solid #059669' : '1.5px solid #bbf7d0',
                        borderRadius: 20, padding: '0.28rem 0.7rem',
                        fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                        boxShadow: ativo ? '0 0 0 2px #6ee7b7' : 'none',
                        transition: 'all 0.12s',
                      }}
                    >
                      <span style={{ fontSize: '0.95rem' }}>🧑‍🚒</span>
                      {ag}
                      {ativo && <span style={{ fontSize: '0.65rem', marginLeft: 2 }}>📍</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Seção: Materiais e Recursos ── */}
        <div style={{ borderTop: '1px solid #e5e7eb' }}>
          <div style={{ padding: '0.35rem 0.85rem', background: 'linear-gradient(90deg,#78350f,#b45309)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'white', textTransform: 'uppercase', letterSpacing: '0.06em' }}>📦 Materiais e Recursos</span>
            <span style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.18)', color: 'white', borderRadius: 10, fontSize: '0.65rem', fontWeight: 700, padding: '0.05rem 0.45rem' }}>
              {plano.materiais.length} {plano.materiais.length === 1 ? 'item' : 'itens'}
            </span>
          </div>
          <div style={{ padding: '0.45rem 0.75rem' }}>
            {plano.materiais.length === 0 ? (
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center', padding: '0.3rem 0' }}>
                Nenhum material cadastrado · edite o plano para adicionar
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {plano.materiais.map(mat => {
                  const key = `mat:${mat.nome}`
                  const ativo = itemSelecionado === key
                  return (
                    <button
                      key={mat.id}
                      onClick={() => setItemSelecionado(ativo ? null : key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.3rem',
                        background: ativo ? '#b45309' : '#fef3c7',
                        color: ativo ? 'white' : '#78350f',
                        border: ativo ? '1.5px solid #b45309' : '1.5px solid #fcd34d',
                        borderRadius: 20, padding: '0.28rem 0.7rem',
                        fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                        boxShadow: ativo ? '0 0 0 2px #fde68a' : 'none',
                        transition: 'all 0.12s',
                      }}
                    >
                      <span style={{ fontSize: '0.95rem' }}>📦</span>
                      {mat.nome}
                      {mat.quantidade > 1 && <span style={{ fontSize: '0.68rem', opacity: 0.75 }}>×{mat.quantidade}</span>}
                      {ativo && <span style={{ fontSize: '0.65rem', marginLeft: 2 }}>📍</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Seção: Ícones Operacionais (recolhível) ── */}
        <div style={{ borderTop: '1px solid #e5e7eb', marginBottom: '0.5rem' }}>
          <button
            onClick={() => setIconesExpandidos(v => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.85rem', background: '#f1f5f9', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🗺️ Ícones Operacionais</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700 }}>
              {iconesExpandidos ? '▲ Recolher' : '▼ Expandir'}
            </span>
          </button>
          {iconesExpandidos && (
            <div style={{ padding: '0.4rem 0.75rem' }}>
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
          )}
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
                      {o.nome === 'Defesa Civil' ? (
                        <img src="/logo-dc.png" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0, borderRadius: 3 }} />
                      ) : (
                        <span style={{ fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}>{o.emoji}</span>
                      )}
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
    ${plano.horario ? linhaInfo('Horário início', plano.horario) : ''}
    ${plano.horarioFim ? linhaInfo('Horário fim', plano.horarioFim) : ''}
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
  <h2>🗺️ Itens posicionados (${plano.itensMapa.length})</h2>
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

${(plano.lat && plano.lng) || plano.itensMapa.length > 0 || (plano.pontosExtras ?? []).length > 0 ? `
<!-- ── FOLHA DO MAPA ── -->
<div style="page-break-before:always">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<div style="padding:20px 24px 12px">
  <div style="border-bottom:3px solid #1a4b8c;padding-bottom:10px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
    <div>
      <div style="font-size:16px;font-weight:800;color:#1a4b8c">🗺️ Mapa de Planejamento Operacional</div>
      <div style="font-size:11px;color:#6b7280">${plano.nome} — Defesa Civil Ouro Branco</div>
    </div>
    <div style="font-size:10px;color:#9ca3af">Emitido em ${dataEmissao}</div>
  </div>
</div>
<div id="map-pdf" style="height:calc(100vh - 120px);width:100%;margin:0"></div>
<script>
(function(){
  var map = L.map('map-pdf');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  var bounds = [];
  ${plano.lat && plano.lng ? `
  L.circleMarker([${plano.lat},${plano.lng}],{radius:10,color:'#1a4b8c',fillColor:'#1a4b8c',fillOpacity:1,weight:3}).addTo(map)
    .bindPopup('<strong>📍 Local principal</strong><br>${plano.nome.replace(/'/g, "\\'")}');
  bounds.push([${plano.lat},${plano.lng}]);
  ` : ''}
  ${(plano.pontosExtras ?? []).map(p => `
  L.marker([${p.lat},${p.lng}]).addTo(map)
    .bindPopup('<strong>📌 ${p.label.replace(/'/g, "\\'")}</strong>');
  bounds.push([${p.lat},${p.lng}]);
  `).join('')}
  ${plano.itensMapa.map(it => `
  L.marker([${it.lat},${it.lng}], {icon: L.divIcon({html:'<div style="font-size:1.4rem;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4))">${it.emoji}</div>',className:'',iconAnchor:[12,12]})}).addTo(map)
    .bindPopup('<strong>${it.emoji} ${(it.obs || it.tipo).replace(/'/g, "\\'")}</strong>');
  bounds.push([${it.lat},${it.lng}]);
  `).join('')}
  if(bounds.length > 0) {
    if(bounds.length === 1) { map.setView(bounds[0], 15); }
    else { map.fitBounds(bounds, {padding:[40,40]}); }
  } else { map.setView([-20.5195,-43.6983], 13); }
})();
<\/script>
</div>
` : ''}

<script>setTimeout(()=>window.print(),2000)</script>
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
  const [horarioFim, setHorarioFim] = useState(planoEditando?.horarioFim ?? '')
  const [publicoEstimado, setPublicoEstimado] = useState(planoEditando?.publicoEstimado ?? '')
  const [risco] = useState<'baixo' | 'medio' | 'alto'>(planoEditando?.risco ?? 'baixo')
  const [equipe, setEquipe] = useState<string[]>(planoEditando?.equipe ?? [])
  const [materiais, setMateriais] = useState<MaterialPlano[]>(planoEditando?.materiais ?? [])
  const [observacoes, setObservacoes] = useState(planoEditando?.observacoes ?? '')
  const [lat, setLat] = useState<number | null>(planoEditando?.lat ?? null)
  const [lng, setLng] = useState<number | null>(planoEditando?.lng ?? null)
  const [pontosExtras, setPontosExtras] = useState<PontoExtra[]>(planoEditando?.pontosExtras ?? [])
  const [novoPontoLat, setNovoPontoLat] = useState('')
  const [novoPontoLng, setNovoPontoLng] = useState('')
  const [novoPontoLabel, setNovoPontoLabel] = useState('')
  const [clickandoPonto, setClickandoPonto] = useState(false)

  const [agentesDefesaCivil, setAgentesDefesaCivil] = useState<string[]>(planoEditando?.agentesDefesaCivil ?? [])

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
      horarioFim,
      materiais,
      itensMapa: planoEditando?.itensMapa ?? [],
      pontosExtras,
      lat,
      lng,
      observacoes: observacoes.trim(),
      risco,
      agentesDefesaCivil,
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
              <label className="plan-form-label">Horário início</label>
              <input className="plan-form-input" type="time" value={horario} onChange={e => setHorario(e.target.value)} />
            </div>
            <div className="plan-form-group">
              <label className="plan-form-label">Horário fim</label>
              <input className="plan-form-input" type="time" value={horarioFim} onChange={e => setHorarioFim(e.target.value)} />
            </div>
          </div>

          {tipo === 'evento' && (
            <div className="plan-form-group">
              <label className="plan-form-label">Público estimado</label>
              <input className="plan-form-input" placeholder="Ex: 5.000" value={publicoEstimado} onChange={e => setPublicoEstimado(e.target.value)} />
            </div>
          )}

          <div className="plan-form-secao">📍 Localização no mapa</div>
          {/* Mapa principal */}
          <MapaPicker lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln) }} />
          {/* Entrada manual de coordenadas em GMS */}
          <div style={{ display: 'flex', gap: '0.4rem', margin: '-2px 0 8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 140px' }}>
              <div style={{ fontSize: '0.68rem', color: '#6b7280', fontWeight: 600, marginBottom: 2 }}>Latitude (GMS)</div>
              <InputGMS valor={lat} tipo="lat" onChange={v => setLat(v)} />
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <div style={{ fontSize: '0.68rem', color: '#6b7280', fontWeight: 600, marginBottom: 2 }}>Longitude (GMS)</div>
              <InputGMS valor={lng} tipo="lng" onChange={v => setLng(v)} />
            </div>
            {lat && lng && (
              <button style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', flexShrink: 0, paddingBottom: '0.38rem', fontWeight: 700 }} onClick={() => { setLat(null); setLng(null) }}>✕ Remover</button>
            )}
          </div>
          {lat && lng && (
            <div style={{ fontSize: '0.73rem', color: '#6b7280', textAlign: 'center', marginTop: -4, marginBottom: '0.4rem', fontFamily: 'monospace' }}>
              📍 {decimalParaGMS(lat, 'lat')} · {decimalParaGMS(lng, 'lng')}
            </div>
          )}

          {/* Pontos extras */}
          <div style={{ background: '#f0f4ff', border: '1.5px solid #bfdbfe', borderRadius: 10, padding: '0.6rem 0.7rem', marginBottom: '0.3rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1e40af', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              📌 Pontos adicionais de referência
            </div>

            {/* Campo clique-no-mapa para ponto extra */}
            {clickandoPonto && (
              <div style={{ background: '#fef3c7', border: '1.5px solid #fbbf24', borderRadius: 8, padding: '0.4rem 0.7rem', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: 600, color: '#92400e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>📍 Toque no mapa acima para definir o ponto</span>
                <button type="button" onClick={() => setClickandoPonto(false)} style={{ background: 'none', border: 'none', color: '#b45309', cursor: 'pointer', fontWeight: 800 }}>✕</button>
              </div>
            )}

            {/* Formulário manual com GMS */}
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '0.4rem' }}>
              <div style={{ flex: '1 1 120px' }}>
                <div style={{ fontSize: '0.68rem', color: '#6b7280', fontWeight: 600, marginBottom: 2 }}>Nome/referência</div>
                <input
                  type="text"
                  placeholder="Ex: Portão A"
                  value={novoPontoLabel}
                  onChange={e => setNovoPontoLabel(e.target.value)}
                  style={{ width: '100%', padding: '0.38rem 0.5rem', border: '1.5px solid #cbd5e1', borderRadius: 7, fontSize: '0.8rem', outline: 'none' }}
                />
              </div>
              <div style={{ flex: '0 1 130px' }}>
                <div style={{ fontSize: '0.68rem', color: '#6b7280', fontWeight: 600, marginBottom: 2 }}>Latitude (GMS)</div>
                <input
                  type="text"
                  placeholder={"20°31'10\"S"}
                  value={novoPontoLat}
                  onChange={e => setNovoPontoLat(e.target.value)}
                  style={{ width: '100%', padding: '0.38rem 0.5rem', border: '1.5px solid #cbd5e1', borderRadius: 7, fontSize: '0.79rem', outline: 'none', fontFamily: 'monospace' }}
                />
              </div>
              <div style={{ flex: '0 1 130px' }}>
                <div style={{ fontSize: '0.68rem', color: '#6b7280', fontWeight: 600, marginBottom: 2 }}>Longitude (GMS)</div>
                <input
                  type="text"
                  placeholder={"43°41'54\"O"}
                  value={novoPontoLng}
                  onChange={e => setNovoPontoLng(e.target.value)}
                  style={{ width: '100%', padding: '0.38rem 0.5rem', border: '1.5px solid #cbd5e1', borderRadius: 7, fontSize: '0.79rem', outline: 'none', fontFamily: 'monospace' }}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  const la = gmsParaDecimal(novoPontoLat) ?? parseFloat(novoPontoLat.replace(',', '.'))
                  const ln = gmsParaDecimal(novoPontoLng) ?? parseFloat(novoPontoLng.replace(',', '.'))
                  if (isNaN(la) || isNaN(ln)) return
                  setPontosExtras(prev => [...prev, { id: gerarId(), lat: la, lng: ln, label: novoPontoLabel.trim() || `Ponto ${prev.length + 1}` }])
                  setNovoPontoLat(''); setNovoPontoLng(''); setNovoPontoLabel('')
                }}
                style={{ background: '#1e40af', color: 'white', border: 'none', borderRadius: 7, padding: '0.38rem 0.8rem', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0 }}
              >+</button>
            </div>

            {/* Lista de pontos extras */}
            {pontosExtras.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {pontosExtras.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'white', borderRadius: 7, padding: '0.3rem 0.55rem', border: '1px solid #e0e7ff' }}>
                    <span style={{ fontSize: '0.9rem' }}>📌</span>
                    <span style={{ fontWeight: 700, fontSize: '0.78rem', color: '#1e40af', flex: 1 }}>{p.label}</span>
                    <span style={{ fontSize: '0.7rem', color: '#6b7280', fontFamily: 'monospace' }}>{decimalParaGMS(p.lat, 'lat')} {decimalParaGMS(p.lng, 'lng')}</span>
                    <button
                      type="button"
                      onClick={() => setPontosExtras(prev => prev.filter(x => x.id !== p.id))}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 900, fontSize: '0.8rem', padding: 0 }}
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
            {pontosExtras.length === 0 && (
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'center' }}>Nenhum ponto adicional. Preencha os campos acima para adicionar.</div>
            )}
          </div>

          <div className="plan-form-secao">🏛️ Órgãos Empenhados</div>
          <OrgaosPanel selecionados={equipe} onChange={setEquipe} />

          <div className="plan-form-secao">🧑‍🚒 Agentes da Defesa Civil</div>
          <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10, padding: '0.6rem 0.7rem', marginBottom: '0.3rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#166534', marginBottom: '0.45rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Selecione os agentes escalados para este planejamento
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {AGENTES.map(ag => {
                const sel = agentesDefesaCivil.includes(ag)
                return (
                  <button
                    key={ag}
                    type="button"
                    onClick={() => setAgentesDefesaCivil(prev => sel ? prev.filter(a => a !== ag) : [...prev, ag])}
                    style={{
                      background: sel ? '#059669' : '#f0fdf4',
                      color: sel ? 'white' : '#166534',
                      border: sel ? '1.5px solid #059669' : '1.5px solid #bbf7d0',
                      borderRadius: 20,
                      padding: '0.32rem 0.75rem',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                      transition: 'all 0.15s',
                    }}
                  >
                    {sel && <span style={{ fontSize: '0.75rem' }}>✓</span>}
                    {ag}
                  </button>
                )
              })}
            </div>
            {agentesDefesaCivil.length > 0 && (
              <div style={{ marginTop: '0.45rem', fontSize: '0.73rem', color: '#059669', fontWeight: 600 }}>
                ✅ {agentesDefesaCivil.length} agente{agentesDefesaCivil.length > 1 ? 's' : ''} selecionado{agentesDefesaCivil.length > 1 ? 's' : ''}
              </div>
            )}
          </div>

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

// ── Previsão do tempo (Open-Meteo) ──────────────────────────────────────
const WMO_LABEL: Record<number, { emoji: string; desc: string }> = {
  0:  { emoji: '☀️',  desc: 'Céu limpo' },
  1:  { emoji: '🌤️', desc: 'Predominantemente limpo' },
  2:  { emoji: '⛅',  desc: 'Parcialmente nublado' },
  3:  { emoji: '☁️',  desc: 'Encoberto' },
  45: { emoji: '🌫️', desc: 'Neblina' },
  48: { emoji: '🌫️', desc: 'Neblina com gelo' },
  51: { emoji: '🌦️', desc: 'Garoa fraca' },
  53: { emoji: '🌦️', desc: 'Garoa moderada' },
  55: { emoji: '🌧️', desc: 'Garoa forte' },
  61: { emoji: '🌧️', desc: 'Chuva fraca' },
  63: { emoji: '🌧️', desc: 'Chuva moderada' },
  65: { emoji: '🌧️', desc: 'Chuva forte' },
  71: { emoji: '❄️',  desc: 'Neve fraca' },
  80: { emoji: '⛈️',  desc: 'Pancadas de chuva' },
  81: { emoji: '⛈️',  desc: 'Pancadas moderadas' },
  82: { emoji: '⛈️',  desc: 'Pancadas fortes' },
  95: { emoji: '⛈️',  desc: 'Trovoada' },
  96: { emoji: '⛈️',  desc: 'Trovoada com granizo' },
  99: { emoji: '⛈️',  desc: 'Trovoada com granizo forte' },
}

function PrevisaoTempo({ lat, lng, data }: { lat: number; lng: number; data: string }) {
  interface DadosTempo { emoji: string; desc: string; chuva: number; prob: number }
  const [dados, setDados] = useState<DadosTempo | null>(null)
  const [status, setStatus] = useState<'carregando' | 'ok' | 'indisponivel'>('carregando')

  useEffect(() => {
    const hoje = new Date()
    const dataEvento = new Date(data + 'T12:00:00')
    const diffDias = Math.round((dataEvento.getTime() - hoje.getTime()) / 86400000)
    if (diffDias < -1 || diffDias > 15) { setStatus('indisponivel'); return }

    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&daily=precipitation_sum,precipitation_probability_max,weathercode&timezone=America%2FSao_Paulo&start_date=${data}&end_date=${data}`)
      .then(r => r.json())
      .then(d => {
        const code = d.daily?.weathercode?.[0]
        if (code === undefined || code === null) { setStatus('indisponivel'); return }
        const wmo = WMO_LABEL[code as number] ?? { emoji: '🌡️', desc: 'Variável' }
        setDados({ emoji: wmo.emoji, desc: wmo.desc, chuva: d.daily.precipitation_sum[0] ?? 0, prob: d.daily.precipitation_probability_max[0] ?? 0 })
        setStatus('ok')
      })
      .catch(() => setStatus('indisponivel'))
  }, [lat, lng, data])

  if (status === 'carregando') return (
    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '0.42rem 0.75rem', fontSize: '0.78rem', color: '#0369a1', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
      <span>🌤️</span> Buscando previsão...
    </div>
  )
  if (status === 'indisponivel' || !dados) return (
    <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '0.42rem 0.75rem', fontSize: '0.75rem', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
      <span>🌡️</span> Previsão indisponível (disponível até 15 dias à frente)
    </div>
  )
  const corFundo = dados.prob > 60 ? '#eff6ff' : dados.prob > 30 ? '#f0fdf4' : '#fefce8'
  const corBorda = dados.prob > 60 ? '#bfdbfe' : dados.prob > 30 ? '#bbf7d0' : '#fde68a'
  return (
    <div style={{ background: corFundo, border: `1.5px solid ${corBorda}`, borderRadius: 8, padding: '0.48rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '1.45rem', lineHeight: 1 }}>{dados.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1f2937' }}>{dados.desc}</div>
        <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>
          💧 {dados.chuva.toFixed(1)} mm · {dados.prob}% probabilidade de chuva
        </div>
      </div>
      <div style={{ fontSize: '0.6rem', color: '#9ca3af', textAlign: 'right', lineHeight: 1.4, fontWeight: 600 }}>Open-Meteo<br/>INMET</div>
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

  // ── Prontidão ───────────────────────────────────────────────────────────
  const chaveLocal = `dc-prontidao-${plano.id}`
  const [emProntidao, setEmProntidao] = useState<boolean>(() => localStorage.getItem(chaveLocal) === '1')
  const [estadoGps, setEstadoGps] = useState(() => getEstadoGps())
  const [outrosProntidao, setOutrosProntidao] = useState<{ id: string; nome: string }[]>([])

  useEffect(() => {
    const unsub = subscribeGps(setEstadoGps)
    return unsub
  }, [])

  useEffect(() => {
    const planoId = plano.id
    const meuId = getDispositivoIdGlobal()

    const offIniciais = wsOn('prontidao_iniciais', (msg) => {
      const lista = Array.isArray(msg.agentes) ? msg.agentes as { id: string; nome: string; planoId: string }[] : []
      setOutrosProntidao(lista.filter(a => a.planoId === planoId && a.id !== meuId))
    })
    const offPront = wsOn('prontidao', (msg) => {
      if (String(msg.planoId) !== planoId) return
      const id = String(msg.id)
      if (id === meuId) return
      setOutrosProntidao(prev => prev.some(a => a.id === id) ? prev : [...prev, { id, nome: String(msg.nome || id) }])
    })
    const offSair = wsOn('prontidao_sair', (msg) => {
      if (String(msg.planoId) !== planoId) return
      const id = String(msg.id)
      setOutrosProntidao(prev => prev.filter(a => a.id !== id))
    })
    const offRemover = wsOn('remover', (msg) => {
      const id = String(msg.id)
      setOutrosProntidao(prev => prev.filter(a => a.id !== id))
    })

    return () => { offIniciais(); offPront(); offSair(); offRemover() }
  }, [plano.id])

  function toggleProntidao() {
    const meuId = getDispositivoIdGlobal()
    const meuNome = getNomeAgenteGlobal()
    if (emProntidao) {
      wsSend({ tipo: 'prontidao_sair', id: meuId, planoId: plano.id })
      localStorage.removeItem(chaveLocal)
      setEmProntidao(false)
    } else {
      wsSend({ tipo: 'prontidao', id: meuId, nome: meuNome, planoId: plano.id, ativo: true })
      localStorage.setItem(chaveLocal, '1')
      setEmProntidao(true)
      if (estadoGps.status === 'inativo' || estadoGps.status === 'erro') {
        ativarGps()
      }
    }
  }

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

  function atualizarQuantidadeMaterial(matId: string, novaQtd: number) {
    const qtd = Math.max(1, novaQtd)
    const atualizado = {
      ...planoLocal,
      materiais: planoLocal.materiais.map(m => m.id === matId ? { ...m, quantidade: qtd } : m),
    }
    setPlanoLocal(atualizado)
    onAtualizar(atualizado)
  }

  function removerMaterialDetalhe(matId: string) {
    const atualizado = {
      ...planoLocal,
      materiais: planoLocal.materiais.filter(m => m.id !== matId),
    }
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
                  {planoLocal.horario && ` · ${planoLocal.horario}${planoLocal.horarioFim ? ` – ${planoLocal.horarioFim}` : ''}`}
                </span>
              </div>
            )}
            {planoLocal.dataInicio && planoLocal.lat && planoLocal.lng && (
              <div className="plan-detalhe-info-row" style={{ alignItems: 'flex-start' }}>
                <span className="plan-detalhe-info-label" style={{ paddingTop: '0.2rem' }}>🌤️ Tempo</span>
                <div style={{ flex: 1 }}>
                  <PrevisaoTempo lat={planoLocal.lat} lng={planoLocal.lng} data={planoLocal.dataInicio} />
                </div>
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

        {/* Prontidão */}
        <div className="plan-detalhe-card" style={{ overflow: 'hidden' }}>
          <div style={{
            background: emProntidao ? 'linear-gradient(135deg,#065f46,#059669)' : 'linear-gradient(135deg,#374151,#4b5563)',
            color: 'white', padding: '0.6rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.6rem'
          }}>
            <span style={{ fontSize: '1.1rem' }}>🛡️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: '0.88rem' }}>
                {emProntidao ? 'Você está em prontidão' : 'Prontidão'}
              </div>
              <div style={{ fontSize: '0.72rem', opacity: 0.85, marginTop: 1 }}>
                {emProntidao
                  ? estadoGps.status === 'ativo' ? '📡 GPS ativo — sua posição é visível no mapa' : '📵 GPS inativo — ative para aparecer no mapa'
                  : 'Declare prontidão para aparecer no mapa tático em tempo real'}
              </div>
            </div>
            <button
              onClick={toggleProntidao}
              style={{
                background: emProntidao ? '#fee2e2' : '#dcfce7',
                color: emProntidao ? '#b91c1c' : '#166534',
                border: 'none', borderRadius: 20, padding: '0.35rem 0.85rem',
                fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)'
              }}
            >
              {emProntidao ? '🔴 Sair' : '🟢 Entrar'}
            </button>
          </div>

          {emProntidao && (estadoGps.status === 'inativo' || estadoGps.status === 'erro') && (
            <div style={{ background: '#fef3c7', padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem' }}>⚠️</span>
              <span style={{ fontSize: '0.78rem', color: '#92400e', fontWeight: 600 }}>GPS desativado</span>
              <button
                onClick={() => ativarGps()}
                style={{ marginLeft: 'auto', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 12, padding: '0.22rem 0.7rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Ativar GPS
              </button>
            </div>
          )}

          {emProntidao && estadoGps.status === 'aguardando' && (
            <div style={{ background: '#eff6ff', padding: '0.4rem 0.85rem', fontSize: '0.78rem', color: '#1d4ed8', fontWeight: 600 }}>
              🔄 Aguardando sinal de GPS…
            </div>
          )}

          {outrosProntidao.length > 0 && (
            <div style={{ padding: '0.55rem 0.85rem', borderTop: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>
                Outros agentes em prontidão ({outrosProntidao.length})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {outrosProntidao.map(ag => (
                  <span key={ag.id} style={{ background: '#dcfce7', color: '#166534', borderRadius: 12, padding: '0.2rem 0.6rem', fontSize: '0.78rem', fontWeight: 600 }}>
                    🧑‍🚒 {ag.nome}
                  </span>
                ))}
              </div>
            </div>
          )}

          {outrosProntidao.length === 0 && !emProntidao && (
            <div style={{ padding: '0.5rem 0.85rem', fontSize: '0.78rem', color: '#9ca3af', textAlign: 'center' }}>
              Nenhum agente em prontidão neste evento
            </div>
          )}
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

        {/* Agentes Defesa Civil */}
        {(planoLocal.agentesDefesaCivil ?? []).length > 0 && (
          <div className="plan-detalhe-card" style={{ overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#065f46,#059669)', color: 'white', padding: '0.55rem 0.85rem', fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.01em' }}>
              🧑‍🚒 Agentes da Defesa Civil — {(planoLocal.agentesDefesaCivil ?? []).length} escalado{(planoLocal.agentesDefesaCivil ?? []).length > 1 ? 's' : ''}
            </div>
            <div style={{ padding: '0.6rem 0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
              {(planoLocal.agentesDefesaCivil ?? []).map(ag => (
                <span key={ag} style={{ background: '#dcfce7', color: '#166534', borderRadius: 12, padding: '0.25rem 0.7rem', fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  🧑‍🚒 {ag}
                </span>
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
                <div key={m.id} className="plan-mat-detalhe-item" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className="plan-mat-detalhe-nome">{m.nome}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginLeft: 'auto', flexShrink: 0 }}>
                    <button
                      onClick={() => atualizarQuantidadeMaterial(m.id, m.quantidade - 1)}
                      style={{ width: 26, height: 26, background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, fontWeight: 800, fontSize: '1rem', cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}
                    >−</button>
                    <span style={{ minWidth: 38, textAlign: 'center', fontSize: '0.82rem', fontWeight: 700, color: '#1f2937' }}>{m.quantidade} {m.unidade}</span>
                    <button
                      onClick={() => atualizarQuantidadeMaterial(m.id, m.quantidade + 1)}
                      style={{ width: 26, height: 26, background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 6, fontWeight: 800, fontSize: '1rem', cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1e40af' }}
                    >+</button>
                    <button
                      onClick={() => removerMaterialDetalhe(m.id)}
                      style={{ width: 24, height: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 800, fontSize: '0.9rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Remover"
                    >✕</button>
                  </div>
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

// ── Mapa compartilhado da seção (nível de lista) ────────────────────────
interface ItemMapaSecao {
  id: string
  tipo: string
  emoji: string
  label: string
  lat: number
  lng: number
}

function MapaSecaoPlanos({
  tipo,
  planos,
}: {
  tipo: TipoPlano
  planos: Plano[]
}) {
  const chave = `dc-mapa-secao-${tipo}-v1`
  const [itens, setItens] = useState<ItemMapaSecao[]>(() => {
    try { return JSON.parse(localStorage.getItem(chave) || '[]') } catch { return [] }
  })
  const [itemSelecionado, setItemSelecionado] = useState<string | null>(null)
  const [labelNovo, setLabelNovo] = useState('')
  const [aba, setAba] = useState<'icones' | 'orgaos' | 'materiais' | 'agentes'>('icones')

  const planosDoTipo = planos.filter(p => p.tipo === tipo)
  const planoCentral = planosDoTipo.find(p => p.lat && p.lng)
  const centro: [number, number] = planoCentral?.lat && planoCentral?.lng
    ? [planoCentral.lat, planoCentral.lng]
    : OURO_BRANCO_CENTER

  const todosOrgaos = [...new Set(planosDoTipo.flatMap(p => p.equipe))]
  const todosMateriais = planosDoTipo.flatMap(p => p.materiais)
  const todosAgentes = [...new Set(planosDoTipo.flatMap(p => p.agentesDefesaCivil ?? []))]

  function salvarItens(lista: ItemMapaSecao[]) {
    setItens(lista)
    localStorage.setItem(chave, JSON.stringify(lista))
  }

  function adicionarItemNoMapa(lat: number, lng: number) {
    if (!itemSelecionado) return
    const cfgIcon = ITENS_POSICIONAR.find(i => i.tipo === itemSelecionado)
    if (cfgIcon) {
      salvarItens([...itens, { id: gerarId(), tipo: cfgIcon.tipo, emoji: cfgIcon.emoji, label: labelNovo.trim() || cfgIcon.label, lat, lng }])
      setItemSelecionado(null); setLabelNovo(''); return
    }
    if (itemSelecionado.startsWith('org:')) {
      const nome = itemSelecionado.slice(4)
      const info = ORGAOS_EMPENHO.flatMap(c => c.orgaos).find(o => `${o.emoji} ${o.nome}` === nome)
      salvarItens([...itens, { id: gerarId(), tipo: 'orgao', emoji: info?.emoji ?? '🏛️', label: labelNovo.trim() || (info?.nome ?? nome), lat, lng }])
      setItemSelecionado(null); setLabelNovo(''); return
    }
    if (itemSelecionado.startsWith('mat:')) {
      salvarItens([...itens, { id: gerarId(), tipo: 'material', emoji: '📦', label: labelNovo.trim() || itemSelecionado.slice(4), lat, lng }])
      setItemSelecionado(null); setLabelNovo(''); return
    }
    if (itemSelecionado.startsWith('ag:')) {
      const nome = itemSelecionado.slice(3)
      salvarItens([...itens, { id: gerarId(), tipo: 'agente', emoji: '🧑‍🚒', label: labelNovo.trim() || nome, lat, lng }])
      setItemSelecionado(null); setLabelNovo(''); return
    }
  }

  function removerItemSecao(id: string) {
    salvarItens(itens.filter(i => i.id !== id))
  }

  const labelSelecionado = (() => {
    if (!itemSelecionado) return ''
    if (itemSelecionado.startsWith('org:')) return itemSelecionado.slice(4)
    if (itemSelecionado.startsWith('mat:')) return itemSelecionado.slice(4)
    if (itemSelecionado.startsWith('ag:')) return itemSelecionado.slice(3)
    return ITENS_POSICIONAR.find(i => i.tipo === itemSelecionado)?.label ?? ''
  })()

  const btnStyle = (sel: boolean) => ({
    background: sel ? '#1a4b8c' : '#dbeafe',
    color: sel ? 'white' : '#1e3a8a',
    border: 'none', borderRadius: 20,
    padding: '0.25rem 0.65rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '0.2rem',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem' }}>
      {/* Toolbar ADICIONAR NO MAPA */}
      <div style={{ background: '#f0f4ff', border: '1.5px solid #bfdbfe', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1e40af', marginBottom: '0.42rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          🗺️ Adicionar no mapa
        </div>

        {/* Abas */}
        <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.45rem', flexWrap: 'wrap' }}>
          {([['icones','🗺️ Ícones'],['orgaos','🏛️ Órgãos'],['materiais','📦 Materiais'],['agentes','🧑‍🚒 Agentes DC']] as const).map(([a,l]) => (
            <button key={a} onClick={() => { setAba(a); setItemSelecionado(null) }}
              style={{ background: aba===a?'#1a4b8c':'#e0e7ff', color: aba===a?'white':'#1e3a8a', border:'none', borderRadius:20, padding:'0.22rem 0.62rem', fontSize:'0.72rem', fontWeight:700, cursor:'pointer' }}>
              {l}
            </button>
          ))}
        </div>

        {/* Conteúdo da aba */}
        {aba === 'icones' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
            {ITENS_POSICIONAR.map(it => (
              <button key={it.tipo} onClick={() => { setItemSelecionado(p => p===it.tipo?null:it.tipo); setLabelNovo('') }} style={btnStyle(itemSelecionado===it.tipo)}>
                <span>{it.emoji}</span>{it.label}
              </button>
            ))}
          </div>
        )}
        {aba === 'orgaos' && (
          todosOrgaos.length === 0
            ? <div style={{ fontSize:'0.78rem',color:'#9ca3af',textAlign:'center',padding:'0.4rem' }}>Nenhum órgão empenhado nos planos desta seção</div>
            : <div style={{ display:'flex',flexWrap:'wrap',gap:'0.3rem' }}>
                {todosOrgaos.map(orgao => {
                  const key = `org:${orgao}`
                  const info = ORGAOS_EMPENHO.flatMap(c=>c.orgaos).find(o=>`${o.emoji} ${o.nome}`===orgao)
                  return <button key={orgao} onClick={() => { setItemSelecionado(p=>p===key?null:key); setLabelNovo('') }} style={btnStyle(itemSelecionado===key)}>
                    <span>{info?.emoji??'🏛️'}</span>{info?.nome??orgao}
                  </button>
                })}
              </div>
        )}
        {aba === 'materiais' && (
          todosMateriais.length === 0
            ? <div style={{ fontSize:'0.78rem',color:'#9ca3af',textAlign:'center',padding:'0.4rem' }}>Nenhum material nos planos desta seção</div>
            : <div style={{ display:'flex',flexWrap:'wrap',gap:'0.3rem' }}>
                {todosMateriais.map(mat => {
                  const key = `mat:${mat.nome}`
                  return <button key={mat.id} onClick={() => { setItemSelecionado(p=>p===key?null:key); setLabelNovo('') }} style={btnStyle(itemSelecionado===key)}>
                    <span>📦</span>{mat.nome}
                  </button>
                })}
              </div>
        )}
        {aba === 'agentes' && (
          todosAgentes.length === 0
            ? <div style={{ fontSize:'0.78rem',color:'#9ca3af',textAlign:'center',padding:'0.4rem' }}>Nenhum agente nos planos desta seção</div>
            : <div style={{ display:'flex',flexWrap:'wrap',gap:'0.3rem' }}>
                {todosAgentes.map(ag => {
                  const key = `ag:${ag}`
                  return <button key={ag} onClick={() => { setItemSelecionado(p=>p===key?null:key); setLabelNovo('') }} style={btnStyle(itemSelecionado===key)}>
                    <span>🧑‍🚒</span>{ag}
                  </button>
                })}
              </div>
        )}

        {itemSelecionado && (
          <>
            <div style={{ display:'flex', gap:'0.4rem', marginTop:'0.42rem' }}>
              <input
                style={{ flex:1, padding:'0.35rem 0.6rem', border:'1.5px solid #cbd5e1', borderRadius:7, fontSize:'0.8rem', outline:'none' }}
                placeholder={`Rótulo (ex: ${labelSelecionado} Principal)`}
                value={labelNovo}
                onChange={e => setLabelNovo(e.target.value)}
              />
            </div>
            <div style={{ background:'#fef3c7',border:'1.5px solid #fbbf24',borderRadius:8,padding:'0.38rem 0.7rem',fontSize:'0.8rem',fontWeight:600,color:'#92400e',display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'0.35rem' }}>
              <span>📍 Toque no mapa para posicionar: <strong>{labelSelecionado}</strong></span>
              <button onClick={() => { setItemSelecionado(null); setLabelNovo('') }} style={{ background:'none',border:'none',color:'#b45309',cursor:'pointer',fontWeight:800,fontSize:'0.9rem' }}>✕</button>
            </div>
          </>
        )}
      </div>

      {/* Mapa */}
      <div style={{ borderRadius: 12, overflow: 'hidden', border: '1.5px solid #e5e7eb' }}>
        <MapContainer
          center={centro}
          zoom={planoCentral ? 15 : 13}
          style={{ height: 'min(60vh, 560px)', minHeight: 360, width: '100%' }}
          zoomControl={true}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {planoCentral && <FlyToMarca lat={centro[0]} lng={centro[1]} />}
          <MapClickHandler ativo={!!itemSelecionado} onClique={adicionarItemNoMapa} />

          {/* Marcadores dos planos */}
          {planosDoTipo.filter(p => p.lat && p.lng).map(p => (
            <Marker key={p.id} position={[p.lat!, p.lng!]} icon={criarIconePrincipal()}>
              <Popup>
                <div style={{ textAlign:'center', minWidth:100 }}>
                  <div style={{ fontWeight:700,fontSize:'0.88rem' }}>{TIPOS_CONFIG[p.tipo].emoji} {p.nome}</div>
                  {p.local && <div style={{ fontSize:'0.78rem',color:'#6b7280',marginTop:2 }}>📍 {p.local}</div>}
                  {p.dataInicio && <div style={{ fontSize:'0.73rem',color:'#9ca3af',marginTop:1 }}>📅 {formatarData(p.dataInicio)}</div>}
                  <div style={{ fontSize:'0.68rem',color:'#9ca3af',marginTop:2,fontFamily:'monospace' }}>{decimalParaGMS(p.lat!,'lat')} {decimalParaGMS(p.lng!,'lng')}</div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Pontos extras dos planos */}
          {planosDoTipo.flatMap(p=>(p.pontosExtras??[]).map(pe=>({...pe,planoNome:p.nome}))).map(pe => (
            <Marker key={pe.id} position={[pe.lat,pe.lng]} icon={criarIconeEmoji('📌')}>
              <Popup>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontWeight:700,fontSize:'0.82rem' }}>📌 {pe.label}</div>
                  <div style={{ fontSize:'0.72rem',color:'#6b7280' }}>{pe.planoNome}</div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Itens de mapa individuais dos planos */}
          {planosDoTipo.flatMap(p=>p.itensMapa.map(it=>({...it,planoNome:p.nome}))).map(item => (
            <Marker key={item.id} position={[item.lat,item.lng]} icon={item.tipo==='agente_dc'?criarIconeAgentePlanejado(item.obs||item.tipo):criarIconeEmoji(item.emoji)}>
              <Popup>
                <div style={{ textAlign:'center' }}>
                  <span style={{ fontSize:'1.3rem' }}>{item.emoji}</span>
                  <div style={{ fontWeight:700,fontSize:'0.82rem',marginTop:2 }}>{item.obs||item.tipo}</div>
                  <div style={{ fontSize:'0.72rem',color:'#6b7280' }}>{item.planoNome}</div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Itens posicionados na seção */}
          {itens.map(item => (
            <Marker key={item.id} position={[item.lat,item.lng]} icon={item.tipo==='agente'?criarIconeAgentePlanejado(item.label):criarIconeEmoji(item.emoji)}>
              <Popup>
                <div style={{ textAlign:'center' }}>
                  <span style={{ fontSize:'1.3rem' }}>{item.emoji}</span>
                  <div style={{ fontWeight:700,fontSize:'0.82rem',marginTop:2 }}>{item.label}</div>
                  <button onClick={() => removerItemSecao(item.id)}
                    style={{ marginTop:6,background:'#fee2e2',border:'none',borderRadius:6,padding:'0.2rem 0.7rem',color:'#b91c1c',fontWeight:700,fontSize:'0.78rem',cursor:'pointer' }}>
                    🗑️ Remover
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {planosDoTipo.filter(p => !p.lat || !p.lng).length > 0 && (
        <div style={{ background:'#fef3c7',border:'1px solid #fcd34d',borderRadius:8,padding:'0.4rem 0.75rem',fontSize:'0.75rem',color:'#92400e' }}>
          ℹ️ {planosDoTipo.filter(p=>!p.lat||!p.lng).length} plano(s) sem localização não aparecem no mapa. Edite-os para adicionar coordenadas.
        </div>
      )}

      {itens.length > 0 && (
        <div style={{ background:'#f8fafc',border:'1.5px solid #e5e7eb',borderRadius:10,padding:'0.5rem 0.75rem' }}>
          <div style={{ fontSize:'0.7rem',fontWeight:800,color:'#1e40af',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'0.35rem' }}>
            📌 Itens posicionados ({itens.length})
          </div>
          <div style={{ display:'flex',flexWrap:'wrap',gap:'0.25rem' }}>
            {itens.map(item => (
              <span key={item.id} style={{ background:'#dbeafe',color:'#1e3a8a',borderRadius:12,padding:'0.2rem 0.55rem',fontSize:'0.75rem',fontWeight:600,display:'flex',alignItems:'center',gap:'0.3rem' }}>
                {item.emoji} {item.label}
                <button onClick={() => removerItemSecao(item.id)} style={{ background:'none',border:'none',cursor:'pointer',color:'#1e40af',fontWeight:900,fontSize:'0.7rem',padding:0,lineHeight:1 }}>✕</button>
              </span>
            ))}
          </div>
        </div>
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

  useEffect(() => {
    supabase.from('planejamentos').select('*').order('criado_em', { ascending: false }).limit(500)
      .then(({ data, error }) => {
        if (error || !data) return
        const remote = data.map(row => sbParaPlano(row as Record<string, unknown>))
        setPlanos(prev => {
          const map = new Map(prev.map(p => [p.id, p]))
          remote.forEach(r => { if (!map.has(r.id)) map.set(r.id, r) })
          return Array.from(map.values()).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
        })
      })
      .catch(() => {})
  }, [])

  async function sincSB(plano: Plano) {
    try { await supabase.from('planejamentos').upsert(planoParaSB(plano)) } catch { /* silencioso */ }
  }

  async function deletarSB(id: string) {
    try { await supabase.from('planejamentos').delete().eq('id', id) } catch { /* silencioso */ }
  }

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
    sincSB(plano)
  }, [])

  const atualizarPlano = useCallback((plano: Plano) => {
    setPlanos(prev => prev.map(p => p.id === plano.id ? plano : p))
    setAberto(plano)
    sincSB(plano)
  }, [])

  const deletarPlano = useCallback((id: string) => {
    setPlanos(prev => prev.filter(p => p.id !== id))
    setAberto(null)
    deletarSB(id)
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
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.75rem', borderBottom: '1px solid #e5e7eb', background: '#f8fafc', flexShrink: 0 }}>
            <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600 }}>
              📋 {TIPOS_CONFIG[subAba].label}
            </span>
            <button
              style={{ marginLeft: 'auto', background: '#1a4b8c', color: 'white', border: 'none', borderRadius: 20, padding: '0.28rem 0.85rem', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
              onClick={() => setCriando(true)}
            >
              + Novo
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            <ListaPlanos
              tipo={subAba}
              planos={planos}
              onNovo={() => setCriando(true)}
              onAbrir={p => setAberto(p)}
            />
          </div>
        </>
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
