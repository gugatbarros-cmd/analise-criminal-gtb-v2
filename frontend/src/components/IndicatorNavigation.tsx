import { createContext, useContext, useState, type ReactNode } from 'react'
import { iconForIndicator, SystemIcon } from './SystemIcon'
import { getReportDataset } from '../services/api'
import { filterReportRows, personProfile, selectReportRows, type ReportId, type ReportRow } from '../services/report-model'
import type { Source, Summary } from '../services/api'
import type { ComparisonDataset } from '../services/comparison-model'
import { indicatorVariation } from '../services/indicator-variation'

export const IndicatorNavigationContext = createContext<(target: string) => void>(() => {})
export const IndicatorChartTargetContext = createContext('')
export const IndicatorUpdateContext = createContext<Pick<Summary, 'source_coverage' | 'last_imported_at'> | undefined>(undefined)
export const IndicatorVariationContext = createContext<{ summary?: Summary; dataset?: ComparisonDataset; year: number; municipality?: string } | undefined>(undefined)

const calculation: Record<string, string> = {
  ocorrencias: 'Contagem de ocorrências elegíveis da base geral.',
  armas: 'Unidades apreendidas na base de armas; sem ela, ocorrências com menção.',
  drogas: 'Registros da base de drogas; sem ela, ocorrências com menção.',
  'mvi-cad': 'Vítimas com MVI confirmado na fonte CAD, inclusive revisão humana.',
  'mvi-neac': 'Vítimas elegíveis da fonte NEAC, sem somar ao CAD.',
  cvp: 'Ocorrências classificadas como roubo (CVP).',
  tentativas: 'Ocorrências classificadas como homicídio tentado.',
  tco: 'Ocorrências com TCO elaborado pela PM.',
  mandados: 'Ocorrências com cumprimento de mandado reconhecido.',
  visitas: 'Ocorrências com visita orientativa ou preventiva reconhecida.',
  sossego: 'Ocorrências de perturbação do sossego reconhecidas.',
  domestica: 'Ocorrências de violência doméstica reconhecidas.',
}
const action: Record<string, string> = {
  ocorrencias: 'Avaliar horários e ruas com maior concentração para ajustar o patrulhamento.',
  cvp: 'Priorizar patrulhamento nos locais e horários de maior concentração de roubos.',
  tentativas: 'Revisar focos de violência e coordenar prevenção com investigação.',
  'mvi-cad': 'Conferir relatos pendentes e concentrar ações preventivas nas áreas críticas.',
  'mvi-neac': 'Comparar casos com o CAD e avaliar áreas de maior risco.',
  domestica: 'Reforçar atendimento, proteção às vítimas e articulação com a rede local.',
  sossego: 'Planejar fiscalização nos horários e locais de maior recorrência.',
  armas: 'Revisar cobertura e qualidade do registro de apreensões.',
  drogas: 'Revisar cobertura e qualidade do registro de apreensões.',
  tco: 'Revisar cobertura e capacidade de elaboração de TCO.',
  mandados: 'Revisar planejamento e cumprimento dos mandados em aberto.',
  visitas: 'Reforçar agenda de visitas preventivas nas áreas prioritárias.',
}

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

function PersonProfile({ report, year, municipality }: { report: ReportId; year?: number; municipality?: string }) {
  const [rows, setRows] = useState<ReportRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = async () => {
    setBusy(true); setError('')
    try {
      const data = await getReportDataset()
      setRows(selectReportRows(filterReportRows(data.rows, { year, city: municipality }), report))
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível consultar o perfil.') }
    finally { setBusy(false) }
  }
  const groups = rows && personProfile(rows)
  return <section className="indicator-person-profile" aria-label="Perfil por sexo e idade">
    <div className="indicator-person-heading"><strong>Sexo e idade das pessoas envolvidas</strong><button type="button" disabled={busy} onClick={() => { void load() }}>{busy ? 'Carregando…' : rows ? 'Atualizar perfil' : 'Mostrar perfil'}</button></div>
    {error && <p role="alert">{error}</p>}
    {rows && <><p>{rows.length.toLocaleString('pt-BR')} registro(s) no recorte. Contagem por vínculo declarado; campos ausentes não são inferidos por nome ou relato.</p>
      {groups?.size ? <div className="indicator-person-grid">{[...groups].map(([role, group]) => <div key={role}><h4>{role} · {group.total.toLocaleString('pt-BR')} registro(s)</h4><strong>Sexo</strong><ul>{group.sex.map(([label, total]) => <li key={label}>{label}: {total.toLocaleString('pt-BR')}</li>)}</ul><strong>Faixa etária</strong><ul>{group.age.map(([label, total]) => <li key={label}>{label}: {total.toLocaleString('pt-BR')}</li>)}</ul></div>)}</div>
        : <p>A fonte não fornece sexo ou idade em campos estruturados neste recorte.</p>}</>}
  </section>
}

export function IndicatorSection({ id, year, municipality, children }: { id: string; year?: number; municipality?: string; children: ReactNode }) {
  const report = (id === 'ocorrencias' ? 'geral' : id) as ReportId
  return <IndicatorChartTargetContext.Provider value={id}><div id={id}>
    <div className="indicator-report-shortcut"><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('gtb-report-request', { detail: report }))}>Gerar relatório deste indicador ↗</button></div>
    <PersonProfile key={`${report}:${year || ''}:${municipality || ''}`} report={report} year={year} municipality={municipality} />
    {children}</div></IndicatorChartTargetContext.Provider>
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
    <small className="indicator-calculation">Como é calculado: {label === 'Peso de drogas' ? 'Soma dos pesos com unidade reconhecida, convertida para kg.' : calculation[target]}</small>
    {change && <small className={`indicator-variation indicator-variation-${change.tone}`}>{change.text}</small>}
    {change?.tone === 'bad' && <small className="indicator-action">Ação sugerida: {action[target] || 'Avaliar a causa da mudança e ajustar a atuação local.'}</small>}
    <small className="indicator-update">{updateDate(updatedAt)}</small>
  </button></article>
}
