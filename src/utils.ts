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
