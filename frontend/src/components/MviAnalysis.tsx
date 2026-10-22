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
    <p className="muted">Os totais e distribuições vêm somente de {label}. Os filtros da lista individual acima permanecem próprios daquela lista. O meio empregado usa apenas campos explícitos; relatos ainda aguardam análise e conferência.</p>
    {analysis.isPending && <p className="empty">Carregando perfil MVI…</p>}
    {analysis.isError && <p className="error" role="alert">Não foi possível carregar o perfil {label}.</p>}
    {analysis.data && <><p className="analysis-total">Vítimas no recorte <strong>{analysis.data.total}</strong></p><div className="analysis-grid"><Ranking title="Histórico anual" items={analysis.data.yearly.map(item => ({ name: String(item.year), total: item.total }))} /><Ranking title="Municípios" items={analysis.data.municipalities} /><Ranking title="Classificações" items={analysis.data.classifications} /><Ranking title="Meio empregado declarado" items={analysis.data.instruments} /></div></>}
  </section>
}
