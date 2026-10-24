import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRecords, getTeamsAnalysis, type TeamsFilters } from '../services/api'
import { Ranking } from './Ranking'
import { useAnalysisScope } from './useAnalysisScope'

const groupName = { roster: 'Escala', extra: 'Força-tarefa', unlisted: 'Fora da escala' }
const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export function TeamsAnalysis({ year, municipality }: { year?: number; municipality?: string }) {
  const { scopeYear, scopeMunicipality, controls } = useAnalysisScope(year, municipality)
  const [page, setPage] = useState(1)
  const [month, setMonth] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [teamName, setTeamName] = useState('')
  const [officerRegistration, setOfficerRegistration] = useState('')
  const [natureFilter, setNatureFilter] = useState('')
  const invalidRange = !!startDate && !!endDate && startDate > endDate
  const hasFilters = !!(month || startDate || endDate || teamName || officerRegistration || natureFilter)
  const filters: TeamsFilters = { month: month ? Number(month) : undefined,
    startDate: startDate || undefined, endDate: endDate || undefined,
    teamName: teamName || undefined, officerRegistration: officerRegistration || undefined,
    natureFilter: natureFilter || undefined }
  useEffect(() => setPage(1), [scopeYear, scopeMunicipality, month, startDate, endDate, teamName,
    officerRegistration, natureFilter])
  const base = useQuery({ queryKey: ['teams-analysis', scopeYear, scopeMunicipality],
    queryFn: () => getTeamsAnalysis(scopeYear, scopeMunicipality) })
  const filtered = useQuery({ queryKey: ['teams-analysis', scopeYear, scopeMunicipality, filters],
    queryFn: () => getTeamsAnalysis(scopeYear, scopeMunicipality, filters), enabled: hasFilters && !invalidRange })
  const analysis = hasFilters ? filtered : base
  const records = useQuery({ queryKey: ['records', 'guarnicoes', page, scopeYear, scopeMunicipality, filters],
    queryFn: () => getRecords('guarnicoes', page, scopeYear, scopeMunicipality, undefined, undefined,
      undefined, filters.startDate, filters.endDate, filters.month, undefined, undefined,
      undefined, filters.teamName, filters.officerRegistration, filters.natureFilter),
    enabled: !invalidRange })
  return <section className="panel" aria-label="Produtividade das guarnições">
    <div className="section-head"><div><p className="eyebrow">Vínculos operacionais · base própria</p><h2>Guarnições</h2></div><span>Provisório · validar layout oficial</span></div>
    <p className="muted">A pontuação usa a complexidade da natureza registrada, de 1 a 5 pontos. O ranking de equipes inclui apenas guarnições reconhecidas da escala. Força-tarefa e outros recursos aparecem separadamente; um mesmo atendimento pode ter mais de uma equipe.</p>
    {controls}
    <div className="filters">
      <label>Mês<select value={month} onChange={event => setMonth(event.target.value)}><option value="">Todos</option>{months.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
      <label>Data inicial<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
      <label>Data final<input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
      <label>Equipe<select value={teamName} onChange={event => setTeamName(event.target.value)}><option value="">Todas</option>{(base.data?.available_teams || []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Policial · matrícula<select value={officerRegistration} onChange={event => setOfficerRegistration(event.target.value)}><option value="">Todos</option>{(base.data?.available_officers || []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Natureza<select value={natureFilter} onChange={event => setNatureFilter(event.target.value)}><option value="">Todas</option>{(base.data?.available_natures || []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </div>
    {invalidRange && <p className="error" role="alert">A data inicial deve ser anterior ou igual à data final.</p>}
    {analysis.isError && <p className="error" role="alert">Não foi possível carregar a análise de guarnições.</p>}
    {analysis.data && <><div className="analysis-grid"><p>Atendimentos na escala <strong>{analysis.data.roster_occurrences}</strong></p><p>Pontos ponderados <strong>{analysis.data.weighted_points}</strong></p><p>Guarnições <strong>{analysis.data.teams}</strong></p><p>Policiais identificados <strong>{analysis.data.officers}</strong></p><p>Força-tarefa <strong>{analysis.data.extra_occurrences}</strong></p><p>Outros recursos <strong>{analysis.data.unlisted_occurrences}</strong></p></div><div className="analysis-grid"><Ranking title="Equipes · pontos" items={analysis.data.ranking.map(item => ({ name: item.name, total: item.points }))} /><Ranking title="Policiais · pontos" items={analysis.data.officer_ranking.map(item => ({ name: item.name, total: item.points }))} /><Ranking title="Naturezas da escala" items={analysis.data.natures} /></div></>}
    {records.isPending && <p className="empty">Carregando vínculos…</p>}
    {records.isError && <p className="error" role="alert">Não foi possível carregar a relação de guarnições.</p>}
    {records.data?.total === 0 && <p className="empty">Nenhum vínculo neste recorte.</p>}
    {!!records.data?.total && <><div className="table-scroll"><table><thead><tr><th>Data</th><th>Ocorrência</th><th>Município</th><th>Equipe</th><th>Grupo</th><th>Natureza</th><th>Pontos</th><th>Vínculo</th></tr></thead><tbody>{records.data.items.map(item => <tr key={item.natural_key}><td>{item.event_date}</td><td>{item.occurrence || '—'}</td><td>{item.municipality}</td><td>{item.category}</td><td>{item.team_group ? groupName[item.team_group] : '—'}</td><td>{item.nature || '—'}</td><td>{item.team_score ?? '—'}</td><td>{item.team_role || '—'}</td></tr>)}</tbody></table></div><div className="pagination"><span>{records.data.total} vínculo(s) · página {page}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={page * 20 >= records.data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div></div></>}
  </section>
}
