import type { Summary } from './api'
import { indicatorFacts, previousYearDay, rangeTotal, sourceFacts, variation, type ComparisonDataset } from './comparison-model'

export type IndicatorVariation = { text: string; tone: 'good' | 'bad' | 'neutral' }

const favorableIncrease = new Set(['armas', 'drogas', 'mandados', 'visitas', 'tco'])
const unavailable: IndicatorVariation = { text: 'Sem período comparável', tone: 'neutral' }

export function indicatorVariation(target: string, label: string, summary: Summary | undefined,
  dataset: ComparisonDataset | undefined, year: number, municipality?: string): IndicatorVariation {
  if (!summary || !dataset || !Number.isInteger(year)) return unavailable
  const source = target === 'mvi-cad' ? 'mvi_cad' : target === 'mvi-neac' ? 'mvi_neac'
    : target === 'armas' ? 'armas' : target === 'drogas' ? 'drogas' : 'ocorrencias'
  if (!summary.source_coverage?.[source]) return unavailable
  const imported = summary.last_imported_at?.[source]?.slice(0, 10)
  const sourceRows = sourceFacts(dataset.rows, target, municipality)
  if (!sourceRows.some(row => row.date.startsWith(`${year - 1}-`))) return unavailable
  const latestEvent = sourceRows.filter(row => row.date.startsWith(`${year}-`)).map(row => row.date).sort().at(-1)
  const end = imported?.startsWith(`${year}-`) ? imported : year === new Date().getFullYear() ? null : latestEvent
  if (!end) return unavailable
  const selected = indicatorFacts(sourceRows, target)
  const metric = label === 'Peso de drogas' ? 'kg' : target === 'armas' ? 'units' : 'records'
  const current = rangeTotal(sourceRows, selected, { start: `${year}-01-01`, end }, metric).value
  const previous = rangeTotal(sourceRows, selected,
    { start: `${year - 1}-01-01`, end: previousYearDay(end) }, metric).value
  const change = variation(previous, current)
  if (change.difference === null) return unavailable
  if (change.difference === 0) return { text: `Estável vs ${year - 1} · mesmo período`, tone: 'neutral' }
  const increase = change.difference > 0
  const favorable = favorableIncrease.has(target) === increase || (label === 'Peso de drogas' && increase)
  const amount = change.percent === null
    ? `${increase ? '+' : ''}${change.difference.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`
    : `${increase ? '+' : ''}${change.percent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
  return { text: `${amount} vs ${year - 1} · ${increase ? 'alta' : 'queda'} ${favorable ? 'favorável' : 'desfavorável'}`,
    tone: favorable ? 'good' : 'bad' }
}
