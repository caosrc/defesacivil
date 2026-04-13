import ExcelJS from 'exceljs'
import type { Ocorrencia } from './types'

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
  linha('Data da Ocorrência', o.data_ocorrencia ? new Date(o.data_ocorrencia + 'T00:00:00').toLocaleDateString('pt-BR') : '—')
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
  secao('OBSERVAÇÕES')
  const obsCell = ws.getCell(`A${row}`)
  ws.mergeCells(`A${row}:B${row + 3}`)
  obsCell.value = o.observacoes || '—'
  obsCell.font = { size: 10 }
  obsCell.alignment = { vertical: 'top', wrapText: true, indent: 1 }
  ws.getRow(row).height = 18
  row += 4

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

// ── Export all occurrences (tabular) with embedded photo thumbnails ───────────
export async function exportarTodasExcel(ocorrencias: Ocorrencia[]): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Defesa Civil Ouro Branco'
  wb.created = new Date()

  const ws = wb.addWorksheet('Ocorrências')

  // Descobre o maior número de fotos entre todas as ocorrências
  const maxFotos = ocorrencias.reduce((max, o) => Math.max(max, o.fotos?.length ?? 0), 0)

  // Colunas de dados fixas
  const colsDados: Partial<ExcelJS.Column>[] = [
    { header: 'ID',              key: 'id',              width: 6  },
    { header: 'Data Ocorrência', key: 'data_ocorrencia', width: 16 },
    { header: 'Registrado em',   key: 'created_at',      width: 20 },
    { header: 'Tipo',            key: 'tipo',            width: 14 },
    { header: 'Natureza',        key: 'natureza',        width: 26 },
    { header: 'Detalhe',         key: 'subnatureza',     width: 20 },
    { header: 'Nível de Risco',  key: 'nivel_risco',     width: 14 },
    { header: 'Status',          key: 'status_oc',       width: 12 },
    { header: 'Endereço',        key: 'endereco',        width: 32 },
    { header: 'Latitude',        key: 'lat',             width: 12 },
    { header: 'Longitude',       key: 'lng',             width: 12 },
    { header: 'Proprietário',    key: 'proprietario',    width: 26 },
    { header: 'Observações',     key: 'observacoes',     width: 40 },
  ]

  // Colunas de foto dinâmicas
  const colsFoto: Partial<ExcelJS.Column>[] = Array.from({ length: maxFotos }, (_, i) => ({
    header: `Foto ${i + 1}`,
    key: `foto_${i}`,
    width: FOTO_COL_W,
  }))

  ws.columns = [...colsDados, ...colsFoto]

  // Cabeçalho
  const headerRow = ws.getRow(1)
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: BRANCO } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { bottom: { style: 'thin', color: { argb: BRANCO } } }
  })
  // Cabeçalhos de foto em laranja para destacar
  if (maxFotos > 0) {
    for (let i = 0; i < maxFotos; i++) {
      const colIdx = colsDados.length + i + 1
      const cell = headerRow.getCell(colIdx)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA } }
    }
  }

  const ROW_H_PT = Math.round(FOTO_H / ROW_H_PX_TO_PT)

  // Linhas de dados
  ocorrencias.forEach((o, idx) => {
    const temFotos = o.fotos && o.fotos.length > 0
    const r = ws.addRow({
      id: o.id,
      data_ocorrencia: o.data_ocorrencia ? new Date(o.data_ocorrencia + 'T00:00:00').toLocaleDateString('pt-BR') : '—',
      created_at: o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '—',
      tipo: o.tipo,
      natureza: o.natureza,
      subnatureza: o.subnatureza || '—',
      nivel_risco: nivelLabel(o.nivel_risco),
      status_oc: statusLabel(o.status_oc),
      endereco: o.endereco || '—',
      lat: o.lat ?? '—',
      lng: o.lng ?? '—',
      proprietario: o.proprietario || '—',
      observacoes: o.observacoes || '—',
    })

    // Altura da linha: se tem fotos, usa a altura da miniatura; senão, altura padrão
    r.height = temFotos ? ROW_H_PT : 18

    const isEven = idx % 2 === 1
    r.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { size: 10 }
      cell.alignment = { vertical: 'middle', wrapText: false }
      if (isEven) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f0f4ff' } }
      }
    })

    // Cor do nível de risco
    const nivelCell = r.getCell('nivel_risco')
    if (o.nivel_risco === 'alto') nivelCell.font = { bold: true, size: 10, color: { argb: 'dc2626' } }
    else if (o.nivel_risco === 'medio') nivelCell.font = { bold: true, size: 10, color: { argb: 'd97706' } }
    else nivelCell.font = { bold: true, size: 10, color: { argb: '059669' } }

    // Incorpora fotos nas últimas colunas
    if (temFotos) {
      o.fotos!.forEach((fotoBase64, fotoIdx) => {
        const base64Data = fotoBase64.includes(',') ? fotoBase64.split(',')[1] : fotoBase64
        const ext = fotoBase64.startsWith('data:image/png') ? 'png' : 'jpeg'
        const colIdx = colsDados.length + fotoIdx  // índice 0-based da coluna de foto

        try {
          const imageId = wb.addImage({ base64: base64Data, extension: ext })
          ws.addImage(imageId, {
            tl: { col: colIdx, row: r.number - 1 },
            ext: { width: FOTO_W, height: FOTO_H },
          })
        } catch {
          // ignora imagem inválida
        }
      })
    }
  })

  // Filtro automático e linha congelada
  const totalCols = colsDados.length + maxFotos
  ws.autoFilter = { from: 'A1', to: { row: 1, column: totalCols } }
  ws.views = [{ state: 'frozen', ySplit: 2 }]

  // Título no topo
  ws.spliceRows(1, 0, [])
  ws.mergeCells(1, 1, 1, totalCols)
  const t = ws.getCell('A1')
  t.value = `DEFESA CIVIL OURO BRANCO — TODAS AS OCORRÊNCIAS — Gerado em ${new Date().toLocaleString('pt-BR')}`
  t.font = { bold: true, size: 12, color: { argb: BRANCO } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA } }
  t.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 26

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
