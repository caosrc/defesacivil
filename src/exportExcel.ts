import type { CellValue as ExcelCellValue, Workbook as ExcelWorkbook } from 'exceljs'
import type { Ocorrencia } from './types'
import { parseDateLocal } from './utils'

export interface ChecklistExportData {
  id: number
  data_checklist: string
  km: string | null
  placa: string | null
  motorista: string | null
  fotos_avarias: string[]
  foto_frontal: string | null
  foto_traseira: string | null
  foto_direita: string | null
  foto_esquerda: string | null
  itens: Record<string, string> | null
  observacoes: string | null
  assinatura_data: string | null
  created_at: string
}

const AZUL = '1a4b8c'
const LARANJA = 'E05F00'
const CINZA_CLARO = 'f3f4f6'
const BRANCO = 'FFFFFF'

const FOTO_W = 120  // largura da miniatura em pixels
const FOTO_H = 90   // altura da miniatura em pixels
const FOTO_COL_W = 17  // largura da coluna em caracteres (≈ 120px)
const ROW_H_PX_TO_PT = 0.75  // 1pt ≈ 1.33px

function nivelLabel(n: string) {
  return n === 'alto' ? 'Alto 🔴' : n === 'medio' ? 'Médio 🟡' : 'Baixo 🟢'
}
function statusLabel(s: string) {
  return s === 'ativo' ? 'Ativo' : 'Resolvido'
}

// ── Export single occurrence with photos ──────────────────────────────────────
export async function exportarOcorrenciaExcel(o: Ocorrencia): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Defesa Civil Ouro Branco'
  wb.created = new Date()

  const ws = wb.addWorksheet('Ocorrência', {
    pageSetup: { orientation: 'landscape', fitToPage: true },
  })

  ws.columns = [
    { width: 28 },
    { width: 38 },
    { width: 4 },
    { width: 32 },
    { width: 32 },
  ]

  ws.mergeCells('A1:E1')
  const titleCell = ws.getCell('A1')
  titleCell.value = 'DEFESA CIVIL OURO BRANCO — RELATÓRIO DE OCORRÊNCIA'
  titleCell.font = { bold: true, size: 14, color: { argb: BRANCO } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 32

  ws.mergeCells('A2:E2')
  const subCell = ws.getCell('A2')
  subCell.value = `Ocorrência #${o.id} — Gerado em ${new Date().toLocaleString('pt-BR')}`
  subCell.font = { italic: true, size: 10, color: { argb: '6b7280' } }
  subCell.alignment = { horizontal: 'center' }
  ws.getRow(2).height = 18

  let row = 4

  function secao(titulo: string) {
    ws.mergeCells(`A${row}:B${row}`)
    const c = ws.getCell(`A${row}`)
    c.value = titulo
    c.font = { bold: true, size: 10, color: { argb: BRANCO } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA } }
    c.alignment = { horizontal: 'left', indent: 1 }
    ws.getRow(row).height = 20
    row++
  }

  function linha(label: string, valor: string | null | undefined) {
    const lCell = ws.getCell(`A${row}`)
    const vCell = ws.getCell(`B${row}`)
    lCell.value = label
    lCell.font = { bold: true, size: 10 }
    lCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA_CLARO.replace('#', '') } }
    lCell.alignment = { vertical: 'top', indent: 1 }
    vCell.value = valor || '—'
    vCell.font = { size: 10 }
    vCell.alignment = { vertical: 'top', wrapText: true }
    vCell.border = { bottom: { style: 'thin', color: { argb: 'e5e7eb' } } }
    lCell.border = { bottom: { style: 'thin', color: { argb: 'e5e7eb' } } }
    ws.getRow(row).height = 18
    row++
  }

  secao('IDENTIFICAÇÃO')
  linha('ID', String(o.id))
  linha('Data da Ocorrência', parseDateLocal(o.data_ocorrencia)?.toLocaleDateString('pt-BR') ?? '—')
  linha('Registrado em', o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '—')
  linha('Tipo', o.tipo)
  linha('Natureza', o.natureza)
  if (o.subnatureza) linha('Detalhe', o.subnatureza)
  linha('Nível de Risco', nivelLabel(o.nivel_risco))
  linha('Status', statusLabel(o.status_oc))

  row++
  secao('LOCALIZAÇÃO')
  linha('Endereço', o.endereco)
  linha('Latitude', o.lat != null ? String(o.lat) : null)
  linha('Longitude', o.lng != null ? String(o.lng) : null)

  row++
  secao('RESPONSÁVEL')
  linha('Proprietário / Morador', o.proprietario)

  row++
  secao('SITUAÇÃO')
  const obsCell = ws.getCell(`A${row}`)
  ws.mergeCells(`A${row}:B${row + 3}`)
  obsCell.value = o.situacao || '—'
  obsCell.font = { size: 10 }
  obsCell.alignment = { vertical: 'top', wrapText: true, indent: 1 }
  ws.getRow(row).height = 18
  row += 4

  if (o.recomendacao) {
    row++
    secao('RECOMENDAÇÃO')
    const recCell = ws.getCell(`A${row}`)
    ws.mergeCells(`A${row}:B${row + 3}`)
    recCell.value = o.recomendacao
    recCell.font = { size: 10 }
    recCell.alignment = { vertical: 'top', wrapText: true, indent: 1 }
    ws.getRow(row).height = 18
    row += 4
  }

  if (o.conclusao) {
    row++
    secao('CONCLUSÃO')
    const conCell = ws.getCell(`A${row}`)
    ws.mergeCells(`A${row}:B${row + 3}`)
    conCell.value = o.conclusao
    conCell.font = { size: 10 }
    conCell.alignment = { vertical: 'top', wrapText: true, indent: 1 }
    ws.getRow(row).height = 18
    row += 4
  }

  if (o.fotos && o.fotos.length > 0) {
    row++
    ws.mergeCells(`A${row}:E${row}`)
    const fotosHeader = ws.getCell(`A${row}`)
    fotosHeader.value = `FOTOS DO REGISTRO (${o.fotos.length})`
    fotosHeader.font = { bold: true, size: 10, color: { argb: BRANCO } }
    fotosHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
    fotosHeader.alignment = { horizontal: 'left', indent: 1 }
    ws.getRow(row).height = 20
    row++

    const ROW_H_PT = Math.round(FOTO_H / ROW_H_PX_TO_PT)
    let fotoRow = row
    let col = 3

    for (let i = 0; i < o.fotos.length; i++) {
      const fotoBase64 = o.fotos[i]
      const base64Data = fotoBase64.includes(',') ? fotoBase64.split(',')[1] : fotoBase64
      const ext = fotoBase64.startsWith('data:image/png') ? 'png' : 'jpeg'

      try {
        const imageId = wb.addImage({ base64: base64Data, extension: ext })
        ws.addImage(imageId, {
          tl: { col: col, row: fotoRow - 1 },
          ext: { width: FOTO_W, height: FOTO_H },
        })
        ws.getRow(fotoRow).height = ROW_H_PT
      } catch {
        // ignora imagem inválida
      }

      col++
      if (col > 4) {
        col = 3
        fotoRow++
        ws.getRow(fotoRow).height = ROW_H_PT
      }
    }
  }

  ws.getCell('A1').border = {
    top: { style: 'medium', color: { argb: AZUL } },
    left: { style: 'medium', color: { argb: AZUL } },
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ocorrencia_${o.id}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Dashboard Analytics Sheet ─────────────────────────────────────────────────
function adicionarAbaDashboard(wb: ExcelWorkbook, ocorrencias: Ocorrencia[]): void {
  const ws = wb.addWorksheet('📊 Dashboard', { views: [{ showGridLines: false }] })

  // Palette
  const C_AZUL   = '1a4b8c'
  const C_LARANJ  = 'c2410c'
  const C_VERDE   = '14532d'
  const C_VERM    = '991b1b'
  const C_AMAR    = '78350f'
  const C_ROXO    = '4c1d95'
  const C_CINZA   = '374151'
  const C_BRANCO  = 'FFFFFF'
  const C_FUNDO   = 'f0f4ff'

  // Columns: A(spacer) | B(label) | C(count) | D(bar) | E(pct) | F(extra)
  ws.columns = [
    { width: 2 },
    { width: 30 },
    { width: 9 },
    { width: 34 },
    { width: 9 },
    { width: 18 },
  ]

  let r = 1

  // ── helpers ───────────────────────────────────────────────────────
  const fmtPct = (n: number, tot: number) =>
    tot === 0 ? '0%' : `${((n / tot) * 100).toFixed(1)}%`

  const bar = (n: number, max: number, len = 30): string => {
    if (max === 0) return '░'.repeat(len)
    const f = Math.round((n / max) * len)
    return '█'.repeat(f) + '░'.repeat(len - f)
  }

  function headerPrincipal(text: string) {
    ws.mergeCells(`A${r}:F${r}`)
    const c = ws.getCell(`A${r}`)
    c.value = text
    c.font = { bold: true, size: 14, color: { argb: C_BRANCO } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(r).height = 40
    r++
  }

  function subHeader(text: string) {
    ws.mergeCells(`A${r}:F${r}`)
    const c = ws.getCell(`A${r}`)
    c.value = text
    c.font = { italic: true, size: 9, color: { argb: '6b7280' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'e8f0fe' } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(r).height = 18
    r++
  }

  function kpiSection(kpis: { label: string; valor: string | number; sub: string; cor: string }[]) {
    r++
    // Title row of KPIs
    kpis.forEach((k, i) => {
      const cols = ['B', 'C', 'D', 'E', 'F']
      const col = cols[i]
      if (!col) return
      const c = ws.getCell(`${col}${r}`)
      c.value = k.label
      c.font = { size: 8, bold: true, color: { argb: C_BRANCO } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: k.cor } }
      c.alignment = { horizontal: 'center', vertical: 'middle' }
    })
    ws.getRow(r).height = 16
    r++
    // Value row
    kpis.forEach((k, i) => {
      const cols = ['B', 'C', 'D', 'E', 'F']
      const col = cols[i]
      if (!col) return
      const c = ws.getCell(`${col}${r}`)
      c.value = k.valor
      c.font = { size: 22, bold: true, color: { argb: k.cor } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: k.cor + '12' } }
      c.alignment = { horizontal: 'center', vertical: 'middle' }
      c.border = {
        bottom: { style: 'medium', color: { argb: k.cor } },
        left:   { style: 'thin', color: { argb: k.cor + '55' } },
        right:  { style: 'thin', color: { argb: k.cor + '55' } },
      }
    })
    ws.getRow(r).height = 38
    r++
    // Sub row
    kpis.forEach((k, i) => {
      const cols = ['B', 'C', 'D', 'E', 'F']
      const col = cols[i]
      if (!col) return
      const c = ws.getCell(`${col}${r}`)
      c.value = k.sub
      c.font = { size: 8, italic: true, color: { argb: '6b7280' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: k.cor + '10' } }
      c.alignment = { horizontal: 'center', vertical: 'middle' }
    })
    ws.getRow(r).height = 14
    r++
  }

  function secaoHeader(titulo: string, cor: string) {
    r++
    ws.mergeCells(`A${r}:F${r}`)
    const c = ws.getCell(`A${r}`)
    c.value = titulo
    c.font = { bold: true, size: 10, color: { argb: C_BRANCO } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } }
    c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    ws.getRow(r).height = 22
    r++
  }

  function colHeader() {
    const hRow = ws.getRow(r)
    const titles = ['', 'Categoria', 'Qtd', 'Distribuição Visual', '%', 'Observação']
    titles.forEach((t, i) => {
      const c = hRow.getCell(i + 1)
      c.value = t
      c.font = { size: 8, bold: true, color: { argb: '6b7280' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f3f4f6' } }
      c.alignment = { horizontal: i <= 1 ? 'left' : 'center', vertical: 'middle' }
      c.border = { bottom: { style: 'thin', color: { argb: 'd1d5db' } } }
    })
    ws.getRow(r).height = 16
    r++
  }

  function barRow(
    rank: number | string,
    label: string,
    count: number,
    total: number,
    maxCount: number,
    cor: string,
    extra = '',
  ) {
    const isEven = (r % 2 === 0)
    const bgFill = isEven ? C_FUNDO : C_BRANCO

    const aCell = ws.getCell(`A${r}`)
    aCell.value = typeof rank === 'number' ? rank : ''
    aCell.font = { size: 8, color: { argb: 'a0aec0' } }
    aCell.alignment = { horizontal: 'center', vertical: 'middle' }
    aCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgFill } }

    const bCell = ws.getCell(`B${r}`)
    bCell.value = label
    bCell.font = { size: 9, color: { argb: C_CINZA } }
    bCell.alignment = { vertical: 'middle', indent: 1 }
    bCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgFill } }

    const cCell = ws.getCell(`C${r}`)
    cCell.value = count
    cCell.font = { size: 10, bold: true, color: { argb: cor } }
    cCell.alignment = { horizontal: 'center', vertical: 'middle' }
    cCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgFill } }

    const dCell = ws.getCell(`D${r}`)
    dCell.value = bar(count, maxCount, 28)
    dCell.font = { size: 9, color: { argb: cor }, name: 'Consolas' }
    dCell.alignment = { vertical: 'middle' }
    dCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor + '18' } }

    const eCell = ws.getCell(`E${r}`)
    eCell.value = fmtPct(count, total)
    eCell.font = { size: 9, italic: true, color: { argb: '6b7280' } }
    eCell.alignment = { horizontal: 'center', vertical: 'middle' }
    eCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgFill } }

    const fCell = ws.getCell(`F${r}`)
    fCell.value = extra
    fCell.font = { size: 8, color: { argb: '9ca3af' } }
    fCell.alignment = { horizontal: 'center', vertical: 'middle' }
    fCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgFill } }

    ;['A','B','C','D','E','F'].forEach(col => {
      ws.getCell(`${col}${r}`).border = {
        bottom: { style: 'hair', color: { argb: 'e5e7eb' } },
      }
    })

    ws.getRow(r).height = 17
    r++
  }

  function rodape(texto: string) {
    ws.mergeCells(`A${r}:F${r}`)
    const c = ws.getCell(`A${r}`)
    c.value = texto
    c.font = { size: 8, italic: true, color: { argb: '9ca3af' } }
    c.alignment = { horizontal: 'center' }
    ws.getRow(r).height = 14
    r++
  }

  // ── Compute analytics ─────────────────────────────────────────────
  const total = ocorrencias.length
  const ativas = ocorrencias.filter(o => o.status_oc === 'ativo').length
  const resolvidas = total - ativas
  const altoR = ocorrencias.filter(o => o.nivel_risco === 'alto').length
  const medioR = ocorrencias.filter(o => o.nivel_risco === 'medio').length
  const baixoR = ocorrencias.filter(o => o.nivel_risco === 'baixo').length

  const freq = <T>(arr: T[]): Map<T, number> => {
    const m = new Map<T, number>()
    arr.forEach(v => m.set(v, (m.get(v) ?? 0) + 1))
    return m
  }

  const sorted = <T>(m: Map<T, number>, lim = 999): [T, number][] =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, lim)

  // Tipo
  const tipoMap = freq(ocorrencias.map(o => o.tipo || 'Não informado'))
  // Natureza
  const naturMap = freq(ocorrencias.map(o => o.natureza || 'Não informado'))
  // Bairro – extrai parte significativa do endereço
  const bairroMap = freq(ocorrencias.map(o => {
    const end = (o.endereco || '').trim()
    if (!end) return 'Não informado'
    const partes = end.split(',').map(p => p.trim()).filter(Boolean)
    if (partes.length >= 3) return partes[partes.length - 2].slice(0, 28)
    if (partes.length === 2) return partes[1].slice(0, 28)
    return partes[0].slice(0, 28)
  }))
  // Agente registrador
  const agenteMap = freq(ocorrencias.map(o => o.responsavel_registro || 'Não informado'))
  // Mensal
  const mesMap = new Map<string, number>()
  const MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  ocorrencias.forEach(o => {
    const raw = o.data_ocorrencia || o.created_at
    if (!raw) return
    const parts = raw.split(/[-T]/)
    if (parts.length < 2) return
    const [y, m] = parts
    const key = `${y}-${m.padStart(2,'0')}`
    mesMap.set(key, (mesMap.get(key) ?? 0) + 1)
  })
  const sortedMes = [...mesMap.entries()].sort((a,b) => a[0].localeCompare(b[0])).slice(-18)

  // Risco ao longo do tempo: top mês com mais alto risco
  const altoPorMes = new Map<string, number>()
  ocorrencias.filter(o => o.nivel_risco === 'alto').forEach(o => {
    const raw = o.data_ocorrencia || o.created_at
    if (!raw) return
    const [y, m] = raw.split(/[-T]/)
    const key = `${y}-${m.padStart(2,'0')}`
    altoPorMes.set(key, (altoPorMes.get(key) ?? 0) + 1)
  })

  // Status por tipo
  const statusPorTipo = new Map<string, { ativo: number; resolvido: number }>()
  ocorrencias.forEach(o => {
    const t = o.tipo || 'Não informado'
    const cur = statusPorTipo.get(t) ?? { ativo: 0, resolvido: 0 }
    if (o.status_oc === 'ativo') cur.ativo++; else cur.resolvido++
    statusPorTipo.set(t, cur)
  })

  // ── Build sheet ────────────────────────────────────────────────────
  headerPrincipal('📊  DEFESA CIVIL OURO BRANCO — PAINEL ANALÍTICO DE OCORRÊNCIAS')
  subHeader(`Gerado em ${new Date().toLocaleString('pt-BR')} · Total de ${total} ocorrências analisadas`)

  // ── KPIs ───────────────────────────────────────────────────────────
  kpiSection([
    { label: '📋 TOTAL', valor: total, sub: 'ocorrências registradas', cor: C_AZUL },
    { label: '🔴 ATIVAS', valor: ativas, sub: `${fmtPct(ativas, total)} em aberto`, cor: C_VERM },
    { label: '✅ RESOLVIDAS', valor: resolvidas, sub: `${fmtPct(resolvidas, total)} concluídas`, cor: C_VERDE },
    { label: '⚠️ ALTO RISCO', valor: altoR, sub: `${fmtPct(altoR, total)} críticas`, cor: C_LARANJ },
    { label: '📡 MÉDIO RISCO', valor: medioR, sub: `${fmtPct(medioR, total)} atenção`, cor: C_AMAR },
  ])

  // ── Gráfico 1: Tipos de Ocorrência ─────────────────────────────────
  secaoHeader('🏷️   TIPOS DE OCORRÊNCIA', C_AZUL)
  colHeader()
  const sortedTipo = sorted(tipoMap)
  const maxTipo = sortedTipo[0]?.[1] ?? 1
  const CORES_TIPO: Record<string, string> = {
    'Diligência': '1d4ed8',
    'Vistoria de Engenharia': '7c3aed',
    'Vistoria Ambiental': '059669',
    'Apoio': 'ea580c',
    'Outro': '64748b',
  }
  sortedTipo.forEach(([tipo, cnt], i) => {
    const cor = CORES_TIPO[tipo] ?? C_CINZA
    const { ativo: a, resolvido: res } = statusPorTipo.get(tipo) ?? { ativo: 0, resolvido: 0 }
    barRow(i + 1, tipo, cnt, total, maxTipo, cor, `✅${res} 🔴${a}`)
  })
  rodape('Distribuição por tipo · cores indicam categoria')

  // ── Gráfico 2: Natureza / Causa ─────────────────────────────────────
  secaoHeader('🌐   NATUREZA / CAUSA DAS OCORRÊNCIAS  (Top 14)', C_ROXO)
  colHeader()
  const sortedNatur = sorted(naturMap, 14)
  const maxNatur = sortedNatur[0]?.[1] ?? 1
  const CORES_NATUR: Record<string, string> = {
    'Árvore Gerando Risco (Caída ou Não)': '15803d',
    'Rompimento de Cabo de Energia': 'ca8a04',
    'Rompimento de Cabo de Telefonia': '7c3aed',
    'Queda de Poste (Total ou Parcial)': '64748b',
    'Óleo na Pista': '92400e',
    'Incêndio em Área Urbana': 'dc2626',
    'Incêndio em Área Rural': 'ea580c',
    'Alagamento': '2563eb',
    'Inundação': '0284c7',
    'Queda de Estrutura': '9f1239',
    'Deslizamento de Massa/Rocha': '92400e',
    'Processo Erosivo': 'b45309',
    'Apreensão e Captura de Animal': '7c3aed',
    'Abelhas/Marimbondo': 'ca8a04',
    'Vistoria Residencial': '0f766e',
    'Talude em Risco': '854d0e',
  }
  sortedNatur.forEach(([nat, cnt], i) => {
    const cor = CORES_NATUR[nat] ?? C_CINZA
    barRow(i + 1, nat, cnt, total, maxNatur, cor)
  })
  rodape('Ranking de causas mais frequentes')

  // ── Gráfico 3: Locais / Bairros ────────────────────────────────────
  secaoHeader('📍   LOCAIS COM MAIS OCORRÊNCIAS  (Top 12)', C_LARANJ)
  colHeader()
  const sortedBairro = sorted(bairroMap, 12)
  const maxBairro = sortedBairro[0]?.[1] ?? 1
  const PALETTE_LOC = ['e63946','457b9d','2a9d8f','e9c46a','f4a261','264653','6d2b3d','2d6a4f','f3722c','577590','4d908e','277da1']
  sortedBairro.forEach(([bairro, cnt], i) => {
    barRow(i + 1, bairro, cnt, total, maxBairro, PALETTE_LOC[i % PALETTE_LOC.length])
  })
  rodape('Extrato do endereço · localidades com maior concentração de ocorrências')

  // ── Gráfico 4: Evolução Mensal ──────────────────────────────────────
  secaoHeader('📅   EVOLUÇÃO MENSAL DE OCORRÊNCIAS', '0f4c75')
  colHeader()
  const maxMes = Math.max(...sortedMes.map(([, c]) => c), 1)
  const totalMesGeral = sortedMes.reduce((s, [, c]) => s + c, 0)
  sortedMes.forEach(([key, cnt]) => {
    const [y, m] = key.split('-')
    const mi = parseInt(m, 10) - 1
    const label = `${MESES_PT[mi] ?? m}/${y}`
    const altoMes = altoPorMes.get(key) ?? 0
    const risco = altoMes > 0 ? `⚠️ ${altoMes} críticas` : '—'
    const gradPct = cnt / maxMes
    const cor = gradPct > 0.75 ? C_VERM : gradPct > 0.5 ? C_LARANJ : gradPct > 0.25 ? C_AMAR : '16a34a'
    barRow('', label, cnt, totalMesGeral, maxMes, cor, risco)
  })
  rodape('Série histórica · cor varia por volume: verde→amarelo→laranja→vermelho')

  // ── Gráfico 5: Nível de Risco ──────────────────────────────────────
  secaoHeader('🎯   DISTRIBUIÇÃO POR NÍVEL DE RISCO', C_VERM)
  colHeader()
  const riscos: [string, number, string][] = [
    ['🔴 Alto Risco — Emergência', altoR, C_VERM],
    ['🟡 Médio Risco — Atenção', medioR, C_AMAR],
    ['🟢 Baixo Risco — Normal', baixoR, C_VERDE],
  ]
  riscos.forEach(([label, cnt, cor]) => {
    barRow('', label, cnt, total, altoR > medioR ? altoR : medioR > baixoR ? medioR : baixoR, cor,
      fmtPct(cnt, total))
  })

  // Indice de resolução por risco
  r++
  ;['Alto','Médio','Baixo'].forEach((nivel, ni) => {
    const nKey = ['alto','medio','baixo'][ni] as 'alto' | 'medio' | 'baixo'
    const sub = ocorrencias.filter(o => o.nivel_risco === nKey)
    const resS = sub.filter(o => o.status_oc === 'resolvido').length
    const cor = ['C_VERM','C_AMAR','C_VERDE'][ni]
    const corHex = [C_VERM, C_AMAR, C_VERDE][ni]
    ws.mergeCells(`B${r}:F${r}`)
    const c = ws.getCell(`B${r}`)
    c.value = `  ${['🔴','🟡','🟢'][ni]}  ${nivel} Risco: ${sub.length} ocorrências · ${resS} resolvidas (${fmtPct(resS, sub.length)}) · ${sub.length - resS} em aberto`
    c.font = { size: 9, color: { argb: corHex }, bold: ni === 0 }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: corHex + '14' } }
    c.alignment = { vertical: 'middle', indent: 1 }
    c.border = { bottom: { style: 'hair', color: { argb: 'e5e7eb' } } }
    ws.getRow(r).height = 16
    r++
  })
  rodape('Percentual de resolução por nível de criticidade')

  // ── Gráfico 6: Por Agente Registrador ─────────────────────────────
  secaoHeader('👤   OCORRÊNCIAS POR AGENTE REGISTRADOR', C_VERDE)
  colHeader()
  const sortedAgente = sorted(agenteMap)
  const maxAgente = sortedAgente[0]?.[1] ?? 1
  const CORES_AG = ['1d4ed8','7c3aed','059669','ea580c','0891b2','db2777','b45309','475569','dc2626','ca8a04']
  sortedAgente.forEach(([ag, cnt], i) => {
    const resAg = ocorrencias.filter(o => (o.responsavel_registro || 'Não informado') === ag && o.status_oc === 'resolvido').length
    barRow(i + 1, ag, cnt, total, maxAgente, CORES_AG[i % CORES_AG.length],
      `${fmtPct(resAg, cnt)} resolvidas`)
  })
  rodape('Quem mais registrou ocorrências · percentual de resolução por agente')

  // ── Rodapé final ────────────────────────────────────────────────────
  r++
  ws.mergeCells(`A${r}:F${r}`)
  const footer = ws.getCell(`A${r}`)
  footer.value = `🛡️ Defesa Civil de Ouro Branco — MG  ·  Relatório gerado automaticamente  ·  ${new Date().toLocaleDateString('pt-BR')}`
  footer.font = { size: 8, italic: true, color: { argb: 'a0aec0' } }
  footer.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C_AZUL } }
  footer.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(r).height = 22
}

// ── Export all occurrences (tabular) with embedded photo thumbnails ───────────
export async function exportarTodasExcel(ocorrencias: Ocorrencia[]): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Defesa Civil Ouro Branco'
  wb.created = new Date()

  const ws = wb.addWorksheet('Ocorrências')

  const maxFotos = ocorrencias.reduce((max, o) => Math.max(max, o.fotos?.length ?? 0), 0)
  const totalCols = 15 + maxFotos

  // ── Linha 1: título ───────────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, totalCols)
  const titulo = ws.getCell('A1')
  titulo.value = `DEFESA CIVIL OURO BRANCO — TODAS AS OCORRÊNCIAS — Gerado em ${new Date().toLocaleString('pt-BR')}`
  titulo.font = { bold: true, size: 12, color: { argb: BRANCO } }
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA } }
  titulo.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 26

  // ── Linha 2: cabeçalhos das colunas ──────────────────────────────────────
  const cabecalhos = [
    'ID', 'Data Ocorrência', 'Registrado em', 'Tipo', 'Natureza', 'Detalhe',
    'Nível de Risco', 'Status', 'Endereço', 'Latitude', 'Longitude',
    'Proprietário', 'Situação', 'Recomendação', 'Conclusão',
    ...Array.from({ length: maxFotos }, (_, i) => `Foto ${i + 1}`),
  ]

  const larguras = [6, 16, 20, 14, 26, 20, 14, 12, 32, 12, 12, 26, 40, 40, 40,
    ...Array(maxFotos).fill(FOTO_COL_W)]

  ws.columns = larguras.map((w) => ({ width: w }))

  const headerRow = ws.getRow(2)
  cabecalhos.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, size: 10, color: { argb: BRANCO } }
    cell.fill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: i >= 15 ? LARANJA : AZUL },
    }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { bottom: { style: 'thin', color: { argb: BRANCO } } }
  })
  headerRow.height = 22

  // ── Filtro e freeze ───────────────────────────────────────────────────────
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: totalCols } }
  ws.views = [{ state: 'frozen', ySplit: 2 }]

  // ── Linhas de dados (começam na linha 3) ─────────────────────────────────
  const ROW_H_PT = Math.round(FOTO_H / ROW_H_PX_TO_PT)
  const LINHA_INICIO = 3  // primeira linha de dados (1-indexed)

  ocorrencias.forEach((o, idx) => {
    const temFotos = o.fotos && o.fotos.length > 0
    const linhaNum = LINHA_INICIO + idx
    const r = ws.getRow(linhaNum)

    const valores = [
      o.id,
      parseDateLocal(o.data_ocorrencia)?.toLocaleDateString('pt-BR') ?? '—',
      o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '—',
      o.tipo,
      o.natureza,
      o.subnatureza || '—',
      nivelLabel(o.nivel_risco),
      statusLabel(o.status_oc),
      o.endereco || '—',
      o.lat ?? '—',
      o.lng ?? '—',
      o.proprietario || '—',
      o.situacao || '—',
      o.recomendacao || '—',
      o.conclusao || '—',
    ]

    valores.forEach((v, i) => { r.getCell(i + 1).value = v as ExcelCellValue })

    r.height = temFotos ? ROW_H_PT : 18

    const isEven = idx % 2 === 1
    r.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { size: 10 }
      cell.alignment = { vertical: 'middle', wrapText: false }
      if (isEven) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f0f4ff' } }
    })

    // Cor do nível de risco (coluna 7)
    const nivelCell = r.getCell(7)
    if (o.nivel_risco === 'alto') nivelCell.font = { bold: true, size: 10, color: { argb: 'dc2626' } }
    else if (o.nivel_risco === 'medio') nivelCell.font = { bold: true, size: 10, color: { argb: 'd97706' } }
    else nivelCell.font = { bold: true, size: 10, color: { argb: '059669' } }

    // Incorpora fotos — linha 0-indexed = linhaNum - 1
    if (temFotos) {
      o.fotos!.forEach((fotoBase64, fotoIdx) => {
        const base64Data = fotoBase64.includes(',') ? fotoBase64.split(',')[1] : fotoBase64
        const ext = fotoBase64.startsWith('data:image/png') ? 'png' : 'jpeg'
        const colIdx = 15 + fotoIdx  // 0-indexed: coluna 16 em diante

        try {
          const imageId = wb.addImage({ base64: base64Data, extension: ext })
          ws.addImage(imageId, {
            tl: { col: colIdx, row: linhaNum - 1 },
            ext: { width: FOTO_W, height: FOTO_H },
          })
        } catch {
          // ignora imagem inválida
        }
      })
    }
  })

  // ── Aba de Dashboard Analítico ────────────────────────────────────
  adicionarAbaDashboard(wb, ocorrencias)

  // Ativa a aba de dados como padrão ao abrir
  ws.state = 'visible'

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `defesacivil_ourobranco_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Export checklists da viatura ──────────────────────────────────────────────
export async function exportarChecklistExcel(checklists: ChecklistExportData[]): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Defesa Civil Ouro Branco'
  wb.created = new Date()

  const ws = wb.addWorksheet('Checklists', {
    pageSetup: { orientation: 'landscape', fitToPage: true },
  })

  const LABELS_BMR: Record<string, string> = { bom: 'Bom', medio: 'Médio', ruim: 'Ruim' }
  const LABELS_SN: Record<string, string> = { sim: 'Sim', nao: 'Não', na: 'N/A' }

  const ITENS_LABELS: [string, string, 'bmr' | 'sn'][] = [
    ['limpezaExterna', 'Limpeza Externa', 'bmr'],
    ['limpezaInterna', 'Limpeza Interna', 'bmr'],
    ['pneus', 'Pneus', 'bmr'],
    ['estepe', 'Estepe', 'bmr'],
    ['ltzPlaca', 'Luz Placa (Tras.)', 'sn'],
    ['ltzDirLuz', 'Luz Tras. Dir.', 'sn'],
    ['ltzDirLuzRe', 'Luz Ré Dir.', 'sn'],
    ['ltzDirFreio', 'Freio Dir.', 'sn'],
    ['ltzDirSeta', 'Seta Tras. Dir.', 'sn'],
    ['ltzEsqLuz', 'Luz Tras. Esq.', 'sn'],
    ['ltzEsqLuzRe', 'Luz Ré Esq.', 'sn'],
    ['ltzEsqFreio', 'Freio Esq.', 'sn'],
    ['ltzEsqSeta', 'Seta Tras. Esq.', 'sn'],
    ['ldzPlaca', 'Luz Placa (Diant.)', 'sn'],
    ['ldzDirFarolAlto', 'Farol Alto Dir.', 'sn'],
    ['ldzDirFarolBaixo', 'Farol Baixo Dir.', 'sn'],
    ['ldzDirNeblina', 'Neblina Dir.', 'sn'],
    ['ldzEsqFarolAlto', 'Farol Alto Esq.', 'sn'],
    ['ldzEsqFarolBaixo', 'Farol Baixo Esq.', 'sn'],
    ['ldzEsqSeta', 'Seta Diant. Esq.', 'sn'],
    ['ldzEsqNeblina', 'Neblina Esq.', 'sn'],
    ['segAlarme', 'Alarme', 'sn'],
    ['segBuzina', 'Buzina', 'sn'],
    ['segChaveRoda', 'Chave de Roda', 'sn'],
    ['segCintos', 'Cintos', 'sn'],
    ['segDocumentos', 'Documentos', 'sn'],
    ['segExtintor', 'Extintor', 'sn'],
    ['segLimpadores', 'Limpadores', 'sn'],
    ['segMacaco', 'Macaco', 'sn'],
    ['segPainel', 'Painel', 'sn'],
    ['segRetrovisorInterno', 'Retrovisor Int.', 'sn'],
    ['segRetrovisorDireito', 'Retrovisor Dir.', 'sn'],
    ['segRetrovisorEsquerdo', 'Retrovisor Esq.', 'sn'],
    ['segTravas', 'Travas', 'sn'],
    ['segTriangulo', 'Triângulo', 'sn'],
    ['motAcelerador', 'Acelerador', 'sn'],
    ['motAguaLimpador', 'Água Limpador', 'sn'],
    ['motAguaRadiador', 'Água Radiador', 'sn'],
    ['motEmbreagem', 'Embreagem', 'sn'],
    ['motFreio', 'Freio', 'sn'],
    ['motFreioMao', 'Freio de Mão', 'sn'],
    ['motOleoFreio', 'Óleo Freio', 'sn'],
    ['motOleoMoto', 'Óleo Motor', 'sn'],
    ['motTanquePartida', 'Tanque/Partida', 'sn'],
  ]

  const fotosFixas = ['Foto Esquerda', 'Foto Frontal', 'Foto Traseira', 'Foto Direita']
  const maxAvarias = checklists.reduce((max, c) => Math.max(max, c.fotos_avarias?.length ?? 0), 0)
  const fotosAvariasHeaders = Array.from({ length: maxAvarias }, (_, i) => `Foto Avaria ${i + 1}`)
  const fotoHeaders = [...fotosFixas, ...fotosAvariasHeaders]
  const totalCols = 8 + ITENS_LABELS.length + fotoHeaders.length
  const FOTO_CHECKLIST_SIZE = 110
  const FOTO_CHECKLIST_COL_W = 16
  const FOTO_CHECKLIST_ROW_H = Math.round(FOTO_CHECKLIST_SIZE / ROW_H_PX_TO_PT)

  ws.mergeCells(1, 1, 1, totalCols)
  const titulo = ws.getCell('A1')
  titulo.value = `DEFESA CIVIL OURO BRANCO — CHECKLISTS DA VIATURA — Gerado em ${new Date().toLocaleString('pt-BR')}`
  titulo.font = { bold: true, size: 12, color: { argb: BRANCO } }
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  titulo.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 26

  const cabecalhos = [
    'ID', 'Data', 'Motorista', 'Placa', 'KM', 'Avarias', 'Assinado', 'Observações',
    ...ITENS_LABELS.map(([, label]) => label),
    ...fotoHeaders,
  ]
  const larguras = [
    5, 12, 14, 10, 10, 8, 10, 28,
    ...Array(ITENS_LABELS.length).fill(14),
    ...Array(fotoHeaders.length).fill(FOTO_CHECKLIST_COL_W),
  ]
  ws.columns = larguras.map(w => ({ width: w }))

  const headerRow = ws.getRow(2)
  cabecalhos.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, size: 9, color: { argb: BRANCO } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i < 8 ? AZUL : i < 8 + ITENS_LABELS.length ? LARANJA : '166534' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: BRANCO } } }
  })
  headerRow.height = 36

  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: totalCols } }
  ws.views = [{ state: 'frozen', ySplit: 2 }]

  checklists.forEach((c, idx) => {
    const linhaNum = 3 + idx
    const r = ws.getRow(linhaNum)
    const it = c.itens || {}
    const [y,m,d] = String(c.data_checklist || '').split('T')[0].split('-')
    const fotosLinha = [
      c.foto_esquerda,
      c.foto_frontal,
      c.foto_traseira,
      c.foto_direita,
      ...(c.fotos_avarias || []),
    ]

    const valores = [
      c.id,
      `${d}/${m}/${y}`,
      c.motorista || '—',
      c.placa || '—',
      c.km || '—',
      c.fotos_avarias?.length ?? 0,
      c.assinatura_data ? 'Sim' : 'Não',
      c.observacoes || '—',
      ...ITENS_LABELS.map(([campo, , tipo]) => {
        const v = it[campo] || ''
        return tipo === 'bmr' ? (LABELS_BMR[v] || '—') : (LABELS_SN[v] || '—')
      }),
      ...fotoHeaders.map((_, fotoIdx) => fotosLinha[fotoIdx] ? 'Foto' : '—'),
    ]

    valores.forEach((v, i) => { r.getCell(i + 1).value = v as ExcelCellValue })

    r.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = { size: 9 }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      if (colNum <= 2) cell.alignment = { ...cell.alignment, horizontal: 'left' }
      if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f0f4ff' } }

      if (colNum > 8 && colNum <= 8 + ITENS_LABELS.length) {
        const itenIdx = colNum - 9
        const [campo, , tipo] = ITENS_LABELS[itenIdx]
        const raw = it[campo] || ''
        if (tipo === 'bmr') {
          if (raw === 'bom') cell.font = { size: 9, bold: true, color: { argb: '15803d' } }
          else if (raw === 'medio') cell.font = { size: 9, bold: true, color: { argb: 'd97706' } }
          else if (raw === 'ruim') cell.font = { size: 9, bold: true, color: { argb: 'dc2626' } }
        } else {
          if (raw === 'sim') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'd1fae5' } }
          else if (raw === 'nao') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'fee2e2' } }
          else if (raw === 'na') cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f3f4f6' } }
        }
      }

      if (colNum > 8 + ITENS_LABELS.length) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
        cell.border = {
          top: { style: 'thin', color: { argb: 'd1d5db' } },
          left: { style: 'thin', color: { argb: 'd1d5db' } },
          bottom: { style: 'thin', color: { argb: 'd1d5db' } },
          right: { style: 'thin', color: { argb: 'd1d5db' } },
        }
      }
    })

    const temFoto = fotosLinha.some(Boolean)
    r.height = temFoto ? FOTO_CHECKLIST_ROW_H : 16

    fotosLinha.forEach((fotoBase64, fotoIdx) => {
      if (!fotoBase64) return
      const base64Data = fotoBase64.includes(',') ? fotoBase64.split(',')[1] : fotoBase64
      const ext = fotoBase64.startsWith('data:image/png') ? 'png' : 'jpeg'
      const colIdx = 8 + ITENS_LABELS.length + fotoIdx
      try {
        const imageId = wb.addImage({ base64: base64Data, extension: ext })
        ws.addImage(imageId, {
          tl: { col: colIdx, row: linhaNum - 1 },
          ext: { width: FOTO_CHECKLIST_SIZE, height: FOTO_CHECKLIST_SIZE },
        })
      } catch {
        // ignora imagem inválida
      }
    })
  })

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `checklists_viatura_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
