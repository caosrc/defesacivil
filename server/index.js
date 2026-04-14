import express from 'express'
import cors from 'cors'
import pg from 'pg'
import JSZip from 'jszip'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, readFileSync, readdirSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const app = express()

app.use(cors())
app.use(express.json({ limit: '100mb' }))

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function formatarDataCurta(data = new Date()) {
  return data.toLocaleDateString('pt-BR')
}

function formatarDataExtenso(data = new Date()) {
  return `${data.getDate()} de ${MESES[data.getMonth()]} de ${data.getFullYear()}`
}

function decimalParaGms(valor, positivo, negativo) {
  const absoluto = Math.abs(Number(valor))
  const graus = Math.floor(absoluto)
  const minutosFloat = (absoluto - graus) * 60
  const minutos = Math.floor(minutosFloat)
  const segundos = ((minutosFloat - minutos) * 60).toFixed(2).replace('.', ',')
  return `${graus}° ${minutos}' ${segundos}" ${Number(valor) >= 0 ? positivo : negativo}`
}

function formatarCoordenadas(lat, lng) {
  if (lat == null || lng == null || lat === '' || lng === '') return 'Não informadas'
  return `${decimalParaGms(lat, 'N', 'S')}, ${decimalParaGms(lng, 'L', 'O')}`
}

function limparNomeArquivo(valor, fallback) {
  const limpo = String(valor || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return limpo || fallback
}

function nomeRua(endereco) {
  const texto = String(endereco || '').trim()
  if (!texto) return 'Endereco'
  return texto.split(',')[0].trim() || texto
}

function relatorioFileName(ocorrencia) {
  const numero = limparNomeArquivo(ocorrencia.id, 'numero')
  const rua = limparNomeArquivo(nomeRua(ocorrencia.endereco), 'Nome_da_Rua')
  const requerente = limparNomeArquivo(ocorrencia.proprietario, 'Nome_do_requerente')
  return `RelVist_${numero}_${rua}_${requerente}.docx`
}

function getRelatorioTemplatePath() {
  const assetsPath = join(__dirname, '..', 'attached_assets')
  const arquivos = readdirSync(assetsPath)
    .filter((nome) => nome.startsWith('RelVist_') && nome.endsWith('.docx'))
    .sort()
  if (!arquivos.length) throw new Error('Modelo de relatório não encontrado em attached_assets')
  return join(assetsPath, arquivos[arquivos.length - 1])
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/)
  if (!match) return null
  const mime = match[1] === 'image/jpg' ? 'image/jpeg' : match[1]
  const extension = mime === 'image/png' ? 'png' : 'jpeg'
  return { mime, extension, buffer: Buffer.from(match[2], 'base64') }
}

function imageDrawingXml(rId, index) {
  const cx = 3000000
  const cy = 2250000
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${200 + index}" name="Foto ${index}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="0"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${300 + index}" name="Foto ${index}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

async function gerarRelatorioVistoria(ocorrencia) {
  const template = readFileSync(getRelatorioTemplatePath())
  const zip = await JSZip.loadAsync(template)
  const hoje = new Date()
  const natureza = ocorrencia.natureza || 'Não informada'
  const requerente = ocorrencia.proprietario || 'Não informado'
  const endereco = ocorrencia.endereco || 'Não informado'
  let documentXml = await zip.file('word/document.xml').async('string')

  const situacao = ocorrencia.situacao || ''
  const recomendacao = ocorrencia.recomendacao || ''
  const conclusao = ocorrencia.conclusao || ''

  const substituicoes = {
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
  documentXml = documentXml
    .replace(/[“”]/g, '')
    .replace(/,\s*Zona Rural de Olaria/g, '')
    .replace(/\s+Zona Rural de Olaria,\s*coordenadas/g, ' coordenadas')
    .replace(/\s*descreva a conclus.o\.?/gi, '')

  let relsXml = await zip.file('word/_rels/document.xml.rels').async('string')
  const contentTypesFile = zip.file('[Content_Types].xml')
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
    zip.file(`word/${target}`, imagem.buffer)
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

  zip.file('word/document.xml', documentXml)
  zip.file('word/_rels/document.xml.rels', relsXml)
  zip.file('[Content_Types].xml', contentTypesXml)
  return zip.generateAsync({ type: 'nodebuffer' })
}

async function initDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não configurada')
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ocorrencias (
      id SERIAL PRIMARY KEY,
      tipo VARCHAR(255) NOT NULL,
      natureza VARCHAR(255) NOT NULL,
      subnatureza VARCHAR(255),
      nivel_risco VARCHAR(100) NOT NULL,
      status_oc VARCHAR(100) NOT NULL DEFAULT 'ativo',
      fotos JSONB NOT NULL DEFAULT '[]'::jsonb,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      endereco TEXT,
      proprietario VARCHAR(255),
      situacao TEXT,
      recomendacao TEXT,
      conclusao TEXT,
      data_ocorrencia TIMESTAMP,
      agentes JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS checklists_viatura (
      id SERIAL PRIMARY KEY,
      data_checklist DATE NOT NULL,
      km VARCHAR(100),
      motorista VARCHAR(255),
      fotos_avarias JSONB NOT NULL DEFAULT '[]'::jsonb,
      foto_principal TEXT,
      foto_frontal TEXT,
      foto_traseira TEXT,
      foto_direita TEXT,
      foto_esquerda TEXT,
      observacoes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`ALTER TABLE checklists_viatura ADD COLUMN IF NOT EXISTS placa VARCHAR(20)`)
  await pool.query(`ALTER TABLE checklists_viatura ADD COLUMN IF NOT EXISTS itens JSONB NOT NULL DEFAULT '{}'::jsonb`)
}

app.get('/api/ocorrencias', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ocorrencias ORDER BY created_at DESC')
    res.json(result.rows)
  } catch (err) {
    console.error('GET /api/ocorrencias error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/ocorrencias', async (req, res) => {
  const { tipo, natureza, subnatureza, nivel_risco, status_oc, fotos, lat, lng, endereco, proprietario, situacao, recomendacao, conclusao, data_ocorrencia, agentes } = req.body
  try {
    const result = await pool.query(
      `INSERT INTO ocorrencias (tipo, natureza, subnatureza, nivel_risco, status_oc, fotos, lat, lng, endereco, proprietario, situacao, recomendacao, conclusao, data_ocorrencia, agentes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [tipo, natureza, subnatureza || null, nivel_risco, status_oc || 'ativo', JSON.stringify(Array.isArray(fotos) ? fotos : []), lat || null, lng || null, endereco || null, proprietario || null, situacao || null, recomendacao || null, conclusao || null, data_ocorrencia || null, JSON.stringify(Array.isArray(agentes) ? agentes : [])]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error('POST /api/ocorrencias error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/ocorrencias/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ocorrencias WHERE id=$1', [req.params.id])
    if (!result.rows.length) return res.status(404).json({ error: 'Não encontrado' })
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/ocorrencias/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' })

  const { tipo, natureza, subnatureza, nivel_risco, status_oc, fotos, lat, lng, endereco, proprietario, situacao, recomendacao, conclusao, data_ocorrencia, agentes } = req.body
  console.log(`PUT /api/ocorrencias/${id} — tipo=${tipo} natureza=${natureza}`)

  try {
    await pool.query(
      `UPDATE ocorrencias
       SET tipo=$1, natureza=$2, subnatureza=$3, nivel_risco=$4, status_oc=$5,
           fotos=$6::jsonb, lat=$7, lng=$8, endereco=$9, proprietario=$10,
           situacao=$11, recomendacao=$12, conclusao=$13, data_ocorrencia=$14, agentes=$15::jsonb
       WHERE id=$16`,
      [
        tipo,
        natureza,
        subnatureza || null,
        nivel_risco,
        status_oc,
        JSON.stringify(Array.isArray(fotos) ? fotos : []),
        lat != null && lat !== '' ? lat : null,
        lng != null && lng !== '' ? lng : null,
        endereco || null,
        proprietario || null,
        situacao || null,
        recomendacao || null,
        conclusao || null,
        data_ocorrencia || null,
        JSON.stringify(Array.isArray(agentes) ? agentes : []),
        id,
      ]
    )

    // Busca o registro atualizado separadamente
    const sel = await pool.query('SELECT * FROM ocorrencias WHERE id=$1', [id])
    if (!sel.rows.length) return res.status(404).json({ error: 'Ocorrência não encontrada' })

    console.log(`PUT /api/ocorrencias/${id} — salvo com sucesso`)
    return res.json(sel.rows[0])
  } catch (err) {
    console.error('PUT /api/ocorrencias error:', err)
    return res.status(500).json({ error: err.message })
  }
})

app.delete('/api/ocorrencias/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM ocorrencias WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/health', (req, res) => res.json({ ok: true }))

app.post('/api/relatorio-vistoria', async (req, res) => {
  try {
    let ocorrencia = req.body
    if (!ocorrencia || typeof ocorrencia !== 'object') {
      return res.status(400).json({ error: 'Dados da ocorrência não informados' })
    }
    if (ocorrencia.id && Number(ocorrencia.id) > 0) {
      try {
        const fresh = await pool.query('SELECT * FROM ocorrencias WHERE id=$1', [Number(ocorrencia.id)])
        if (fresh.rows.length > 0) ocorrencia = fresh.rows[0]
      } catch (dbErr) {
        console.warn('Não foi possível buscar dados frescos do banco:', dbErr.message)
      }
    }
    const buffer = await gerarRelatorioVistoria(ocorrencia)
    const filename = relatorioFileName(ocorrencia)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
    res.send(buffer)
  } catch (err) {
    console.error('POST /api/relatorio-vistoria error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Checklists Viatura ──
app.get('/api/checklists', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM checklists_viatura ORDER BY created_at DESC')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/checklists', async (req, res) => {
  const { data_checklist, km, placa, motorista, fotos_avarias, foto_frontal, foto_traseira, foto_direita, foto_esquerda, itens, observacoes } = req.body
  try {
    const result = await pool.query(
      `INSERT INTO checklists_viatura (data_checklist, km, placa, motorista, fotos_avarias, foto_frontal, foto_traseira, foto_direita, foto_esquerda, itens, observacoes)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10::jsonb,$11) RETURNING *`,
      [data_checklist, km || null, placa || null, motorista || null, JSON.stringify(Array.isArray(fotos_avarias) ? fotos_avarias : []), foto_frontal || null, foto_traseira || null, foto_direita || null, foto_esquerda || null, JSON.stringify(itens || {}), observacoes || null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error('POST /api/checklists error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/checklists/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM checklists_viatura WHERE id=$1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

const distPath = join(__dirname, '..', 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get(/(.*)/, (req, res) => {
    res.sendFile(join(distPath, 'index.html'))
  })
}

const PORT = process.env.PORT || 3001

try {
  await initDb()
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`API Defesa Civil rodando na porta ${PORT}`)
  })

  server.on('error', (err) => {
    console.error('Server error:', err)
    process.exit(1)
  })
} catch (err) {
  console.error('Erro ao inicializar o servidor:', err)
  process.exit(1)
}
