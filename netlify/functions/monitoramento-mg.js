import { buscarEstacoesCemaden } from '../../server/weather-routes.js'

const CACHE_TTL_MS = 2 * 60 * 1000
const STALE_TTL_MS = 15 * 60 * 1000
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
    cache = await buscarEstacoesCemaden()
    cacheTimestamp = now
    return responder(200, cache, 60)
  } catch (error) {
    console.warn('[CEMADEN] Falha ao consultar pluviômetros:', error?.message || error)
    if (cache && now - cacheTimestamp <= STALE_TTL_MS) {
      return responder(200, { ...cache, cache: true, erroAtualizacao: true }, 30)
    }
    return responder(503, {
      sucesso: false,
      erro: 'Não foi possível consultar os pluviômetros CEMADEN do entorno de Ouro Branco.',
    })
  }
}
