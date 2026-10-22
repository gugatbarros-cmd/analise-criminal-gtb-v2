import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getOperationalAnalysis, getRecords, type OperationalKind } from '../services/api'
import { Ranking } from './Ranking'

export function OperationalAnalysis({ kind, year, municipality }: {
  kind: OperationalKind; year?: number; municipality?: string
}) {
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [year, municipality])
  const analysis = useQuery({
    queryKey: ['operational-analysis', kind, year, municipality],
    queryFn: () => getOperationalAnalysis(kind, year, municipality),
  })
  const records = useQuery({
    queryKey: ['records', 'ocorrencias', kind, page, year, municipality],
    queryFn: () => getRecords('ocorrencias', page, year, municipality, undefined, undefined, kind),
  })
  const title = kind === 'Mandados' ? 'Cumprimentos de mandados' : kind === 'Visitas' ? 'Visitas orientativas' : 'Perturbação do sossego'
  const description = kind === 'Mandados'
    ? 'Conta cumprimento, execução ou apoio efetivo; exclui mandados apenas pendentes, expedidos ou sem êxito.'
    : kind === 'Visitas'
      ? 'Conta modalidades explícitas de visita orientativa, preventiva, comunitária, tranquilizadora ou de acompanhamento, quando realizadas.'
      : 'Conta perturbação do sossego, tranquilidade, trabalho ou descanso na natureza ou tipificação. Exclui ocorrências descartadas pela solução.'
  const months = analysis.data?.monthly.map(item => ({
    name: `${item.period.slice(5)}/${item.period.slice(0, 4)}`, total: item.total,
  })) || []
  return <section className="panel" aria-label={title}>
    <div className="section-head"><div><p className="eyebrow">{kind === 'Sossego' ? 'Ocorrências · base geral' : 'Ações operacionais · base geral'}</p><h2>{title}</h2></div><span>Uma ocorrência por CAD/BO e ano</span></div>
    <p className="muted">{description} A evidência textual aparece na relação individual.</p>
    {analysis.isError && <p className="error" role="alert">Não foi possível carregar a análise de {title.toLowerCase()}.</p>}
    {analysis.data && <><p className="analysis-total">Casos no recorte <strong>{analysis.data.total}</strong></p><div className="analysis-grid"><Ranking title="Evolução mensal" items={months} /><Ranking title="Municípios" items={analysis.data.municipalities} /><Ranking title="Naturezas" items={analysis.data.natures} /></div></>}
    {records.isPending && <p className="empty">Carregando ocorrências…</p>}
    {records.isError && <p className="error" role="alert">Não foi possível carregar as ocorrências.</p>}
    {records.data?.total === 0 && <p className="empty">Nenhum caso reconhecido neste recorte.</p>}
    {!!records.data?.total && <><div className="table-scroll"><table><thead><tr><th>Data</th><th>CAD/BO</th><th>Município</th><th>Natureza</th><th>Solução</th><th>Evidência</th></tr></thead><tbody>{records.data.items.map(item => <tr key={item.natural_key}><td>{item.event_date}</td><td>{item.occurrence}</td><td>{item.municipality}</td><td>{item.nature || 'Não informada'}</td><td>{item.solution || 'Não informada'}</td><td>{item.action_evidence}</td></tr>)}</tbody></table></div><div className="pagination"><span>{records.data.total} caso(s) · página {page}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={page * 20 >= records.data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div></div></>}
  </section>
}
