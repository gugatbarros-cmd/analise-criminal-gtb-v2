import { useQuery } from '@tanstack/react-query'
import { getMunicipalityOverview } from '../services/api'

export function MunicipalityOverview({ year }: { year?: number }) {
  const query = useQuery({ queryKey: ['municipalities-overview', year], queryFn: () => getMunicipalityOverview(year) })
  return <section className="panel"><div className="section-head"><div><p className="eyebrow">Território do 10º BPM</p><h2>Municípios por fonte</h2></div><span>{year || 'Todos os anos'}</span></div>
    <p className="muted">Volume de registros importados, sem tratar fontes diferentes como ocorrências únicas.</p>
    {query.isPending ? <p className="empty">Carregando municípios…</p> : query.isError ? <p className="error">Não foi possível carregar os municípios.</p> : <div className="table-scroll"><table className="report-table"><thead><tr><th>Município</th><th>Total</th><th>Ocorrências</th><th>MVI CAD</th><th>MVI NEAC</th><th>Armas</th><th>Drogas</th><th>Guarnições</th></tr></thead><tbody>{query.data.map(item => <tr key={item.municipality}><td>{item.municipality}</td><td>{item.total}</td><td>{item.ocorrencias}</td><td>{item.mvi_cad}</td><td>{item.mvi_neac}</td><td>{item.armas}</td><td>{item.drogas}</td><td>{item.guarnicoes}</td></tr>)}</tbody></table></div>}
  </section>
}
