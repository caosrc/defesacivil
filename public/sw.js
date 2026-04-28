/* Defesa Civil Ouro Branco — Service Worker
 * PWA + Offline First
 *
 * Estratégias:
 *  - App shell (HTML/CSS/JS/ícones)  → cache-first com revalidação em segundo plano
 *  - Navegação (rotas SPA)           → network-first com fallback para index.html cacheado
 *  - Tiles do mapa (OSM/Esri)        → cache-first, só baixa o que falta
 *  - Supabase / Open-Meteo / APIs    → sempre rede (nunca cachear dados dinâmicos)
 *
 * Mensagens suportadas (vindas do app, ver src/offline.ts):
 *  - SKIP_WAITING                    → ativa SW novo imediatamente
 *  - CACHEAR_MAPA_OURO_BRANCO        → pré-baixa tiles da área urbana
 *  - INFO_CACHE_MAPA                 → devolve quantidade de tiles em cache
 *  - LIMPAR_CACHE_MAPA               → apaga todos os tiles cacheados
 */

const VERSION = 'v5-2026-04'
const APP_CACHE = `defesacivil-app-${VERSION}`
const TILES_CACHE = 'defesacivil-tiles-osm'
const ASSETS_CACHE = `defesacivil-assets-${VERSION}`
const MALHA_CACHE = 'defesacivil-malha-viaria'

// Recursos essenciais para abrir o app offline (app shell)
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon.svg',
  '/logo-dc.jpg',
  '/logo-dc.png',
  '/icons.svg',
]

// ── INSTALL ────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((cache) =>
      // addAll falha tudo se um único asset falhar — então adicionamos um por um
      Promise.all(
        APP_SHELL.map((url) =>
          cache
            .add(new Request(url, { cache: 'reload' }))
            .catch(() => { /* asset opcional ausente, segue */ })
        )
      )
    )
  )
})

// ── ACTIVATE ───────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      // Mantém apenas as caches da versão atual + tiles + malha (que persistem entre versões)
      const validas = new Set([APP_CACHE, ASSETS_CACHE, TILES_CACHE, MALHA_CACHE])
      await Promise.all(
        keys
          .filter((k) => !validas.has(k) && k.startsWith('defesacivil-'))
          .map((k) => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

// ── FETCH ──────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  let url
  try { url = new URL(req.url) } catch { return }

  // 1. Tiles do mapa → cache-first com fallback de rede
  if (
    url.host.endsWith('tile.openstreetmap.org') ||
    url.host.includes('arcgisonline.com')
  ) {
    event.respondWith(servirTile(req))
    return
  }

  // 2. APIs dinâmicas (Supabase, Open-Meteo, Nominatim) → sempre rede
  //    Não interceptamos: o navegador faz o fetch normalmente.
  if (
    url.host.endsWith('.supabase.co') ||
    url.host.endsWith('open-meteo.com') ||
    url.host.endsWith('nominatim.openstreetmap.org') ||
    url.host.startsWith('api.')
  ) {
    return
  }

  // 3. Mesma origem
  if (url.origin === self.location.origin) {
    // 3a. Malha viária cacheada (Overpass) → cache-only
    if (url.pathname === '/__malha-viaria__') {
      event.respondWith(servirMalha())
      return
    }
    // 3b. Navegação (SPA) → network-first, cai para index.html cacheado
    if (req.mode === 'navigate') {
      event.respondWith(servirNavegacao(req))
      return
    }
    // 3c. Assets estáticos (JS/CSS/imagens) → stale-while-revalidate
    event.respondWith(servirAsset(req))
  }
})

async function servirMalha() {
  const cache = await caches.open(MALHA_CACHE)
  const cached = await cache.match('/__malha-viaria__')
  if (cached) return cached
  return new Response(JSON.stringify({ erro: 'malha_nao_baixada' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ── Estratégia: tile (cache-first, persistente) ────────────────────
async function servirTile(req) {
  const cache = await caches.open(TILES_CACHE)
  const cached = await cache.match(req, { ignoreVary: true })
  if (cached) return cached
  try {
    const resp = await fetch(req)
    if (resp && resp.ok) {
      cache.put(req, resp.clone()).catch(() => {})
    }
    return resp
  } catch {
    return new Response('', { status: 504, statusText: 'Sem conexão e tile não cacheado' })
  }
}

// ── Estratégia: navegação (network-first com fallback offline) ─────
async function servirNavegacao(req) {
  try {
    const resp = await fetch(req)
    // Atualiza o cache do shell em segundo plano
    const cache = await caches.open(APP_CACHE)
    cache.put('/index.html', resp.clone()).catch(() => {})
    return resp
  } catch {
    const cache = await caches.open(APP_CACHE)
    const fallback =
      (await cache.match('/index.html')) ||
      (await cache.match('/')) ||
      (await cache.match(new URL('/', self.location.origin).toString()))
    if (fallback) return fallback
    return new Response(
      '<h1>Sem conexão</h1><p>Abra o app pelo menos uma vez online para que ele funcione offline.</p>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
    )
  }
}

// ── Estratégia: assets (stale-while-revalidate) ────────────────────
async function servirAsset(req) {
  const cache = await caches.open(ASSETS_CACHE)
  const cached = await cache.match(req)
  const fetchPromise = fetch(req)
    .then((resp) => {
      if (resp && resp.ok && resp.type !== 'opaque') {
        cache.put(req, resp.clone()).catch(() => {})
      }
      return resp
    })
    .catch(() => null)

  if (cached) {
    // Revalida em segundo plano, devolve cache imediatamente
    fetchPromise.catch(() => {})
    return cached
  }
  const network = await fetchPromise
  if (network) return network
  // Sem cache e sem rede — tenta o app shell como último recurso para HTML
  if (req.destination === 'document') {
    const shell = await cache.match('/index.html')
    if (shell) return shell
  }
  return new Response('', { status: 504, statusText: 'Sem conexão' })
}

// ── MESSAGES ───────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  const msg = event.data
  if (!msg || typeof msg !== 'object') return

  if (msg.tipo === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }

  if (msg.tipo === 'CACHEAR_MAPA_OURO_BRANCO') {
    const zooms = Array.isArray(msg.zooms) && msg.zooms.length > 0
      ? msg.zooms
      : [11, 12, 13, 14, 15, 16]
    const raioKm = Number(msg.raioKm) > 0 ? Number(msg.raioKm) : 20
    event.waitUntil(cachearMapaOuroBranco(zooms, raioKm, event.source))
    return
  }

  if (msg.tipo === 'BAIXAR_MALHA_VIARIA') {
    const raioM = Number(msg.raioM) > 0 ? Number(msg.raioM) : 20000
    event.waitUntil(baixarMalhaViaria(raioM, event.source))
    return
  }

  if (msg.tipo === 'INFO_MALHA_VIARIA') {
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(MALHA_CACHE)
        const resp = await cache.match('/__malha-viaria__')
        const tem = !!resp
        let bytes = 0
        if (resp) {
          const blob = await resp.clone().blob()
          bytes = blob.size
        }
        event.source && event.source.postMessage({
          tipo: 'INFO_MALHA_VIARIA_RESP',
          baixada: tem,
          bytes,
        })
      } catch {
        event.source && event.source.postMessage({
          tipo: 'INFO_MALHA_VIARIA_RESP',
          baixada: false,
          bytes: 0,
        })
      }
    })())
    return
  }

  if (msg.tipo === 'INFO_CACHE_MAPA') {
    event.waitUntil(
      caches.open(TILES_CACHE)
        .then((c) => c.keys())
        .then((keys) => {
          event.source && event.source.postMessage({
            tipo: 'INFO_CACHE_MAPA_RESP',
            totalTiles: keys.length,
          })
        })
        .catch(() => {
          event.source && event.source.postMessage({
            tipo: 'INFO_CACHE_MAPA_RESP',
            totalTiles: 0,
          })
        })
    )
    return
  }

  if (msg.tipo === 'LIMPAR_CACHE_MAPA') {
    event.waitUntil(
      caches.delete(TILES_CACHE).then(() => {
        event.source && event.source.postMessage({ tipo: 'CACHE_MAPA_LIMPO' })
      })
    )
    return
  }
})

// ── Pré-cache de tiles (Ouro Branco) ──────────────────────────────
function lon2tile(lon, zoom) {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom))
}
function lat2tile(lat, zoom) {
  const rad = (lat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  )
}

async function cachearMapaOuroBranco(zooms, raioKm, source) {
  // Bounding box ao redor de Ouro Branco — MG (centro: -20.5195, -43.6983)
  const lat = -20.5195
  const lng = -43.6983
  // 1 grau de latitude ≈ 111 km. Longitude ajusta pela cossecante da latitude.
  const margemLat = raioKm / 111
  const margemLng = raioKm / (111 * Math.cos((lat * Math.PI) / 180))
  const latMin = lat - margemLat
  const latMax = lat + margemLat
  const lngMin = lng - margemLng
  const lngMax = lng + margemLng

  const tiles = []
  for (const z of zooms) {
    const xMin = lon2tile(lngMin, z)
    const xMax = lon2tile(lngMax, z)
    const yMin = lat2tile(latMax, z)
    const yMax = lat2tile(latMin, z)
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const sub = ['a', 'b', 'c'][Math.abs(x + y) % 3]
        tiles.push(`https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`)
      }
    }
  }

  const cache = await caches.open(TILES_CACHE)
  let concluido = 0
  let erros = 0
  const total = tiles.length

  function notificar(status) {
    if (source) source.postMessage({ tipo: 'PROGRESSO_MAPA', total, concluido, erros, status })
  }

  notificar('iniciando')

  // Baixa em lotes pequenos para não sobrecarregar nem o navegador nem o servidor de tiles
  const lote = 6
  for (let i = 0; i < tiles.length; i += lote) {
    const slice = tiles.slice(i, i + lote)
    await Promise.all(
      slice.map(async (url) => {
        try {
          const existente = await cache.match(url)
          if (existente) { concluido++; return }
          const resp = await fetch(url, { mode: 'cors' })
          if (resp && resp.ok) {
            await cache.put(url, resp.clone())
            concluido++
          } else {
            erros++
          }
        } catch {
          erros++
        }
      })
    )
    notificar('andamento')
  }

  notificar('concluido')
}

// ── Pré-cache de malha viária (Overpass) ──────────────────────────
// Baixa todas as ruas/estradas dentro do raio configurado e armazena
// como Response no cache para o app indexar e usar offline.
async function baixarMalhaViaria(raioM, source) {
  const lat = -20.5195
  const lng = -43.6983

  function notificar(status, extra = {}) {
    if (source) source.postMessage({ tipo: 'PROGRESSO_MALHA', status, ...extra })
  }

  notificar('iniciando')

  // Query Overpass: todas as ways do tipo highway dentro do raio + nodes referenciados.
  const query = `[out:json][timeout:120];
(
  way["highway"](around:${raioM},${lat},${lng});
);
(._;>;);
out body;`

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ]

  let resposta = null
  let erroFinal = null
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
      })
      if (r.ok) { resposta = r; break }
      erroFinal = `Overpass ${ep} retornou ${r.status}`
    } catch (e) {
      erroFinal = e && e.message ? e.message : 'erro de rede'
    }
  }

  if (!resposta) {
    notificar('erro', { mensagem: erroFinal || 'Falha ao baixar malha viária' })
    return
  }

  try {
    const cache = await caches.open(MALHA_CACHE)
    // Clonamos antes de consumir para conseguir guardar no cache.
    const blob = await resposta.clone().blob()
    const respCache = new Response(blob, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    await cache.put('/__malha-viaria__', respCache)
    notificar('concluido', { bytes: blob.size })
  } catch (e) {
    notificar('erro', { mensagem: e && e.message ? e.message : 'erro ao salvar' })
  }
}
