import { IndicatorComparisons } from './components/IndicatorComparisons'
import './comparisons.css'
import './system-icons.css'
import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import { SourceTable } from './components/SourceTable'
import { ProjectProgress } from './components/ProjectProgress'
import { CvpAnalysis } from './components/CvpAnalysis'
import { AttemptAnalysis } from './components/AttemptAnalysis'
import { TcoAnalysis } from './components/TcoAnalysis'
import { MviAnalysis } from './components/MviAnalysis'
import { MviComparison } from './components/MviComparison'
import { OperationalAnalysis } from './components/OperationalAnalysis'
import { DomesticAnalysis } from './components/DomesticAnalysis'
import type { SpecializedReportRequest } from './components/SpecializedReport'
import { LoginScreen } from './components/LoginScreen'
import { UserManagement } from './components/UserManagement'
import { OnlineSync } from './components/OnlineSync'
import { isCloud, refreshCloud, cloudInfo } from './services/cloud'
import { ArmsAnalysis } from './components/ArmsAnalysis'
import { DrugsAnalysis } from './components/DrugsAnalysis'
import { TeamsAnalysis } from './components/TeamsAnalysis'
import { ImportAudit } from './components/ImportAudit'
import { LegacyLayout } from './components/LegacyLayout'
import { ConsolidatedTable } from './components/ConsolidatedTable'
import { MunicipalityOverview } from './components/MunicipalityOverview'
import { ProfilePanel } from './components/ProfilePanel'
import { LocalAssistant } from './components/LocalAssistant'
import { CadImport } from './components/CadImport'
import { StorageStatus } from './components/StorageStatus'
import { CriminalOverview } from './components/CriminalOverview'
import { Ranking } from './components/Ranking'
import { IndicatorCard, IndicatorSection, IndicatorUpdateContext, IndicatorVariationContext } from './components/IndicatorNavigation'
import { getBatches, getComparisonDataset, getSummary, upload, validateUpload, type Source } from './services/api'
import { currentYear, periodEndForYear } from './services/period-default'
import { clearSession, getMe, getSessionToken, logout, saveSession } from './services/auth'
import { getHealth } from './services/health'
import './style.css'
import './source-table.css'
import './progress.css'
import './legacy-charts.css'
import './indicator-navigation.css'
import './criminal-overview.css'

const labels: Record<Source, string> = {
  mvi_cad: 'MVI CAD', mvi_neac: 'MVI NEAC', ocorrencias: 'Ocorrências',
  armas: 'Armas', drogas: 'Drogas', guarnicoes: 'Guarnições',
}
const sources: Source[] = ['mvi_cad', 'mvi_neac', 'ocorrencias', 'armas', 'drogas', 'guarnicoes']
const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const queryClient = new QueryClient()
const MonthlyChart = lazy(() => import('./components/MonthlyChart').then(module => ({ default: module.MonthlyChart })))
const SummaryReport = lazy(() => import('./components/SummaryReport').then(module => ({ default: module.SummaryReport })))
const SpecializedReport = lazy(() => import('./components/SpecializedReport').then(module => ({ default: module.SpecializedReport })))
const ReportCenter = lazy(() => import('./components/ReportCenter').then(module => ({ default: module.ReportCenter })))

function App() {
  const [source, setSource] = useState<Source>('mvi_cad')
  const [scope, setScope] = useState<'partial' | 'complete'>('partial')
  const [file, setFile] = useState<File | null>(null)
  const [validatedFile, setValidatedFile] = useState('')
  const [year, setYear] = useState(() => String(currentYear()))
  const [municipality, setMunicipality] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportCenterOpen, setReportCenterOpen] = useState(false)
  const [specializedReport, setSpecializedReport] = useState<SpecializedReportRequest | null>(null)
  const [batchPage, setBatchPage] = useState(1)
  const [activeSource, setActiveSource] = useState<'mvi_cad' | 'mvi_neac'>('mvi_cad')
  const navigateToIndicator = useCallback((target: string) => {
    if (target === 'mvi-cad') setActiveSource('mvi_cad')
    if (target === 'mvi-neac') setActiveSource('mvi_neac')
    if (target === 'relatorios') setReportCenterOpen(true)
  }, [])
  const [token, setToken] = useState(getSessionToken)
  const health = useQuery({ queryKey: ['health'], queryFn: () => getHealth(apiUrl), retry: 1 })
  const demo = health.data?.mode === 'demo'
  const auth = useQuery({ queryKey: ['auth-me', token], queryFn: () => getMe(token),
    enabled: ['local', 'online'].includes(health.data?.mode || '') && !!token, retry: false })
  const canRead = demo || auth.isSuccess
  const canImport = !demo && !isCloud && auth.data?.role !== 'viewer'
  const [cloudError, setCloudError] = useState('')
  useEffect(() => {
    if (!isCloud || !canRead) return
    const update = () => { void queryClient.invalidateQueries() }
    window.addEventListener('gtb-cloud-updated', update)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshCloud().then(() => setCloudError('')).catch(error => setCloudError(error instanceof Error ? error.message : 'Falha ao atualizar a consulta online.'))
    }, 60000)
    return () => { clearInterval(timer); window.removeEventListener('gtb-cloud-updated', update) }
  }, [canRead])
  const summary = useQuery({ queryKey: ['summary', token, year, municipality], queryFn: () => getSummary(year ? Number(year) : undefined, municipality || undefined), enabled: health.isSuccess && canRead })
  const comparisons = useQuery({ queryKey: ['comparison-dataset'], queryFn: getComparisonDataset, enabled: health.isSuccess && canRead, staleTime: 60000 })
  const batches = useQuery({ queryKey: ['batches', token, batchPage], queryFn: () => getBatches(batchPage), enabled: health.isSuccess && canRead })
  useEffect(() => {
    const expired = () => { clearSession(); setToken(''); queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'health' }) }
    window.addEventListener('gtb-session-expired', expired)
    return () => window.removeEventListener('gtb-session-expired', expired)
  }, [])
  const importer = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Selecione um arquivo CSV, XLS ou XLSX.')
      return upload(source, file, scope)
    },
    onSuccess: async () => {
      const affected = new Set(['comparison-dataset', 'report-dataset', 'summary', 'crime-analysis', 'batches', 'batch-audit',
        'records', 'tco-analysis', 'domestic-analysis', 'arms-analysis', 'drugs-analysis', 'teams-analysis',
        'mvi-analysis', 'mvi-comparison', 'mvi-detail', 'mvi-versions', 'operational-analysis'])
      // Não aceitar uma resposta iniciada antes do commit da importação.
      await queryClient.cancelQueries({ predicate: query => affected.has(String(query.queryKey[0])) })
      setValidatedFile(''); setBatchPage(1)
      await queryClient.invalidateQueries({ predicate: query => affected.has(String(query.queryKey[0])) })
    },
  })
  const validator = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Selecione um arquivo CSV, XLS ou XLSX.')
      return validateUpload(source, file)
    },
    onSuccess: data => setValidatedFile(`${data.source}:${data.sha256}`),
  })
  const validationReady = !!validator.data && validatedFile === `${source}:${validator.data.sha256}`

  if (health.data?.mode === 'setup' || (['local', 'online'].includes(health.data?.mode || '') && (!token || auth.isError)))
    return <LoginScreen setup={health.data?.mode === 'setup'} onLogin={value => { saveSession(value); setToken(value); void queryClient.invalidateQueries({ queryKey: ['health'] }) }} />
  if (['local', 'online'].includes(health.data?.mode || '') && auth.isPending)
    return <main className="shell"><p className="empty">Validando sessão local…</p></main>

  return <LegacyLayout onNavigate={navigateToIndicator} version={health.data?.version || '0.1.81'} demo={demo} username={auth.data?.username} onLogout={() => { void logout(token).finally(() => { clearSession(); setToken(''); queryClient.removeQueries({ predicate: query => query.queryKey[0] !== 'health' }) }) }}><main className="shell">
    <CriminalOverview summary={summary.data} year={year} municipality={municipality} loading={summary.isFetching} serviceAvailable={health.isSuccess && !summary.isError} demo={!!demo} cloud={isCloud} />
    {isCloud && <section className="notice" aria-label="Atualização online"><p>Última sincronização: {cloudInfo().syncedAt ? new Date(cloudInfo().syncedAt!).toLocaleString('pt-BR') : 'aguardando dados'} · Versão dos dados: {cloudInfo().version || '—'}</p><button type="button" onClick={() => { void refreshCloud().then(() => { setCloudError(''); void queryClient.invalidateQueries() }).catch(error => setCloudError(error instanceof Error ? error.message : 'Falha ao atualizar.')) }}>Atualizar consulta</button>{(cloudError || summary.isError) && <p className="error" role="alert">{cloudError || summary.error?.message}</p>}</section>}
    {demo && <nav className="quick-nav" aria-label="Explorar demonstração"><a href="#andamento">Andamento</a><a href="#indicadores">Indicadores</a><a href="#mvi">MVI por fonte</a><a href="#operacoes">Outros indicadores</a><a href="#importacoes">Importações sintéticas</a></nav>}
    {demo && <div className="demo-banner" role="status"><strong>Demonstração isolada</strong><span>Os números abaixo vêm apenas de planilhas fictícias. A importação está bloqueada nesta prévia.</span></div>}
    <details id="andamento" className="release-details"><summary>Sobre esta versão e andamento da validação</summary><ProjectProgress /></details>
    <section className="filters" aria-label="Filtros de indicadores"><label>Ano<input type="number" min="1900" max="2100" placeholder="Todos" value={year} onChange={event => setYear(event.target.value)} /></label><label>Município<input type="search" placeholder="Todos os municípios" value={municipality} onChange={event => setMunicipality(event.target.value)} /></label><output className="period-cutoff">{periodEndForYear(summary.data, year) ? `Até ${periodEndForYear(summary.data, year)!.split('-').reverse().join('/')} · última importação` : year === String(currentYear()) ? 'Sem importação no ano atual' : 'Período anual selecionado'}</output><button type="button" onClick={() => { setYear(String(currentYear())); setMunicipality('') }}>Restaurar padrão</button><button type="button" className="primary" onClick={() => { setSpecializedReport(null); setReportOpen(true) }}>Ver relatório</button></section>
    <IndicatorVariationContext.Provider value={{ summary: summary.data, dataset: comparisons.data, year: Number(year), municipality }}><IndicatorUpdateContext.Provider value={summary.data}><section id="indicadores" className="metrics five" aria-label="Indicadores"><IndicatorCard target="ocorrencias" label="Ocorrências"><span>Ocorrências</span><strong>{summary.data?.occurrences ?? '—'}</strong><small>Base geral · 10º BPM</small></IndicatorCard><IndicatorCard target="armas" label="Armas"><span>{summary.data?.source_coverage?.armas ? 'Armas apreendidas' : 'Armas · base geral'}</span><strong>{summary.data ? (summary.data.source_coverage?.armas ? summary.data.seized_arms : summary.data.general_arm_occurrences) ?? '—' : '—'}</strong><small>{summary.data?.source_coverage?.armas ? 'Unidades · base de armas' : 'Ocorrências com menção · sem base de armas'}</small></IndicatorCard><IndicatorCard target="drogas" label="Drogas"><span>{summary.data?.source_coverage?.drogas ? 'Drogas' : 'Drogas · base geral'}</span><strong>{summary.data ? (summary.data.source_coverage?.drogas ? summary.data.by_source.drogas : summary.data.general_drug_occurrences) ?? '—' : '—'}</strong><small>{summary.data?.source_coverage?.drogas ? 'Registros · base de drogas' : 'Ocorrências com menção · sem base de drogas'}</small></IndicatorCard><IndicatorCard target="drogas" label="Peso de drogas"><span>Peso de drogas</span><strong>{summary.data?.source_coverage?.drogas ? ((summary.data.drug_weight_grams || 0) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '—'}</strong><small>kg · somente unidades reconhecidas</small></IndicatorCard><IndicatorCard target="mvi-cad" label="MVI CAD"><span>MVI CAD</span><strong>{summary.data?.mvi_cad ?? '—'}</strong><small>Vítimas · fonte CAD</small></IndicatorCard><IndicatorCard target="mvi-neac" label="MVI NEAC"><span>MVI NEAC</span><strong>{summary.data?.mvi_neac ?? '—'}</strong><small>Vítimas · fonte NEAC</small></IndicatorCard><IndicatorCard target="cvp" label="CVP"><span>CVP</span><strong>{summary.data?.cvp ?? '—'}</strong><small>Ocorrências de roubo</small></IndicatorCard><IndicatorCard target="tentativas" label="Tentativas de homicídio"><span>Tentativas</span><strong>{summary.data?.tentativas ?? '—'}</strong><small>Ocorrências de homicídio tentado</small></IndicatorCard><IndicatorCard target="tco" label="TCO"><span>TCO</span><strong>{summary.data?.tco ?? '—'}</strong><small>Termos elaborados pela PM</small></IndicatorCard><IndicatorCard target="mandados" label="Mandados"><span>Mandados</span><strong>{summary.data?.mandados ?? '—'}</strong><small>Cumprimentos reconhecidos</small></IndicatorCard><IndicatorCard target="visitas" label="Visitas"><span>Visitas</span><strong>{summary.data?.visitas ?? '—'}</strong><small>Orientativas e preventivas</small></IndicatorCard><IndicatorCard target="sossego" label="Sossego"><span>Sossego</span><strong>{summary.data?.sossego ?? '—'}</strong><small>Perturbação reconhecida</small></IndicatorCard><IndicatorCard target="domestica" label="Violência doméstica"><span>Doméstica</span><strong>{summary.data?.domestica ?? '—'}</strong><small>Casos reconhecidos para revisão</small></IndicatorCard></section></IndicatorUpdateContext.Provider></IndicatorVariationContext.Provider>
    <p className="muted">Dashboard criminal: ano {year || 'todos os anos'} · {municipality || '11 municípios do 10º BPM'}. CAD e NEAC são contados separadamente. Fiscalização isolada de medida protetiva permanece na auditoria e não entra nas ocorrências do painel.</p>
    <div className="source-coverage" aria-label="Disponibilidade das bases">{sources.map(item => <span key={item}>{labels[item]}: {summary.data?.source_coverage?.[item] ? `${summary.data.source_coverage[item].toLocaleString('pt-BR')} registros importados` : 'sem base importada'}</span>)}</div>
    <IndicatorSection id="ocorrencias"><IndicatorComparisons id="ocorrencias" year={year ? Number(year) : undefined} municipality={municipality || undefined} lastImportedAt={summary.data?.last_imported_at} />{summary.data?.occurrence_charts && <section className="panel"><div className="section-head"><h2>Ocorrências · gráficos do painel geral</h2><span>Mesmo recorte dos cartões</span></div><div className="analysis-grid"><Ranking title="Evolução mensal de ocorrências" items={summary.data.occurrence_charts.monthly} /><Ranking title="Ocorrências por município" items={summary.data.occurrence_charts.cities} /><Ranking title="Ocorrências por natureza" items={summary.data.occurrence_charts.natures} /></div></section>}</IndicatorSection>
    {summary.isError && <p className="error" role="alert">Não foi possível consultar os indicadores.</p>}
    {reportOpen && <Suspense fallback={<p role="status">Carregando relatório…</p>}><SummaryReport summary={summary.data} year={year ? Number(year) : undefined} municipality={municipality || undefined} onClose={() => setReportOpen(false)} /></Suspense>}
    {specializedReport && <Suspense fallback={<p role="status">Carregando relatório…</p>}><SpecializedReport request={specializedReport} onClose={() => setSpecializedReport(null)} /></Suspense>}
    <section className="panel"><div className="section-head"><div><p className="eyebrow">Evolução mensal</p><h2>MVI por fonte</h2></div><span>CAD e NEAC permanecem independentes</span></div><Suspense fallback={<p className="empty">Carregando gráfico…</p>}><MonthlyChart monthly={summary.data?.monthly || {}} /></Suspense></section>
    <div id="mvi" className="section-anchor" /><IndicatorSection id={activeSource === 'mvi_cad' ? 'mvi-cad' : 'mvi-neac'}><IndicatorComparisons id={activeSource === 'mvi_cad' ? 'mvi-cad' : 'mvi-neac'} year={year ? Number(year) : undefined} municipality={municipality || undefined} lastImportedAt={summary.data?.last_imported_at} /><section className="panel"><div className="section-head"><div><p className="eyebrow">Relação individual</p><h2>Vítimas elegíveis</h2></div></div><div className="tabs" role="tablist" aria-label="Fonte MVI"><button type="button" role="tab" aria-selected={activeSource === 'mvi_cad'} onClick={() => setActiveSource('mvi_cad')}>MVI CAD</button><button type="button" role="tab" aria-selected={activeSource === 'mvi_neac'} onClick={() => setActiveSource('mvi_neac')}>MVI NEAC</button></div><SourceTable source="mvi_cad" active={activeSource === 'mvi_cad'} /><SourceTable source="mvi_neac" active={activeSource === 'mvi_neac'} /></section>
    <MviAnalysis source={activeSource} year={year ? Number(year) : undefined} municipality={municipality || undefined} />
    <MviComparison year={year ? Number(year) : undefined} municipality={municipality || undefined} /></IndicatorSection>
    <IndicatorSection id="cvp"><IndicatorComparisons id="cvp" year={year ? Number(year) : undefined} municipality={municipality || undefined} lastImportedAt={summary.data?.last_imported_at} /><CvpAnalysis summary={summary.data} year={year ? Number(year) : undefined} municipality={municipality || undefined} /></IndicatorSection>
    <IndicatorSection id="tentativas"><IndicatorComparisons id="tentativas" year={year ? Number(year) : undefined} municipality={municipality || undefined} lastImportedAt={summary.data?.last_imported_at} /><AttemptAnalysis year={year ? Number(year) : undefined} municipality={municipality || undefined} /></IndicatorSection>
    <IndicatorSection id="tco"><IndicatorComparisons id="tco" year={year ? Number(year) : undefined} municipality={municipality || undefined} lastImportedAt={summary.data?.last_imported_at} /><TcoAnalysis year={year ? Number(year) : undefined} municipality={municipality || undefined} /></IndicatorSection>
    <div id="operacoes" className="section-anchor" />
    <IndicatorSection id="mandados"><IndicatorComparisons id="mandados" year={year ? Number(year) : undefined} municipality={municipality || undefined} lastImportedAt={summary.data?.last_imported_at} /><OperationalAnalysis kind="Mandados" year={year ? Number(year) : undefined} municipality={municipality || undefined} /></IndicatorSection>
    <IndicatorSection id="visitas"><IndicatorComparisons id="visitas" year={year ? Number(year) : undefined} municipality={municipality || undefined} lastImportedAt={summary.data?.last_imported_at} /><OperationalAnalysis kind="Visitas" year={year ? Number(year) : undefined} municipality={municipality || undefined} /></IndicatorSection>
    <IndicatorSection id="sossego"><IndicatorComparisons id="sossego" year={year ? Number(year) : undefined} municipality={municipality || undefined} lastImportedAt={summary.data?.last_imported_at} /><OperationalAnalysis kind="Sossego" year={year ? Number(year) : undefined} municipality={municipality || undefined} /></IndicatorSection>
    <IndicatorSection id="domestica"><IndicatorComparisons id="domestica" year={year ? Number(year) : undefined} municipality={municipality || undefined} lastImportedAt={summary.data?.last_imported_at} /><DomesticAnalysis year={year ? Number(year) : undefined} municipality={municipality || undefined} /></IndicatorSection>
    <IndicatorSection id="armas"><IndicatorComparisons id="armas" year={year ? Number(year) : undefined} municipality={municipality || undefined} lastImportedAt={summary.data?.last_imported_at} /><ArmsAnalysis year={year ? Number(year) : undefined} municipality={municipality || undefined} onReport={request => { setReportOpen(false); setSpecializedReport(request) }} /></IndicatorSection>
    <IndicatorSection id="drogas"><IndicatorComparisons id="drogas" year={year ? Number(year) : undefined} municipality={municipality || undefined} lastImportedAt={summary.data?.last_imported_at} /><DrugsAnalysis year={year ? Number(year) : undefined} municipality={municipality || undefined} onReport={request => { setReportOpen(false); setSpecializedReport(request) }} /></IndicatorSection>
    <IndicatorSection id="guarnicoes"><IndicatorComparisons id="guarnicoes" year={year ? Number(year) : undefined} municipality={municipality || undefined} lastImportedAt={summary.data?.last_imported_at} /><TeamsAnalysis year={year ? Number(year) : undefined} municipality={municipality || undefined} onReport={request => { setReportOpen(false); setSpecializedReport(request) }} /></IndicatorSection>
    <div id="relatorios">{reportCenterOpen ? <Suspense fallback={<section className="panel" role="status">Carregando a Central de Relatórios…</section>}><ReportCenter year={year ? Number(year) : undefined} municipality={municipality || undefined} version={health.data?.version || '0.1.81'} allowed={!!demo || auth.data?.role === 'admin'} /></Suspense> : <section className="panel"><div className="section-head"><div><p className="eyebrow">Documentos e apresentações</p><h2>Central de Relatórios</h2></div></div><p className="muted">Os dados serão carregados somente quando você escolher um relatório para gerar.</p><button type="button" onClick={() => setReportCenterOpen(true)}>Abrir relatórios</button></section>}</div>
    <div id="municipios"><MunicipalityOverview year={year ? Number(year) : undefined} /></div>
    <div id="tabela-geral"><ConsolidatedTable year={year ? Number(year) : undefined} municipality={municipality || undefined} /></div>
    <div id="assistente-local"><LocalAssistant summary={summary.data} year={year ? Number(year) : undefined} municipality={municipality || undefined} /></div>
    <div id="importacoes" className="section-anchor" />
    <div className="two-col"><section className="panel"><div className="section-head"><div><p className="eyebrow">Entrada de dados</p><h2>{isCloud ? 'Importe pelo sistema local' : demo ? 'Importação desativada na prévia' : auth.data?.role === 'viewer' ? 'Importação restrita ao perfil de consulta' : 'Importar base real'}</h2></div></div><p className="muted">A planilha é pré-validada antes da gravação. O arquivo bruto, o histórico e o backup automático anterior ao lote ficam somente neste computador, fora do Git e das prévias online.</p><form onSubmit={event => { event.preventDefault(); if (canImport && validationReady) importer.mutate() }}><label>Fonte<select value={source} onChange={event => { setSource(event.target.value as Source); setValidatedFile(''); validator.reset(); importer.reset() }}>{sources.map(item => <option key={item} value={item}>{labels[item]}</option>)}</select></label><label>Escopo<select value={scope} onChange={event => setScope(event.target.value as 'partial' | 'complete')}><option value="partial">Parcial — acrescenta e atualiza</option><option value="complete">Completo — também aponta ausências para revisão</option></select></label><label>Arquivo CSV, XLS ou XLSX<input type="file" accept=".csv,.xls,.xlsx" onChange={event => { setFile(event.target.files?.[0] || null); setValidatedFile(''); validator.reset(); importer.reset() }} required /></label><div className="import-actions"><button type="button" onClick={() => validator.mutate()} disabled={!canImport || !file || validator.isPending || importer.isPending || !health.isSuccess}>{validator.isPending ? 'Validando…' : '1. Pré-validar arquivo'}</button><button type="submit" className="primary" disabled={!canImport || !validationReady || importer.isPending || !health.isSuccess}>{importer.isPending ? 'Importando…' : '2. Importar base validada'}</button></div></form>{validator.isError && <p className="error" role="alert">{validator.error.message}</p>}{validator.data && <div className={validator.data.quarantined ? 'validation-result warning' : 'validation-result success'} role="status"><strong>{validationReady ? 'Arquivo pronto para importação' : 'Validação expirada; valide novamente'}</strong><span>{validator.data.row_count.toLocaleString('pt-BR')} linhas lidas · {validator.data.accepted.toLocaleString('pt-BR')} aceitas · {validator.data.quarantined.toLocaleString('pt-BR')} em quarentena · {validator.data.ineligible.toLocaleString('pt-BR')} fora da regra do indicador</span>{validator.data.reasons.slice(0, 4).map(item => <small key={item.reason}>{item.count.toLocaleString('pt-BR')} × {item.reason}</small>)}</div>}{importer.isError && <p className="error" role="alert">{importer.error.message}</p>}{importer.data && <p className="success" role="status">{importer.data.repeated ? 'Arquivo já importado.' : `Lote concluído: ${importer.data.inserted} novos, ${importer.data.updated} atualizados, ${importer.data.quarantined} em quarentena.`}</p>}</section><ImportAudit batches={batches.data?.items || []} total={batches.data?.total || 0} page={batchPage} size={batches.data?.size || 20} loading={batches.isPending} onPageChange={setBatchPage} /></div>
    {canImport && <CadImport onComplete={() => { setBatchPage(1); void queryClient.invalidateQueries() }} />}
    {auth.data && <div id="perfil"><ProfilePanel user={auth.data} /></div>}
    <div id="online-sync">{auth.data?.role === 'admin' && <OnlineSync />}</div>
    <div id="usuarios">{auth.data?.role === 'admin' && <UserManagement token={token} />}</div>
    <div id="armazenamento"><StorageStatus /></div>
    {!!batches.data?.items.some(batch => batch.differences > 0) && <p className="notice" role="status">Há registros ausentes em arquivo completo nesta página. Abra “Conferir lote” na auditoria para revisar; nenhum registro foi apagado.</p>}
    <footer>{isCloud ? 'Consulta protegida · atualização automática após sincronização local · Firebase gratuito.' : demo ? 'Demonstração com dados sintéticos.' : 'Execução local · backup automático por lote · sincronização configurável na administração.'}</footer>
  </main></LegacyLayout>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></React.StrictMode>)
