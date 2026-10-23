import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getArmsAnalysis, getRecords } from '../services/api'
import { Ranking } from './Ranking'

export function ArmsAnalysis({ year, municipality }: { year?: number; municipality?: string }) {
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [year, municipality])
  const analysis = useQuery({ queryKey: ['arms-analysis', year, municipality],
    queryFn: () => getArmsAnalysis(year, municipality) })
  const records = useQuery({ queryKey: ['records', 'armas', page, year, municipality],
    queryFn: () => getRecords('armas', page, year, municipality) })
  const months = analysis.data?.monthly.map(item => ({
    name: `${item.period.slice(5)}/${item.period.slice(0, 4)}`, total: item.total,
  })) || []
  return <section className="panel" aria-label="Análise de armas">
    <div className="section-head"><div><p className="eyebrow">Fonte própria · contagem por unidade</p><h2>Armas</h2></div><span>Provisório · validar layout oficial</span></div>
    <p className="muted">Cada arma é identificada pela série ou pelo número da ocorrência e ID do item. A quantidade soma unidades, sem somar munições. Apreensão depende da situação informada.</p>
    {analysis.isError && <p className="error" role="alert">Não foi possível carregar a análise de armas.</p>}
    {analysis.data && <><div className="analysis-grid"><p>Unidades <strong>{analysis.data.total}</strong></p><p>Apreendidas <strong>{analysis.data.seized}</strong></p><p>Uso restrito <strong>{analysis.data.restricted}</strong></p></div><div className="analysis-grid"><Ranking title="Apreensões por mês" items={months} /><Ranking title="Municípios · unidades" items={analysis.data.municipalities} /><Ranking title="Tipos · unidades" items={analysis.data.types} /><Ranking title="Calibres · unidades" items={analysis.data.calibers} /><Ranking title="Situações · unidades" items={analysis.data.situations} /></div></>}
    {records.isPending && <p className="empty">Carregando armas…</p>}
    {records.isError && <p className="error" role="alert">Não foi possível carregar a relação de armas.</p>}
    {records.data?.total === 0 && <p className="empty">Nenhuma arma neste recorte.</p>}
    {!!records.data?.total && <><div className="table-scroll"><table><thead><tr><th>Data</th><th>Ocorrência</th><th>Município</th><th>Tipo</th><th>Calibre</th><th>Unidades</th><th>Situação</th></tr></thead><tbody>{records.data.items.map(item => <tr key={item.natural_key}><td>{item.event_date}</td><td>{item.occurrence || '—'}</td><td>{item.municipality}</td><td>{item.category}</td><td>{item.arm_caliber || '—'}</td><td>{item.arm_quantity ?? 1}</td><td>{item.arm_situation || '—'}</td></tr>)}</tbody></table></div><div className="pagination"><span>{records.data.total} item(ns) · página {page}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={page * 20 >= records.data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div></div></>}
  </section>
}
