const INMET_ALERTS_URL = 'https://apiprevmet3.inmet.gov.br/avisos/rss'
const CEMADEN_CATALOG_URL = 'https://resources.cemaden.gov.br/graficos/interativo/getJson2.php?uf=MG'
const CEMADEN_RESOURCES_URL = 'https://mapservices.cemaden.gov.br/MapaInterativoWS/resources'
const REDEMET_PRODUCTS_URL = 'https://api-redemet.decea.mil.br/produtos'
const REDEMET_IMAGE_HOST = 'estatico-redemet.decea.mil.br'
const CENTER = { latitude: -20.5195, longitude: -43.6983 }
const NEARBY_CITIES = new Set([
  'CONGONHAS',
  'OURO PRETO',
  'ITABIRITO',
  'CONSELHEIRO LAFAIETE',
  'BELO VALE',
  'MARIANA',
])
const RADAR_TYPES = new Set(['maxcappi', '10km', '07km', '05km', '03km'])
const radarCache = new Map()
let cemadenCache = null
let cemadenCacheAt = 0
let alertsCache = null
let alertsCacheAt = 0
let lightningCache = null
let lightningCacheAt = 0

function normalizarTexto(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

function numeroOuNulo(valor) {
  if (valor == null || valor === '' || valor === '-') return null
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

function dataHoraPonto(ponto) {
  if (!ponto) return ''
  const data = String(ponto.data || '')
  const hora = String(ponto.hora || '').match(/^(\d{1,2})h$/i)?.[1]
  if (!hora || !/^\d{2}\/\d{2}\/\d{4}$/.test(data)) return ''
  return `${data} ${hora.padStart(2, '0')}:00`
}

function ultimaLeitura(payload) {
  const horarios = Array.isArray(payload?.horarios) ? payload.horarios : []
  const datas = Array.isArray(payload?.datas) ? payload.datas : []
  const acumulados = Array.isArray(payload?.acumulados) ? payload.acumulados : []
  const pontos = []

  acumulados.forEach((linha, indiceData) => {
    if (!Array.isArray(linha)) return
    linha.forEach((valor, indiceHora) => {
      const numero = numeroOuNulo(valor)
      const data = String(datas[indiceData] || '')
      const hora = String(horarios[indiceHora] || '')
      const [dia, mes, ano] = data.split('/').map(Number)
      const horaNumero = Number(hora.match(/^(\d{1,2})h$/i)?.[1])
      if (numero == null || !dia || !mes || !ano || !Number.isFinite(horaNumero)) return
      pontos.push({
        data,
        hora,
        valor: numero,
        instante: Date.UTC(ano < 100 ? 2000 + ano : ano, mes - 1, dia, horaNumero),
      })
    })
  })

  return pontos.sort((a, b) => a.instante - b.instante).at(-1) || null
}

function distanciaKm(latitude, longitude) {
  const radianos = Math.PI / 180
  const deltaLat = (latitude - CENTER.latitude) * radianos
  const deltaLon = (longitude - CENTER.longitude) * radianos
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(CENTER.latitude * radianos) * Math.cos(latitude * radianos) *
    Math.sin(deltaLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function buscarEstacoesCemaden() {
  const respostaCatalogo = await fetch(CEMADEN_CATALOG_URL, {
    headers: { 'User-Agent': 'DefesaCivilOuroBranco/1.0' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!respostaCatalogo.ok) throw new Error(`Catálogo CEMADEN respondeu ${respostaCatalogo.status}`)

  const catalogo = await respostaCatalogo.json()
  if (!Array.isArray(catalogo)) throw new Error('Formato inesperado no catálogo CEMADEN')
  const candidatas = catalogo.filter(estacao =>
    String(estacao?.uf || '').toUpperCase() === 'MG' &&
    NEARBY_CITIES.has(normalizarTexto(estacao?.cidade)),
  )

  const leituras = await Promise.allSettled(candidatas.map(async estacao => {
    const id = Number(estacao?.idestacao)
    if (!Number.isFinite(id)) throw new Error('Estação CEMADEN sem identificador')
    const resposta = await fetch(`${CEMADEN_RESOURCES_URL}/horario/${id}/96`, {
      headers: { 'User-Agent': 'DefesaCivilOuroBranco/1.0' },
      signal: AbortSignal.timeout(4_000),
    })
    if (!resposta.ok) throw new Error(`Estação CEMADEN respondeu ${resposta.status}`)
    return { estacao, payload: await resposta.json() }
  }))
  const leiturasPorId = new Map()
  leituras.forEach(resultado => {
    if (resultado.status === 'fulfilled') {
      leiturasPorId.set(Number(resultado.value.estacao.idestacao), resultado.value)
    }
  })

  const estacoes = candidatas.map(item => {
    const leitura = leiturasPorId.get(Number(item.idestacao))
    const dadosEstacao = leitura?.payload?.estacao || {}
    const ponto = ultimaLeitura(leitura?.payload)
    const valorCatalogo = numeroOuNulo(item.acc1hr)
    const latitude = numeroOuNulo(dadosEstacao.latitude)
    const longitude = numeroOuNulo(dadosEstacao.longitude)
    return {
      id: Number(item.idestacao),
      nome: String(item.nomeestacao || dadosEstacao.nome || ''),
      municipio: String(item.cidade || dadosEstacao.idMunicipio?.cidade || ''),
      codigo: String(dadosEstacao.codEstacao || ''),
      latitude,
      longitude,
      precipitacaoAtual: valorCatalogo ?? ponto?.valor ?? null,
      precipitacaoDataHora: valorCatalogo != null
        ? String(item.datahoraUltimovalor || '')
        : dataHoraPonto(ponto) || String(item.datahoraUltimovalor || ''),
      distanciaKm: latitude != null && longitude != null
        ? Number(distanciaKm(latitude, longitude).toFixed(1))
        : null,
    }
  }).filter(estacao => estacao.distanciaKm == null || estacao.distanciaKm <= 70)

  const georreferenciadas = estacoes.filter(estacao =>
    estacao.latitude != null && estacao.longitude != null,
  ).length
  if (georreferenciadas === 0) {
    throw new Error('Nenhuma estação CEMADEN do entorno pôde ser posicionada')
  }

  return {
    sucesso: true,
    estacoes,
    totalEstacoes: estacoes.length,
    estacoesGeorreferenciadas: georreferenciadas,
    estacoesSemCoordenadas: estacoes.length - georreferenciadas,
    atualizadoEm: new Date().toISOString(),
    fonte: 'CEMADEN · Ouro Branco e municípios próximos',
  }
}

function decodificarXml(texto) {
  return String(texto || '')
    .replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function campoXml(xml, nome) {
  const match = xml.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, 'i'))
  return match ? decodificarXml(match[1]) : ''
}

async function buscarAlertasInmet() {
  const resposta = await fetch(INMET_ALERTS_URL, {
    headers: { Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!resposta.ok) throw new Error(`INMET respondeu ${resposta.status}`)
  const xml = await resposta.text()
  const regioesDeInteresse = [
    'OURO BRANCO',
    'METROPOLITANA DE BELO HORIZONTE',
    'CAMPO DAS VERTENTES',
    'OESTE DE MINAS',
    'SUL/SUDOESTE DE MINAS',
    'ZONA DA MATA',
    'VALE DO RIO DOCE',
    'VALE DO MUCURI',
    'JEQUITINHONHA',
    'CENTRAL MINEIRA',
    'NORTE DE MINAS',
  ]
  const itens = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
  const alertas = itens.flatMap(([_, item], indice) => {
    const titulo = campoXml(item, 'title')
    const descricao = campoXml(item, 'description')
    const areaMatch = descricao.match(/(?:Área|Areas?)\s*(?:Aviso para as)?\s*:\s*([\s\S]*?)(?:Link Gráfico|$)/i)
    const areas = areaMatch?.[1] || descricao
    const areasNormalizadas = normalizarTexto(areas)
    if (!regioesDeInteresse.some(regiao => areasNormalizadas.includes(regiao))) return []
    const severidade = normalizarTexto(`${titulo} ${descricao}`)
    const nivel = severidade.includes('GRANDE PERIGO')
      ? 'vermelho'
      : severidade.includes('PERIGO POTENCIAL') || severidade.includes('PERIGO')
        ? 'amarelo'
        : 'informativo'
    const link = campoXml(item, 'link') || campoXml(item, 'guid') || 'https://avisos.inmet.gov.br/'
    return [{
      id: campoXml(item, 'guid') || `${indice}-${titulo}`,
      titulo: titulo || 'Aviso meteorológico',
      descricao,
      nivel,
      inicio: campoXml(item, 'pubDate') || null,
      url: /^https:\/\/(?:avisos\.inmet\.gov\.br|apiprevmet3\.inmet\.gov\.br)\//i.test(link)
        ? link
        : 'https://avisos.inmet.gov.br/',
    }]
  })
  return { alertas: alertas.slice(0, 10), fonte: 'INMET', atualizadoEm: new Date().toISOString() }
}

const PONTOS_PREVISAO = [
  { id: 'belo-horizonte', nome: 'Belo Horizonte', latitude: -19.9167, longitude: -43.9345 },
  { id: 'uberlandia', nome: 'Uberlândia', latitude: -18.9186, longitude: -48.2772 },
  { id: 'juiz-de-fora', nome: 'Juiz de Fora', latitude: -21.7595, longitude: -43.3398 },
  { id: 'montes-claros', nome: 'Montes Claros', latitude: -16.7286, longitude: -43.8578 },
  { id: 'uberaba', nome: 'Uberaba', latitude: -19.7473, longitude: -47.9381 },
  { id: 'governador-valadares', nome: 'Governador Valadares', latitude: -18.8512, longitude: -41.9498 },
  { id: 'ipatinga', nome: 'Ipatinga', latitude: -19.4681, longitude: -42.5360 },
  { id: 'teofilo-otoni', nome: 'Teófilo Otoni', latitude: -17.8574, longitude: -41.5054 },
  { id: 'pocos-de-caldas', nome: 'Poços de Caldas', latitude: -21.7873, longitude: -46.5614 },
  { id: 'pouso-alegre', nome: 'Pouso Alegre', latitude: -22.2294, longitude: -45.9365 },
  { id: 'varginha', nome: 'Varginha', latitude: -21.5514, longitude: -45.4303 },
  { id: 'barbacena', nome: 'Barbacena', latitude: -21.2251, longitude: -43.7736 },
  { id: 'divinopolis', nome: 'Divinópolis', latitude: -20.1436, longitude: -44.8910 },
  { id: 'patos-de-minas', nome: 'Patos de Minas', latitude: -18.5789, longitude: -46.5186 },
  { id: 'ouro-branco', nome: 'Ouro Branco', latitude: CENTER.latitude, longitude: CENTER.longitude },
  { id: 'manhuacu', nome: 'Manhuaçu', latitude: -20.2573, longitude: -42.0261 },
]
const MODELOS = [
  { id: 'ecmwf_ifs025', nome: 'ECMWF IFS' },
  { id: 'gfs_global', nome: 'GFS Global' },
  { id: 'icon_global', nome: 'DWD ICON Global' },
]

async function buscarPrevisaoModelo(modelo) {
  const params = new URLSearchParams({
    latitude: PONTOS_PREVISAO.map(ponto => ponto.latitude.toFixed(4)).join(','),
    longitude: PONTOS_PREVISAO.map(ponto => ponto.longitude.toFixed(4)).join(','),
    hourly: 'weather_code,precipitation_probability,precipitation',
    forecast_hours: '36',
    timezone: 'America/Sao_Paulo',
    models: modelo.id,
  })
  const resposta = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!resposta.ok) throw new Error(`${modelo.nome} respondeu ${resposta.status}`)
  const corpo = await resposta.json()
  const locais = Array.isArray(corpo) ? corpo : [corpo]
  return modelo.id === 'ecmwf_ifs025'
    ? { modelo, locais }
    : { modelo, locais }
}

function instanteOpenMeteoLocal(valor) {
  if (typeof valor !== 'string') return Number.NaN
  return Date.parse(`${valor}:00-03:00`)
}

function horaLocal(valor) {
  return typeof valor === 'string' ? valor : ''
}

async function buscarPrevisaoRaios() {
  const resultados = await Promise.allSettled(MODELOS.map(buscarPrevisaoModelo))
  const modelos = resultados.flatMap(resultado => resultado.status === 'fulfilled'
    ? [resultado.value]
    : [])
  if (modelos.length === 0) throw new Error('Modelos de previsão indisponíveis')

  const agora = Date.now()
  const horasBase = modelos[0].locais[0]?.hourly?.time || []
  const indicesFuturos = horasBase
    .map((time, indice) => ({ time, indice }))
    .filter(item => instanteOpenMeteoLocal(item.time) >= agora)
    .map(item => item.indice)
  const consenso = indicesFuturos.slice(0, 36).map(indiceHora => {
    const time = horasBase[indiceHora]
    const dados = modelos.map(modelo => {
      const hourly = modelo.locais[0]?.hourly || {}
      return {
        codigo: Number(hourly.weather_code?.[indiceHora] ?? 0),
        probabilidade: Number(hourly.precipitation_probability?.[indiceHora] ?? 0),
        precipitacao: Number(hourly.precipitation?.[indiceHora] ?? 0),
      }
    })
    const raios = dados.filter(item => item.codigo >= 95)
    const modelosComTrovoada = raios.length
    const maiorCodigo = Math.max(0, ...dados.map(item => item.codigo))
    return {
      time,
      modelosComTrovoada,
      maiorProbabilidadeChuva: Math.max(0, ...dados.map(item => item.probabilidade)),
      codigoMaisGrave: maiorCodigo,
      risco: maiorCodigo >= 99 ? 'alto' : maiorCodigo >= 95 ? 'atenção' : 'baixo',
      precipitacao: Math.max(0, ...dados.map(item => item.precipitacao)),
    }
  })

  const modelosResumo = modelos.map(modelo => {
    const hourly = modelo.locais[0]?.hourly || {}
    const times = Array.isArray(hourly.time) ? hourly.time : []
    const codes = Array.isArray(hourly.weather_code) ? hourly.weather_code : []
    const primeiroIndice = codes.findIndex((codigo, indice) =>
      instanteOpenMeteoLocal(times[indice]) >= agora && Number(codigo) >= 95,
    )
    return {
      id: modelo.modelo.id,
      nome: modelo.modelo.nome,
      primeiraTrovoada: primeiroIndice >= 0 ? horaLocal(times[primeiroIndice]) : null,
      maiorCodigo: Math.max(0, ...codes.map(Number)),
      horas: times
        .map((time, indice) => ({ time, indice }))
        .filter(item => instanteOpenMeteoLocal(item.time) >= agora)
        .map(({ time, indice }) => ({
        time,
        codigoTempo: Number(codes[indice] ?? 0),
        probabilidadeChuva: Number(hourly.precipitation_probability?.[indice] ?? 0),
        })),
    }
  })

  const pontos = PONTOS_PREVISAO.flatMap((ponto, indicePonto) => {
    const candidatas = modelos.flatMap(modelo => {
      const hourly = modelo.locais[indicePonto]?.hourly || {}
      const times = Array.isArray(hourly.time) ? hourly.time : []
      const codes = Array.isArray(hourly.weather_code) ? hourly.weather_code : []
      const primeiroIndice = codes.findIndex((codigo, indice) =>
        instanteOpenMeteoLocal(times[indice]) >= agora && Number(codigo) >= 95,
      )
      if (primeiroIndice < 0) return []
      return [{
        time: horaLocal(times[primeiroIndice]),
        codigo: Number(codes[primeiroIndice] ?? 0),
        probabilidade: Number(hourly.precipitation_probability?.[primeiroIndice] ?? 0),
        precipitacao: Number(hourly.precipitation?.[primeiroIndice] ?? 0),
        modelo: modelo.modelo.id,
      }]
    })
    if (!candidatas.length) return []
    const proxima = candidatas.sort((a, b) => a.time.localeCompare(b.time))[0]
    const risco = candidatas.length >= 2 ? 'alto' : proxima.probabilidade >= 60 ? 'atenção' : 'baixo'
    return [{
      ...ponto,
      primeiraTrovoada: proxima.time,
      modelosComTrovoada: candidatas.filter(item => item.time === proxima.time).length,
      codigoMaisGrave: Math.max(...candidatas.map(item => item.codigo)),
      intensidade: risco === 'alto' ? 'Alta' : risco === 'atenção' ? 'Moderada' : 'Baixa',
      intensidadeNivel: risco === 'alto' ? 3 : risco === 'atenção' ? 2 : 1,
      probabilidadeChuva: Math.max(...candidatas.map(item => item.probabilidade)),
      precipitacao: Math.max(...candidatas.map(item => item.precipitacao)),
      chuva: Math.max(...candidatas.map(item => item.precipitacao)),
      risco,
    }]
  })
  const primeiraTrovoada = pontos.map(ponto => ponto.primeiraTrovoada).sort()[0] || null
  const horaAtual = consenso[0]

  return {
    atualizadoEm: new Date().toISOString(),
    atual: {
      time: horaAtual?.time || null,
      modelosComTrovoada: horaAtual?.modelosComTrovoada || 0,
      maiorProbabilidadeChuva: horaAtual?.maiorProbabilidadeChuva || 0,
      codigoMaisGrave: horaAtual?.codigoMaisGrave || 0,
      risco: horaAtual?.risco || 'baixo',
    },
    modelos: modelosResumo,
    consenso,
    pontos,
    proximaTrovoada: primeiraTrovoada,
    riscoAtual: horaAtual?.risco || 'baixo',
    fonte: 'Open-Meteo · ECMWF IFS, GFS Global e DWD ICON Global',
    observacao: 'Previsão por modelos numéricos em 16 localidades de Minas Gerais; não é detecção de raios.',
    modelosDisponiveis: modelos.length,
  }
}

function numeroValido(valor) {
  return numeroOuNulo(valor)
}

function urlImagemSegura(valor) {
  if (typeof valor !== 'string') return null
  try {
    const url = new URL(valor)
    return url.protocol === 'https:' && url.hostname === REDEMET_IMAGE_HOST
      ? url.toString()
      : null
  } catch {
    return null
  }
}

function normalizarImagensRadar(dados) {
  const registros = Array.isArray(dados?.data?.radar) ? dados.data.radar.flat(2) : []
  return registros.flatMap(registro => {
    const url = urlImagemSegura(registro?.path)
    const sul = numeroValido(registro?.lat_min)
    const oeste = numeroValido(registro?.lon_min)
    const norte = numeroValido(registro?.lat_max)
    const leste = numeroValido(registro?.lon_max)
    if (!url || sul == null || oeste == null || norte == null || leste == null ||
      sul >= norte || oeste >= leste) return []
    return [{
      id: `${registro.localidade || 'radar'}-${registro.data || url}`,
      nome: String(registro.nome || 'Radar REDEMET'),
      localidade: String(registro.localidade || ''),
      bounds: [[sul, oeste], [norte, leste]],
      url,
      atualizadoEm: typeof registro.data === 'string' ? registro.data : null,
    }]
  })
}

function normalizarImagensSatelite(dados) {
  const registros = Array.isArray(dados?.data?.satelite) ? dados.data.satelite : []
  const box = dados?.data?.lat_lon
  const sul = numeroValido(box?.lat_min)
  const oeste = numeroValido(box?.lon_min)
  const norte = numeroValido(box?.lat_max)
  const leste = numeroValido(box?.lon_max)
  if (sul == null || oeste == null || norte == null || leste == null ||
    sul >= norte || oeste >= leste) return []
  return registros.flatMap((registro, indice) => {
    const url = urlImagemSegura(registro?.path)
    return url ? [{
      id: `ir-${registro.data || indice}`,
      nome: 'REDEMET · Satélite IR',
      bounds: [[sul, oeste], [norte, leste]],
      url,
      atualizadoEm: typeof registro.data === 'string' ? registro.data : null,
    }] : []
  })
}

function normalizarPontosTrovoada(dados) {
  const quadros = Array.isArray(dados?.data?.stsc) ? dados.data.stsc : []
  const pontos = Array.isArray(quadros.at(-1)) ? quadros.at(-1) : []
  return pontos.flatMap((ponto, indice) => {
    const latitude = numeroValido(ponto?.la)
    const longitude = numeroValido(ponto?.lo)
    if (latitude == null || longitude == null || latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180 || distanciaKm(latitude, longitude) > 400) return []
    return [{ id: `${latitude}-${longitude}-${indice}`, latitude, longitude }]
  })
}

async function buscarProdutoRedemet(produto, tipo, apiKey) {
  const sufixo = produto === 'radar' ? `/${tipo}` : produto === 'satelite' ? '/ir' : ''
  const url = new URL(`${REDEMET_PRODUCTS_URL}/${produto}${sufixo}`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('anima', '1')
  if (produto === 'radar') url.searchParams.set('area', 'pc')
  const resposta = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  })
  if (!resposta.ok) throw new Error(`REDEMET respondeu ${resposta.status}`)
  const corpo = await resposta.json()
  if (corpo?.status !== true) throw new Error('Produto não disponível na REDEMET')

  if (produto === 'radar') {
    const imagens = normalizarImagensRadar(corpo)
    if (!imagens.length) throw new Error('A REDEMET não retornou imagens válidas do radar')
    return { disponivel: true, produto, tipo, fonte: 'REDEMET · DECEA', imagens, consultadoEm: new Date().toISOString() }
  }
  if (produto === 'satelite') {
    const imagens = normalizarImagensSatelite(corpo)
    if (!imagens.length) throw new Error('A REDEMET não retornou imagens válidas do satélite')
    return { disponivel: true, produto, tipo: 'ir', fonte: 'REDEMET · DECEA', imagens, consultadoEm: new Date().toISOString() }
  }
  return {
    disponivel: true,
    produto,
    fonte: 'REDEMET · DECEA',
    pontos: normalizarPontosTrovoada(corpo),
    raioReferenciaKm: 400,
    referencia: 'Ouro Branco',
    horarioQuadro: Array.isArray(corpo?.data?.anima) ? corpo.data.anima.at(-1) || null : null,
    consultadoEm: new Date().toISOString(),
  }
}

export function registerWeatherRoutes(app) {
  app.get('/api/monitoramento-mg', async (_req, res) => {
    const agora = Date.now()
    if (cemadenCache && agora - cemadenCacheAt < 2 * 60 * 1000) {
      return res.json({ ...cemadenCache, cache: true })
    }
    try {
      cemadenCache = await buscarEstacoesCemaden()
      cemadenCacheAt = agora
      res.set('Cache-Control', 'no-store')
      return res.json(cemadenCache)
    } catch (erro) {
      console.warn('[CEMADEN] Falha ao consultar pluviômetros:', erro?.message || erro)
      if (cemadenCache && agora - cemadenCacheAt <= 15 * 60 * 1000) {
        return res.json({ ...cemadenCache, cache: true, erroAtualizacao: true })
      }
      return res.status(503).json({
        sucesso: false,
        erro: 'Não foi possível consultar os pluviômetros CEMADEN do entorno de Ouro Branco.',
      })
    }
  })

  app.get('/api/tempo-raios', async (_req, res) => {
    const agora = Date.now()
    if (lightningCache && agora - lightningCacheAt < 5 * 60 * 1000) {
      return res.json({ ...lightningCache, cache: true })
    }
    try {
      lightningCache = await buscarPrevisaoRaios()
      lightningCacheAt = agora
      return res.json(lightningCache)
    } catch (erro) {
      console.warn('[Previsão de raios] Falha ao consultar modelos:', erro?.message || erro)
      if (lightningCache) return res.json({ ...lightningCache, cache: true, erroAtualizacao: true })
      return res.status(503).json({ erro: 'Previsão de trovoadas indisponível no momento.' })
    }
  })

  app.get('/api/alertas-tempo', async (_req, res) => {
    const agora = Date.now()
    if (alertsCache && agora - alertsCacheAt < 10 * 60 * 1000) {
      return res.json({ ...alertsCache, cache: true })
    }
    try {
      alertsCache = await buscarAlertasInmet()
      alertsCacheAt = agora
      return res.json(alertsCache)
    } catch (erro) {
      console.warn('[INMET] Falha ao consultar avisos:', erro?.message || erro)
      if (alertsCache) return res.json({ ...alertsCache, cache: true, erroAtualizacao: true })
      return res.status(503).json({ erro: 'Avisos meteorológicos do INMET indisponíveis.' })
    }
  })

  app.get('/api/redemet', async (req, res) => {
    const produto = String(req.query.produto || '').toLowerCase()
    const tipo = String(req.query.tipo || 'maxcappi').toLowerCase()
    if (!['radar', 'stsc', 'satelite'].includes(produto) ||
      (produto === 'radar' && !RADAR_TYPES.has(tipo))) {
      return res.status(400).json({ erro: 'Produto REDEMET inválido.' })
    }

    const apiKey = process.env.REDEMET_API_KEY
    if (!apiKey) {
      return res.status(503).json({
        configurada: false,
        erro: 'A fonte oficial REDEMET precisa da Secret REDEMET_API_KEY no servidor.',
      })
    }

    const cacheKey = `${produto}:${produto === 'radar' ? tipo : ''}`
    const atual = radarCache.get(cacheKey)
    const agora = Date.now()
    if (atual && agora - atual.salvoEm < 90 * 1000) {
      return res.json({ ...atual.dados, cache: true })
    }
    try {
      const dados = await buscarProdutoRedemet(produto, tipo, apiKey)
      radarCache.set(cacheKey, { dados, salvoEm: agora })
      return res.json(dados)
    } catch (erro) {
      console.warn('[REDEMET] Falha ao consultar produto:', erro?.message || erro)
      if (atual) return res.json({ ...atual.dados, cache: true, erroAtualizacao: true })
      return res.status(502).json({ erro: 'A API REDEMET não retornou um produto válido nesta consulta.' })
    }
  })
}
