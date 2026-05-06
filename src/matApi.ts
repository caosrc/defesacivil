export interface MatMaterial {
  id: string
  nome: string
  descricao: string | null
  observacoes: string | null
  foto_thumb: string | null
  foto?: string | null
  foto_placa?: string | null
  quantidade: number | null
  created_at: string
}

export interface MatEmprestimo {
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
  tipo: 'emprestimo' | 'manutencao'
  created_at: string
}

export interface MatEquipamentoCampo {
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

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, options)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    const msg = err?.error || res.statusText
    if (res.status === 409) {
      const e = new Error(msg) as Error & { status: number }
      e.status = 409
      throw e
    }
    throw new Error(msg)
  }
  return res.json()
}

export const matApi = {
  async listarMateriais(): Promise<MatMaterial[]> {
    return apiFetch<MatMaterial[]>('/api/materiais')
  },

  async buscarMaterial(id: string): Promise<MatMaterial> {
    return apiFetch<MatMaterial>(`/api/materiais/${encodeURIComponent(id)}`)
  },

  async criarMaterial(material: {
    id: string
    nome: string
    descricao?: string | null
    observacoes?: string | null
    foto_thumb?: string | null
    foto?: string | null
    foto_placa?: string | null
    quantidade?: number
  }): Promise<MatMaterial> {
    return apiFetch<MatMaterial>('/api/materiais', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(material),
    })
  },

  async atualizarMaterial(
    id: string,
    campos: Partial<{
      nome: string
      descricao: string | null
      observacoes: string | null
      foto_thumb: string | null
      foto: string | null
      foto_placa: string | null
      quantidade: number
    }>
  ): Promise<MatMaterial> {
    return apiFetch<MatMaterial>(`/api/materiais/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campos),
    })
  },

  async excluirMaterial(id: string): Promise<void> {
    await apiFetch<{ success: boolean }>(`/api/materiais/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
  },

  async listarEmprestimos(): Promise<MatEmprestimo[]> {
    return apiFetch<MatEmprestimo[]>('/api/emprestimos')
  },

  async criarEmprestimo(emp: {
    material_id: string
    material_codigo: string
    material_nome: string
    responsavel: string
    cpf?: string | null
    secretaria?: string | null
    prazo_dias: number
    quantidade?: number
    data_devolucao_prevista?: string | null
    condicao_equipamento?: string | null
    observacoes?: string | null
    agente_emprestador?: string | null
    assinatura_data?: string | null
    tipo: 'emprestimo' | 'manutencao'
  }): Promise<MatEmprestimo> {
    return apiFetch<MatEmprestimo>('/api/emprestimos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emp),
    })
  },

  async registrarDevolucao(
    id: number,
    campos: {
      devolvido_em: string
      devolvido_obs?: string | null
      devolvido_recebedor: string
      devolvido_foto?: string | null
    }
  ): Promise<MatEmprestimo> {
    return apiFetch<MatEmprestimo>(`/api/emprestimos/${id}/devolver`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campos),
    })
  },

  async listarCampo(): Promise<MatEquipamentoCampo[]> {
    return apiFetch<MatEquipamentoCampo[]>('/api/equipamentos-campo')
  },

  async criarCampo(campo: {
    material_id: string
    material_nome: string
    fotos?: string[] | null
    latitude?: number | null
    longitude?: number | null
    rua?: string | null
    numero?: string | null
    bairro?: string | null
    observacao?: string | null
    quantidade?: number
    prazo_dias?: number | null
    data_recolha_prevista?: string | null
    status: 'ativo'
    agente?: string | null
  }): Promise<MatEquipamentoCampo> {
    return apiFetch<MatEquipamentoCampo>('/api/equipamentos-campo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campo),
    })
  },

  async devolverCampo(id: number): Promise<void> {
    await apiFetch<{ success: boolean }>(`/api/equipamentos-campo/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'devolvido' }),
    })
  },

  async excluirCampo(id: number): Promise<void> {
    await apiFetch<{ success: boolean }>(`/api/equipamentos-campo/${id}`, {
      method: 'DELETE',
    })
  },
}
