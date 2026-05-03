import express from 'express'
import cors from 'cors'
import compression from 'compression'
import pg from 'pg'
import JSZip from 'jszip'
import webpush from 'web-push'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ── PostgreSQL (Replit native DB) ──────────────────────────────────────────
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

async function query(sql, params = []) {
  const client = await pool.connect()
  try {
    const result = await client.query(sql, params)
    return result
  } finally {
    client.release()
  }
}

const app = express()
const httpServer = createServer(app)

app.use(compression())
app.use(cors())
app.use(express.json({ limit: '100mb' }))

// ── VAPID (Web Push) ──
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:defesacivilob@gmail.com'
let vapidConfigured = false
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    vapidConfigured = true
  } catch (e) {
    console.warn('[VAPID] configuração inválida:', e?.message || e)
  }
}

app.get('/api/vapid-public-key', (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY })
})

// ── WebSocket — Rastreamento em tempo real ──────────────────────────────────
const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

const todosConectados = new Set()
const dispositivosOnline = new Map()
const agentesOnline = new Map()
const ONLINE_TTL_MS = 60 * 1000

function emitirOnlineSync() {
  const agora = Date.now()
  const agentes = []
  for (const [id, info] of agentesOnline) {
    if (agora - info.ts > ONLINE_TTL_MS) continue
    agentes.push({ id, nome: info.nome })
  }
  broadcastParaTodos({ tipo: 'online_sync', agentes })
}

function broadcastParaTodos(payload, excluirWs = null) {
  const json = JSON.stringify(payload)
  for (const ws of todosConectados) {
    if (ws !== excluirWs && ws.readyState === 1) {
      ws.send(json)
    }
  }
}

const sosAtivos = new Map()
const SOS_TTL_MS = 60 * 60 * 1000

async function enviarPushSosServidor(msg) {
  if (!vapidConfigured) return
  if (!msg || !msg.id || !msg.agente) return
  try {
    const result = await query('SELECT id, endpoint, p256dh, auth, agente FROM push_subscriptions')
    const subs = result.rows
    if (!subs.length) return
    const localPart = msg.lat != null && msg.lng != null
      ? `📍 ${Number(msg.lat).toFixed(4)}, ${Number(msg.lng).toFixed(4)}`
      : 'Localização em apuração'
    const payload = JSON.stringify({
      title: '🆘 SOS — Defesa Civil Ouro Branco',
      body: `${msg.agente} acionou o SOS! ${localPart}`,
      tag: `sos-${msg.id}`,
      sosId: msg.id,
      url: '/',
    })
    const removidos = []
    await Promise.all(subs.map(async (s) => {
      if (msg.deviceId && s.id === msg.deviceId) return
      if (s.agente && msg.agente && s.agente === msg.agente) return
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 30, urgency: 'high' },
        )
      } catch (err) {
        const status = err && err.statusCode
        if (status === 404 || status === 410) removidos.push(s.id)
        else console.warn('[SOS-push] erro:', s.id, status)
      }
    }))
    if (removidos.length > 0) {
      await query('DELETE FROM push_subscriptions WHERE id = ANY($1)', [removidos])
    }
  } catch (e) {
    console.warn('[SOS-push] falha geral:', e?.message || e)
  }
}

function processarSos(msg, wsRemetente = null) {
  if (!msg || !msg.id) return
  const existente = sosAtivos.get(msg.id)
  if (existente) {
    const fundido = { ...existente, ...msg }
    sosAtivos.set(msg.id, fundido)
    broadcastParaTodos(fundido, wsRemetente)
  } else {
    sosAtivos.set(msg.id, { ...msg })
    broadcastParaTodos(msg, wsRemetente)
    enviarPushSosServidor(msg).catch(() => {})
  }
}

function processarSosAudio(msg, wsRemetente = null) {
  if (!msg || !msg.id || !msg.audio) return
  const existente = sosAtivos.get(msg.id)
  if (existente) sosAtivos.set(msg.id, { ...existente, audio: msg.audio })
  broadcastParaTodos(msg, wsRemetente)
}

function processarSosCancelar(msg, wsRemetente = null) {
  if (!msg || !msg.id) return
  sosAtivos.delete(msg.id)
  broadcastParaTodos(msg, wsRemetente)
}

wss.on('connection', (ws) => {
  todosConectados.add(ws)
  let dispositivoId = null
  let onlineId = null

  const posicoeAtuais = []
  for (const [id, d] of dispositivosOnline) {
    if (d.lat !== null && d.lat !== undefined) {
      posicoeAtuais.push({ id, nome: d.nome, lat: d.lat, lng: d.lng, precisao: d.precisao, velocidade: d.velocidade })
    }
  }
  if (posicoeAtuais.length > 0) {
    ws.send(JSON.stringify({ tipo: 'posicoes_iniciais', posicoes: posicoeAtuais }))
  }

  const agora = Date.now()
  const sosValidos = []
  for (const [, alerta] of sosAtivos) {
    if (agora - alerta.timestamp < SOS_TTL_MS) sosValidos.push(alerta)
  }
  if (sosValidos.length > 0) {
    ws.send(JSON.stringify({ tipo: 'sos_persistidos', alertas: sosValidos }))
  }

  const agentesAtuais = []
  for (const [id, info] of agentesOnline) {
    if (Date.now() - info.ts <= ONLINE_TTL_MS) agentesAtuais.push({ id, nome: info.nome })
  }
  ws.send(JSON.stringify({ tipo: 'online_sync', agentes: agentesAtuais }))

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())

      if (msg.tipo === 'posicao') {
        dispositivoId = msg.id
        dispositivosOnline.set(dispositivoId, {
          ws,
          nome: msg.nome || `Equipe ${msg.id}`,
          lat: msg.lat,
          lng: msg.lng,
          precisao: msg.precisao || 0,
          velocidade: msg.velocidade ?? null,
          ts: Date.now(),
        })
        broadcastParaTodos({
          tipo: 'posicao',
          id: msg.id,
          nome: msg.nome || `Equipe ${msg.id}`,
          lat: msg.lat,
          lng: msg.lng,
          precisao: msg.precisao || 0,
          velocidade: msg.velocidade ?? null,
        }, ws)
      }

      if (msg.tipo === 'parar') {
        const idParar = msg.id || dispositivoId
        if (dispositivosOnline.has(idParar)) {
          dispositivosOnline.delete(idParar)
          broadcastParaTodos({ tipo: 'remover', id: idParar })
        }
      }

      if (msg.tipo === 'ping') {
        ws.send(JSON.stringify({ tipo: 'pong' }))
      }

      if (msg.tipo === 'online') {
        const id = String(msg.id || '')
        const nome = String(msg.nome || `Equipe ${id.slice(0, 4)}`)
        if (id) {
          onlineId = id
          agentesOnline.set(id, { nome, ts: Date.now() })
          emitirOnlineSync()
        }
      }
      if (msg.tipo === 'offline') {
        const id = String(msg.id || onlineId || '')
        if (id && agentesOnline.has(id)) {
          agentesOnline.delete(id)
          emitirOnlineSync()
        }
      }

      if (msg.tipo === 'online_ping') {
        const id = String(msg.id || onlineId || '')
        if (id && agentesOnline.has(id)) {
          const info = agentesOnline.get(id)
          info.ts = Date.now()
          agentesOnline.set(id, info)
        }
      }

      if (msg.tipo === 'solicitar_online') {
        const lista = []
        for (const [id, info] of agentesOnline) {
          if (Date.now() - info.ts <= ONLINE_TTL_MS) lista.push({ id, nome: info.nome })
        }
        ws.send(JSON.stringify({ tipo: 'online_sync', agentes: lista }))
      }

      if (msg.tipo === 'solicitar_estado') {
        const posicoes = []
        for (const [id, d] of dispositivosOnline) {
          if (d.lat !== null && d.lat !== undefined) {
            posicoes.push({ id, nome: d.nome, lat: d.lat, lng: d.lng, precisao: d.precisao, velocidade: d.velocidade })
          }
        }
        if (posicoes.length > 0) {
          ws.send(JSON.stringify({ tipo: 'posicoes_iniciais', posicoes }))
        }
        const agoraEstado = Date.now()
        const sosValidos = []
        for (const [, alerta] of sosAtivos) {
          if (agoraEstado - alerta.timestamp < SOS_TTL_MS) sosValidos.push(alerta)
        }
        if (sosValidos.length > 0) {
          ws.send(JSON.stringify({ tipo: 'sos_persistidos', alertas: sosValidos }))
        }
      }

      if (msg.tipo === 'sos') processarSos(msg, ws)
      if (msg.tipo === 'sos-audio') processarSosAudio(msg, ws)
      if (msg.tipo === 'sos-cancelar') processarSosCancelar(msg, ws)

      if (msg.tipo === 'sos-visualizar') {
        const { id, agente } = msg
        if (id && agente) {
          const existente = sosAtivos.get(id)
          if (existente) {
            const vizs = Array.isArray(existente.visualizadores) ? existente.visualizadores : []
            if (!vizs.includes(agente)) {
              const atualizados = [...vizs, agente]
              sosAtivos.set(id, { ...existente, visualizadores: atualizados })
              broadcastParaTodos({ tipo: 'sos-visualizado', id, visualizadores: atualizados }, null)
            }
          }
        }
      }

      if (msg.tipo === 'sos-mensagem') {
        const { id, agente, texto, ts } = msg
        if (id && agente && texto) {
          const existente = sosAtivos.get(id)
          if (existente) {
            const msgs = Array.isArray(existente.mensagens) ? existente.mensagens : []
            const novas = [...msgs, { agente, texto, ts: ts || Date.now() }]
            sosAtivos.set(id, { ...existente, mensagens: novas })
            broadcastParaTodos({ tipo: 'sos-nova-mensagem', id, mensagens: novas }, null)
          }
        }
      }
    } catch { /* ignora mensagens malformadas */ }
  })

  ws.on('close', () => {
    todosConectados.delete(ws)
    if (dispositivoId) {
      dispositivosOnline.delete(dispositivoId)
      broadcastParaTodos({ tipo: 'remover', id: dispositivoId })
    }
    if (onlineId && agentesOnline.has(onlineId)) {
      agentesOnline.delete(onlineId)
      emitirOnlineSync()
    }
  })

  ws.on('error', () => {
    todosConectados.delete(ws)
    if (dispositivoId) dispositivosOnline.delete(dispositivoId)
    if (onlineId) agentesOnline.delete(onlineId)
  })
})

setInterval(() => {
  const limite = Date.now() - 90 * 1000
  for (const [id, d] of dispositivosOnline) {
    if (d.ts < limite || d.ws.readyState !== 1) {
      dispositivosOnline.delete(id)
      broadcastParaTodos({ tipo: 'remover', id })
    }
  }
  let mudouOnline = false
  const limiteOnline = Date.now() - ONLINE_TTL_MS
  for (const [id, info] of agentesOnline) {
    if (info.ts < limiteOnline) {
      agentesOnline.delete(id)
      mudouOnline = true
    }
  }
  if (mudouOnline) emitirOnlineSync()
}, 15 * 1000)

// ── Report generation helpers ──────────────────────────────────────────────
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']

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
  const cx = 2880000
  const cy = 3420000
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
    '"data 1"': formatarDataCurta(hoje),
    '"Nome do requerente"': xmlEscape(requerente),
    '"Natureza da Ocorrência"': xmlEscape(natureza),
    'Natureza da Ocorrência': xmlEscape(natureza),
    '"data 2"': xmlEscape(formatarDataExtenso(hoje)),
    '"Endereço"': xmlEscape(endereco),
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
    .replace(/[""]/g, '')
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

  documentXml = documentXml.replace(/<w:tc>([\s\S]*?)<\/w:tc>/g, (match, content) => {
    if (!content.includes('<w:drawing>')) return match
    const cleaned = content.replace(/<w:p\b(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/g, (para) => {
      const hasText = /<w:t[^>]*>[^<]/.test(para)
      const hasDrawing = para.includes('<w:drawing>')
      return (hasText || hasDrawing) ? para : ''
    })
    return `<w:tc>${cleaned}</w:tc>`
  })

  zip.file('word/document.xml', documentXml)
  zip.file('word/_rels/document.xml.rels', relsXml)
  zip.file('[Content_Types].xml', contentTypesXml)
  return zip.generateAsync({ type: 'nodebuffer' })
}

// ── DB init — cria tabelas se não existirem ─────────────────────────────────
async function initDb() {
  await query(`
    CREATE TABLE IF NOT EXISTS ocorrencias (
      id BIGSERIAL PRIMARY KEY,
      tipo TEXT,
      natureza TEXT,
      subnatureza TEXT,
      nivel_risco TEXT,
      status_oc TEXT DEFAULT 'ativo',
      fotos JSONB DEFAULT '[]',
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      endereco TEXT,
      proprietario TEXT,
      situacao TEXT,
      recomendacao TEXT,
      conclusao TEXT,
      data_ocorrencia TEXT,
      agentes JSONB DEFAULT '[]',
      responsavel_registro TEXT,
      vistorias JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS escala_estado (
      id INTEGER PRIMARY KEY,
      data JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS checklists_viatura (
      id BIGSERIAL PRIMARY KEY,
      data_checklist TEXT,
      km TEXT,
      placa TEXT,
      motorista TEXT,
      fotos_avarias JSONB DEFAULT '[]',
      foto_frontal TEXT,
      foto_traseira TEXT,
      foto_direita TEXT,
      foto_esquerda TEXT,
      itens JSONB DEFAULT '{}',
      observacoes TEXT,
      assinatura_data TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS materiais (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      descricao TEXT,
      observacoes TEXT,
      foto TEXT,
      foto_placa TEXT,
      quantidade INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS emprestimos (
      id BIGSERIAL PRIMARY KEY,
      material_id TEXT NOT NULL REFERENCES materiais(id) ON DELETE CASCADE,
      material_codigo TEXT NOT NULL,
      material_nome TEXT NOT NULL,
      responsavel TEXT NOT NULL,
      cpf TEXT,
      secretaria TEXT,
      prazo_dias INTEGER NOT NULL DEFAULT 7,
      quantidade INTEGER NOT NULL DEFAULT 1,
      data_emprestimo TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      data_devolucao_prevista DATE,
      condicao_equipamento TEXT,
      observacoes TEXT,
      agente_emprestador TEXT,
      assinatura_data TEXT,
      devolvido_em TIMESTAMPTZ,
      devolvido_obs TEXT,
      devolvido_recebedor TEXT,
      devolvido_foto TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      agente TEXT,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS equipamentos_campo (
      id BIGSERIAL PRIMARY KEY,
      material_id TEXT REFERENCES materiais(id) ON DELETE SET NULL,
      material_nome TEXT,
      fotos JSONB,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      rua TEXT,
      numero TEXT,
      bairro TEXT,
      observacao TEXT,
      quantidade INTEGER NOT NULL DEFAULT 1,
      prazo_dias INTEGER,
      data_recolha_prevista DATE,
      status TEXT NOT NULL DEFAULT 'ativo',
      agente TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  console.log('[DB] Tabelas verificadas/criadas com sucesso')
}

function broadcastOcorrenciasAtualizadas() {
  broadcastParaTodos({ tipo: 'ocorrencias_atualizadas' })
}

// ── Ocorrências ─────────────────────────────────────────────────────────────
app.get('/api/ocorrencias', async (req, res) => {
  try {
    const result = await query('SELECT * FROM ocorrencias ORDER BY created_at DESC')
    res.json(result.rows)
  } catch (err) {
    console.error('GET /api/ocorrencias error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/ocorrencias', async (req, res) => {
  const { tipo, natureza, subnatureza, nivel_risco, status_oc, fotos, lat, lng, endereco, proprietario, situacao, recomendacao, conclusao, data_ocorrencia, agentes, responsavel_registro, vistorias } = req.body
  try {
    const result = await query(
      `INSERT INTO ocorrencias (tipo, natureza, subnatureza, nivel_risco, status_oc, fotos, lat, lng, endereco, proprietario, situacao, recomendacao, conclusao, data_ocorrencia, agentes, responsavel_registro, vistorias)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [tipo, natureza, subnatureza || null, nivel_risco, status_oc || 'ativo',
       JSON.stringify(Array.isArray(fotos) ? fotos : []),
       lat || null, lng || null, endereco || null, proprietario || null,
       situacao || null, recomendacao || null, conclusao || null,
       data_ocorrencia || null,
       JSON.stringify(Array.isArray(agentes) ? agentes : []),
       responsavel_registro || null,
       JSON.stringify(Array.isArray(vistorias) ? vistorias : [])]
    )
    broadcastOcorrenciasAtualizadas()
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error('POST /api/ocorrencias error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/ocorrencias/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM ocorrencias WHERE id = $1', [req.params.id])
    if (!result.rows[0]) return res.status(404).json({ error: 'Não encontrado' })
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/ocorrencias/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' })
  const { tipo, natureza, subnatureza, nivel_risco, status_oc, fotos, lat, lng, endereco, proprietario, situacao, recomendacao, conclusao, data_ocorrencia, agentes, vistorias } = req.body
  console.log(`PUT /api/ocorrencias/${id} — tipo=${tipo} natureza=${natureza}`)
  try {
    const result = await query(
      `UPDATE ocorrencias SET tipo=$1, natureza=$2, subnatureza=$3, nivel_risco=$4, status_oc=$5,
       fotos=$6, lat=$7, lng=$8, endereco=$9, proprietario=$10, situacao=$11, recomendacao=$12,
       conclusao=$13, data_ocorrencia=$14, agentes=$15, vistorias=$16
       WHERE id=$17 RETURNING *`,
      [tipo, natureza, subnatureza || null, nivel_risco, status_oc,
       JSON.stringify(Array.isArray(fotos) ? fotos : []),
       lat != null && lat !== '' ? lat : null,
       lng != null && lng !== '' ? lng : null,
       endereco || null, proprietario || null,
       situacao || null, recomendacao || null, conclusao || null,
       data_ocorrencia || null,
       JSON.stringify(Array.isArray(agentes) ? agentes : []),
       JSON.stringify(Array.isArray(vistorias) ? vistorias : []),
       id]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Ocorrência não encontrada' })
    console.log(`PUT /api/ocorrencias/${id} — salvo com sucesso`)
    broadcastOcorrenciasAtualizadas()
    return res.json(result.rows[0])
  } catch (err) {
    console.error('PUT /api/ocorrencias error:', err)
    return res.status(500).json({ error: err.message })
  }
})

app.delete('/api/ocorrencias/:id', async (req, res) => {
  try {
    await query('DELETE FROM ocorrencias WHERE id = $1', [req.params.id])
    broadcastOcorrenciasAtualizadas()
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Escala ──────────────────────────────────────────────────────────────────
app.get('/api/escala', async (_req, res) => {
  try {
    const result = await query('SELECT data FROM escala_estado WHERE id = 1')
    if (!result.rows[0]) return res.json(null)
    res.json(result.rows[0].data)
  } catch (err) {
    console.error('GET /api/escala error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.put('/api/escala', async (req, res) => {
  try {
    const data = req.body && typeof req.body === 'object' ? req.body : {}
    await query(
      `INSERT INTO escala_estado (id, data, updated_at) VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = NOW()`,
      [JSON.stringify(data)]
    )
    res.json({ success: true })
  } catch (err) {
    console.error('PUT /api/escala error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/health', (req, res) => res.json({ ok: true }))

// ── SOS ─────────────────────────────────────────────────────────────────────
app.post('/api/sos', (req, res) => {
  const msg = req.body
  if (!msg || typeof msg !== 'object' || !msg.tipo || !msg.id) {
    return res.status(400).json({ error: 'Mensagem SOS inválida' })
  }
  try {
    if (msg.tipo === 'sos') processarSos(msg, null)
    else if (msg.tipo === 'sos-audio') processarSosAudio(msg, null)
    else if (msg.tipo === 'sos-cancelar') processarSosCancelar(msg, null)
    else return res.status(400).json({ error: `Tipo SOS desconhecido: ${msg.tipo}` })
    res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/sos error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Relatório de Vistoria ────────────────────────────────────────────────────
app.post('/api/relatorio-vistoria', async (req, res) => {
  try {
    let ocorrencia = req.body
    if (!ocorrencia || typeof ocorrencia !== 'object') {
      return res.status(400).json({ error: 'Dados da ocorrência não informados' })
    }
    if (ocorrencia.id && Number(ocorrencia.id) > 0) {
      try {
        const result = await query('SELECT * FROM ocorrencias WHERE id = $1', [Number(ocorrencia.id)])
        if (result.rows[0]) ocorrencia = result.rows[0]
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

// ── Checklists Viatura ───────────────────────────────────────────────────────
app.get('/api/checklists', async (req, res) => {
  try {
    const result = await query('SELECT * FROM checklists_viatura ORDER BY created_at DESC')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/checklists', async (req, res) => {
  const { data_checklist, km, placa, motorista, fotos_avarias, foto_frontal, foto_traseira, foto_direita, foto_esquerda, itens, observacoes, assinatura_data } = req.body
  try {
    const result = await query(
      `INSERT INTO checklists_viatura (data_checklist, km, placa, motorista, fotos_avarias, foto_frontal, foto_traseira, foto_direita, foto_esquerda, itens, observacoes, assinatura_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [data_checklist, km || null, placa || null, motorista || null,
       JSON.stringify(Array.isArray(fotos_avarias) ? fotos_avarias : []),
       foto_frontal || null, foto_traseira || null, foto_direita || null, foto_esquerda || null,
       JSON.stringify(itens || {}), observacoes || null, assinatura_data || null]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error('POST /api/checklists error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/checklists/:id', async (req, res) => {
  try {
    await query('DELETE FROM checklists_viatura WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Materiais ────────────────────────────────────────────────────────────────
function broadcastMateriaisAtualizados() {
  broadcastParaTodos({ tipo: 'materiais_atualizados' })
}
function broadcastEmprestimosAtualizados() {
  broadcastParaTodos({ tipo: 'emprestimos_atualizados' })
}

app.get('/api/materiais', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM materiais ORDER BY id')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/materiais', async (req, res) => {
  const { id, nome, descricao, observacoes, foto, foto_placa, quantidade } = req.body || {}
  if (!id || !nome) return res.status(400).json({ error: 'id e nome obrigatórios' })
  try {
    const result = await query(
      `INSERT INTO materiais (id, nome, descricao, observacoes, foto, foto_placa, quantidade)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [String(id).trim(), String(nome).trim(), descricao || null, observacoes || null,
       foto || null, foto_placa || null, Math.max(1, quantidade || 1)]
    )
    broadcastMateriaisAtualizados()
    res.status(201).json(result.rows[0])
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: `Já existe material com código "${id}".` })
    console.error('POST /api/materiais error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/materiais/:id', async (req, res) => {
  const { nome, descricao, observacoes, foto, foto_placa, quantidade } = req.body || {}
  const sets = []
  const vals = []
  let idx = 1
  if (typeof nome === 'string') { sets.push(`nome=$${idx++}`); vals.push(nome.trim()) }
  if (descricao !== undefined) { sets.push(`descricao=$${idx++}`); vals.push(descricao || null) }
  if (observacoes !== undefined) { sets.push(`observacoes=$${idx++}`); vals.push(observacoes || null) }
  if (foto !== undefined) { sets.push(`foto=$${idx++}`); vals.push(foto || null) }
  if (foto_placa !== undefined) { sets.push(`foto_placa=$${idx++}`); vals.push(foto_placa || null) }
  if (quantidade !== undefined) { sets.push(`quantidade=$${idx++}`); vals.push(Math.max(1, quantidade || 1)) }
  if (sets.length === 0) return res.status(400).json({ error: 'Nada para atualizar' })
  vals.push(req.params.id)
  try {
    const result = await query(`UPDATE materiais SET ${sets.join(', ')} WHERE id=$${idx} RETURNING *`, vals)
    if (!result.rows[0]) return res.status(404).json({ error: 'Material não encontrado' })
    broadcastMateriaisAtualizados()
    res.json(result.rows[0])
  } catch (err) {
    console.error('PATCH /api/materiais error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/materiais/:id', async (req, res) => {
  try {
    await query('DELETE FROM materiais WHERE id = $1', [req.params.id])
    broadcastMateriaisAtualizados()
    broadcastEmprestimosAtualizados()
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Empréstimos ──────────────────────────────────────────────────────────────
app.get('/api/emprestimos', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM emprestimos ORDER BY created_at DESC')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/emprestimos', async (req, res) => {
  const { material_id, material_codigo, material_nome, responsavel, cpf, secretaria, prazo_dias, quantidade, data_devolucao_prevista, condicao_equipamento, observacoes, agente_emprestador, assinatura_data } = req.body || {}
  if (!material_id || !responsavel) {
    return res.status(400).json({ error: 'material_id e responsavel obrigatórios' })
  }
  try {
    const result = await query(
      `INSERT INTO emprestimos (material_id, material_codigo, material_nome, responsavel, cpf, secretaria, prazo_dias, quantidade, data_devolucao_prevista, condicao_equipamento, observacoes, agente_emprestador, assinatura_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [material_id, material_codigo || material_id, material_nome || '',
       String(responsavel).trim(), cpf || null, secretaria || null,
       Number(prazo_dias) || 7, Math.max(1, quantidade || 1),
       data_devolucao_prevista || null, condicao_equipamento || null,
       observacoes || null, agente_emprestador || null, assinatura_data || null]
    )
    broadcastEmprestimosAtualizados()
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error('POST /api/emprestimos error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/emprestimos/:id/devolver', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' })
  const { devolvido_em, devolvido_obs, devolvido_recebedor, devolvido_foto } = req.body || {}
  try {
    const result = await query(
      `UPDATE emprestimos SET devolvido_em=$1, devolvido_obs=$2, devolvido_recebedor=$3, devolvido_foto=$4
       WHERE id=$5 RETURNING *`,
      [devolvido_em || new Date().toISOString(), devolvido_obs || null,
       devolvido_recebedor || null, devolvido_foto || null, id]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Empréstimo não encontrado' })
    broadcastEmprestimosAtualizados()
    res.json(result.rows[0])
  } catch (err) {
    console.error('PATCH /api/emprestimos error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Generic PATCH for emprestimos (devolução via /api/emprestimos/:id)
app.patch('/api/emprestimos/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' })
  const { devolvido_em, devolvido_obs, devolvido_recebedor, devolvido_foto } = req.body || {}
  try {
    const result = await query(
      `UPDATE emprestimos SET devolvido_em=$1, devolvido_obs=$2, devolvido_recebedor=$3, devolvido_foto=$4
       WHERE id=$5 RETURNING *`,
      [devolvido_em || new Date().toISOString(), devolvido_obs || null,
       devolvido_recebedor || null, devolvido_foto || null, id]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Empréstimo não encontrado' })
    broadcastEmprestimosAtualizados()
    res.json(result.rows[0])
  } catch (err) {
    console.error('PATCH /api/emprestimos/:id error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ── Equipamentos em Campo ────────────────────────────────────────────────────
app.get('/api/equipamentos-campo', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM equipamentos_campo ORDER BY created_at DESC')
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/equipamentos-campo', async (req, res) => {
  const { material_id, material_nome, fotos, latitude, longitude, rua, numero, bairro, observacao, quantidade, prazo_dias, data_recolha_prevista, status, agente } = req.body || {}
  if (!material_id) return res.status(400).json({ error: 'material_id obrigatório' })
  try {
    const result = await query(
      `INSERT INTO equipamentos_campo (material_id, material_nome, fotos, latitude, longitude, rua, numero, bairro, observacao, quantidade, prazo_dias, data_recolha_prevista, status, agente)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [material_id, material_nome || null,
       fotos ? JSON.stringify(fotos) : null,
       latitude ?? null, longitude ?? null,
       rua || null, numero || null, bairro || null, observacao || null,
       Math.max(1, quantidade || 1), prazo_dias || null,
       data_recolha_prevista || null, status || 'ativo', agente || null]
    )
    broadcastParaTodos({ tipo: 'campo_atualizado' })
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error('POST /api/equipamentos-campo error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.patch('/api/equipamentos-campo/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' })
  const { status } = req.body || {}
  try {
    const result = await query(
      'UPDATE equipamentos_campo SET status=$1 WHERE id=$2 RETURNING *',
      [status || 'devolvido', id]
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Registro não encontrado' })
    broadcastParaTodos({ tipo: 'campo_atualizado' })
    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/equipamentos-campo/:id', async (req, res) => {
  try {
    await query('DELETE FROM equipamentos_campo WHERE id = $1', [req.params.id])
    broadcastParaTodos({ tipo: 'campo_atualizado' })
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Push subscriptions ───────────────────────────────────────────────────────
app.post('/api/push-subscriptions', async (req, res) => {
  const { id, agente, endpoint, p256dh, auth } = req.body || {}
  if (!id || !endpoint || !p256dh || !auth) {
    return res.status(400).json({ error: 'id, endpoint, p256dh e auth obrigatórios' })
  }
  try {
    await query(
      `INSERT INTO push_subscriptions (id, agente, endpoint, p256dh, auth, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (id) DO UPDATE SET agente=$2, endpoint=$3, p256dh=$4, auth=$5, updated_at=NOW()`,
      [String(id), agente || null, endpoint, p256dh, auth]
    )
    res.json({ success: true })
  } catch (err) {
    console.error('POST /api/push-subscriptions error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/api/push-subscriptions/:id', async (req, res) => {
  try {
    await query('DELETE FROM push_subscriptions WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ── Send SOS Push ────────────────────────────────────────────────────────────
app.post('/api/send-sos-push', async (req, res) => {
  if (!vapidConfigured) {
    return res.status(503).json({ error: 'VAPID keys não configuradas no servidor' })
  }
  const body = req.body || {}
  if (!body.id || !body.agente) {
    return res.status(400).json({ error: 'id e agente obrigatórios' })
  }
  let subs
  try {
    const result = await query('SELECT id, endpoint, p256dh, auth, agente FROM push_subscriptions')
    subs = result.rows
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
  const localPart = body.lat != null && body.lng != null
    ? `📍 ${Number(body.lat).toFixed(5)}, ${Number(body.lng).toFixed(5)}`
    : 'Localização indisponível'
  const payload = JSON.stringify({
    title: '🆘 SOS — Defesa Civil',
    body: `${body.agente} acionou o SOS. ${localPart}`,
    tag: `sos-${body.id}`,
    sosId: body.id,
    url: '/',
  })
  const enviados = []
  const removidos = []
  await Promise.all(subs.map(async (s) => {
    if (body.excludeId && s.id === body.excludeId) return
    if (body.agente && s.agente && s.agente === body.agente) return
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 60 * 30, urgency: 'high' },
      )
      enviados.push(s.id)
    } catch (err) {
      const status = err && err.statusCode
      if (status === 404 || status === 410) removidos.push(s.id)
      else console.warn('[send-sos-push] erro envio:', s.id, status)
    }
  }))
  if (removidos.length > 0) {
    await query('DELETE FROM push_subscriptions WHERE id = ANY($1)', [removidos])
  }
  res.json({ enviados: enviados.length, removidos: removidos.length })
})

// ── Tiles proxy ──────────────────────────────────────────────────────────────
const OSM_SUBDOMAINS = ['a', 'b', 'c']
let _osmIdx = 0

app.get('/api/tiles/:z/:x/:y', async (req, res) => {
  const { z, x, y } = req.params
  const sub = OSM_SUBDOMAINS[_osmIdx++ % 3]
  const tileUrl = `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`
  try {
    const response = await fetch(tileUrl, {
      headers: {
        'User-Agent': 'DefesaCivilOuroBranco/1.0 (defesacivil@ourobranco.mg.gov.br)',
        'Accept': 'image/png,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) { res.status(response.status).end(); return }
    const buffer = await response.arrayBuffer()
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
    res.end(Buffer.from(buffer))
  } catch {
    res.status(503).end()
  }
})

// ── Geocode proxy ────────────────────────────────────────────────────────────
const geocodeCache = new Map()
const GEOCODE_TTL_MS = 60 * 60 * 1000

app.get('/api/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 2) return res.json([])
  const chave = q.toLowerCase()
  const agora = Date.now()
  const cached = geocodeCache.get(chave)
  if (cached && (agora - cached.ts) < GEOCODE_TTL_MS) return res.json(cached.data)
  try {
    const queryFinal = /ouro branco|mg|minas/i.test(q) ? q : `${q}, Ouro Branco, MG, Brasil`
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryFinal)}&format=json&limit=6&addressdetails=0&countrycodes=br&accept-language=pt-BR`
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'DefesaCivilOuroBranco/1.0', 'Accept-Language': 'pt-BR' },
    })
    if (!resp.ok) return res.status(502).json({ erro: 'Nominatim retornou ' + resp.status })
    const data = await resp.json()
    const arr = Array.isArray(data) ? data : []
    const simplificado = arr.map(d => ({
      display: d.display_name,
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
    })).filter(d => Number.isFinite(d.lat) && Number.isFinite(d.lng))
    geocodeCache.set(chave, { ts: agora, data: simplificado })
    res.json(simplificado)
  } catch (err) {
    console.error('Erro no geocode:', err.message)
    res.status(503).json({ erro: 'Geocodificação indisponível' })
  }
})

// ── Route proxy ──────────────────────────────────────────────────────────────
app.get('/api/rota', async (req, res) => {
  const from = String(req.query.from || '').split(',').map(parseFloat)
  const to = String(req.query.to || '').split(',').map(parseFloat)
  if (from.length !== 2 || to.length !== 2 || from.some(n => !Number.isFinite(n)) || to.some(n => !Number.isFinite(n))) {
    return res.status(400).json({ erro: 'Parâmetros from/to inválidos (use lat,lng)' })
  }
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
    const resp = await fetch(url, { headers: { 'User-Agent': 'DefesaCivilOuroBranco/1.0' } })
    if (!resp.ok) return res.status(502).json({ erro: 'OSRM retornou ' + resp.status })
    const json = await resp.json()
    const r = json?.routes?.[0]
    if (!r) return res.status(404).json({ erro: 'Sem rota disponível' })
    const coords = (r.geometry.coordinates || []).map(([lng, lat]) => [lat, lng])
    res.json({ coords, km: r.distance / 1000, min: Math.round(r.duration / 60) })
  } catch (err) {
    console.error('Erro na rota:', err.message)
    res.status(503).json({ erro: 'Roteamento indisponível' })
  }
})

// ── Weather ──────────────────────────────────────────────────────────────────
const OURO_BRANCO_LAT = -20.5195
const OURO_BRANCO_LON = -43.6983
const INMET_ESTACAO_OB = 'A513'
let climaCache = null
let climaCacheTs = 0
const CLIMA_TTL_MS = 10 * 60 * 1000

async function buscarDadosInmet() {
  for (let diasAtras = 0; diasAtras <= 3; diasAtras++) {
    const d = new Date()
    d.setDate(d.getDate() - diasAtras)
    const data = d.toISOString().slice(0, 10)
    const url = `https://apitempo.inmet.gov.br/estacao/${data}/${data}/${INMET_ESTACAO_OB}`
    try {
      const resp = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(6000) })
      if (resp.status !== 200) continue
      const json = await resp.json()
      if (!Array.isArray(json) || json.length === 0) continue
      const validos = json.filter(r => r.TEM_INS != null && r.TEM_INS !== '')
      if (validos.length === 0) continue
      const reg = validos[validos.length - 1]
      return {
        temperatura: reg.TEM_INS != null ? parseFloat(reg.TEM_INS) : null,
        umidade: reg.UMD_INS != null ? parseFloat(reg.UMD_INS) : null,
        ventoVel: reg.VEN_VEL != null ? parseFloat(reg.VEN_VEL) : null,
        ventoKmh: reg.VEN_VEL != null ? Math.round(parseFloat(reg.VEN_VEL) * 3.6) : null,
        ventoDir: reg.VEN_DIR != null ? parseFloat(reg.VEN_DIR) : null,
        chuva: reg.CHUVA != null ? parseFloat(reg.CHUVA) : null,
        horario: reg.HR_MEDICAO || reg.DT_MEDICAO || null,
        fonte: 'INMET',
        estacaoId: INMET_ESTACAO_OB,
      }
    } catch { continue }
  }
  return null
}

async function buscarDadosOpenMeteo() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${OURO_BRANCO_LAT}&longitude=${OURO_BRANCO_LON}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation&timezone=America%2FSao_Paulo&wind_speed_unit=ms`
  const resp = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!resp.ok) throw new Error(`Open-Meteo: ${resp.status}`)
  const json = await resp.json()
  const c = json.current
  const ventoVel = c.wind_speed_10m != null ? parseFloat(c.wind_speed_10m) : null
  return {
    temperatura: c.temperature_2m != null ? parseFloat(c.temperature_2m) : null,
    umidade: c.relative_humidity_2m != null ? parseFloat(c.relative_humidity_2m) : null,
    ventoVel,
    ventoKmh: ventoVel != null ? Math.round(ventoVel * 3.6) : null,
    ventoDir: c.wind_direction_10m != null ? parseFloat(c.wind_direction_10m) : null,
    chuva: c.precipitation != null ? parseFloat(c.precipitation) : null,
    horario: c.time || null,
    fonte: 'INMET',
    estacaoId: INMET_ESTACAO_OB,
  }
}

app.get('/api/tempo', async (_req, res) => {
  try {
    const agora = Date.now()
    if (climaCache && (agora - climaCacheTs) < CLIMA_TTL_MS) return res.json(climaCache)
    let dados = await buscarDadosInmet()
    if (!dados) dados = await buscarDadosOpenMeteo()
    const resultado = { ...dados, atualizadoEm: agora }
    climaCache = resultado
    climaCacheTs = agora
    res.json(resultado)
  } catch (err) {
    console.error('Erro ao buscar dados climáticos:', err.message)
    if (climaCache) return res.json({ ...climaCache, cache: true })
    res.status(503).json({ erro: 'Serviço climático indisponível' })
  }
})

// ── Serve frontend build ─────────────────────────────────────────────────────
const distPath = join(__dirname, '..', 'dist')
if (existsSync(distPath)) {
  app.use('/assets', express.static(join(distPath, 'assets'), { maxAge: '1y', immutable: true }))
  app.use(express.static(distPath, {
    setHeaders(res, filePath) {
      if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      }
    },
  }))
  app.get(/(.*)/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.sendFile(join(distPath, 'index.html'))
  })
}

const PORT = process.env.PORT || 3001

try {
  await initDb()
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`API Defesa Civil rodando na porta ${PORT}`)
    console.log(`WebSocket de rastreamento ativo em ws://0.0.0.0:${PORT}/ws`)
  })
  httpServer.on('error', (err) => {
    console.error('Server error:', err)
    process.exit(1)
  })
} catch (err) {
  console.error('Erro ao inicializar o servidor:', err)
  process.exit(1)
}
