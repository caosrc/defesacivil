import type { CellValue as ExcelCellValue, Workbook as ExcelWorkbook } from 'exceljs'
import type { Ocorrencia } from './types'
import { parseDateLocal } from './utils'
import { gerarDashboardImagem } from './exportDashboardImage'

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

  // ── Vistorias adicionais (Interdição de Imóvel) ──
  const vistoriasAdic = Array.isArray(o.vistorias) ? o.vistorias : []
  if (vistoriasAdic.length > 0) {
    row++
    ws.mergeCells(`A${row}:E${row}`)
    const vistoriasHeader = ws.getCell(`A${row}`)
    vistoriasHeader.value = `VISTORIAS ADICIONAIS (${vistoriasAdic.length})`
    vistoriasHeader.font = { bold: true, size: 10, color: { argb: BRANCO } }
    vistoriasHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'B91C1C' } }
    vistoriasHeader.alignment = { horizontal: 'left', indent: 1 }
    ws.getRow(row).height = 20
    row++

    vistoriasAdic.forEach((v, vIdx) => {
      const dataFmt = v.data ? new Date(v.data).toLocaleString('pt-BR') : '—'
      linha(`Vistoria #${vIdx + 1} — Data`, dataFmt)
      if (v.agente) linha(`Vistoria #${vIdx + 1} — Agente`, v.agente)
      const obsCellV = ws.getCell(`A${row}`)
      ws.mergeCells(`A${row}:B${row + 2}`)
      obsCellV.value = v.observacao || '—'
      obsCellV.font = { size: 10 }
      obsCellV.alignment = { vertical: 'top', wrapText: true, indent: 1 }
      ws.getRow(row).height = 18
      row += 3

      if (Array.isArray(v.fotos) && v.fotos.length > 0) {
        const ROW_H_PT_V = Math.round(FOTO_H / ROW_H_PX_TO_PT)
        let fRow = row
        let col = 3
        for (let i = 0; i < v.fotos.length; i++) {
          const fb = v.fotos[i]
          const data = fb.includes(',') ? fb.split(',')[1] : fb
          const ext = fb.startsWith('data:image/png') ? 'png' : 'jpeg'
          try {
            const imageId = wb.addImage({ base64: data, extension: ext })
            ws.addImage(imageId, {
              tl: { col, row: fRow - 1 },
              ext: { width: FOTO_W, height: FOTO_H },
            })
            ws.getRow(fRow).height = ROW_H_PT_V
          } catch { /* ignora */ }
          col++
          if (col > 4) { col = 3; fRow++; ws.getRow(fRow).height = ROW_H_PT_V }
        }
        row = fRow + 1
      }
      row++
    })
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


// ── Dashboard Analytics Sheet (visual, com gráficos) ──────────────────────────
async function adicionarAbaDashboard(wb: ExcelWorkbook, ocorrencias: Ocorrencia[]): Promise<void> {
  const ws = wb.addWorksheet('📊 Dashboard', {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  })

  // Renderiza o painel como imagem PNG (mesmo visual do app: KPIs, donuts, barras, sparkline)
  let imagem: { base64: string; largura: number; altura: number } | null = null
  try {
    imagem = await gerarDashboardImagem(ocorrencias)
  } catch {
    imagem = null
  }

  // Configuração das colunas: 1 grid largo para acomodar a imagem (~1400px)
  // Excel: 1 unidade de largura ≈ 7px. 1400px ÷ 7 ≈ 200 unidades. Vamos usar 14 colunas de ~14.5.
  ws.columns = Array.from({ length: 14 }, () => ({ width: 14.5 }))

  if (imagem && imagem.base64) {
    try {
      const imageId = wb.addImage({ base64: imagem.base64, extension: 'png' })
      // Posiciona a imagem ocupando toda a largura útil. Tamanho proporcional ao SVG original (1400×1620).
      const larguraDestinoPx = 1280
      const proporcao = imagem.altura / imagem.largura
      const alturaDestinoPx = Math.round(larguraDestinoPx * proporcao)
      ws.addImage(imageId, {
        tl: { col: 0.2, row: 0.2 },
        ext: { width: larguraDestinoPx, height: alturaDestinoPx },
      })

      // Reserva linhas embaixo da imagem para que o conteúdo seguinte não sobreponha.
      // 1 linha padrão ≈ 20px. Para alturaDestinoPx px → ~ alturaDestinoPx/20 linhas.
      const linhasReservadas = Math.ceil(alturaDestinoPx / 20) + 2
      for (let i = 1; i <= linhasReservadas; i++) ws.getRow(i).height = 20
    } catch {
      // Se falhar a imagem, segue só com o resumo textual abaixo
    }
  }

  // ── Tabela compacta complementar (logo abaixo da imagem) ──────────────────
  // Permite filtrar/ordenar dados que a imagem não permite.
  const inicioTabela = imagem ? Math.ceil((Math.round(1280 * (imagem.altura / imagem.largura))) / 20) + 4 : 2
  let r = inicioTabela

  const total = ocorrencias.length
  const fmtPct = (n: number, t: number) => (t === 0 ? '0%' : `${((n / t) * 100).toFixed(1)}%`)

  function tituloSecao(texto: string, cor: string) {
    ws.mergeCells(`A${r}:N${r}`)
    const c = ws.getCell(`A${r}`)
    c.value = texto
    c.font = { bold: true, size: 11, color: { argb: BRANCO } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } }
    c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    ws.getRow(r).height = 22
    r++
  }

  function colunasTabela() {
    const titulos = ['Categoria', 'Qtd', '%', 'Detalhe']
    // Categoria: A:G (7 cols), Qtd: H, %: I, Detalhe: J:N (5 cols)
    ws.mergeCells(`A${r}:G${r}`); ws.getCell(`A${r}`).value = titulos[0]
    ws.getCell(`H${r}`).value = titulos[1]
    ws.getCell(`I${r}`).value = titulos[2]
    ws.mergeCells(`J${r}:N${r}`); ws.getCell(`J${r}`).value = titulos[3]
    ;['A','H','I','J'].forEach((col) => {
      const c = ws.getCell(`${col}${r}`)
      c.font = { bold: true, size: 9, color: { argb: '6b7280' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f3f4f6' } }
      c.alignment = { horizontal: col === 'A' || col === 'J' ? 'left' : 'center', vertical: 'middle', indent: 1 }
      c.border = { bottom: { style: 'thin', color: { argb: 'd1d5db' } } }
    })
    ws.getRow(r).height = 18
    r++
  }

  function linhaTabela(label: string, qtd: number, totalDiv: number, detalhe: string, cor: string) {
    const isEven = (r % 2 === 0)
    const fundo = isEven ? 'f8fafc' : BRANCO
    ws.mergeCells(`A${r}:G${r}`)
    const a = ws.getCell(`A${r}`)
    a.value = label
    a.font = { size: 10, color: { argb: '1e293b' } }
    a.alignment = { vertical: 'middle', indent: 1 }
    a.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fundo } }

    const h = ws.getCell(`H${r}`)
    h.value = qtd
    h.font = { size: 10, bold: true, color: { argb: cor.replace('#', '') } }
    h.alignment = { horizontal: 'center', vertical: 'middle' }
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fundo } }

    const i = ws.getCell(`I${r}`)
    i.value = fmtPct(qtd, totalDiv)
    i.font = { size: 10, italic: true, color: { argb: '6b7280' } }
    i.alignment = { horizontal: 'center', vertical: 'middle' }
    i.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fundo } }

    ws.mergeCells(`J${r}:N${r}`)
    const j = ws.getCell(`J${r}`)
    j.value = detalhe
    j.font = { size: 9, color: { argb: '64748b' } }
    j.alignment = { vertical: 'middle', indent: 1 }
    j.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fundo } }

    ;['A','H','I','J'].forEach(col => {
      ws.getCell(`${col}${r}`).border = { bottom: { style: 'hair', color: { argb: 'e5e7eb' } } }
    })
    ws.getRow(r).height = 16
    r++
  }

  // — Por tipo
  const freq = <T,>(arr: T[]): Map<T, number> => {
    const m = new Map<T, number>()
    arr.forEach(v => m.set(v, (m.get(v) ?? 0) + 1))
    return m
  }
  const tipoMap = freq(ocorrencias.map(o => o.tipo || 'Não informado'))
  const sortedTipo = [...tipoMap.entries()].sort((a, b) => b[1] - a[1])

  const statusPorTipo = new Map<string, { ativo: number; resolvido: number }>()
  ocorrencias.forEach(o => {
    const t = o.tipo || 'Não informado'
    const cur = statusPorTipo.get(t) ?? { ativo: 0, resolvido: 0 }
    if (o.status_oc === 'ativo') cur.ativo++; else cur.resolvido++
    statusPorTipo.set(t, cur)
  })

  tituloSecao('🏷️  Tipos de Ocorrência', AZUL)
  colunasTabela()
  sortedTipo.forEach(([tipo, cnt]) => {
    const { ativo: a, resolvido: res } = statusPorTipo.get(tipo) ?? { ativo: 0, resolvido: 0 }
    linhaTabela(tipo, cnt, total, `${res} resolvidas · ${a} em aberto`, AZUL)
  })

  r++

  // — Por agente registrador
  const agenteMap = freq(ocorrencias.map(o => o.responsavel_registro || 'Não informado'))
  const sortedAgente = [...agenteMap.entries()].sort((a, b) => b[1] - a[1])

  tituloSecao('👤  Ocorrências por Agente Registrador', LARANJA)
  colunasTabela()
  sortedAgente.forEach(([ag, cnt]) => {
    const resAg = ocorrencias.filter(o => (o.responsavel_registro || 'Não informado') === ag && o.status_oc === 'resolvido').length
    linhaTabela(ag, cnt, total, `${fmtPct(resAg, cnt)} resolvidas`, LARANJA)
  })

  r++

  // — Evolução mensal (últimos 12 meses)
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
  const sortedMes = [...mesMap.entries()].sort((a,b) => a[0].localeCompare(b[0])).slice(-12)
  const totalMes = sortedMes.reduce((s, [, c]) => s + c, 0) || 1

  tituloSecao('📅  Evolução Mensal (últimos 12 meses)', '0f4c75')
  colunasTabela()
  sortedMes.forEach(([key, cnt]) => {
    const [y, m] = key.split('-')
    const mi = parseInt(m, 10) - 1
    const label = `${MESES_PT[mi] ?? m}/${y}`
    linhaTabela(label, cnt, totalMes, '', '0f4c75')
  })

  // Rodapé
  r++
  ws.mergeCells(`A${r}:N${r}`)
  const footer = ws.getCell(`A${r}`)
  footer.value = `🛡️ Defesa Civil de Ouro Branco — MG  ·  Relatório automático  ·  ${new Date().toLocaleDateString('pt-BR')}`
  footer.font = { size: 9, italic: true, color: { argb: 'BRANCO' === BRANCO ? 'cbd5e1' : 'cbd5e1' } }
  footer.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
  footer.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(r).height = 22

  // Imprime cabeçalho da imagem na primeira linha (caso a imagem falhe, fica vazio)
  ws.getRow(1).height = imagem ? 20 : 22
}

// ── Export all occurrences (tabular) with embedded photo thumbnails ───────────
export async function exportarTodasExcel(ocorrencias: Ocorrencia[]): Promise<void> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Defesa Civil Ouro Branco'
  wb.created = new Date()

  const ws = wb.addWorksheet('Ocorrências')

  const maxFotos = ocorrencias.reduce((max, o) => Math.max(max, o.fotos?.length ?? 0), 0)
  // Colunas extras p/ vistorias adicionais (Interdição de Imóvel)
  const COLS_BASE = 15 + 3 // 15 anteriores + 3 colunas de vistorias adicionais
  const totalCols = COLS_BASE + maxFotos

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
    'Vistorias Adicionais (qtd)', 'Última Vistoria', 'Observações das Vistorias',
    ...Array.from({ length: maxFotos }, (_, i) => `Foto ${i + 1}`),
  ]

  const larguras = [6, 16, 20, 14, 26, 20, 14, 12, 32, 12, 12, 26, 40, 40, 40,
    14, 18, 50,
    ...Array(maxFotos).fill(FOTO_COL_W)]

  ws.columns = larguras.map((w) => ({ width: w }))

  const headerRow = ws.getRow(2)
  cabecalhos.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, size: 10, color: { argb: BRANCO } }
    // Colunas 16, 17, 18 = Vistorias (vermelho); >= 19 = Fotos (laranja); demais = azul
    let bg = AZUL
    if (i >= 15 && i < 18) bg = 'B91C1C'
    else if (i >= 18) bg = LARANJA
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
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

    const vAdic = Array.isArray(o.vistorias) ? o.vistorias : []
    const ultimaV = vAdic.length > 0 ? vAdic[vAdic.length - 1] : null
    const ultimaVistoriaTxt = ultimaV
      ? new Date(ultimaV.data).toLocaleDateString('pt-BR')
      : '—'
    const obsVistoriasTxt = vAdic.length > 0
      ? vAdic.map((v, i) => {
          const d = new Date(v.data).toLocaleDateString('pt-BR')
          const ag = v.agente ? ` [${v.agente}]` : ''
          const fc = Array.isArray(v.fotos) && v.fotos.length > 0 ? ` (📷 ${v.fotos.length})` : ''
          return `#${i + 1} ${d}${ag}${fc}: ${v.observacao || '—'}`
        }).join('\n')
      : '—'

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
      vAdic.length,
      ultimaVistoriaTxt,
      obsVistoriasTxt,
    ]

    valores.forEach((v, i) => { r.getCell(i + 1).value = v as ExcelCellValue })

    r.height = temFotos ? ROW_H_PT : 18

    const isEven = idx % 2 === 1
    r.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { size: 10 }
      cell.alignment = { vertical: 'middle', wrapText: false }
      if (isEven) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f0f4ff' } }
    })

    // Wrap text na coluna de observações das vistorias (col 18)
    r.getCell(18).alignment = { vertical: 'top', wrapText: true }

    // Destaque para qtd de vistorias se houver
    if (vAdic.length > 0) {
      r.getCell(16).font = { bold: true, size: 10, color: { argb: 'B91C1C' } }
      r.getCell(16).alignment = { horizontal: 'center', vertical: 'middle' }
    }

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
        const colIdx = 18 + fotoIdx  // 0-indexed: coluna 19 em diante (após Vistorias)

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
  await adicionarAbaDashboard(wb, ocorrencias)

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
  const totalCols = 9 + ITENS_LABELS.length + fotoHeaders.length
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
    'ID', 'Data', 'Motorista', 'Placa', 'KM', 'Combustível', 'Avarias', 'Assinado', 'Observações',
    ...ITENS_LABELS.map(([, label]) => label),
    ...fotoHeaders,
  ]
  const larguras = [
    5, 12, 14, 10, 10, 11, 8, 10, 28,
    ...Array(ITENS_LABELS.length).fill(14),
    ...Array(fotoHeaders.length).fill(FOTO_CHECKLIST_COL_W),
  ]
  ws.columns = larguras.map(w => ({ width: w }))

  const headerRow = ws.getRow(2)
  cabecalhos.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true, size: 9, color: { argb: BRANCO } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i < 9 ? AZUL : i < 9 + ITENS_LABELS.length ? LARANJA : '166534' } }
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
      it.nivelCombustivel || '—',
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

      if (colNum > 9 && colNum <= 9 + ITENS_LABELS.length) {
        const itenIdx = colNum - 10
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

      if (colNum > 9 + ITENS_LABELS.length) {
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
      const colIdx = 9 + ITENS_LABELS.length + fotoIdx
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
