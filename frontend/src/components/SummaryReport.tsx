import type { Summary } from '../services/api'

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

export function SummaryReport({ summary, year, municipality, onClose }: {
  summary?: Summary; year?: number; municipality?: string; onClose: () => void
}) {
  const emittedAt = new Date().toLocaleString('pt-BR')
  return <section className="panel report-panel" aria-label="Relatório resumido de indicadores">
    <div className="section-head"><div><p className="eyebrow">Relatório resumido · provisório</p><h2>Indicadores do recorte</h2></div><span>Emitido em {emittedAt}</span></div>
    <p className="muted">Ano: <strong>{year || 'todos'}</strong> · Município: <strong>{municipality || 'todos'}</strong>. As fontes MVI CAD e NEAC são independentes e não devem ser somadas.</p>
    {!summary ? <p className="empty">Aguardando os indicadores para gerar o relatório.</p> : <table className="report-table"><thead><tr><th>Indicador</th><th>Quantidade</th><th>Unidade</th></tr></thead><tbody>{metrics.map(metric => <tr key={metric.key}><td>{metric.label}</td><td>{Number(summary[metric.key]).toLocaleString('pt-BR')}</td><td>{metric.unit}</td></tr>)}</tbody></table>}
    <p className="muted">Números calculados por regras provisórias extraídas do sistema anterior. Ainda faltam paridade com dados oficiais, revisão de casos ambíguos e validação operacional. Esta página registra o recorte exibido; a função de imprimir do navegador permite salvar em PDF.</p>
    <div className="report-actions"><button type="button" className="primary" disabled={!summary} onClick={() => window.print()}>Imprimir ou salvar PDF</button><button type="button" onClick={onClose}>Fechar relatório</button></div>
  </section>
}
