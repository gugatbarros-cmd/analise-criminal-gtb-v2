import type { ArmsAnalysis, ArmsFilters, DrugsAnalysis, DrugsFilters, TeamsAnalysis, TeamsFilters } from '../services/api'

type Scope = { year?: number; municipality?: string }
export type SpecializedReportRequest =
  | { kind: 'arms'; scope: Scope; filters: ArmsFilters; data: ArmsAnalysis }
  | { kind: 'drugs'; scope: Scope; filters: DrugsFilters; data: DrugsAnalysis }
  | { kind: 'teams'; scope: Scope; filters: TeamsFilters; data: TeamsAnalysis }

const labels = { arms: 'Armas', drugs: 'Drogas', teams: 'Guarnições' }
const number = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

function Distribution({ title, items }: { title: string; items: { name: string; total: number }[] }) {
  return <div className="report-distribution"><h4>{title}</h4>{items.length ?
    <table className="report-table"><thead><tr><th>Categoria</th><th>Quantidade</th></tr></thead><tbody>{items.slice(0, 10).map(item =>
      <tr key={item.name}><td>{item.name}</td><td>{number(item.total)}</td></tr>)}</tbody></table> :
    <p className="muted">Sem registros no recorte.</p>}</div>
}

function selectedFilters(request: SpecializedReportRequest): string[] {
  const { scope, filters } = request
  const entries = [
    `Ano: ${scope.year || 'todos'}`,
    `Município: ${scope.municipality || 'todos'}`,
    `Mês: ${filters.month || 'todos'}`,
    `Data inicial: ${filters.startDate || 'sem limite'}`,
    `Data final: ${filters.endDate || 'sem limite'}`,
  ]
  if (request.kind === 'arms') entries.push(`Tipo: ${request.filters.armType || 'todos'}`,
    `Situação: ${request.filters.situation || 'todas'}`)
  if (request.kind === 'drugs') entries.push(`Tipo: ${request.filters.drugType || 'todos'}`)
  if (request.kind === 'teams') entries.push(`Equipe: ${request.filters.teamName || 'todas'}`,
    `Policial (matrícula): ${request.filters.officerRegistration || 'todos'}`,
    `Natureza: ${request.filters.natureFilter || 'todas'}`)
  return entries
}

function ArmsContent({ data }: { data: ArmsAnalysis }) {
  return <><table className="report-table"><tbody>
    <tr><th>Itens</th><td>{number(data.records)}</td></tr>
    <tr><th>Unidades</th><td>{number(data.total)}</td></tr>
    <tr><th>Unidades apreendidas</th><td>{number(data.seized)}</td></tr>
    <tr><th>Unidades de uso restrito</th><td>{number(data.restricted)}</td></tr>
  </tbody></table><div className="report-grid">
    <Distribution title="Apreensões por mês · unidades" items={data.monthly.map(item => ({ name: item.period, total: item.total }))} />
    <Distribution title="Tipos · unidades" items={data.types} />
    <Distribution title="Calibres · unidades" items={data.calibers} />
    <Distribution title="Situações · unidades" items={data.situations} />
    <Distribution title="Municípios · unidades" items={data.municipalities} />
  </div><p className="muted">Cada item pode representar mais de uma unidade. Apreensão e uso restrito seguem os campos da planilha de armas.</p></>
}

function DrugsContent({ data }: { data: DrugsAnalysis }) {
  return <><table className="report-table"><tbody>
    <tr><th>Registros</th><td>{number(data.total)}</td></tr>
    <tr><th>Peso reconhecido · g</th><td>{number(data.total_weight_grams)}</td></tr>
    <tr><th>Registros com peso reconhecido</th><td>{number(data.weighted_records)} de {number(data.total)}</td></tr>
  </tbody></table><div className="report-grid">
    <Distribution title="Evolução mensal · registros" items={data.monthly.map(item => ({ name: item.period, total: item.total }))} />
    <Distribution title="Tipos · registros" items={data.types} />
    <Distribution title="Peso por tipo · g" items={data.weights_by_type.map(item => ({ name: item.name, total: item.grams }))} />
    <Distribution title="Locais · registros" items={data.locations} />
    <Distribution title="Municípios · registros" items={data.municipalities} />
  </div><p className="muted">Somente kg, g e mg reconhecidos são convertidos em gramas. Outras unidades não entram no peso.</p></>
}

function TeamsContent({ data }: { data: TeamsAnalysis }) {
  return <><table className="report-table"><tbody>
    <tr><th>Vínculos de equipes da escala</th><td>{number(data.roster_occurrences)}</td></tr>
    <tr><th>Pontos ponderados da escala</th><td>{number(data.weighted_points)}</td></tr>
    <tr><th>Equipes da escala</th><td>{number(data.teams)}</td></tr>
    <tr><th>Policiais identificados</th><td>{number(data.officers)}</td></tr>
    <tr><th>Vínculos de força-tarefa</th><td>{number(data.extra_occurrences)}</td></tr>
    <tr><th>Outros recursos fora da escala</th><td>{number(data.unlisted_occurrences)}</td></tr>
  </tbody></table><div className="report-grid">
    <Distribution title="Equipes · pontos" items={data.ranking.map(item => ({ name: item.name, total: item.points }))} />
    <Distribution title="Equipes · vínculos" items={data.ranking.map(item => ({ name: item.name, total: item.occurrences }))} />
    <Distribution title="Policiais · pontos" items={data.officer_ranking.map(item => ({ name: `${item.name} · ${item.registration}`, total: item.points }))} />
    <Distribution title="Naturezas da escala · vínculos" items={data.natures} />
  </div><p className="muted">Pontos somam vínculos de equipes da escala. Força-tarefa e outros recursos ficam separados; uma ocorrência pode ter mais de uma equipe.</p></>
}

export function SpecializedReport({ request, onClose }: { request: SpecializedReportRequest; onClose: () => void }) {
  return <section className="panel report-panel" aria-label={`Relatório especializado de ${labels[request.kind].toLowerCase()}`}>
    <div className="section-head"><div><p className="eyebrow">Relatório especializado · provisório</p><h2>{labels[request.kind]}</h2></div><span>Emitido em {new Date().toLocaleString('pt-BR')}</span></div>
    <p className="muted">Recorte aplicado: {selectedFilters(request).join(' · ')}.</p>
    {request.kind === 'arms' ? <ArmsContent data={request.data} /> :
      request.kind === 'drugs' ? <DrugsContent data={request.data} /> :
        <TeamsContent data={request.data} />}
    <p className="muted">Resultados provisórios, ainda sem comparação com totais oficiais. A impressão do navegador permite salvar em PDF.</p>
    <div className="report-actions"><button type="button" className="primary" onClick={() => window.print()}>Imprimir ou salvar PDF</button><button type="button" onClick={onClose}>Fechar relatório</button></div>
  </section>
}
