export function savingsPercent(originalBytes: number, outputBytes: number): number {
  if (!Number.isFinite(originalBytes) || originalBytes <= 0) return 0
  return Math.round((1 - outputBytes / originalBytes) * 100)
}

export function savedBytes(originalBytes: number, outputBytes: number): number {
  return originalBytes - outputBytes
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1)
  const value = bytes / 1024 ** exponent
  const rounded = exponent === 0 ? Math.round(value) : parseFloat(value.toFixed(decimals))
  return `${rounded} ${UNITS[exponent]}`
}
