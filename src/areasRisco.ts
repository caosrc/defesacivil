export const TIPOS_AREAS_RISCO = [
  'Encostas',
  'Enchentes',
  'Drenagem',
  'Alagamentos',
  'Deslizamentos',
  'Problemas de vias',
  'Obras',
  'Inundações',
  'Incêndios',
  'Outros',
] as const

export type TipoAreaRisco = typeof TIPOS_AREAS_RISCO[number]
export type CoordenadaAreaRisco = [number, number]

export interface AreaRisco {
  id: string
  tipo: TipoAreaRisco
  latitude: number
  longitude: number
  poligono: CoordenadaAreaRisco[]
  data_inicio: string
  limite_precipitacao_mm: number
  referencia: string | null
  observacao: string | null
  criado_por: string
  created_at: string
  ocorrencia_id?: number | null
}

export type AreaRiscoInput = Omit<AreaRisco, 'id' | 'criado_por' | 'created_at'>

export const ESTILO_AREA_RISCO: Record<TipoAreaRisco, { cor: string; icone: string }> = {
  Encostas: { cor: '#d97706', icone: 'slope' },
  Enchentes: { cor: '#187eaa', icone: 'flood' },
  Drenagem: { cor: '#087e9b', icone: 'drainage' },
  Alagamentos: { cor: '#2457c5', icone: 'flood' },
  Deslizamentos: { cor: '#b4233b', icone: 'landslide' },
  'Problemas de vias': { cor: '#7854a8', icone: 'road' },
  Obras: { cor: '#5c7b36', icone: 'works' },
  Inundações: { cor: '#2463b5', icone: 'flood' },
  'Incêndios': { cor: '#dc4b37', icone: 'fire' },
  Outros: { cor: '#6b7280', icone: 'other' },
}
