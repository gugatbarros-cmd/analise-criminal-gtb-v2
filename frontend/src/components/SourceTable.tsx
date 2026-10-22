import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRecords, type Source } from '../services/api'

export function SourceTable({ source, active }: { source: Source; active: boolean }) {
  const [year, setYear] = useState('')
  const [municipality, setMunicipality] = useState('')
  const [victim, setVictim] = useState('')
  const [page, setPage] = useState(1)
  const records = useQuery({
    queryKey: ['records', source, page, year, municipality, victim],
    queryFn: () => getRecords(source, page, year ? Number(year) : undefined, municipality || undefined, victim || undefined),
    enabled: active,
  })
  return <div hidden={!active}>
    <div className="filters source-filters"><label>Ano<input type="number" placeholder="Todos" value={year} onChange={event => { setYear(event.target.value); setPage(1) }} /></label><label>Município<input type="search" placeholder="Todos" value={municipality} onChange={event => { setMunicipality(event.target.value); setPage(1) }} /></label><label>Vítima<input type="search" placeholder="Buscar nome" value={victim} onChange={event => { setVictim(event.target.value); setPage(1) }} /></label></div>
    {records.isError && <p className="error" role="alert">Não foi possível carregar os registros.</p>}
    {records.isPending && active && <p className="empty">Carregando registros…</p>}
    {records.data?.total === 0 && <p className="empty">Nenhum registro elegível neste filtro.</p>}
    {!!records.data?.total && <><div className="table-scroll"><table><thead><tr><th>Data</th><th>Ocorrência</th><th>Vítima</th><th>Município</th><th>Classificação</th><th>Meio declarado</th></tr></thead><tbody>{records.data.items.map((item, index) => <tr key={`${item.occurrence}-${item.victim}-${index}`}><td>{item.event_date}</td><td>{item.occurrence}</td><td>{item.victim}</td><td>{item.municipality}</td><td>{item.category}</td><td>{item.instrument}</td></tr>)}</tbody></table></div><div className="pagination"><span>{records.data.total} vítima(s) · página {page}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={page * 20 >= records.data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div></div></>}
  </div>
}
