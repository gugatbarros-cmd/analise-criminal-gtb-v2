export type RankingItem = { name: string; total: number }

export function Ranking({ title, items }: { title: string; items: RankingItem[] }) {
  const maximum = Math.max(1, ...items.map(item => item.total))
  return <div className="analysis-ranking"><h3>{title}</h3>{items.length === 0 ? <p className="empty">Sem dados neste recorte.</p> : <ol>{items.map(item => <li key={item.name}><div><span>{item.name}</span><strong>{item.total}</strong></div><span className="analysis-bar" aria-hidden="true"><span style={{ width: `${item.total / maximum * 100}%` }} /></span></li>)}</ol>}</div>
}
