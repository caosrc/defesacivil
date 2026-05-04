// Script de migração: Supabase → PostgreSQL Replit
// Uso: node server/migrate-supabase.js

import pg from 'pg'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
const DATABASE_URL = process.env.DATABASE_URL

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não definidos')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: DATABASE_URL })

async function query(sql, params = []) {
  const client = await pool.connect()
  try {
    return await client.query(sql, params)
  } finally {
    client.release()
  }
}

async function fetchSupabase(table, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*${params}&limit=10000`
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Erro ao buscar ${table}: ${res.status} ${text}`)
  }
  return res.json()
}

function jsonOrNull(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') return JSON.stringify(v)
  return v
}

async function migrarOcorrencias() {
  const rows = await fetchSupabase('ocorrencias', '&order=id.asc')
  console.log(`  📋 ocorrencias: ${rows.length} registros`)
  if (!rows.length) return 0

  for (const r of rows) {
    await query(
      `INSERT INTO ocorrencias
        (tipo, natureza, subnatureza, nivel_risco, status_oc, fotos, lat, lng, endereco,
         proprietario, situacao, recomendacao, conclusao, data_ocorrencia, agentes,
         responsavel_registro, vistorias, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT DO NOTHING`,
      [
        r.tipo, r.natureza, r.subnatureza, r.nivel_risco,
        r.status_oc ?? r.status ?? 'ativo',
        jsonOrNull(r.fotos ?? []),
        r.lat, r.lng, r.endereco, r.proprietario, r.situacao,
        r.recomendacao, r.conclusao, r.data_ocorrencia,
        jsonOrNull(r.agentes ?? []),
        r.responsavel_registro,
        jsonOrNull(r.vistorias ?? []),
        r.created_at ?? new Date().toISOString(),
      ]
    )
  }
  return rows.length
}

async function migrarEscalaEstado() {
  const rows = await fetchSupabase('escala_estado')
  console.log(`  📅 escala_estado: ${rows.length} registros`)
  if (!rows.length) return 0

  for (const r of rows) {
    await query(
      `INSERT INTO escala_estado (id, data, updated_at)
       VALUES ($1,$2,$3)
       ON CONFLICT (id) DO UPDATE SET data=$2, updated_at=$3`,
      [r.id, jsonOrNull(r.data), r.updated_at ?? new Date().toISOString()]
    )
  }
  return rows.length
}

async function migrarChecklists() {
  const rows = await fetchSupabase('checklists_viatura', '&order=id.asc')
  console.log(`  🚗 checklists_viatura: ${rows.length} registros`)
  if (!rows.length) return 0

  for (const r of rows) {
    await query(
      `INSERT INTO checklists_viatura
        (data_checklist, km, placa, motorista, fotos_avarias, foto_frontal,
         foto_traseira, foto_direita, foto_esquerda, itens, observacoes,
         assinatura_data, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT DO NOTHING`,
      [
        r.data_checklist, r.km, r.placa, r.motorista,
        jsonOrNull(r.fotos_avarias ?? []),
        r.foto_frontal, r.foto_traseira, r.foto_direita, r.foto_esquerda,
        jsonOrNull(r.itens ?? {}),
        r.observacoes, r.assinatura_data,
        r.created_at ?? new Date().toISOString(),
      ]
    )
  }
  return rows.length
}

async function migrarMateriais() {
  const rows = await fetchSupabase('materiais', '&order=id.asc')
  console.log(`  📦 materiais: ${rows.length} registros`)
  if (!rows.length) return 0

  for (const r of rows) {
    await query(
      `INSERT INTO materiais (id, nome, descricao, observacoes, foto, foto_placa, quantidade, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE
         SET nome=$2, descricao=$3, observacoes=$4, foto=$5, foto_placa=$6, quantidade=$7`,
      [
        r.id, r.nome, r.descricao, r.observacoes, r.foto, r.foto_placa,
        r.quantidade ?? 1,
        r.created_at ?? new Date().toISOString(),
      ]
    )
  }
  return rows.length
}

async function migrarEmprestimos() {
  const rows = await fetchSupabase('emprestimos', '&order=id.asc')
  console.log(`  🤝 emprestimos: ${rows.length} registros`)
  if (!rows.length) return 0

  for (const r of rows) {
    await query(
      `INSERT INTO emprestimos
        (material_id, material_codigo, material_nome, responsavel, cpf, secretaria,
         prazo_dias, quantidade, data_emprestimo, data_devolucao_prevista,
         condicao_equipamento, observacoes, agente_emprestador, assinatura_data,
         devolvido_em, devolvido_obs, devolvido_recebedor, devolvido_foto, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT DO NOTHING`,
      [
        r.material_id, r.material_codigo, r.material_nome,
        r.responsavel, r.cpf, r.secretaria,
        r.prazo_dias ?? 7, r.quantidade ?? 1,
        r.data_emprestimo ?? new Date().toISOString(),
        r.data_devolucao_prevista ?? null,
        r.condicao_equipamento, r.observacoes, r.agente_emprestador,
        r.assinatura_data,
        r.devolvido_em ?? null, r.devolvido_obs ?? null,
        r.devolvido_recebedor ?? null, r.devolvido_foto ?? null,
        r.created_at ?? new Date().toISOString(),
      ]
    )
  }
  return rows.length
}

async function migrarEquipamentosCampo() {
  const rows = await fetchSupabase('equipamentos_campo', '&order=id.asc')
  console.log(`  🏕️  equipamentos_campo: ${rows.length} registros`)
  if (!rows.length) return 0

  for (const r of rows) {
    await query(
      `INSERT INTO equipamentos_campo
        (material_id, material_nome, fotos, latitude, longitude, rua, numero,
         bairro, observacao, quantidade, prazo_dias, data_recolha_prevista,
         status, agente, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT DO NOTHING`,
      [
        r.material_id ?? null, r.material_nome,
        jsonOrNull(r.fotos),
        r.latitude, r.longitude, r.rua, r.numero, r.bairro,
        r.observacao, r.quantidade ?? 1, r.prazo_dias ?? null,
        r.data_recolha_prevista ?? null,
        r.status ?? 'ativo', r.agente,
        r.created_at ?? new Date().toISOString(),
      ]
    )
  }
  return rows.length
}

async function migrarPushSubscriptions() {
  const rows = await fetchSupabase('push_subscriptions')
  console.log(`  🔔 push_subscriptions: ${rows.length} registros`)
  if (!rows.length) return 0

  for (const r of rows) {
    await query(
      `INSERT INTO push_subscriptions (id, agente, endpoint, p256dh, auth, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE
         SET agente=$2, endpoint=$3, p256dh=$4, auth=$5, updated_at=$6`,
      [
        r.id, r.agente, r.endpoint, r.p256dh, r.auth,
        r.updated_at ?? new Date().toISOString(),
      ]
    )
  }
  return rows.length
}

async function migrarSosAtivos() {
  const rows = await fetchSupabase('sos_ativos_db')
  console.log(`  🆘 sos_ativos_db: ${rows.length} registros`)
  if (!rows.length) return 0

  for (const r of rows) {
    await query(
      `INSERT INTO sos_ativos_db
        (id, agente, lat, lng, bateria, audio, timestamp, visualizadores, mensagens, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE
         SET agente=$2, lat=$3, lng=$4, bateria=$5, audio=$6, timestamp=$7`,
      [
        r.id, r.agente, r.lat ?? null, r.lng ?? null,
        r.bateria ?? null, r.audio ?? null,
        r.timestamp ?? Date.now(),
        jsonOrNull(r.visualizadores ?? []),
        jsonOrNull(r.mensagens ?? []),
        r.created_at ?? new Date().toISOString(),
      ]
    )
  }
  return rows.length
}

async function main() {
  console.log('\n🚀 Iniciando migração Supabase → Replit PostgreSQL\n')
  console.log(`   Supabase: ${SUPABASE_URL}`)
  console.log(`   Destino:  Replit PostgreSQL (DATABASE_URL)\n`)

  const resultados = {}
  const erros = []

  const etapas = [
    ['ocorrencias', migrarOcorrencias],
    ['escala_estado', migrarEscalaEstado],
    ['checklists_viatura', migrarChecklists],
    ['materiais', migrarMateriais],
    ['emprestimos', migrarEmprestimos],
    ['equipamentos_campo', migrarEquipamentosCampo],
    ['push_subscriptions', migrarPushSubscriptions],
    ['sos_ativos_db', migrarSosAtivos],
  ]

  // materiais deve vir antes de emprestimos e equipamentos (FK)
  for (const [nome, fn] of etapas) {
    try {
      resultados[nome] = await fn()
    } catch (e) {
      console.error(`  ❌ Erro em ${nome}:`, e.message)
      erros.push({ nome, erro: e.message })
      resultados[nome] = 0
    }
  }

  console.log('\n✅ Migração concluída!\n')
  console.log('Resumo:')
  for (const [nome, qtd] of Object.entries(resultados)) {
    console.log(`  ${qtd > 0 ? '✔' : '–'} ${nome}: ${qtd} registros`)
  }
  if (erros.length) {
    console.log('\n⚠️  Erros encontrados:')
    for (const { nome, erro } of erros) {
      console.log(`  • ${nome}: ${erro}`)
    }
  }

  await pool.end()
}

main().catch(e => {
  console.error('Erro fatal:', e)
  process.exit(1)
})
