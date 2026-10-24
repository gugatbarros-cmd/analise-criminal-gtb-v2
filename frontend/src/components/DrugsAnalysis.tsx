import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDrugsAnalysis, getRecords, type DrugsFilters } from '../services/api'
import { Ranking } from './Ranking'
import { useAnalysisScope } from './useAnalysisScope'
import type { SpecializedReportRequest } from './SpecializedReport'

const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const weight = (grams: number) => `${(grams / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg · ${grams.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} g`

export function DrugsAnalysis({ year, municipality, onReport }: { year?: number; municipality?: string; onReport: (request: SpecializedReportRequest) => void }) {
  const { scopeYear, scopeMunicipality, controls } = useAnalysisScope(year, municipality)
  const [page, setPage] = useState(1)
  const [month, setMonth] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [drugType, setDrugType] = useState('')
  const invalidRange = !!startDate && !!endDate && startDate > endDate
  const hasFilters = !!(month || startDate || endDate || drugType)
  const filters: DrugsFilters = { month: month ? Number(month) : undefined,
    startDate: startDate || undefined, endDate: endDate || undefined,
    drugType: drugType || undefined }
  useEffect(() => setPage(1), [scopeYear, scopeMunicipality, month, startDate, endDate, drugType])
  const base = useQuery({ queryKey: ['drugs-analysis', scopeYear, scopeMunicipality],
    queryFn: () => getDrugsAnalysis(scopeYear, scopeMunicipality) })
  const filtered = useQuery({ queryKey: ['drugs-analysis', scopeYear, scopeMunicipality, filters],
    queryFn: () => getDrugsAnalysis(scopeYear, scopeMunicipality, filters), enabled: hasFilters && !invalidRange })
  const analysis = hasFilters ? filtered : base
  const records = useQuery({ queryKey: ['records', 'drogas', page, scopeYear, scopeMunicipality, filters],
    queryFn: () => getRecords('drogas', page, scopeYear, scopeMunicipality, undefined, undefined, undefined,
      filters.startDate, filters.endDate, filters.month, undefined, undefined, filters.drugType),
    enabled: !invalidRange })
  const monthly = analysis.data?.monthly.map(item => ({
    name: `${item.period.slice(5)}/${item.period.slice(0, 4)}`, total: item.total,
  })) || []
  return <section className="panel" aria-label="Análise de drogas">
    <div className="section-head"><div><p className="eyebrow">Fonte própria · peso reconhecido</p><h2>Drogas</h2></div><span>Estimativa · validar layout oficial</span></div>
    <p className="muted">Registros e peso são medidas distintas. O peso só soma quantidades com unidade reconhecida em g, kg ou mg; outras unidades permanecem na relação sem virar gramas.</p>
    {controls}
    <div className="filters">
      <label>Mês<select value={month} onChange={event => setMonth(event.target.value)}><option value="">Todos</option>{months.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
      <label>Data inicial<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
      <label>Data final<input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
      <label>Tipo<select value={drugType} onChange={event => setDrugType(event.target.value)}><option value="">Todos</option>{(base.data?.available_types || []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    {invalidRange && <p className="error" role="alert">A data inicial deve ser anterior ou igual à data final.</p>}
    {analysis.isError && <p className="error" role="alert">Não foi possível carregar a análise de drogas.</p>}
    {analysis.data && <><div className="analysis-grid"><p>Registros <strong>{analysis.data.total}</strong></p><p>Peso reconhecido <strong>{weight(analysis.data.total_weight_grams)}</strong></p><p>Com peso <strong>{analysis.data.weighted_records}/{analysis.data.total}</strong></p></div><div className="analysis-grid"><Ranking title="Evolução mensal · registros" items={monthly} /><Ranking title="Tipos · registros" items={analysis.data.types} /><Ranking title="Municípios · registros" items={analysis.data.municipalities} /><Ranking title="Locais · registros" items={analysis.data.locations} /><Ranking title="Peso por tipo · g" items={analysis.data.weights_by_type.map(item => ({ name: item.name, total: item.grams }))} /></div></>}
    <div className="report-actions"><button type="button" disabled={!analysis.data || analysis.isFetching || invalidRange} onClick={() => { if (analysis.data) onReport({ kind: 'drugs', scope: { year: scopeYear, municipality: scopeMunicipality }, filters, data: analysis.data }) }}>Ver relatório de drogas</button></div>
    {records.isPending && !invalidRange && <p className="empty">Carregando registros de drogas…</p>}
    {records.isError && <p className="error" role="alert">Não foi possível carregar a relação de drogas.</p>}
    {records.data?.total === 0 && <p className="empty">Nenhum registro neste recorte.</p>}
    {!!records.data?.total && <><div className="table-scroll"><table><thead><tr><th>Data</th><th>Município</th><th>Tipo</th><th>Quantidade</th><th>Peso reconhecido</th><th>Local</th></tr></thead><tbody>{records.data.items.map(item => <tr key={item.natural_key}><td>{item.event_date}</td><td>{item.municipality}</td><td>{item.category}</td><td>{item.drug_quantity ?? '—'} {item.drug_unit || ''}</td><td>{item.drug_weight_grams === null || item.drug_weight_grams === undefined ? 'Não reconhecido' : `${item.drug_weight_grams} g`}</td><td>{item.drug_location || '—'}</td></tr>)}</tbody></table></div><div className="pagination"><span>{records.data.total} registro(s) · página {page}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={page * 20 >= records.data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div></div></>}
  </section>
}
