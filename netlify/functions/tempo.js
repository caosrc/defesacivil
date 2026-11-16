import { buscarPrevisaoOpenMeteo } from '../../server/weather-forecast.js'

const CACHE_TTL_MS = 10 * 60 * 1000
let cache = null
let cacheTimestamp = 0

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
    cache = await buscarPrevisaoOpenMeteo()
    cacheTimestamp = now
    return responder(200, cache, 60)
  } catch (error) {
    console.error('Erro ao buscar previsão climática:', error?.message || error)
    if (cache) return responder(200, { ...cache, cache: true, erroAtualizacao: true }, 30)
    return responder(503, { erro: 'Serviço climático indisponível' })
  }
}
