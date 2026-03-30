/** Format number Swedish style: 1 234 567,89 */
export function formatSEK(value: number | string | null): string {
  if (value === null || value === undefined) return '\u2014'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '\u2014'
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

/** Format date: 2025-03-15 */
export function formatDate(date: string | null): string {
  if (!date) return '\u2014'
  return date.slice(0, 10)
}

/** Pad account number to 4 digits */
export function formatAccount(num: number): string {
  return String(num).padStart(4, '0')
}

/** Parse Supabase numeric (returned as string) to number */
export function parseNumeric(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return parseFloat(value)
  return 0
}
