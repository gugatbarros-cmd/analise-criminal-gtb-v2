import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRecords, getTcoAnalysis } from '../services/api'

function Ranking({ title, items }: { title: string; items: { name: string; total: number }[] }) {
  const maximum = Math.max(1, ...items.map(item => item.total))
  return <div className="tco-ranking"><h3>{title}</h3>{items.length === 0 ? <p className="empty">Sem dados neste recorte.</p> : <ol>{items.map(item => <li key={item.name}><div><span>{item.name}</span><strong>{item.total}</strong></div><span className="tco-bar" aria-hidden="true"><span style={{ width: `${item.total / maximum * 100}%` }} /></span></li>)}</ol>}</div>
}

export function TcoAnalysis({ year, municipality }: { year?: number; municipality?: string }) {
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [year, municipality])
  const records = useQuery({
    queryKey: ['records', 'ocorrencias', 'tco', page, year, municipality],
    queryFn: () => getRecords('ocorrencias', page, year, municipality, undefined, undefined, 'TCO'),
  })
  const analysis = useQuery({
    queryKey: ['tco-analysis', year, municipality],
    queryFn: () => getTcoAnalysis(year, municipality),
  })
  const months = analysis.data?.monthly.map(item => ({
    name: `${item.period.slice(5)}/${item.period.slice(0, 4)}`, total: item.total,
  })) || []
  return <section className="panel" aria-label="Análise de TCO">
    <div className="section-head"><div><p className="eyebrow">Termos circunstanciados</p><h2>TCO elaborados pela PM</h2></div><span>Uma ocorrência por CAD/BO e ano</span></div>
    <p className="muted">Conta a solução “ELABOROU TCO (PM)” e variantes de separadores. “NÃO ELABOROU TCO” não entra. Um TCO também pode aparecer em outro indicador quando a ocorrência satisfaz ambas as regras.</p>
    {analysis.isError && <p className="error" role="alert">Não foi possível carregar os gráficos de TCO.</p>}
    {analysis.data && <><p className="tco-total">TCOs no recorte <strong>{analysis.data.total}</strong></p><div className="tco-analysis-grid"><Ranking title="Evolução mensal" items={months} /><Ranking title="Municípios com mais TCOs" items={analysis.data.municipalities} /><Ranking title="Naturezas mais frequentes" items={analysis.data.natures} /></div></>}
    {records.isPending && <p className="empty">Carregando TCOs…</p>}
    {records.isError && <p className="error" role="alert">Não foi possível carregar os TCOs.</p>}
    {records.data?.total === 0 && <p className="empty">Nenhum TCO elaborado neste recorte.</p>}
    {!!records.data?.total && <><div className="table-scroll"><table><thead><tr><th>Data</th><th>CAD/BO</th><th>Município</th><th>Natureza</th><th>Solução</th></tr></thead><tbody>{records.data.items.map((item, index) => <tr key={`${item.occurrence}-${index}`}><td>{item.event_date}</td><td>{item.occurrence}</td><td>{item.municipality}</td><td>{item.nature || 'Não informada'}</td><td>{item.solution || 'Não informada'}</td></tr>)}</tbody></table></div><div className="pagination"><span>{records.data.total} TCO(s) · página {page}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={page * 20 >= records.data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div></div></>}
  </section>
}
