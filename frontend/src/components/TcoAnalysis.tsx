import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRecords } from '../services/api'

export function TcoAnalysis({ year, municipality }: { year?: number; municipality?: string }) {
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [year, municipality])
  const records = useQuery({
    queryKey: ['records', 'ocorrencias', 'tco', page, year, municipality],
    queryFn: () => getRecords('ocorrencias', page, year, municipality, undefined, undefined, 'TCO'),
  })
  return <section className="panel" aria-label="Análise de TCO">
    <div className="section-head"><div><p className="eyebrow">Termos circunstanciados</p><h2>TCO elaborados pela PM</h2></div><span>Uma ocorrência por CAD/BO e ano</span></div>
    <p className="muted">Conta a solução “ELABOROU TCO (PM)” e variantes de separadores. “NÃO ELABOROU TCO” não entra. Um TCO também pode aparecer em outro indicador quando a ocorrência satisfaz ambas as regras.</p>
    {records.isPending && <p className="empty">Carregando TCOs…</p>}
    {records.isError && <p className="error" role="alert">Não foi possível carregar os TCOs.</p>}
    {records.data?.total === 0 && <p className="empty">Nenhum TCO elaborado neste recorte.</p>}
    {!!records.data?.total && <><div className="table-scroll"><table><thead><tr><th>Data</th><th>CAD/BO</th><th>Município</th><th>Natureza</th><th>Solução</th></tr></thead><tbody>{records.data.items.map((item, index) => <tr key={`${item.occurrence}-${index}`}><td>{item.event_date}</td><td>{item.occurrence}</td><td>{item.municipality}</td><td>{item.nature || 'Não informada'}</td><td>{item.solution || 'Não informada'}</td></tr>)}</tbody></table></div><div className="pagination"><span>{records.data.total} TCO(s) · página {page}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={page * 20 >= records.data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div></div></>}
  </section>
}
