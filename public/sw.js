const CACHE = 'defesacivil-v1'

const PRECACHE = [
  '/',
  '/index.html',
  '/logo-dc.png',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // API: network-first, skip cache on POST/PUT/DELETE
  if (url.pathname.startsWith('/api')) {
    if (e.request.method !== 'GET') return
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE).then((c) => c.put(e.request, clone))
          return res
        })
        .catch(() => caches.match(e.request).then((r) => r || new Response('[]', { headers: { 'Content-Type': 'application/json' } })))
    )
    return
  }

  // Nominatim tiles / external: network only
  if (!url.origin.includes(self.location.hostname)) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503 })))
    return
  }

  // App shell: cache-first, fallback to network
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request).then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()))
          return res
        })
    )
  )
})
