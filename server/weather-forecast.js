const OURO_BRANCO_LAT = -20.5195
const OURO_BRANCO_LON = -43.6983

function dataLocalISO(offsetDias = 0) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offsetDias * 24 * 60 * 60 * 1000))
}

function resumirChuvaOntem(horas) {
  const data = dataLocalISO(-1)
  const horasOntem = horas.filter(hora => hora.time?.slice(0, 10) === data)
  const comChuva = horasOntem.filter(hora => Number(hora.precipitacao) >= 0.1)
  const total = horasOntem.reduce((soma, hora) => soma + (Number(hora.precipitacao) || 0), 0)
  const pico = horasOntem
    .filter(hora => Number.isFinite(hora.precipitacao))
    .sort((a, b) => b.precipitacao - a.precipitacao)[0] || null
  const nuvens = horasOntem
    .filter(hora => Number.isFinite(hora.coberturaNuvens))
    .reduce((soma, hora) => soma + hora.coberturaNuvens, 0)

  return {
    data,
    precipitacao: Number(total.toFixed(1)),
    horasComChuva: comChuva.length,
    picoHoraria: pico ? Number(pico.precipitacao.toFixed(1)) : 0,
    horaPico: pico?.time || null,
    coberturaNuvensMedia: horasOntem.length ? Math.round(nuvens / horasOntem.length) : null,
    fonte: 'Open-Meteo · histórico horário',
  }
}

export async function buscarPrevisaoOpenMeteo() {
  const params = new URLSearchParams({
    latitude: String(OURO_BRANCO_LAT),
    longitude: String(OURO_BRANCO_LON),
    timezone: 'America/Sao_Paulo',
    past_days: '2',
    forecast_days: '7',
    hourly: [
      'temperature_2m',
      'relative_humidity_2m',
      'precipitation_probability',
      'precipitation',
      'rain',
      'showers',
      'cloud_cover',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
    ].join(','),
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'precipitation',
      'rain',
      'showers',
      'weather_code',
      'wind_speed_10m',
      'wind_gusts_10m',
    ].join(','),
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'rain_sum',
      'precipitation_hours',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
    ].join(','),
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
  })

  const resposta = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!resposta.ok) throw new Error(`Open-Meteo: ${resposta.status}`)

  const dados = await resposta.json()
  if (!Array.isArray(dados?.hourly?.time)) {
    throw new Error('Resposta horária inválida da Open-Meteo')
  }

  const horario = dados.hourly
  const atual = dados.current
  const horas = horario.time.map((time, indice) => ({
    time,
    temperatura: horario.temperature_2m?.[indice] ?? null,
    umidade: horario.relative_humidity_2m?.[indice] ?? null,
    probabilidadeChuva: horario.precipitation_probability?.[indice] ?? null,
    precipitacao: horario.precipitation?.[indice] ?? 0,
    chuva: horario.rain?.[indice] ?? 0,
    pancadas: horario.showers?.[indice] ?? 0,
    coberturaNuvens: horario.cloud_cover?.[indice] ?? null,
    codigoTempo: horario.weather_code?.[indice] ?? null,
    vento: horario.wind_speed_10m?.[indice] ?? null,
    direcaoVento: horario.wind_direction_10m?.[indice] ?? null,
    rajada: horario.wind_gusts_10m?.[indice] ?? null,
  }))
  const extremos = valores => ({
    maiorPrecipitacao: [...valores].filter(item => Number.isFinite(item.precipitacao))
      .sort((a, b) => b.precipitacao - a.precipitacao)[0] ?? null,
    maiorVento: [...valores].filter(item => Number.isFinite(item.vento))
      .sort((a, b) => b.vento - a.vento)[0] ?? null,
    maiorRajada: [...valores].filter(item => Number.isFinite(item.rajada))
      .sort((a, b) => b.rajada - a.rajada)[0] ?? null,
    menorUmidade: [...valores].filter(item => Number.isFinite(item.umidade))
      .sort((a, b) => a.umidade - b.umidade)[0] ?? null,
    maiorProbabilidadeChuva: [...valores].filter(item => Number.isFinite(item.probabilidadeChuva))
      .sort((a, b) => b.probabilidadeChuva - a.probabilidadeChuva)[0] ?? null,
  })

  return {
    local: 'Ouro Branco - MG',
    latitude: OURO_BRANCO_LAT,
    longitude: OURO_BRANCO_LON,
    timezone: dados.timezone,
    atualizadoEm: new Date().toISOString(),
    atual: atual ? {
      time: atual.time ?? null,
      temperatura: atual.temperature_2m ?? null,
      umidade: atual.relative_humidity_2m ?? null,
      precipitacao: atual.precipitation ?? null,
      chuva: atual.rain ?? null,
      pancadas: atual.showers ?? null,
      codigoTempo: atual.weather_code ?? null,
      vento: atual.wind_speed_10m ?? null,
      rajada: atual.wind_gusts_10m ?? null,
    } : null,
    horas,
    ontem: resumirChuvaOntem(horas),
    diario: dados.daily ?? null,
    extremos: extremos(horas),
    fonte: 'Open-Meteo',
  }
}
