import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRecords } from '../services/api'

export function AttemptAnalysis({ year, municipality }: { year?: number; municipality?: string }) {
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [year, municipality])
  const records = useQuery({
    queryKey: ['records', 'ocorrencias', 'tentativas', page, year, municipality],
    queryFn: () => getRecords('ocorrencias', page, year, municipality, undefined, undefined, 'Tentativa de homicídio'),
  })
  return <section className="panel" aria-label="Análise de tentativas de homicídio">
    <div className="section-head"><div><p className="eyebrow">Base geral de ocorrências</p><h2>Tentativas de homicídio</h2></div><span>Uma ocorrência por CAD/BO</span></div>
    <p className="muted">Tipificação ou relato com tentativa explícita; soluções improcedentes e hipóteses descartadas ficam fora. Solução vazia não elimina o caso. Revise cada classificação no registro original.</p>
    {records.isPending && <p className="empty">Carregando tentativas…</p>}
    {records.isError && <p className="error" role="alert">Não foi possível carregar as tentativas.</p>}
    {records.data?.total === 0 && <p className="empty">Nenhuma tentativa identificada neste recorte.</p>}
    {!!records.data?.total && <><div className="table-scroll"><table><thead><tr><th>Data</th><th>CAD/BO</th><th>Município</th><th>Natureza</th><th>Solução</th></tr></thead><tbody>{records.data.items.map((item, index) => <tr key={`${item.occurrence}-${index}`}><td>{item.event_date}</td><td>{item.occurrence}</td><td>{item.municipality}</td><td>{item.nature || 'Não informada'}</td><td>{item.solution || 'Não informada'}</td></tr>)}</tbody></table></div><div className="pagination"><span>{records.data.total} ocorrência(s) · página {page}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={page * 20 >= records.data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div></div></>}
  </section>
}
