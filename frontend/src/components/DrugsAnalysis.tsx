import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDrugsAnalysis, getRecords } from '../services/api'
import { Ranking } from './Ranking'

const weight = (grams: number) => `${(grams / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg · ${grams.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} g`

export function DrugsAnalysis({ year, municipality }: { year?: number; municipality?: string }) {
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [year, municipality])
  const analysis = useQuery({ queryKey: ['drugs-analysis', year, municipality],
    queryFn: () => getDrugsAnalysis(year, municipality) })
  const records = useQuery({ queryKey: ['records', 'drogas', page, year, municipality],
    queryFn: () => getRecords('drogas', page, year, municipality) })
  const months = analysis.data?.monthly.map(item => ({
    name: `${item.period.slice(5)}/${item.period.slice(0, 4)}`, total: item.total,
  })) || []
  return <section className="panel" aria-label="Análise de drogas">
    <div className="section-head"><div><p className="eyebrow">Fonte própria · peso reconhecido</p><h2>Drogas</h2></div><span>Estimativa · validar layout oficial</span></div>
    <p className="muted">Registros e peso são medidas distintas. O peso só soma quantidades com unidade reconhecida em g, kg ou mg; outras unidades permanecem na relação sem virar gramas.</p>
    {analysis.isError && <p className="error" role="alert">Não foi possível carregar a análise de drogas.</p>}
    {analysis.data && <><div className="analysis-grid"><p>Registros <strong>{analysis.data.total}</strong></p><p>Peso reconhecido <strong>{weight(analysis.data.total_weight_grams)}</strong></p><p>Com peso <strong>{analysis.data.weighted_records}/{analysis.data.total}</strong></p></div><div className="analysis-grid"><Ranking title="Evolução mensal · registros" items={months} /><Ranking title="Tipos · registros" items={analysis.data.types} /><Ranking title="Municípios · registros" items={analysis.data.municipalities} /><Ranking title="Locais · registros" items={analysis.data.locations} /><Ranking title="Peso por tipo · g" items={analysis.data.weights_by_type.map(item => ({ name: item.name, total: item.grams }))} /></div></>}
    {records.isPending && <p className="empty">Carregando registros de drogas…</p>}
    {records.isError && <p className="error" role="alert">Não foi possível carregar a relação de drogas.</p>}
    {records.data?.total === 0 && <p className="empty">Nenhum registro neste recorte.</p>}
    {!!records.data?.total && <><div className="table-scroll"><table><thead><tr><th>Data</th><th>Município</th><th>Tipo</th><th>Quantidade</th><th>Peso reconhecido</th><th>Local</th></tr></thead><tbody>{records.data.items.map(item => <tr key={item.natural_key}><td>{item.event_date}</td><td>{item.municipality}</td><td>{item.category}</td><td>{item.drug_quantity ?? '—'} {item.drug_unit || ''}</td><td>{item.drug_weight_grams === null || item.drug_weight_grams === undefined ? 'Não reconhecido' : `${item.drug_weight_grams} g`}</td><td>{item.drug_location || '—'}</td></tr>)}</tbody></table></div><div className="pagination"><span>{records.data.total} registro(s) · página {page}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={page * 20 >= records.data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div></div></>}
  </section>
}
