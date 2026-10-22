import React, { lazy, Suspense, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import { SourceTable } from './components/SourceTable'
import { ProjectProgress } from './components/ProjectProgress'
import { CvpAnalysis } from './components/CvpAnalysis'
import { AttemptAnalysis } from './components/AttemptAnalysis'
import { TcoAnalysis } from './components/TcoAnalysis'
import { MviAnalysis } from './components/MviAnalysis'
import { getBatches, getSummary, upload, type Source } from './services/api'
import { getHealth } from './services/health'
import './style.css'
import './source-table.css'
import './progress.css'

const labels: Record<Source, string> = {
  mvi_cad: 'MVI CAD', mvi_neac: 'MVI NEAC', ocorrencias: 'Ocorrências',
  armas: 'Armas', drogas: 'Drogas', guarnicoes: 'Guarnições',
}
const sources: Source[] = ['mvi_cad', 'mvi_neac', 'ocorrencias']
const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const queryClient = new QueryClient()
const MonthlyChart = lazy(() => import('./components/MonthlyChart').then(module => ({ default: module.MonthlyChart })))

function App() {
  const [source, setSource] = useState<Source>('mvi_cad')
  const [scope, setScope] = useState<'partial' | 'complete'>('partial')
  const [file, setFile] = useState<File | null>(null)
  const [year, setYear] = useState('')
  const [municipality, setMunicipality] = useState('')
  const [activeSource, setActiveSource] = useState<'mvi_cad' | 'mvi_neac'>('mvi_cad')
  const health = useQuery({ queryKey: ['health'], queryFn: () => getHealth(apiUrl), retry: 1 })
  const summary = useQuery({ queryKey: ['summary', year, municipality], queryFn: () => getSummary(year ? Number(year) : undefined, municipality || undefined), enabled: health.isSuccess })
  const batches = useQuery({ queryKey: ['batches'], queryFn: getBatches, enabled: health.isSuccess })
  const importer = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Selecione um arquivo CSV ou XLSX.')
      return upload(source, file, scope)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['summary'] }); void queryClient.invalidateQueries({ queryKey: ['batches'] }); void queryClient.invalidateQueries({ queryKey: ['records'] }); void queryClient.invalidateQueries({ queryKey: ['tco-analysis'] }); void queryClient.invalidateQueries({ queryKey: ['mvi-analysis'] }); void queryClient.invalidateQueries({ queryKey: ['mvi-detail'] }) },
  })

  return <main className="shell">
    <header><div className="brand"><span className="brand-mark">GTB</span><span>Análise Criminal <strong>2.0</strong></span></div><span className="badge">Local · v{health.data?.version || '0.1.10'}</span></header>
    <section className="hero"><div><p className="eyebrow">Ambiente paralelo de validação</p><h1>Dados separados. Resultados auditáveis.</h1><p>Importe bases de teste, confira o histórico de alterações e compare CAD e NEAC sem combinar as fontes. O sistema anterior continua em produção.</p></div><div className="status" role="status"><span className={health.isSuccess ? 'dot active' : 'dot'} />{health.isPending ? 'Verificando API…' : health.isError ? 'API local indisponível' : 'API local ativa'}</div></section>
    <div className="notice">Indicadores provisórios: regras extraídas do legado. A paridade ainda precisa ser conferida com amostras anonimizadas e números oficiais.</div>
    <ProjectProgress />
    <section className="filters" aria-label="Filtros de indicadores"><label>Ano<input type="number" min="1900" max="2100" placeholder="Todos" value={year} onChange={event => setYear(event.target.value)} /></label><label>Município<input type="search" placeholder="Todos os municípios" value={municipality} onChange={event => setMunicipality(event.target.value)} /></label><button type="button" onClick={() => { setYear(''); setMunicipality('') }}>Limpar filtros</button></section>
    <section className="metrics five" aria-label="Indicadores"><article><span>MVI CAD</span><strong>{summary.data?.mvi_cad ?? '—'}</strong><small>Vítimas · fonte CAD</small></article><article><span>MVI NEAC</span><strong>{summary.data?.mvi_neac ?? '—'}</strong><small>Vítimas · fonte NEAC</small></article><article><span>CVP</span><strong>{summary.data?.cvp ?? '—'}</strong><small>Ocorrências de roubo</small></article><article><span>Tentativas</span><strong>{summary.data?.tentativas ?? '—'}</strong><small>Ocorrências de homicídio tentado</small></article><article><span>TCO</span><strong>{summary.data?.tco ?? '—'}</strong><small>Termos elaborados pela PM</small></article></section>
    {summary.isError && <p className="error" role="alert">Não foi possível consultar os indicadores.</p>}
    <section className="panel"><div className="section-head"><div><p className="eyebrow">Evolução mensal</p><h2>MVI por fonte</h2></div><span>CAD e NEAC permanecem independentes</span></div><Suspense fallback={<p className="empty">Carregando gráfico…</p>}><MonthlyChart monthly={summary.data?.monthly || {}} /></Suspense></section>
    <section className="panel"><div className="section-head"><div><p className="eyebrow">Relação individual</p><h2>Vítimas elegíveis</h2></div></div><div className="tabs" role="tablist" aria-label="Fonte MVI"><button type="button" role="tab" aria-selected={activeSource === 'mvi_cad'} onClick={() => setActiveSource('mvi_cad')}>MVI CAD</button><button type="button" role="tab" aria-selected={activeSource === 'mvi_neac'} onClick={() => setActiveSource('mvi_neac')}>MVI NEAC</button></div><SourceTable source="mvi_cad" active={activeSource === 'mvi_cad'} /><SourceTable source="mvi_neac" active={activeSource === 'mvi_neac'} /></section>
    <MviAnalysis source={activeSource} year={year ? Number(year) : undefined} municipality={municipality || undefined} />
    <CvpAnalysis summary={summary.data} year={year ? Number(year) : undefined} municipality={municipality || undefined} />
    <AttemptAnalysis year={year ? Number(year) : undefined} municipality={municipality || undefined} />
    <TcoAnalysis year={year ? Number(year) : undefined} municipality={municipality || undefined} />
    <div className="two-col"><section className="panel"><div className="section-head"><div><p className="eyebrow">Entrada de dados</p><h2>Importar planilha</h2></div></div><p className="muted">Use apenas dados sintéticos nesta etapa. Arquivo bruto e versões ficam neste computador, fora do Git.</p><form onSubmit={event => { event.preventDefault(); importer.mutate() }}><label>Fonte<select value={source} onChange={event => setSource(event.target.value as Source)}>{sources.map(item => <option key={item} value={item}>{labels[item]}</option>)}</select></label><label>Escopo<select value={scope} onChange={event => setScope(event.target.value as 'partial' | 'complete')}><option value="partial">Parcial</option><option value="complete">Completo (sem exclusão automática)</option></select></label><label>Arquivo CSV ou XLSX<input type="file" accept=".csv,.xlsx" onChange={event => setFile(event.target.files?.[0] || null)} required /></label><button type="submit" className="primary" disabled={importer.isPending || !health.isSuccess}>{importer.isPending ? 'Importando…' : 'Importar e conferir'}</button></form>{importer.isError && <p className="error" role="alert">{importer.error.message}</p>}{importer.data && <p className="success" role="status">{importer.data.repeated ? 'Arquivo já importado.' : `Lote concluído: ${importer.data.inserted} novos, ${importer.data.updated} atualizados, ${importer.data.quarantined} em quarentena.`}</p>}</section><section className="panel"><div className="section-head"><div><p className="eyebrow">Auditoria</p><h2>Importações recentes</h2></div></div>{!batches.data?.length ? <p className="empty">Nenhuma importação registrada.</p> : <div className="batch-list">{batches.data.map(batch => <article key={batch.id}><div><strong>{labels[batch.source]}</strong><span>{new Date(batch.imported_at).toLocaleString('pt-BR')}</span></div><p>{batch.filename}</p><small>{batch.row_count} linhas · {batch.inserted} novos · {batch.updated} alterados · {batch.quarantined} em quarentena</small></article>)}</div>}</section></div>
    {!!batches.data?.some(batch => batch.differences > 0) && <p className="notice" role="status">Há registros ausentes em arquivo completo. Consulte <code>GET /imports/&lt;id&gt;/divergences</code> para revisar; nenhum registro foi apagado.</p>}
    <footer>Execução local · sem sincronização externa · nenhuma base operacional deve ser importada antes da validação de acesso e restauração.</footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></React.StrictMode>)
