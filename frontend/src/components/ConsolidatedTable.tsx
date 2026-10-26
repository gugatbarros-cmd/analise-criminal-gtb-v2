import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getConsolidatedRecords, type Source } from '../services/api'

const labels: Record<Source, string> = { mvi_cad: 'MVI CAD', mvi_neac: 'MVI NEAC', ocorrencias: 'Ocorrências', armas: 'Armas', drogas: 'Drogas', guarnicoes: 'Guarnições' }

export function ConsolidatedTable({ year, municipality }: { year?: number; municipality?: string }) {
  const [page, setPage] = useState(1)
  const [source, setSource] = useState<Source | ''>('')
  const [search, setSearch] = useState('')
  useEffect(() => setPage(1), [year, municipality, source, search])
  const query = useQuery({ queryKey: ['consolidated', page, source, year, municipality, search],
    queryFn: () => getConsolidatedRecords(page, source || undefined, year, municipality, search || undefined) })
  const pages = Math.max(1, Math.ceil((query.data?.total || 0) / (query.data?.size || 50)))
  return <section className="panel"><div className="section-head"><div><p className="eyebrow">Auditoria entre fontes</p><h2>Tabela geral consolidada</h2></div><span>Registros permanecem identificados pela fonte</span></div>
    <div className="filters compact-filters"><label>Fonte<select value={source} onChange={event => setSource(event.target.value as Source | '')}><option value="">Todas</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Pesquisa<input type="search" value={search} placeholder="Ocorrência, vítima ou natureza" onChange={event => setSearch(event.target.value)} /></label></div>
    {query.isPending ? <p className="empty">Carregando tabela…</p> : query.isError ? <p className="error">Não foi possível carregar a tabela consolidada.</p> : <><p className="muted">{query.data.total.toLocaleString('pt-BR')} registros no recorte. A tabela não soma nem funde fontes.</p><div className="table-scroll"><table className="report-table"><thead><tr><th>Fonte</th><th>Data</th><th>Município</th><th>Ocorrência</th><th>Vítima / vínculo</th><th>Natureza / classificação</th></tr></thead><tbody>{query.data.items.map(item => <tr key={`${item.source}:${item.natural_key}`}><td>{labels[item.source]}</td><td>{item.event_date}</td><td>{item.municipality}</td><td>{item.occurrence || '—'}</td><td>{item.victim || '—'}</td><td>{item.category || item.nature || '—'}</td></tr>)}</tbody></table></div><div className="pagination"><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page} de {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Próxima</button></div></>}
  </section>
}
