import type { Summary } from '../services/api'
import { periodEndForYear } from '../services/period-default'

type Props = {
  summary?: Summary
  year: string
  municipality: string
  loading: boolean
  serviceAvailable: boolean
  demo: boolean
  cloud: boolean
}

const number = (value: number | undefined) => value === undefined ? '—' : value.toLocaleString('pt-BR')

export function CriminalOverview({ summary, year, municipality, loading, serviceAvailable, demo, cloud }: Props) {
  const scope = `${year || 'Todos os anos'} · ${municipality || 'Todos os municípios'}`
  const cutoff = periodEndForYear(summary, year)
  const source = demo ? 'Demonstração sintética' : cloud ? 'Consulta online protegida' : 'Dados locais do 10º BPM'
  return <section id="dashboard" className="criminal-overview" aria-labelledby="criminal-overview-title">
    <div className="criminal-overview-main">
      <div className="criminal-overview-kicker"><span className="criminal-overview-pulse" aria-hidden="true" /> Inteligência territorial · 10º BPM</div>
      <h1 id="criminal-overview-title">Dashboard criminal <span>Dados gerais</span></h1>
      <p>Indicadores do período para acompanhar o território e abrir cada análise com um clique.</p>
      <div className="criminal-overview-actions"><a className="criminal-overview-primary" href="#mapa-criminal">Abrir mapa criminal <span aria-hidden="true">↗</span></a><a href="#indicadores">Explorar indicadores <span aria-hidden="true">↓</span></a><a href="#ocorrencias">Analisar ocorrências <span aria-hidden="true">↓</span></a></div>
    </div>
    <div className="criminal-overview-data" aria-label="Resumo criminal do período">
      <div className="criminal-overview-data-head"><span>{source}</span><strong className={serviceAvailable ? 'is-online' : ''}><i aria-hidden="true" />{loading ? 'Atualizando' : serviceAvailable ? 'Sistema conectado' : 'Serviço indisponível'}</strong></div>
      <div className="criminal-overview-scope"><span>Recorte selecionado</span><strong>{scope}{cutoff && ` · até ${cutoff.split('-').reverse().join('/')}`}</strong></div>
      <div className="criminal-overview-numbers"><a href="#ocorrencias"><span>Ocorrências</span><strong>{number(summary?.occurrences)}</strong><small>Base geral</small></a><a href="#mvi"><span>MVI CAD</span><strong>{number(summary?.mvi_cad)}</strong><small>Vítimas · fonte CAD</small></a><a href="#mvi"><span>MVI NEAC</span><strong>{number(summary?.mvi_neac)}</strong><small>Vítimas · fonte NEAC</small></a></div>
      <div className="criminal-overview-bottom"><span>Fontes CAD e NEAC independentes</span><span>Indicadores provisórios sujeitos à conferência oficial</span></div>
    </div>
  </section>
}
