import { AnalysisChart } from './AnalysisChart'
import { useSeizedMaterials } from './useSeizedMaterials'
import { countBy, SEIZED_TARGET, summarizeDepots } from '../services/seized-materials'
import '../seized-materials.css'

const n = (value: number) => value.toLocaleString('pt-BR')

/** Resumo dos materiais apreendidos no dashboard geral; o detalhe fica na aba própria. */
export function SeizedMaterialsOverview({ demo }: { demo: boolean }) {
  const query = useSeizedMaterials(demo)
  const items = query.data || []
  const seized = items.filter(item => item.situation === 'apreendido')
  const cards = [
    { key: 'geral', label: 'Geral', total: items.length, seized: seized.length, returned: items.filter(item => item.situation === 'devolvido').length },
    ...summarizeDepots(items).filter(depot => ['cisp-palmeira', 'gcm-palmeira'].includes(depot.key)),
  ]
  return <section className="panel seized-overview" aria-label="Materiais apreendidos no dashboard">
    <div className="section-head">
      <div><p className="eyebrow">Controle de depósitos</p><h2>Materiais apreendidos · 10º BPM</h2></div>
      <a className="primary" href={`#${SEIZED_TARGET}`}>Abrir materiais apreendidos →</a>
    </div>
    {query.isPending && <p className="empty" role="status">Lendo a planilha de materiais apreendidos…</p>}
    {query.isError && <p className="error" role="alert">{query.error instanceof Error ? query.error.message : 'Não foi possível ler a planilha.'}</p>}
    {query.data && <div className="seized-overview-body">
      <div className="seized-cards">
        {cards.map((card, index) => <a key={card.key} className={`seized-card${index === 0 ? ' featured' : ''}`} href={`#${SEIZED_TARGET}`}>
          <span className="seized-card-title">{card.label}</span>
          <span className="seized-card-row"><span>Apreendidos</span><strong>{n(card.seized)}</strong></span>
          <span className="seized-card-row"><span>Devolvidos</span><strong>{n(card.returned)}</strong></span>
          <small>{n(card.total)} registro(s) no total</small>
        </a>)}
      </div>
      <div><h3 className="seized-overview-chart-title">Apreendidos por comarca</h3><AnalysisChart kind="doughnut" title="Apreendidos por comarca" items={countBy(seized, item => item.comarca, 6)} /></div>
    </div>}
  </section>
}
