import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDomesticAnalysis, getRecords } from '../services/api'
import { Ranking } from './Ranking'

const labels = {
  recognized: 'Reconhecidas', pending: 'Pendentes',
  excluded: 'Não configuradas no atendimento', outside: 'Fora do recorte feminino',
} as const
type Status = keyof typeof labels

export function DomesticAnalysis({ year, municipality }: {
  year?: number; municipality?: string
}) {
  const [status, setStatus] = useState<Status>('recognized')
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [year, municipality, status])
  const analysis = useQuery({
    queryKey: ['domestic-analysis', year, municipality],
    queryFn: () => getDomesticAnalysis(year, municipality),
  })
  const indicator = status === 'recognized' ? 'Doméstica' : `Doméstica:${status}`
  const records = useQuery({
    queryKey: ['records', 'ocorrencias', indicator, page, year, municipality],
    queryFn: () => getRecords('ocorrencias', page, year, municipality, undefined, undefined, indicator),
  })
  const months = analysis.data?.monthly.map(item => ({
    name: `${item.period.slice(5)}/${item.period.slice(0, 4)}`, total: item.total,
  })) || []
  return <section className="panel" aria-label="Análise de violência doméstica">
    <div className="section-head"><div><p className="eyebrow">Base geral · triagem documental</p><h2>Violência doméstica / Maria da Penha</h2></div><span>Uma ocorrência por CAD/BO e ano</span></div>
    <p className="muted">A regra conservadora separa fatos descritos ou tipificados, pendências, conclusões de não configuração e casos fora do recorte feminino. A classificação documental exige revisão humana e não é conclusão judicial.</p>
    {analysis.isError && <p className="error" role="alert">Não foi possível carregar a análise.</p>}
    {analysis.data && <><p className="analysis-total">Reconhecidas no recorte <strong>{analysis.data.total}</strong> · Pendentes {analysis.data.reviews.pending} · Não configuradas {analysis.data.reviews.excluded} · Fora do recorte {analysis.data.reviews.outside}</p><div className="analysis-grid"><Ranking title="Evolução mensal" items={months} /><Ranking title="Municípios" items={analysis.data.municipalities} /><Ranking title="Naturezas" items={analysis.data.natures} /></div></>}
    <div className="tabs" role="tablist" aria-label="Situação da triagem doméstica">{(Object.keys(labels) as Status[]).map(item => <button key={item} type="button" role="tab" aria-selected={status === item} onClick={() => setStatus(item)}>{labels[item]}</button>)}</div>
    {records.isPending && <p className="empty">Carregando casos…</p>}
    {records.isError && <p className="error" role="alert">Não foi possível carregar a relação.</p>}
    {records.data?.total === 0 && <p className="empty">Nenhum caso nesta situação e recorte.</p>}
    {!!records.data?.total && <><div className="table-scroll"><table><thead><tr><th>Data</th><th>CAD/BO</th><th>Município</th><th>Natureza</th><th>Solução</th><th>Motivo e evidência</th></tr></thead><tbody>{records.data.items.map(item => <tr key={item.natural_key}><td>{item.event_date}</td><td>{item.occurrence}</td><td>{item.municipality}</td><td>{item.nature || 'Não informada'}</td><td>{item.solution || 'Não informada'}</td><td>{item.action_evidence}</td></tr>)}</tbody></table></div><div className="pagination"><span>{records.data.total} caso(s) · página {page}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={page * 20 >= records.data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div></div></>}
  </section>
}
