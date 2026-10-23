import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getRecords, getTeamsAnalysis } from '../services/api'
import { Ranking } from './Ranking'

const groupName = { roster: 'Escala', extra: 'Força-tarefa', unlisted: 'Fora da escala' }

export function TeamsAnalysis({ year, municipality }: { year?: number; municipality?: string }) {
  const [page, setPage] = useState(1)
  useEffect(() => setPage(1), [year, municipality])
  const analysis = useQuery({ queryKey: ['teams-analysis', year, municipality],
    queryFn: () => getTeamsAnalysis(year, municipality) })
  const records = useQuery({ queryKey: ['records', 'guarnicoes', page, year, municipality],
    queryFn: () => getRecords('guarnicoes', page, year, municipality) })
  return <section className="panel" aria-label="Produtividade das guarnições">
    <div className="section-head"><div><p className="eyebrow">Vínculos operacionais · base própria</p><h2>Guarnições</h2></div><span>Provisório · validar layout oficial</span></div>
    <p className="muted">A pontuação usa a complexidade da natureza registrada, de 1 a 5 pontos. O ranking de equipes inclui apenas guarnições reconhecidas da escala. Força-tarefa e outros recursos aparecem separadamente; um mesmo atendimento pode ter mais de uma equipe.</p>
    {analysis.isError && <p className="error" role="alert">Não foi possível carregar a análise de guarnições.</p>}
    {analysis.data && <><div className="analysis-grid"><p>Atendimentos na escala <strong>{analysis.data.roster_occurrences}</strong></p><p>Pontos ponderados <strong>{analysis.data.weighted_points}</strong></p><p>Guarnições <strong>{analysis.data.teams}</strong></p><p>Policiais identificados <strong>{analysis.data.officers}</strong></p><p>Força-tarefa <strong>{analysis.data.extra_occurrences}</strong></p><p>Outros recursos <strong>{analysis.data.unlisted_occurrences}</strong></p></div><div className="analysis-grid"><Ranking title="Equipes · pontos" items={analysis.data.ranking.map(item => ({ name: item.name, total: item.points }))} /><Ranking title="Policiais · pontos" items={analysis.data.officer_ranking.map(item => ({ name: item.name, total: item.points }))} /><Ranking title="Naturezas da escala" items={analysis.data.natures} /></div></>}
    {records.isPending && <p className="empty">Carregando vínculos…</p>}
    {records.isError && <p className="error" role="alert">Não foi possível carregar a relação de guarnições.</p>}
    {records.data?.total === 0 && <p className="empty">Nenhum vínculo neste recorte.</p>}
    {!!records.data?.total && <><div className="table-scroll"><table><thead><tr><th>Data</th><th>Ocorrência</th><th>Município</th><th>Equipe</th><th>Grupo</th><th>Natureza</th><th>Pontos</th><th>Vínculo</th></tr></thead><tbody>{records.data.items.map(item => <tr key={item.natural_key}><td>{item.event_date}</td><td>{item.occurrence || '—'}</td><td>{item.municipality}</td><td>{item.category}</td><td>{item.team_group ? groupName[item.team_group] : '—'}</td><td>{item.nature || '—'}</td><td>{item.team_score ?? '—'}</td><td>{item.team_role || '—'}</td></tr>)}</tbody></table></div><div className="pagination"><span>{records.data.total} vínculo(s) · página {page}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Anterior</button><button type="button" disabled={page * 20 >= records.data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div></div></>}
  </section>
}
