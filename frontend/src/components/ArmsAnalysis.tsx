import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getArmsAnalysis, getRecords, type ArmsFilters } from '../services/api'
import { Ranking } from './Ranking'
import { useAnalysisScope } from './useAnalysisScope'
import type { SpecializedReportRequest } from './SpecializedReport'

const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export function ArmsAnalysis({ year, municipality, onReport }: { year?: number; municipality?: string; onReport: (request: SpecializedReportRequest) => void }) {
  const { scopeYear, scopeMunicipality, controls } = useAnalysisScope(year, municipality)
  const [page, setPage] = useState(1)
  const [month, setMonth] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [armType, setArmType] = useState('')
  const [situation, setSituation] = useState('')
  const invalidRange = !!startDate && !!endDate && startDate > endDate
  const hasFilters = !!(month || startDate || endDate || armType || situation)
  const filters: ArmsFilters = { month: month ? Number(month) : undefined,
    startDate: startDate || undefined, endDate: endDate || undefined,
    armType: armType || undefined, situation: situation || undefined }
  useEffect(() => setPage(1), [scopeYear, scopeMunicipality, month, startDate, endDate, armType, situation])
  const base = useQuery({ queryKey: ['arms-analysis', scopeYear, scopeMunicipality],
    queryFn: () => getArmsAnalysis(scopeYear, scopeMunicipality) })
  const filtered = useQuery({ queryKey: ['arms-analysis', scopeYear, scopeMunicipality, filters],
    queryFn: () => getArmsAnalysis(scopeYear, scopeMunicipality, filters), enabled: hasFilters && !invalidRange })
  const analysis = hasFilters ? filtered : base
  const records = useQuery({ queryKey: ['records', 'armas', page, scopeYear, scopeMunicipality, filters],
    queryFn: () => getRecords('armas', page, scopeYear, scopeMunicipality, undefined, undefined, undefined,
      filters.startDate, filters.endDate, filters.month, filters.armType, filters.situation),
    enabled: !invalidRange })
  const monthly = analysis.data?.monthly.map(item => ({
    name: `${item.period.slice(5)}/${item.period.slice(0, 4)}`, total: item.total,
  })) || []
  return <section className="panel" aria-label="Análise de armas">
    <div className="section-head"><div><p className="eyebrow">Fonte própria · contagem por unidade</p><h2>Armas</h2></div><span>Provisório · validar layout oficial</span></div>
    <p className="muted">Cada arma é identificada pela série ou pelo número da ocorrência e ID do item. A quantidade soma unidades, sem somar munições. Apreensão depende da situação informada.</p>
    {controls}
    <div className="filters">
      <label>Mês<select value={month} onChange={event => setMonth(event.target.value)}><option value="">Todos</option>{months.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
      <label>Data inicial<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
      <label>Data final<input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
      <label>Tipo<select value={armType} onChange={event => setArmType(event.target.value)}><option value="">Todos</option>{(base.data?.available_types || []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Situação<select value={situation} onChange={event => setSituation(event.target.value)}><option value="">Todas</option>{(base.data?.available_situations || []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    {invalidRange && <p className="error" role="alert">A data inicial deve ser anterior ou igual à data final.</p>}
    {analysis.isError && <p className="error" role="alert">Não foi possível carregar a análise de armas.</p>}
    {analysis.data && <><div className="analysis-grid"><p>Unidades <strong>{analysis.data.total}</strong></p><p>Apreendidas <strong>{analysis.data.seized}</strong></p><p>Uso restrito <strong>{analysis.data.restricted}</strong></p></div><div className="analysis-grid"><Ranking title="Apreensões por mês" items={monthly} /><Ranking title="Municípios · unidades" items={analysis.data.municipalities} /><Ranking title="Tipos · unidades" items={analysis.data.types} /><Ranking title="Calibres · unidades" items={analysis.data.calibers} /><Ranking title="Situações · unidades" items={analysis.data.situations} /></div></>}
    <div className="report-actions"><button type="button" disabled={!analysis.data || analysis.isFetching || invalidRange} onClick={() => { if (analysis.data) onReport({ kind: 'arms', scope: { year: scopeYear, municipality: scopeMunicipality }, filters, data: analysis.data }) }}>Ver relatório de armas</button></div>
    {records.isPending && !invalidRange && <p className="empty">Carregando armas…</p>}
    {records.isError && <p className="error" role="alert">Não foi possível carregar a relação de armas.</p>}
    {records.data?.total === 0 && <p className="empty">Nenhuma arma neste recorte.</p>}
    {!!records.data?.total && <><div className="table-scroll"><table><thead><tr><th>Data</th><th>Ocorrência</th><th>Município</th><th>Tipo</th><th>Calibre</th><th>Unidades</th><th>Situação</th></tr></thead><tbody>{records.data.items.map(item => <tr key={item.natural_key}><td>{item.event_date}</td><td>{item.occurrence || '—'}</td><td>{item.municipality}</td><td>{item.category}</td><td>{item.arm_caliber || '—'}</td><td>{item.arm_quantity ?? 1}</td><td>{item.arm_situation || '—'}</td></tr>)}</tbody></table></div><div className="pagination"><span>{records.data.total} item(ns) · página {page}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={page * 20 >= records.data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div></div></>}
  </section>
}
