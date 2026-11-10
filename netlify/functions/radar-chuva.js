// Netlify Function — metadados do radar observado RainViewer.
// O site publicado é estático; esta função substitui a rota Express local.

const RAINVIEWER_METADATA_URL = 'https://api.rainviewer.com/public/weather-maps.json'
const RADAR_PATH_PATTERN = /^\/v2\/radar\/[a-z0-9]+$/i
const CACHE_TTL_MS = 2 * 60 * 1000

let cache = null
let cacheTimestamp = 0

function validarQuadro(quadro) {
  const time = Number(quadro?.time)
  return Number.isFinite(time)
    && time > 0
    && typeof quadro?.path === 'string'
    && RADAR_PATH_PATTERN.test(quadro.path)
}

function responder(statusCode, dados, cacheSeconds = 0) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' }
  if (cacheSeconds > 0) {
    headers['Cache-Control'] = `public, max-age=${cacheSeconds}, stale-while-revalidate=120`
    headers['Netlify-CDN-Cache-Control'] = `public, s-maxage=${cacheSeconds}, stale-while-revalidate=120`
  } else {
    headers['Cache-Control'] = 'no-store'
  }

  return { statusCode, headers, body: JSON.stringify(dados) }
}

export const handler = async () => {
  const now = Date.now()
  if (cache && now - cacheTimestamp < CACHE_TTL_MS) {
    return responder(200, { ...cache, cache: true }, 60)
  }

  try {
    const response = await fetch(RAINVIEWER_METADATA_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`RainViewer respondeu ${response.status}`)

    const metadata = await response.json()
    const hostUrl = new URL(String(metadata?.host || ''))
    if (hostUrl.protocol !== 'https:') throw new Error('Host HTTPS inválido no RainViewer')

    const observed = (Array.isArray(metadata?.radar?.past) ? metadata.radar.past : [])
      .filter(validarQuadro)
    const nowcast = (Array.isArray(metadata?.radar?.nowcast) ? metadata.radar.nowcast : [])
      .filter(validarQuadro)
    const frames = [
      ...observed.map(frame => ({ ...frame, tipoQuadro: 'observado' })),
      ...nowcast.map(frame => ({ ...frame, tipoQuadro: 'nowcast' })),
    ].sort((a, b) => Number(a.time) - Number(b.time))
    const latest = observed.at(-1) || nowcast.at(-1)

    if (!latest) throw new Error('RainViewer não retornou quadros de radar válidos')

    cache = {
      host: hostUrl.origin,
      path: latest.path,
      frameTime: Number(latest.time),
      atualizadoEm: new Date(Number(latest.time) * 1000).toISOString(),
      fonte: 'RainViewer',
      tipoQuadro: observed.length > 0 ? 'observado' : 'nowcast',
      quadros: frames.map(frame => ({
        path: frame.path,
        frameTime: Number(frame.time),
        tipoQuadro: frame.tipoQuadro,
      })),
    }
    cacheTimestamp = now
    return responder(200, cache, 60)
  } catch (error) {
    console.error('Erro ao consultar metadados do RainViewer:', error?.message || error)
    if (cache) return responder(200, { ...cache, cache: true, erroAtualizacao: true }, 30)
    return responder(503, { erro: 'Radar de chuva indisponível' })
  }
}
