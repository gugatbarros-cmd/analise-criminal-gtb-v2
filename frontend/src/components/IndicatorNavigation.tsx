import { createContext, useContext, type ReactNode } from 'react'
import { iconForIndicator, SystemIcon } from './SystemIcon'
import type { Source, Summary } from '../services/api'
import type { ComparisonDataset } from '../services/comparison-model'
import { indicatorVariation } from '../services/indicator-variation'

export const IndicatorNavigationContext = createContext<(target: string) => void>(() => {})
export const IndicatorChartTargetContext = createContext('')
export const IndicatorUpdateContext = createContext<Pick<Summary, 'source_coverage' | 'last_imported_at'> | undefined>(undefined)
export const IndicatorVariationContext = createContext<{ summary?: Summary; dataset?: ComparisonDataset; year: number; municipality?: string } | undefined>(undefined)

export function indicatorUpdateSource(target: string, coverage?: Record<string, number>): Source {
  if (target === 'mvi-cad') return 'mvi_cad'
  if (target === 'mvi-neac') return 'mvi_neac'
  if (target === 'armas' && coverage?.armas) return 'armas'
  if (target === 'drogas' && coverage?.drogas) return 'drogas'
  return 'ocorrencias'
}

function updateDate(value?: string | null): string {
  const day = value?.slice(0, 10)
  return day && /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? `Última atualização: ${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`
    : 'Última atualização: sem importação'
}

export function IndicatorSection({ id, children }: { id: string; children: ReactNode }) {
  return <IndicatorChartTargetContext.Provider value={id}><div id={id}>{children}</div></IndicatorChartTargetContext.Provider>
}

export function IndicatorCard({ target, label, children }: {
  target: string; label: string; children: ReactNode
}) {
  const navigate = useContext(IndicatorNavigationContext)
  const summary = useContext(IndicatorUpdateContext)
  const comparison = useContext(IndicatorVariationContext)
  const updatedAt = summary?.last_imported_at?.[indicatorUpdateSource(target, summary.source_coverage)]
  const change = comparison && indicatorVariation(target, label, comparison.summary, comparison.dataset, comparison.year, comparison.municipality)
  return <article className="indicator-card"><button type="button" className="indicator-card-button"
    data-indicator-target={target} aria-label={`Ver análise de ${label}`} onClick={() => navigate(target)}>
    <SystemIcon name={label === 'Peso de drogas' ? 'weight' : iconForIndicator(target)} className="indicator-icon" />
    {children}
    {change && <small className={`indicator-variation indicator-variation-${change.tone}`}>{change.text}</small>}
    <small className="indicator-update">{updateDate(updatedAt)}</small>
  </button></article>
}
