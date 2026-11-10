import { ESTILO_AREA_RISCO, TIPOS_AREAS_RISCO, type AreaRiscoInput, type TipoAreaRisco } from './areasRisco'

export interface PoligonoKmzImportado {
  nome: string
  poligono: Array<[number, number]>
  latitude: number
  longitude: number
  tipo?: TipoAreaRisco
  data_inicio?: string
  limite_precipitacao_mm?: number
  referencia?: string
  observacao?: string
}

const TAMANHO_MAXIMO_ARQUIVO = 20 * 1024 * 1024
const TAMANHO_MAXIMO_KML = 50 * 1024 * 1024
const MAXIMO_POLIGONOS = 500
const MAXIMO_VERTICES = 10_000

function elementosComNome(parent: Document | Element, nome: string) {
  return Array.from(parent.getElementsByTagNameNS('*', nome))
}

function textoKml(parent: Document | Element, nome: string) {
  return elementosComNome(parent, nome)[0]?.textContent?.trim() ?? ''
}

function lerCoordenadas(texto: string): Array<[number, number]> {
  const pontos: Array<[number, number]> = []
  for (const tupla of texto.trim().split(/\s+/)) {
    if (!tupla) continue
    const [lonTexto, latTexto] = tupla.split(',')
    const longitude = Number(lonTexto)
    const latitude = Number(latTexto)
    if (
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    ) continue
    pontos.push([latitude, longitude])
    if (pontos.length > MAXIMO_VERTICES) {
      throw new Error(`O contorno ultrapassa o limite de ${MAXIMO_VERTICES.toLocaleString('pt-BR')} vértices.`)
    }
  }

  const primeiro = pontos[0]
  const ultimo = pontos[pontos.length - 1]
  if (primeiro && ultimo && primeiro[0] === ultimo[0] && primeiro[1] === ultimo[1]) pontos.pop()
  return pontos
}

function metadadosDoPlacemark(placemark: Element) {
  const valores = new Map<string, string>()
  for (const tag of [...elementosComNome(placemark, 'Data'), ...elementosComNome(placemark, 'SimpleData')]) {
    const chave = tag.getAttribute('name')?.trim().toLowerCase()
    const valor = textoKml(tag, 'value') || tag.textContent?.trim() || ''
    if (chave && valor) valores.set(chave, valor)
  }
  return valores
}

function tipoValido(valor: string | undefined): TipoAreaRisco | undefined {
  return valor && TIPOS_AREAS_RISCO.some(tipo => tipo === valor)
    ? valor as TipoAreaRisco
    : undefined
}

function coordenadaDoPonto(placemark: Element): [number, number] | null {
  const coordenadas = textoKml(placemark, 'Point').split(/\s+/)[0]
  if (!coordenadas) return null
  const [lonTexto, latTexto] = coordenadas.split(',')
  const latitude = Number(latTexto)
  const longitude = Number(lonTexto)
  if (
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
  ) return null
  return [latitude, longitude]
}

function analisarKml(conteudo: string): PoligonoKmzImportado[] {
  if (conteudo.length > TAMANHO_MAXIMO_KML) {
    throw new Error('O KML dentro do arquivo é maior que o limite permitido.')
  }

  const documento = new DOMParser().parseFromString(conteudo, 'application/xml')
  if (
    documento.getElementsByTagName('parsererror').length
    || documento.getElementsByTagNameNS('*', 'parsererror').length
  ) {
    throw new Error('O arquivo não contém um KML válido.')
  }

  const resultado: PoligonoKmzImportado[] = []
  for (const placemark of elementosComNome(documento, 'Placemark')) {
    const nome = textoKml(placemark, 'name') || `Polígono ${resultado.length + 1}`
    const dados = metadadosDoPlacemark(placemark)
    const pontoImportado = coordenadaDoPonto(placemark)

    for (const polygon of elementosComNome(placemark, 'Polygon')) {
      const limiteExterno = elementosComNome(polygon, 'outerBoundaryIs')[0]
      const coordenadas = limiteExterno
        ? textoKml(limiteExterno, 'coordinates')
        : textoKml(polygon, 'coordinates')
      const poligono = lerCoordenadas(coordenadas)
      const verticesUnicos = new Set(poligono.map(([lat, lon]) => `${lat},${lon}`))
      if (poligono.length < 3 || verticesUnicos.size < 3) continue
      if (resultado.length >= MAXIMO_POLIGONOS) {
        throw new Error(`O arquivo ultrapassa o limite de ${MAXIMO_POLIGONOS} polígonos por importação.`)
      }

      const latitude = pontoImportado?.[0] ?? poligono.reduce((soma, ponto) => soma + ponto[0], 0) / poligono.length
      const longitude = pontoImportado?.[1] ?? poligono.reduce((soma, ponto) => soma + ponto[1], 0) / poligono.length
      const limiteTexto = dados.get('limite_precipitacao_mm')
      const limite = limiteTexto == null ? undefined : Number(limiteTexto.replace(',', '.'))
      const dataInicio = dados.get('data_inicio') ?? ''

      resultado.push({
        nome,
        poligono,
        latitude,
        longitude,
        tipo: tipoValido(dados.get('tipo')),
        data_inicio: /^\d{4}-\d{2}-\d{2}$/.test(dataInicio) ? dataInicio : undefined,
        limite_precipitacao_mm: limite != null && Number.isFinite(limite) && limite >= 0 ? limite : undefined,
        referencia: dados.get('referencia') || nome,
        observacao: dados.get('observacao'),
      })
    }
  }

  if (!resultado.length) {
    throw new Error('Nenhum polígono válido foi encontrado no KMZ/KML.')
  }
  return resultado
}

export async function importarPoligonosKmz(arquivo: File): Promise<PoligonoKmzImportado[]> {
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
    throw new Error('O arquivo excede o limite de 20 MB.')
  }

  const bytes = await arquivo.arrayBuffer()
  const assinatura = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4))
  const arquivoZip = arquivo.name.toLowerCase().endsWith('.kmz')
    || (assinatura[0] === 0x50 && assinatura[1] === 0x4b)

  if (!arquivoZip) return analisarKml(new TextDecoder().decode(bytes))

  const { default: JSZip } = await import('jszip')
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    throw new Error('Não foi possível abrir o KMZ. Confira se o arquivo está íntegro.')
  }
  const arquivosKml = Object.values(zip.files).filter(item => !item.dir && /\.kml$/i.test(item.name))
  const selecionado = arquivosKml.find(item => /(^|\/)doc\.kml$/i.test(item.name)) ?? arquivosKml[0]
  if (!selecionado) throw new Error('O arquivo KMZ não contém nenhum documento KML.')

  const conteudo = await selecionado.async('string')
  return analisarKml(conteudo)
}

function escaparXml(valor: string | number | null | undefined) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function coordenadasKml(pontos: Array<[number, number]>) {
  const fechados = pontos.length
    && (pontos[0][0] !== pontos[pontos.length - 1][0] || pontos[0][1] !== pontos[pontos.length - 1][1])
    ? [...pontos, pontos[0]]
    : pontos
  return fechados.map(([latitude, longitude]) => `${longitude},${latitude},0`).join(' ')
}

function corKml(hex: string, opacidade: string) {
  const rgb = hex.replace('#', '')
  return `${opacidade}${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}`
}

export async function exportarPoligonosKmz(areas: AreaRiscoInput[]) {
  const comPoligono = areas.filter(area => area.poligono.length >= 3)
  if (!comPoligono.length) {
    throw new Error('Nenhuma área com polígono cadastrado está disponível para exportação.')
  }

  const tipos = Array.from(new Set(comPoligono.map(area => area.tipo)))
  const estiloPorTipo = new Map(tipos.map((tipo, indice) => [tipo, `tipo-${indice}`]))
  const estilos = tipos.map(tipo => {
    const cor = ESTILO_AREA_RISCO[tipo].cor
    return `<Style id="${estiloPorTipo.get(tipo)}"><LineStyle><color>${corKml(cor, 'ff')}</color><width>2</width></LineStyle><PolyStyle><color>${corKml(cor, '55')}</color><fill>1</fill><outline>1</outline></PolyStyle></Style>`
  }).join('')

  const marcacoes = comPoligono.map(area => {
    const nome = area.referencia || area.tipo
    const dados = [
      ['tipo', area.tipo],
      ['referencia', area.referencia],
      ['observacao', area.observacao],
      ['data_inicio', area.data_inicio],
      ['limite_precipitacao_mm', area.limite_precipitacao_mm],
    ].map(([chave, valor]) => `<Data name="${chave}"><value>${escaparXml(valor)}</value></Data>`).join('')
    return `<Placemark><name>${escaparXml(nome)}</name><styleUrl>#${estiloPorTipo.get(area.tipo)}</styleUrl><ExtendedData>${dados}</ExtendedData><MultiGeometry><Polygon><outerBoundaryIs><LinearRing><coordinates>${coordenadasKml(area.poligono)}</coordinates></LinearRing></outerBoundaryIs></Polygon><Point><coordinates>${area.longitude},${area.latitude},0</coordinates></Point></MultiGeometry></Placemark>`
  }).join('')

  const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Áreas de risco — Defesa Civil Ouro Branco</name>${estilos}${marcacoes}</Document></kml>`
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file('doc.kml', kml)
  const arquivo = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.google-earth.kmz',
    compression: 'DEFLATE',
  })
  return { arquivo, quantidade: comPoligono.length }
}
