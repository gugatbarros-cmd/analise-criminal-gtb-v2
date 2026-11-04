function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function cadPeriodError(start: string, end: string): string {
  if (!validDate(start)) return 'Informe uma data inicial válida.'
  if (!validDate(end)) return 'Informe uma data final válida. Confira o dia e o mês escolhidos.'
  if (start > end) return 'A data final deve ser igual ou posterior à data inicial.'
  return ''
}
