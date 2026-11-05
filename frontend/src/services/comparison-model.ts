import type { Source } from './api'
import { bpmCities, fold } from './report-model'

export type ComparisonFact = {
  source: Source; date: string; city: string; nature: string; category: string; eligible: boolean
  indicators: string[]; teamGroup: string; records: number; units: number; grams: number; weighted: number; points: number
  address?: string; latitude?: number | null; longitude?: number | null
}
export type ComparisonDataset = { rows: ComparisonFact[]; updatedAt: string | null }
export type ComparisonMetric = 'records' | 'units' | 'kg' | 'points'
export type ComparisonRange = { start: string; end: string }
export type ComparisonValue = { value: number | null; records: number; weighted: number }
export const comparisonLabels: Record<string, string> = {
  ocorrencias: 'Ocorrências', 'mvi-cad': 'MVI CAD', 'mvi-neac': 'MVI NEAC', cvp: 'CVP',
  tentativas: 'Tentativas de homicídio', tco: 'TCO', mandados: 'Mandados', visitas: 'Visitas',
  sossego: 'Sossego', domestica: 'Violência doméstica', armas: 'Armas apreendidas', drogas: 'Drogas', guarnicoes: 'Guarnições',
}
const indicatorNames: Record<string, string> = { cvp: 'CVP', tentativas: 'Tentativa de homicídio', tco: 'TCO', mandados: 'Mandados', visitas: 'Visitas', sossego: 'Sossego', domestica: 'Doméstica' }
const cities = new Set(bpmCities.map(fold))
export function comparisonSource(id: string): Source {
  return id.startsWith('mvi-') ? id.replace('-', '_') as Source : ['armas', 'drogas', 'guarnicoes'].includes(id) ? id as Source : 'ocorrencias'
}
export function sourceFacts(rows: ComparisonFact[], id: string, city?: string) {
  return rows.filter(row => row.source === comparisonSource(id) && cities.has(fold(row.city)) && (!city || fold(row.city) === fold(city)))
}
export function indicatorFacts(rows: ComparisonFact[], id: string, category = '', teamGroup = 'roster') {
  return rows.filter(row => row.eligible && (!category || row.category === category)
    && (id !== 'guarnicoes' || row.teamGroup === teamGroup)
    && (!indicatorNames[id] || row.indicators.includes(indicatorNames[id]))
    && (id !== 'ocorrencias' || !(fold(row.nature).includes('apoioaojudiciario') && fold(row.nature).includes('fiscalizacaodemedidaprotetiva'))))
}
export function validRange(range: ComparisonRange) {
  const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day
  return validDay(range.start) && validDay(range.end) && range.start <= range.end
}
export const rangeDays = (range: ComparisonRange) => validRange(range) ? Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86400000) + 1 : 0
export function previousYearDay(day: string) {
  const year = Number(day.slice(0, 4)) - 1, month = Number(day.slice(5, 7))
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(Number(day.slice(8, 10)), last)).padStart(2, '0')}`
}
export function rangeTotal(source: ComparisonFact[], selected: ComparisonFact[], range: ComparisonRange, metric: ComparisonMetric): ComparisonValue {
  const contains = (row: ComparisonFact) => row.date >= range.start && row.date <= range.end
  if (!validRange(range) || !source.some(contains)) return { value: null, records: 0, weighted: 0 }
  const rows = selected.filter(contains)
  const records = rows.reduce((sum, row) => sum + row.records, 0)
  const weighted = rows.reduce((sum, row) => sum + row.weighted, 0)
  // Uma base de drogas sem unidade reconhecida não equivale a peso zero.
  if (metric === 'kg' && records > 0 && weighted === 0) return { value: null, records, weighted }
  return { value: Number(rows.reduce((sum, row) => sum + (metric === 'kg' ? row.grams / 1000 : row[metric]), 0).toFixed(6)), records, weighted }
}
export function variation(base: number | null, compared: number | null) {
  if (base === null || compared === null) return { difference: null, percent: null }
  return { difference: Number((compared - base).toFixed(6)), percent: base === 0 ? compared === 0 ? 0 : null : (compared - base) / base * 100 }
}
export const yearRange = (year: number): ComparisonRange => ({ start: `${year}-01-01`, end: `${year}-12-31` })
export function monthRange(year: number, month: number): ComparisonRange {
  return { start: `${year}-${String(month).padStart(2, '0')}-01`, end: `${year}-${String(month).padStart(2, '0')}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}` }
}
export function comparisonCsv(headers: string[], rows: (string | number)[][]) {
  return '\uFEFF' + [headers, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(';')).join('\r\n')
}
