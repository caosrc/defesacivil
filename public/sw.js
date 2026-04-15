const APP_CACHE = 'defesacivil-app-v3'
const TILE_CACHE = 'defesacivil-tiles-v1'

// Arquivos do app shell que serão cacheados na instalação
const PRECACHE = [
  '/',
  '/index.html',
  '/logo-dc.png',
  '/manifest.json',
]

// ------------------------------------------------------------------
// Funções de cálculo de tiles (OpenStreetMap tile scheme)
// ------------------------------------------------------------------
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

// Retorna todas as URLs de tiles para um bbox e lista de zooms
function gerarUrlsTiles(latMin, latMax, lonMin, lonMax, zooms) {
  const urls = []
  const subdominios = ['a', 'b', 'c']
  for (const z of zooms) {
    const xMin = lon2tile(lonMin, z)
    const xMax = lon2tile(lonMax, z)
    const yMin = lat2tile(latMax, z) // latMax → menor y (norte)
    const yMax = lat2tile(latMin, z) // latMin → maior y (sul)
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const s = subdominios[(Math.abs(x + y)) % 3]
        urls.push(`https://${s}.tile.openstreetmap.org/${z}/${x}/${y}.png`)
      }
    }
  }
  return urls
}

// Bounding box da área urbana de Ouro Branco – MG
const OB_LAT_MIN = -20.560
const OB_LAT_MAX = -20.480
const OB_LON_MIN = -43.730
const OB_LON_MAX = -43.660

// ------------------------------------------------------------------
// Instalação: cacheia o app shell
// ------------------------------------------------------------------
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(APP_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

// ------------------------------------------------------------------
// Ativação: limpa caches antigos
// ------------------------------------------------------------------
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== APP_CACHE && k !== TILE_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

// ------------------------------------------------------------------
// Fetch: intercepta requisições
// ------------------------------------------------------------------
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // Tiles do OpenStreetMap → cache-first + fallback cinza
  if (
    url.hostname.endsWith('tile.openstreetmap.org') ||
    url.hostname.endsWith('openstreetmap.org')
  ) {
    e.respondWith(
      caches.open(TILE_CACHE).then((cache) =>
        cache.match(e.request).then((cached) => {
          if (cached) return cached
          return fetch(e.request, { mode: 'cors' })
            .then((res) => {
              if (res.ok) cache.put(e.request, res.clone())
              return res
            })
            .catch(() => {
              // Tile cinza placeholder quando offline e não cacheado
              const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
                <rect width="256" height="256" fill="#d0d8e4"/>
                <text x="128" y="135" text-anchor="middle" fill="#8898aa"
                  font-family="sans-serif" font-size="13">offline</text>
              </svg>`
              return new Response(svg, {
                headers: { 'Content-Type': 'image/svg+xml' },
              })
            })
        })
      )
    )
    return
  }

  // API: network-first, ignora POST/PUT/DELETE
  if (url.pathname.startsWith('/api')) {
    if (e.request.method !== 'GET') return
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone()
          caches.open(APP_CACHE).then((c) => c.put(e.request, clone))
          return res
        })
        .catch(() =>
          caches
            .match(e.request)
            .then(
              (r) =>
                r ||
                new Response('[]', {
                  headers: { 'Content-Type': 'application/json' },
                })
            )
        )
    )
    return
  }

  // Requisições externas que não são tiles
  if (url.origin !== self.location.origin) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })))
    return
  }

  // App shell: cache-first, fallback para network e depois para /
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request).then((res) => {
          if (res.ok) caches.open(APP_CACHE).then((c) => c.put(e.request, res.clone()))
          return res
        }).catch(() => caches.match('/index.html'))
    )
  )
})

// ------------------------------------------------------------------
// Mensagens vindas do app
// ------------------------------------------------------------------
self.addEventListener('message', (e) => {
  const { tipo } = e.data || {}

  // Pré-cacheia tiles da região de Ouro Branco
  if (tipo === 'CACHEAR_MAPA_OURO_BRANCO') {
    const { zooms = [12, 13, 14, 15] } = e.data
    const urls = gerarUrlsTiles(OB_LAT_MIN, OB_LAT_MAX, OB_LON_MIN, OB_LON_MAX, zooms)
    const total = urls.length

    e.source.postMessage({ tipo: 'PROGRESSO_MAPA', total, concluido: 0, status: 'iniciando' })

    let concluido = 0
    let erros = 0

    caches.open(TILE_CACHE).then((cache) => {
      const lotes = []
      const TAMANHO_LOTE = 8

      for (let i = 0; i < urls.length; i += TAMANHO_LOTE) {
        lotes.push(urls.slice(i, i + TAMANHO_LOTE))
      }

      const processarLote = (idx) => {
        if (idx >= lotes.length) {
          e.source.postMessage({
            tipo: 'PROGRESSO_MAPA',
            total,
            concluido,
            erros,
            status: 'concluido',
          })
          return
        }

        const lote = lotes[idx]
        Promise.all(
          lote.map((url) =>
            cache.match(url).then((cached) => {
              if (cached) { concluido++; return }
              return fetch(url, { mode: 'cors' })
                .then((res) => {
                  if (res.ok) {
                    cache.put(url, res)
                    concluido++
                  } else {
                    erros++
                  }
                })
                .catch(() => { erros++ })
            })
          )
        ).then(() => {
          e.source.postMessage({
            tipo: 'PROGRESSO_MAPA',
            total,
            concluido,
            erros,
            status: 'andamento',
          })
          processarLote(idx + 1)
        })
      }

      processarLote(0)
    })
  }

  // Limpa apenas o cache de tiles
  if (tipo === 'LIMPAR_CACHE_MAPA') {
    caches.delete(TILE_CACHE).then(() => {
      e.source.postMessage({ tipo: 'CACHE_MAPA_LIMPO' })
    })
  }

  // Retorna info sobre quantos tiles estão cacheados
  if (tipo === 'INFO_CACHE_MAPA') {
    caches.open(TILE_CACHE).then((cache) =>
      cache.keys().then((keys) => {
        e.source.postMessage({ tipo: 'INFO_CACHE_MAPA_RESP', totalTiles: keys.length })
      })
    )
  }
})
