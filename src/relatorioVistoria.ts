import JSZip from 'jszip'
import type { Ocorrencia } from './types'

const TEMPLATE_URL = '/relatorio-vistoria-template.docx'

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatarDataCurta(data: Date = new Date()): string {
  return data.toLocaleDateString('pt-BR')
}

function formatarDataExtenso(data: Date = new Date()): string {
  return `${data.getDate()} de ${MESES[data.getMonth()]} de ${data.getFullYear()}`
}

function decimalParaGms(valor: number | null | undefined, positivo: string, negativo: string): string {
  const absoluto = Math.abs(Number(valor))
  const graus = Math.floor(absoluto)
  const minutosFloat = (absoluto - graus) * 60
  const minutos = Math.floor(minutosFloat)
  const segundos = ((minutosFloat - minutos) * 60).toFixed(2).replace('.', ',')
  return `${graus}° ${minutos}' ${segundos}" ${Number(valor) >= 0 ? positivo : negativo}`
}

function formatarCoordenadas(lat: number | null | undefined, lng: number | null | undefined): string {
  if (lat == null || lng == null) return 'Não informadas'
  return `${decimalParaGms(lat, 'N', 'S')}, ${decimalParaGms(lng, 'L', 'O')}`
}

function limparNomeArquivo(valor: unknown, fallback: string): string {
  const limpo = String(valor || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return limpo || fallback
}

function nomeRua(endereco: string | null | undefined): string {
  const texto = String(endereco || '').trim()
  if (!texto) return 'Endereco'
  return texto.split(',')[0].trim() || texto
}

export function relatorioFileName(ocorrencia: Ocorrencia): string {
  const numero = limparNomeArquivo(ocorrencia.id, 'numero')
  const rua = limparNomeArquivo(nomeRua(ocorrencia.endereco), 'Nome_da_Rua')
  const requerente = limparNomeArquivo(ocorrencia.proprietario, 'Nome_do_requerente')
  return `RelVist_${numero}_${rua}_${requerente}.docx`
}

interface ImagemDataUrl {
  mime: string
  extension: 'png' | 'jpeg'
  bytes: Uint8Array
}

function parseDataUrl(dataUrl: string): ImagemDataUrl | null {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/)
  if (!match) return null
  const mime = match[1] === 'image/jpg' ? 'image/jpeg' : match[1]
  const extension = mime === 'image/png' ? 'png' : 'jpeg'
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { mime, extension, bytes }
}

function imageDrawingXml(rId: string, index: number): string {
  const cx = 2880000
  const cy = 3420000
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${200 + index}" name="Foto ${index}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="0"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${300 + index}" name="Foto ${index}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

let templateCache: ArrayBuffer | null = null

async function carregarTemplate(): Promise<ArrayBuffer> {
  if (templateCache) return templateCache
  const res = await fetch(TEMPLATE_URL, { cache: 'force-cache' })
  if (!res.ok) {
    throw new Error(`Não foi possível carregar o modelo do relatório (${res.status}). Verifique sua conexão.`)
  }
  templateCache = await res.arrayBuffer()
  return templateCache
}

export async function gerarRelatorioVistoria(ocorrencia: Ocorrencia): Promise<Blob> {
  const template = await carregarTemplate()
  const zip = await JSZip.loadAsync(template)
  const hoje = new Date()
  const natureza = ocorrencia.natureza || 'Não informada'
  const requerente = ocorrencia.proprietario || 'Não informado'
  const endereco = ocorrencia.endereco || 'Não informado'
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('Modelo de relatório inválido (document.xml ausente).')
  let documentXml = await docFile.async('string')

  const situacao = ocorrencia.situacao || ''
  const recomendacao = ocorrencia.recomendacao || ''
  const conclusao = ocorrencia.conclusao || ''

  const substituicoes: Record<string, string> = {
    '“data 1”': formatarDataCurta(hoje),
    '“Nome do requerente”': xmlEscape(requerente),
    '“Natureza da Ocorrência”': xmlEscape(natureza),
    'Natureza da Ocorrência': xmlEscape(natureza),
    '“data 2”': xmlEscape(formatarDataExtenso(hoje)),
    '“Endereço”': xmlEscape(endereco),
    '"coordenadas do local"': xmlEscape(formatarCoordenadas(ocorrencia.lat, ocorrencia.lng)),
    'coordenadas do local': xmlEscape(formatarCoordenadas(ocorrencia.lat, ocorrencia.lng)),
    '(informações da situação descrita na ocorrência, quadro 9)': xmlEscape(situacao),
    '(informações da recomendação descrita na ocorrência, quadro 10)': xmlEscape(recomendacao),
    '(informações da situação descrita na conclusão, quadro 11)': xmlEscape(conclusao),
  }

  for (const [alvo, valor] of Object.entries(substituicoes)) {
    documentXml = documentXml.split(alvo).join(valor)
  }

  if (ocorrencia.tipo === 'Vistoria Ambiental') {
    documentXml = documentXml
      .split('Cristiane Caroline Campos Lopes').join('Talita Oliveira de Ara\u00FAjo')

    const paragrafoCargo = '<w:p><w:pPr><w:keepNext w:val="false" /><w:keepLines w:val="false" /><w:pageBreakBefore w:val="false" /><w:widowControl w:val="true" /><w:pBdr></w:pBdr><w:spacing w:after="0" /><w:ind /><w:jc w:val="center" /><w:rPr><w:rFonts w:hint="default" w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" /><w:sz w:val="20" /><w:szCs w:val="20" /></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:hint="default" w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" /><w:sz w:val="20" /><w:szCs w:val="20" /></w:rPr><w:t>Analista Ambiental</w:t></w:r></w:p>'
    documentXml = documentXml.replace(
      /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?Engenheira Civil - (?:(?!<\/w:p>)[\s\S])*?<\/w:p>/,
      paragrafoCargo
    )
  } else {
    documentXml = documentXml
      .split('Talita Oliveira de Ara\u00FAjo').join('Cristiane Caroline Campos Lopes')
      .split('Talita Oliveira de Araújo').join('Cristiane Caroline Campos Lopes')
      .split('Analista Ambiental').join('Engenheira Civil - Coordenadoria Municipal de Prote\u00E7\u00E3o e Defesa Civil')
  }

  documentXml = documentXml
    .replace(/[“”]/g, '')
    .replace(/,\s*Zona Rural de Olaria/g, '')
    .replace(/\s+Zona Rural de Olaria,\s*coordenadas/g, ' coordenadas')
    .replace(/\s*descreva a conclus.o\.?/gi, '')

  const relsFile = zip.file('word/_rels/document.xml.rels')
  if (!relsFile) throw new Error('Modelo de relatório inválido (rels ausente).')
  let relsXml = await relsFile.async('string')

  const contentTypesFile = zip.file('[Content_Types].xml')
  if (!contentTypesFile) throw new Error('Modelo de relatório inválido (Content_Types ausente).')
  let contentTypesXml = await contentTypesFile.async('string')

  const ids = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]))
  let proximoId = Math.max(0, ...ids) + 1

  const fotos = Array.isArray(ocorrencia.fotos) ? ocorrencia.fotos.slice(0, 6) : []
  fotos.forEach((foto, index) => {
    const imagem = parseDataUrl(foto)
    if (!imagem) return
    const numero = index + 1
    const rId = `rId${proximoId++}`
    const target = `media/relatorio_foto_${numero}.${imagem.extension}`
    zip.file(`word/${target}`, imagem.bytes)
    relsXml = relsXml.replace(
      '</Relationships>',
      `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${target}" /></Relationships>`
    )

    if (!contentTypesXml.includes(`Extension="${imagem.extension}"`)) {
      contentTypesXml = contentTypesXml.replace(
        '</Types>',
        `<Default Extension="${imagem.extension}" ContentType="${imagem.mime}"/></Types>`
      )
    }

    const captionRegex = new RegExp(`(<w:p\\b(?:(?!<\\/w:p>)[\\s\\S])*?SEQ Figura(?:(?!<\\/w:p>)[\\s\\S])*?<w:t[^>]*>\\s*${numero}\\s*<\\/w:t>(?:(?!<\\/w:p>)[\\s\\S])*?<\\/w:p>)`)
    documentXml = documentXml.replace(captionRegex, `${imageDrawingXml(rId, numero)}$1`)
  })

  documentXml = documentXml.replace(/<w:tc>([\s\S]*?)<\/w:tc>/g, (match, content: string) => {
    if (!content.includes('<w:drawing>')) return match
    const cleaned = content.replace(/<w:p\b(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, (para: string) => {
      const hasText = /<w:t[^>]*>[^<]/.test(para)
      const hasDrawing = para.includes('<w:drawing>')
      return (hasText || hasDrawing) ? para : ''
    })
    return `<w:tc>${cleaned}</w:tc>`
  })

  zip.file('word/document.xml', documentXml)
  zip.file('word/_rels/document.xml.rels', relsXml)
  zip.file('[Content_Types].xml', contentTypesXml)

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}
