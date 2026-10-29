import { AnalysisChart } from './AnalysisChart'
export type RankingItem = { name: string; total: number }

export function Ranking({ title, items }: { title: string; items: RankingItem[] }) {
  const temporal = /mensal|por m[eê]s|histórico anual/i.test(title)
  const categorical = /classifica|tipos|meio empregado|calibres|situações/i.test(title)
  return <div className="analysis-ranking"><h3>{title}</h3><AnalysisChart title={title} items={items} kind={temporal ? 'line' : categorical && items.length <= 8 ? 'doughnut' : 'bar'} />{items.length > 0 && <details><summary>Conferir números do gráfico</summary><table className="source-table"><thead><tr><th>Categoria</th><th>Quantidade</th></tr></thead><tbody>{items.map(item => <tr key={item.name}><td>{item.name}</td><td>{item.total.toLocaleString('pt-BR')}</td></tr>)}</tbody></table></details>}</div>
}
