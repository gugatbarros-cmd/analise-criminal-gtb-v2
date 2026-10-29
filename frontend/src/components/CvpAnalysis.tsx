import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRecords, type Summary } from '../services/api'
import { CrimeCharts } from './CrimeCharts'

export function CvpAnalysis({ summary, year, municipality }: {
  summary?: Summary; year?: number; municipality?: string
}) {
  const [status, setStatus] = useState<'Todos' | 'Consumado' | 'Tentado'>('Todos')
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [year, municipality])
  const category = status === 'Todos' ? 'CVP ' : `CVP ${status}`
  const records = useQuery({
    queryKey: ['records', 'ocorrencias', 'cvp', page, year, municipality, category],
    queryFn: () => getRecords('ocorrencias', page, year, municipality, undefined, category),
  })
  const totals = summary?.categories?.ocorrencias || {}
  return <section className="panel" aria-label="Análise CVP">
    <div className="section-head"><div><p className="eyebrow">Crimes violentos contra o patrimônio</p><h2>Análise CVP</h2></div><span>Uma ocorrência por CAD/BO</span></div>
    <p className="muted">Roubos consumados e tentados separados. Latrocínios ficam fora deste indicador. Confira a classificação no registro original.</p>
    <CrimeCharts kind="CVP" year={year} municipality={municipality} />
    <div className="cvp-totals"><span>Consumados <strong>{totals['CVP Consumado'] ?? 0}</strong></span><span>Tentados <strong>{totals['CVP Tentado'] ?? 0}</strong></span></div>
    <div className="filters"><label>Situação<select value={status} onChange={event => { setStatus(event.target.value as typeof status); setPage(1) }}><option>Todos</option><option>Consumado</option><option>Tentado</option></select></label></div>
    {records.isPending && <p className="empty">Carregando ocorrências…</p>}
    {records.isError && <p className="error" role="alert">Não foi possível carregar os casos CVP.</p>}
    {records.data?.total === 0 && <p className="empty">Nenhum CVP neste recorte.</p>}
    {!!records.data?.total && <><div className="table-scroll"><table><thead><tr><th>Data</th><th>Ocorrência</th><th>Município</th><th>Natureza</th><th>Situação</th></tr></thead><tbody>{records.data.items.map((item, index) => <tr key={`${item.occurrence}-${index}`}><td>{item.event_date}</td><td>{item.occurrence}</td><td>{item.municipality}</td><td>{item.nature}</td><td>{item.category.replace('CVP ', '')}</td></tr>)}</tbody></table></div><div className="pagination"><span>{records.data.total} ocorrência(s) · página {page}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={page * 20 >= records.data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div></div></>}
  </section>
}
