import { useQuery } from '@tanstack/react-query'
import { getMviAnalysis, type MviSource } from '../services/api'
import { Ranking } from './Ranking'

export function MviAnalysis({ source, year, municipality }: {
  source: MviSource; year?: number; municipality?: string
}) {
  const analysis = useQuery({
    queryKey: ['mvi-analysis', source, year, municipality],
    queryFn: () => getMviAnalysis(source, year, municipality),
  })
  const label = source === 'mvi_cad' ? 'MVI CAD' : 'MVI NEAC'
  return <section className="panel" aria-label={`Perfil ${label}`}>
    <div className="section-head"><div><p className="eyebrow">Vítimas elegíveis · fonte independente</p><h2>Perfil {label}</h2></div><span>Filtros mestres de ano e município</span></div>
    <p className="muted">Os totais e distribuições vêm somente de {label}. Os filtros da lista individual acima permanecem próprios daquela lista. O meio empregado prioriza campos estruturados e, quando não há meio válido, procura evidência afirmativa no relato da mesma fonte. A inferência ainda requer conferência humana.</p>
    {analysis.isPending && <p className="empty">Carregando perfil MVI…</p>}
    {analysis.isError && <p className="error" role="alert">Não foi possível carregar o perfil {label}.</p>}
    {analysis.data && <>
      <p className="analysis-total">Vítimas no recorte <strong>{analysis.data.total}</strong></p>
      <div className="analysis-grid">
        <Ranking title="Histórico anual" items={analysis.data.yearly.map(item => ({ name: String(item.year), total: item.total }))} />
        <Ranking title="Evolução mensal" items={analysis.data.monthly.map(item => ({ name: `${item.period.slice(5)}/${item.period.slice(0, 4)}`, total: item.total }))} />
        <Ranking title="Dia da semana" items={analysis.data.weekdays} />
        <Ranking title="Municípios" items={analysis.data.municipalities} />
        <Ranking title="Classificações" items={analysis.data.classifications} />
        <Ranking title="Meio empregado · informado ou inferido" items={analysis.data.instruments} />
        <Ranking title="Faixas de duas horas" items={analysis.data.time_bands} />
      </div>
      <p className="muted">Cobertura de horário: {analysis.data.time_coverage.valid} de {analysis.data.time_coverage.total} vítimas elegíveis ({analysis.data.time_coverage.total ? (100 * analysis.data.time_coverage.valid / analysis.data.time_coverage.total).toFixed(1) : '0,0'}%). A concentração considera somente os registros com hora válida.</p>
      <div className="source-table-wrap"><table className="source-table"><thead><tr><th>Município</th><th>Faixa mais frequente</th><th>Vítimas na faixa</th><th>Classificação predominante</th><th>Cobertura de horário</th></tr></thead><tbody>
        {analysis.data.city_time_bands.map(item => <tr key={item.municipality}><td>{item.municipality}</td><td>{item.top_band || 'Sem horário'}</td><td>{item.top_band_total}</td><td>{item.top_category || '—'}</td><td>{item.valid} de {item.total}</td></tr>)}
      </tbody></table></div>
    </>}
  </section>
}
