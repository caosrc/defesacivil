export type NivelRisco = 'baixo' | 'medio' | 'alto'
export type StatusOc = 'ativo' | 'resolvido'

export interface VistoriaAdicional {
  data: string
  observacao: string
  fotos: string[]
  agente: string | null
  status?: StatusOc
}

export interface Ocorrencia {
  id: number
  tipo: string
  natureza: string
  subnatureza: string | null
  nivel_risco: NivelRisco
  status_oc: StatusOc
  fotos: string[]
  descricoes_fotos?: string[] | null
  lat: number | null
  lng: number | null
  endereco: string | null
  proprietario: string | null
  situacao: string | null
  recomendacao: string | null
  conclusao: string | null
  data_ocorrencia: string | null
  hora_inicio: string | null
  hora_fim: string | null
  horas_total: number | null
  horas_sobreaviso: number | null
  created_at: string
  agentes: string[]
  responsavel_registro: string | null
  vistorias: VistoriaAdicional[] | null
  focos_incendio?: { lat: number; lng: number }[] | null
  poligono_area_queimada?: { lat: number; lng: number }[] | null
  _offline?: boolean
  _localId?: number
}

export const AGENTES = ['Moisés', 'Valteir', 'Arthur', 'Gustavo', 'Vânia', 'Graça', 'Talita', 'Cristiane', 'Dyonathan', 'Sócrates']

export const AGENTE_SENHAS: Record<string, string> = {
  'Sócrates': '3004',
  'Moisés': '301067',
  'Gustavo': '8228',
  'Cristiane': '1950',
  'Vânia': '1210',
  'Valteir': '1234',
  'Talita': '1234',
  'Graça': '1122',
  'Dyonathan': '2806',
}

export function getSenhaAgente(nome: string): string | null {
  return AGENTE_SENHAS[nome] ?? null
}

export const TIPOS_OCORRENCIA = ['Diligência', 'Vistoria de Engenharia', 'Vistoria Ambiental', 'Apoio', 'Outro']

export const NATUREZAS = [
  'Árvore Gerando Risco (Caída ou Não)',
  'Rompimento de Cabo de Energia',
  'Rompimento de Cabo de Telefonia',
  'Queda de Poste (Total ou Parcial)',
  'Óleo na Pista',
  'Incêndio em Área Urbana',
  'Incêndio em Área Rural',
  'Alagamento',
  'Inundação',
  'Queda de Estrutura',
  'Deslizamento de Massa/Rocha',
  'Processo Erosivo',
  'Apreensão e Captura de Animal',
  'Abelhas/Marimbondo',
  'Vistoria Residencial',
  'Talude em Risco',
  'Interdição de Imóvel',
  'Interdição de Via',
  'Acidente de Trânsito',
  'Sinalização de Segurança',
  'Eventos',
]

export const NATUREZA_ICONE: Record<string, string> = {
  'Árvore Gerando Risco (Caída ou Não)': '🌳',
  'Rompimento de Cabo de Energia': '⚡',
  'Rompimento de Cabo de Telefonia': '📡',
  'Queda de Poste (Total ou Parcial)': '🏗️',
  'Óleo na Pista': '🛢️',
  'Incêndio em Área Urbana': '🔥',
  'Incêndio em Área Rural': '🔥',
  'Alagamento': '💧',
  'Inundação': '🌊',
  'Queda de Estrutura': '🏚️',
  'Deslizamento de Massa/Rocha': '⛰️',
  'Processo Erosivo': '🏔️',
  'Apreensão e Captura de Animal': '🐾',
  'Abelhas/Marimbondo': '🐝',
  'Vistoria Residencial': '🏠',
  'Talude em Risco': '🪨',
  'Interdição de Imóvel': '🚫',
  'Interdição de Via': '🚧',
  'Acidente de Trânsito': '🚗',
  'Sinalização de Segurança': '🚦',
  'Eventos': '🎪',
}

export const NATUREZA_COR: Record<string, string> = {
  'Árvore Gerando Risco (Caída ou Não)': '#16a34a',
  'Rompimento de Cabo de Energia': '#eab308',
  'Rompimento de Cabo de Telefonia': '#7c3aed',
  'Queda de Poste (Total ou Parcial)': '#6b7280',
  'Óleo na Pista': '#78350f',
  'Incêndio em Área Urbana': '#dc2626',
  'Incêndio em Área Rural': '#ea580c',
  'Alagamento': '#2563eb',
  'Inundação': '#0284c7',
  'Queda de Estrutura': '#9f1239',
  'Deslizamento de Massa/Rocha': '#92400e',
  'Processo Erosivo': '#b45309',
  'Apreensão e Captura de Animal': '#7c3aed',
  'Abelhas/Marimbondo': '#ca8a04',
  'Vistoria Residencial': '#0f766e',
  'Talude em Risco': '#854d0e',
  'Interdição de Imóvel': '#b91c1c',
  'Interdição de Via': '#c2410c',
  'Acidente de Trânsito': '#ef4444',
  'Sinalização de Segurança': '#f59e0b',
  'Eventos': '#0891b2',
}
