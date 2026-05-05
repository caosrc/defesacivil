import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:defesacivil@ourobranco.mg.gov.br'

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return { statusCode: 503, body: JSON.stringify({ error: 'VAPID keys não configuradas' }) }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) }
  }

  if (!body.id || !body.agente) {
    return { statusCode: 400, body: JSON.stringify({ error: 'id e agente obrigatórios' }) }
  }

  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  } catch (e) {
    return { statusCode: 503, body: JSON.stringify({ error: 'VAPID inválido: ' + e.message }) }
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  let subs = []
  try {
    const { data } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth, agente')
    subs = data || []
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Erro ao buscar subscriptions: ' + e.message }) }
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
    }
  }))

  if (removidos.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', removidos).catch(() => {})
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enviados: enviados.length, removidos: removidos.length }),
  }
}
