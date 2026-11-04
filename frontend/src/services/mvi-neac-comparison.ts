import { filterReportRows, selectReportRows, type ReportDataset, type ReportScope } from './report-model'

export type MviNeacComparison = {
  year: number
  currentStart: string
  currentEnd: string
  previousStart: string
  previousEnd: string
  current: number
  previous: number
  difference: number
  variationPercent: number | null
  months: { month: number; current: number; previous: number }[]
}

const dateInYear = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

function shiftYear(date: string, year: number): string {
  const month = Number(date.slice(5, 7))
  const day = Math.min(Number(date.slice(8, 10)), new Date(Date.UTC(year, month, 0)).getUTCDate())
  return dateInYear(year, month, day)
}

export function formatNeacImportDate(data: ReportDataset): string {
  const stamp = data.sourceUpdatedAt?.mvi_neac
  if (!stamp) return 'Não informada na base consultada'
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(stamp)
  return match ? `${match[3]}/${match[2]}/${match[1]}${match[4] ? ` ${match[4]}:${match[5]}` : ''}` : stamp
}

export function mviNeacComparison(data: ReportDataset, scope: ReportScope, today = new Date()): MviNeacComparison | null {
  const dimensions = { ...scope, year: undefined, month: undefined, start: undefined, end: undefined }
  const neac = selectReportRows(filterReportRows(data.rows, dimensions), 'mvi-neac')
  const year = scope.year || Number(scope.end?.slice(0, 4)) || Math.max(0, ...neac.map(row => Number(row.date.slice(0, 4)))) || today.getFullYear()
  const month = scope.month
  const monthStart = dateInYear(year, month || 1, 1)
  const monthEnd = month ? dateInYear(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate()) : ''
  const currentStart = scope.start && scope.start > monthStart ? scope.start : monthStart
  const candidates = neac.filter(row => Number(row.date.slice(0, 4)) === year && (!month || Number(row.date.slice(5, 7)) === month) && row.date >= currentStart && (!scope.end || row.date <= scope.end))
  const lastKnown = candidates.map(row => row.date).sort().at(-1)
  const fallbackEnd = month
    ? monthEnd
    : year === today.getFullYear() ? dateInYear(year, today.getMonth() + 1, today.getDate()) : dateInYear(year, 12, 31)
  const selectedEnd = scope.end || lastKnown || fallbackEnd
  const currentEnd = month && selectedEnd > monthEnd ? monthEnd : selectedEnd
  if (Number(currentStart.slice(0, 4)) !== year || Number(currentEnd.slice(0, 4)) !== year || currentStart > currentEnd) return null
  const previousStart = shiftYear(currentStart, year - 1)
  const previousEnd = shiftYear(currentEnd, year - 1)
  const currentRows = selectReportRows(filterReportRows(data.rows, { ...scope, year, start: currentStart, end: currentEnd }), 'mvi-neac')
  const previousRows = selectReportRows(filterReportRows(data.rows, { ...scope, year: year - 1, start: previousStart, end: previousEnd }), 'mvi-neac')
  const months = Array.from({ length: Number(currentEnd.slice(5, 7)) - Number(currentStart.slice(5, 7)) + 1 }, (_, index) => {
    const value = Number(currentStart.slice(5, 7)) + index
    return { month: value, current: currentRows.filter(row => Number(row.date.slice(5, 7)) === value).length,
      previous: previousRows.filter(row => Number(row.date.slice(5, 7)) === value).length }
  })
  const difference = currentRows.length - previousRows.length
  return { year, currentStart, currentEnd, previousStart, previousEnd,
    current: currentRows.length, previous: previousRows.length, difference,
    variationPercent: previousRows.length ? 100 * difference / previousRows.length : null, months }
}
