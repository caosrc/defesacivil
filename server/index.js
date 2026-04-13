import express from 'express'
import cors from 'cors'
import pg from 'pg'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const app = express()

app.use(cors())
app.use(express.json({ limit: '100mb' }))

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
  const { tipo, natureza, subnatureza, nivel_risco, status_oc, fotos, lat, lng, endereco, proprietario, observacoes, data_ocorrencia } = req.body
  try {
    const result = await pool.query(
      `INSERT INTO ocorrencias (tipo, natureza, subnatureza, nivel_risco, status_oc, fotos, lat, lng, endereco, proprietario, observacoes, data_ocorrencia)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [tipo, natureza, subnatureza || null, nivel_risco, status_oc || 'ativo', fotos || [], lat || null, lng || null, endereco || null, proprietario || null, observacoes || null, data_ocorrencia || null]
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
  const { tipo, natureza, subnatureza, nivel_risco, status_oc, fotos, lat, lng, endereco, proprietario, observacoes, data_ocorrencia } = req.body
  try {
    const result = await pool.query(
      `UPDATE ocorrencias SET tipo=$1,natureza=$2,subnatureza=$3,nivel_risco=$4,status_oc=$5,fotos=$6::jsonb,lat=$7,lng=$8,endereco=$9,proprietario=$10,observacoes=$11,data_ocorrencia=$12
       WHERE id=$13 RETURNING *`,
      [tipo, natureza, subnatureza || null, nivel_risco, status_oc, JSON.stringify(fotos ?? []), lat || null, lng || null, endereco || null, proprietario || null, observacoes || null, data_ocorrencia || null, req.params.id]
    )
    res.json(result.rows[0])
  } catch (err) {
    console.error('PUT /api/ocorrencias error:', err)
    res.status(500).json({ error: err.message })
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

const distPath = join(__dirname, '..', 'dist')
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'))
  })
}

const PORT = process.env.PORT || 3001
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`API Defesa Civil rodando na porta ${PORT}`)
})

server.on('error', (err) => {
  console.error('Server error:', err)
  process.exit(1)
})
