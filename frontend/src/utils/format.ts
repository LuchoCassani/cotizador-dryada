export function numeroCotizacion(id: string): string {
  const year = new Date().getFullYear()
  const short = id.replace(/-/g, '').slice(0, 4).toUpperCase()
  return `DRY-${year}-${short}`
}

export function fmtUSD(value: number): string {
  return `$${value.toFixed(2)}`
}

export function fmtGramos(value: number): string {
  return `${value.toFixed(2)} g`
}

export function fmtFecha(date: Date = new Date()): string {
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
}
