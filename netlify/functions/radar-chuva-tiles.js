const RAINVIEWER_TILE_HOST = 'https://tilecache.rainviewer.com'
const RADAR_PATH_PATTERN = /^\/v2\/radar\/[a-z0-9]+$/i
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

function responderErro(statusCode, erro) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify({ erro }),
  }
}

export const handler = async event => {
  const parametros = event.queryStringParameters || {}
  const frame = typeof parametros.frame === 'string' ? parametros.frame : ''
  const z = Number(parametros.z)
  const x = Number(parametros.x)
  const y = Number(parametros.y)
  const limite = Number.isInteger(z) && z >= 0 && z <= 7 ? 2 ** z : 0

  if (
    !RADAR_PATH_PATTERN.test(frame) ||
    !limite ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= limite ||
    y >= limite
  ) {
    return responderErro(400, 'Quadro ou coordenadas de radar inválidos.')
  }

  try {
    const resposta = await fetch(`${RAINVIEWER_TILE_HOST}${frame}/256/${z}/${x}/${y}/2/1_0.png`, {
      headers: { Accept: 'image/png' },
      signal: AbortSignal.timeout(10000),
    })
    if (!resposta.ok) throw new Error(`RainViewer respondeu ${resposta.status}`)

    const tipoConteudo = resposta.headers.get('content-type') || ''
    if (!tipoConteudo.toLowerCase().includes('image/png')) {
      throw new Error('RainViewer não retornou um tile PNG')
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
        'Netlify-CDN-Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300',
        'X-Content-Type-Options': 'nosniff',
      },
      body: Buffer.from(await resposta.arrayBuffer()).toString('base64'),
      isBase64Encoded: true,
    }
  } catch (error) {
    console.warn('Erro ao buscar tile do RainViewer:', error?.message || error)
    return responderErro(502, 'Tile de chuva indisponível no momento.')
  }
}
