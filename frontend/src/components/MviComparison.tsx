import { useQuery } from '@tanstack/react-query'
import { getMviComparison } from '../services/api'

export function MviComparison({ year, municipality }: { year?: number; municipality?: string }) {
  const comparison = useQuery({
    queryKey: ['mvi-comparison', year, municipality],
    queryFn: () => getMviComparison(year, municipality),
  })
  return <section className="panel" aria-label="Comparação MVI CAD e NEAC">
    <div className="section-head"><div><p className="eyebrow">Conferência entre fontes</p><h2>CAD × NEAC</h2></div><span>Correspondências potenciais</span></div>
    <p className="muted">A comparação exige ano, número da ocorrência e nome da vítima iguais após normalização. Casos ambíguos ficam separados para revisão. Cada fonte mantém seu total próprio; uma correspondência não valida automaticamente o caso.</p>
    {comparison.isPending && <p className="empty">Comparando fontes…</p>}
    {comparison.isError && <p className="error" role="alert">Não foi possível comparar as fontes.</p>}
    {comparison.data && <>
      <div className="metrics five" aria-label="Resumo da comparação">
        <article><span>CAD</span><strong>{comparison.data.cad_total}</strong><small>Vítimas elegíveis</small></article>
        <article><span>NEAC</span><strong>{comparison.data.neac_total}</strong><small>Vítimas elegíveis</small></article>
        <article><span>Possíveis pares</span><strong>{comparison.data.candidate_pairs}</strong><small>Chave exata</small></article>
        <article><span>Só CAD / só NEAC</span><strong>{comparison.data.cad_only} / {comparison.data.neac_only}</strong><small>Sem par no recorte</small></article>
        <article><span>Ambíguos</span><strong>{comparison.data.ambiguous}</strong><small>Registros para revisão</small></article>
      </div>
      {comparison.data.examples.length > 0 && <div className="source-table-wrap"><table className="source-table"><thead><tr><th>Ocorrência</th><th>Vítima</th><th>Data CAD / NEAC</th><th>Município CAD / NEAC</th><th>Conferência</th></tr></thead><tbody>
        {comparison.data.examples.map(item => <tr key={`${item.cad.natural_key}|${item.neac.natural_key}`}><td>{item.cad.occurrence}</td><td>{item.cad.victim}</td><td>{item.cad.date} / {item.neac.date}</td><td>{item.cad.municipality} / {item.neac.municipality}</td><td>{item.same_date && item.same_municipality ? 'Data e município coincidem' : 'Revisar divergência'}</td></tr>)}
      </tbody></table><p className="muted">Exibindo até 20 possíveis pares; as contagens consideram todos os registros do recorte.</p></div>}
    </>}
  </section>
}
