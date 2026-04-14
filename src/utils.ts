export function decimalParaGms(valor: number, positivo: string, negativo: string): string {
  const absoluto = Math.abs(valor)
  const graus = Math.floor(absoluto)
  const minutosFloat = (absoluto - graus) * 60
  const minutos = Math.floor(minutosFloat)
  const segundos = ((minutosFloat - minutos) * 60).toFixed(2).replace('.', ',')
  const direcao = valor >= 0 ? positivo : negativo
  return `${graus}° ${minutos}' ${segundos}" ${direcao}`
}

export function formatarCoordenadas(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return 'Sem GPS'
  return `${decimalParaGms(lat, 'N', 'S')}  ${decimalParaGms(lng, 'L', 'O')}`
}

function gmsCompacto(valor: number, positivo: string, negativo: string): string {
  const absoluto = Math.abs(valor)
  const graus = Math.floor(absoluto)
  const minutosFloat = (absoluto - graus) * 60
  const minutos = Math.floor(minutosFloat)
  const segundos = Math.round((minutosFloat - minutos) * 60)
  const direcao = valor >= 0 ? positivo : negativo
  return `${graus}°${minutos}'${segundos}"${direcao}`
}

async function obterGpsAtual(): Promise<{ lat: number; lng: number } | null> {
  if (!navigator.geolocation) return null
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 30000 }
    )
  })
}

const MESES_ABR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export async function adicionarMarcaDagua(
  dataUrl: string,
  lat?: number | null,
  lng?: number | null
): Promise<string> {
  let useLat = lat ?? null
  let useLng = lng ?? null

  if (useLat == null || useLng == null) {
    const gps = await obterGpsAtual()
    if (gps) { useLat = gps.lat; useLng = gps.lng }
  }

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!

      ctx.drawImage(img, 0, 0)

      const agora = new Date()
      const dia = agora.getDate().toString().padStart(2, '0')
      const mes = MESES_ABR[agora.getMonth()]
      const ano = agora.getFullYear()
      const hora = agora.toTimeString().slice(0, 8)
      const dataHora = `${dia} de ${mes}. de ${ano} ${hora}`

      const linhas: string[] = [dataHora]
      if (useLat != null && useLng != null) {
        linhas.push(`${gmsCompacto(useLat, 'N', 'S')} ${gmsCompacto(useLng, 'L', 'O')}`)
      }
      linhas.push('DEFESA CIVIL - OURO BRANCO')

      const fontSize = Math.max(24, Math.round(img.width * 0.038))
      const padding = fontSize * 0.7
      const lineHeight = fontSize * 1.55
      const boxHeight = linhas.length * lineHeight + padding * 1.5

      ctx.fillStyle = 'rgba(0, 0, 0, 0.58)'
      ctx.fillRect(0, img.height - boxHeight, img.width, boxHeight)

      ctx.font = `bold ${fontSize}px Arial, sans-serif`
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.shadowColor = 'rgba(0,0,0,0.9)'
      ctx.shadowBlur = 6

      linhas.forEach((linha, i) => {
        ctx.fillText(
          linha,
          img.width / 2,
          img.height - boxHeight + padding + fontSize + i * lineHeight
        )
      })

      resolve(canvas.toDataURL('image/jpeg', 0.92))
    }
    img.src = dataUrl
  })
}
