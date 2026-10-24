import { useQuery } from '@tanstack/react-query'
import { getArmsAnalysis, getDomesticAnalysis, getDrugsAnalysis, getMviAnalysis, getMviComparison, getOperationalAnalysis, getTcoAnalysis, getTeamsAnalysis, type OperationalAnalysis, type Summary } from '../services/api'

const metrics: { key: keyof Summary; label: string; unit: string }[] = [
  { key: 'mvi_cad', label: 'MVI CAD', unit: 'vítimas' },
  { key: 'mvi_neac', label: 'MVI NEAC', unit: 'vítimas' },
  { key: 'cvp', label: 'CVP', unit: 'ocorrências' },
  { key: 'tentativas', label: 'Tentativas de homicídio', unit: 'ocorrências' },
  { key: 'tco', label: 'TCO', unit: 'ocorrências' },
  { key: 'mandados', label: 'Mandados cumpridos', unit: 'ocorrências' },
  { key: 'visitas', label: 'Visitas', unit: 'ocorrências' },
  { key: 'sossego', label: 'Perturbação do sossego', unit: 'ocorrências' },
  { key: 'domestica', label: 'Violência doméstica reconhecida', unit: 'ocorrências' },
]

function Distribution({ title, items }: { title: string; items: { name: string; total: number }[] }) {
  return <div className="report-distribution"><h4>{title}</h4>{!items.length ? <p className="muted">Sem registros no recorte.</p> :
    <table className="report-table"><thead><tr><th>Categoria</th><th>Quantidade</th></tr></thead><tbody>{items.slice(0, 10).map(item => <tr key={item.name}><td>{item.name}</td><td>{item.total.toLocaleString('pt-BR')}</td></tr>)}</tbody></table>}</div>
}

function OperationalDetail({ title, data }: { title: string; data: OperationalAnalysis }) {
  return <div className="report-module"><h3>{title} · {data.total.toLocaleString('pt-BR')} ocorrências</h3><div className="report-grid"><Distribution title="Evolução mensal" items={data.monthly.map(item => ({ name: item.period, total: item.total }))} /><Distribution title="Municípios" items={data.municipalities} /><Distribution title="Naturezas" items={data.natures} /></div></div>
}

export function SummaryReport({ summary, year, municipality, onClose }: {
  summary?: Summary; year?: number; municipality?: string; onClose: () => void
}) {
  const emittedAt = new Date().toLocaleString('pt-BR')
  const cad = useQuery({ queryKey: ['mvi-analysis', 'mvi_cad', year, municipality], queryFn: () => getMviAnalysis('mvi_cad', year, municipality) })
  const neac = useQuery({ queryKey: ['mvi-analysis', 'mvi_neac', year, municipality], queryFn: () => getMviAnalysis('mvi_neac', year, municipality) })
  const comparison = useQuery({ queryKey: ['mvi-comparison', year, municipality], queryFn: () => getMviComparison(year, municipality) })
  const tco = useQuery({ queryKey: ['tco-analysis', year, municipality], queryFn: () => getTcoAnalysis(year, municipality) })
  const domestic = useQuery({ queryKey: ['domestic-analysis', year, municipality], queryFn: () => getDomesticAnalysis(year, municipality) })
  const arms = useQuery({ queryKey: ['arms-analysis', year, municipality], queryFn: () => getArmsAnalysis(year, municipality) })
  const drugs = useQuery({ queryKey: ['drugs-analysis', year, municipality], queryFn: () => getDrugsAnalysis(year, municipality) })
  const teams = useQuery({ queryKey: ['teams-analysis', year, municipality], queryFn: () => getTeamsAnalysis(year, municipality) })
  const mandados = useQuery({ queryKey: ['operational-analysis', 'Mandados', year, municipality], queryFn: () => getOperationalAnalysis('Mandados', year, municipality) })
  const visitas = useQuery({ queryKey: ['operational-analysis', 'Visitas', year, municipality], queryFn: () => getOperationalAnalysis('Visitas', year, municipality) })
  const sossego = useQuery({ queryKey: ['operational-analysis', 'Sossego', year, municipality], queryFn: () => getOperationalAnalysis('Sossego', year, municipality) })
  const queries = [cad, neac, comparison, tco, domestic, arms, drugs, teams, mandados, visitas, sossego]
  const ready = !!summary && queries.every(query => query.isSuccess)
  const failed = queries.some(query => query.isError)

  return <section className="panel report-panel" aria-label="Relatório detalhado de indicadores">
    <div className="section-head"><div><p className="eyebrow">Relatório detalhado · provisório</p><h2>Indicadores do recorte</h2></div><span>Emitido em {emittedAt}</span></div>
    <p className="muted">Ano: <strong>{year || 'todos'}</strong> · Município: <strong>{municipality || 'todos'}</strong>. As fontes MVI CAD e NEAC são independentes e não devem ser somadas.</p>
    {!summary ? <p className="empty">Aguardando os indicadores para gerar o relatório.</p> : <table className="report-table"><thead><tr><th>Indicador</th><th>Quantidade</th><th>Unidade</th></tr></thead><tbody>{metrics.map(metric => <tr key={metric.key}><td>{metric.label}</td><td>{Number(summary[metric.key]).toLocaleString('pt-BR')}</td><td>{metric.unit}</td></tr>)}</tbody></table>}
    {!ready && !failed && <p className="empty">Preparando os detalhes dos módulos…</p>}
    {failed && <p className="error" role="alert">Não foi possível carregar todos os detalhes. Revise a conexão antes de imprimir.</p>}
    {ready && <>
      {[cad.data!, neac.data!].map(item => <div className="report-module" key={item.source}><h3>MVI {item.source === 'mvi_cad' ? 'CAD' : 'NEAC'} · {item.total.toLocaleString('pt-BR')} vítimas</h3><p className="muted">Horário informado em {item.time_coverage.valid} de {item.time_coverage.total} vítimas elegíveis.</p><div className="report-grid"><Distribution title="Histórico anual" items={item.yearly.map(row => ({ name: String(row.year), total: row.total }))} /><Distribution title="Municípios" items={item.municipalities} /><Distribution title="Classificações" items={item.classifications} /><Distribution title="Meio empregado" items={item.instruments} /><Distribution title="Faixas de horário" items={item.time_bands} /></div></div>)}
      <div className="report-module"><h3>Conferência CAD × NEAC</h3><p>{comparison.data!.candidate_pairs} possível(is) par(es) exato(s); {comparison.data!.cad_only} somente no CAD; {comparison.data!.neac_only} somente no NEAC; {comparison.data!.ambiguous} registro(s) ambíguo(s). A comparação não soma as fontes nem confirma paridade oficial.</p></div>
      <OperationalDetail title="TCO" data={tco.data!} />
      <OperationalDetail title="Mandados cumpridos" data={mandados.data!} />
      <OperationalDetail title="Visitas" data={visitas.data!} />
      <OperationalDetail title="Perturbação do sossego" data={sossego.data!} />
      <div className="report-module"><h3>Violência doméstica · {domestic.data!.total.toLocaleString('pt-BR')} reconhecidas</h3><p className="muted">Triagem: {domestic.data!.reviews.pending} pendentes, {domestic.data!.reviews.excluded} não configuradas, {domestic.data!.reviews.outside} fora do recorte feminino.</p><div className="report-grid"><Distribution title="Evolução mensal" items={domestic.data!.monthly.map(item => ({ name: item.period, total: item.total }))} /><Distribution title="Municípios" items={domestic.data!.municipalities} /></div></div>
      <div className="report-module"><h3>Armas · {arms.data!.total.toLocaleString('pt-BR')} unidades</h3><p className="muted">{arms.data!.seized} apreendidas; {arms.data!.restricted} de uso restrito. Contagem provisória por unidade informada.</p><div className="report-grid"><Distribution title="Tipos" items={arms.data!.types} /><Distribution title="Calibres" items={arms.data!.calibers} /><Distribution title="Municípios" items={arms.data!.municipalities} /></div></div>
      <div className="report-module"><h3>Drogas · {drugs.data!.total.toLocaleString('pt-BR')} registros</h3><p className="muted">Peso reconhecido: {drugs.data!.total_weight_grams.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} g em {drugs.data!.weighted_records} registros. Outras unidades não são convertidas.</p><div className="report-grid"><Distribution title="Tipos" items={drugs.data!.types} /><Distribution title="Peso por tipo · g" items={drugs.data!.weights_by_type.map(item => ({ name: item.name, total: item.grams }))} /><Distribution title="Municípios" items={drugs.data!.municipalities} /></div></div>
      <div className="report-module"><h3>Guarnições · {teams.data!.roster_occurrences.toLocaleString('pt-BR')} ocorrências da escala</h3><p className="muted">{teams.data!.weighted_points.toLocaleString('pt-BR')} pontos; {teams.data!.extra_occurrences} ocorrências de força-tarefa e {teams.data!.unlisted_occurrences} de recursos fora da escala são separadas.</p><Distribution title="Ranking de guarnições" items={teams.data!.ranking.map(item => ({ name: item.name, total: item.points }))} /></div>
    </>}
    <p className="muted">Números calculados por regras provisórias extraídas do sistema anterior. Ainda faltam paridade com dados oficiais, revisão de casos ambíguos e validação operacional. A impressão do navegador permite salvar em PDF.</p>
    <div className="report-actions"><button type="button" className="primary" disabled={!ready} onClick={() => window.print()}>Imprimir ou salvar PDF</button><button type="button" onClick={onClose}>Fechar relatório</button></div>
  </section>
}
