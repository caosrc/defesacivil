import ExcelJS from 'exceljs'
import type { Ocorrencia } from './types'

const AZUL = '1a4b8c'
const LARANJA = 'E05F00'
const CINZA_CLARO = 'f3f4f6'
const BRANCO = 'FFFFFF'

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

  // Column widths
  ws.columns = [
    { width: 28 }, // A - label
    { width: 38 }, // B - value
    { width: 4 },  // C - spacer
    { width: 32 }, // D - photo 1
    { width: 32 }, // E - photo 2
  ]

  // ── Title row ────────────────────────────────────────────────────────────────
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

  // ── Section header helper ────────────────────────────────────────────────────
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

  // ── Dados básicos ─────────────────────────────────────────────────────────────
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

  // ── Photos ───────────────────────────────────────────────────────────────────
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

    const FOTO_H = 150 // pixels
    const ROW_H_PT = Math.round(FOTO_H * 0.75) // Excel uses points (1pt ≈ 1.33px)

    // Two photos per row, columns D and E (index 3 and 4)
    let fotoRow = row
    let col = 3 // 0-indexed: col 3 = D, col 4 = E

    for (let i = 0; i < o.fotos.length; i++) {
      const fotoBase64 = o.fotos[i]
      const base64Data = fotoBase64.includes(',') ? fotoBase64.split(',')[1] : fotoBase64
      const ext = fotoBase64.startsWith('data:image/png') ? 'png' : 'jpeg'

      try {
        const imageId = wb.addImage({ base64: base64Data, extension: ext })
        ws.addImage(imageId, {
          tl: { col: col, row: fotoRow - 1 },
          ext: { width: 200, height: FOTO_H },
        })
        ws.getRow(fotoRow).height = ROW_H_PT
      } catch {
        // skip image if it fails
      }

      col++
      if (col > 4) {
        col = 3
        fotoRow++
        ws.getRow(fotoRow).height = ROW_H_PT
      }
    }
  }

  // ── Apply outer border ────────────────────────────────────────────────────────
  ws.getCell('A1').border = {
    top: { style: 'medium', color: { argb: AZUL } },
    left: { style: 'medium', color: { argb: AZUL } },
  }

  // ── Download ──────────────────────────────────────────────────────────────────
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

// ── Export all occurrences (tabular) ─────────────────────────────────────────
export async function exportarTodasExcel(ocorrencias: Ocorrencia[]): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Defesa Civil Ouro Branco'
  wb.created = new Date()

  const ws = wb.addWorksheet('Ocorrências')

  ws.columns = [
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
    { header: 'Qtd Fotos',       key: 'qtd_fotos',       width: 10 },
  ]

  // Style header row
  const headerRow = ws.getRow(1)
  headerRow.height = 22
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: BRANCO } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = { bottom: { style: 'thin', color: { argb: BRANCO } } }
  })

  // Data rows
  ocorrencias.forEach((o, idx) => {
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
      qtd_fotos: o.fotos?.length ?? 0,
    })

    r.height = 18
    const isEven = idx % 2 === 1
    r.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { size: 10 }
      cell.alignment = { vertical: 'middle', wrapText: false }
      if (isEven) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f0f4ff' } }
      }
    })

    // Color nivel_risco cell
    const nivelCell = r.getCell('nivel_risco')
    if (o.nivel_risco === 'alto') nivelCell.font = { bold: true, size: 10, color: { argb: 'dc2626' } }
    else if (o.nivel_risco === 'medio') nivelCell.font = { bold: true, size: 10, color: { argb: 'd97706' } }
    else nivelCell.font = { bold: true, size: 10, color: { argb: '059669' } }
  })

  // Auto-filter
  ws.autoFilter = { from: 'A1', to: { row: 1, column: ws.columns.length } }

  // Freeze top row
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  // Title row at very top
  ws.spliceRows(1, 0, [])
  ws.mergeCells(`A1:N1`)
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
