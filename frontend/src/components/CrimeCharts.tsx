import { useQuery } from '@tanstack/react-query'
import { getCrimeAnalysis } from '../services/api'
import { Ranking } from './Ranking'

export function CrimeCharts({ kind, year, municipality }: {
  kind: 'CVP' | 'Tentativa de homicídio'; year?: number; municipality?: string
}) {
  const analysis = useQuery({ queryKey: ['crime-analysis', kind, year, municipality],
    queryFn: () => getCrimeAnalysis(kind, year, municipality) })
  if (analysis.isPending) return <p className="empty">Carregando gráficos…</p>
  if (!analysis.data) return <p className="error">Não foi possível carregar os gráficos.</p>
  return <><p className="analysis-total">Ocorrências no recorte <strong>{analysis.data.total}</strong></p><div className="analysis-grid">
    <Ranking title={`Evolução mensal · ${kind}`} items={analysis.data.monthly.map(item => ({ name: item.period, total: item.total }))} />
    <Ranking title={`Municípios · ${kind}`} items={analysis.data.municipalities} />
    <Ranking title={`Naturezas · ${kind}`} items={analysis.data.natures} />
  </div></>
}
