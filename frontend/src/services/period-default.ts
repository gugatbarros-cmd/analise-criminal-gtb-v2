import type { Summary } from './api'

export const currentYear = () => new Date().getFullYear()

export function periodEndForYear(summary: Summary | undefined, year: string): string | null {
  if (!summary || Number(year) !== currentYear()) return null
  if (summary.period_end) return summary.period_end
  const latest = Object.values(summary.last_imported_at || {}).filter((value): value is string => !!value)
    .map(value => value.slice(0, 10)).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort().at(-1)
  return latest?.startsWith(`${year}-`) ? latest : null
}
