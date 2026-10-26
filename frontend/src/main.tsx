import React, { lazy, Suspense, useEffect, useState } from 'react'
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
import { SummaryReport } from './components/SummaryReport'
import { SpecializedReport, type SpecializedReportRequest } from './components/SpecializedReport'
import { LoginScreen } from './components/LoginScreen'
import { UserManagement } from './components/UserManagement'
import { ArmsAnalysis } from './components/ArmsAnalysis'
import { DrugsAnalysis } from './components/DrugsAnalysis'
import { TeamsAnalysis } from './components/TeamsAnalysis'
import { ImportAudit } from './components/ImportAudit'
import { LegacyLayout } from './components/LegacyLayout'
import { ConsolidatedTable } from './components/ConsolidatedTable'
import { MunicipalityOverview } from './components/MunicipalityOverview'
import { ProfilePanel } from './components/ProfilePanel'
import { LocalAssistant } from './components/LocalAssistant'
import { StorageStatus } from './components/StorageStatus'
import { getBatches, getSummary, upload, validateUpload, type Source } from './services/api'
import { clearSession, getMe, getSessionToken, logout, saveSession } from './services/auth'
import { getHealth } from './services/health'
import './style.css'
import './source-table.css'
import './progress.css'

const labels: Record<Source, string> = {
  mvi_cad: 'MVI CAD', mvi_neac: 'MVI NEAC', ocorrencias: 'Ocorrências',
  armas: 'Armas', drogas: 'Drogas', guarnicoes: 'Guarnições',
}
const sources: Source[] = ['mvi_cad', 'mvi_neac', 'ocorrencias', 'armas', 'drogas', 'guarnicoes']
const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const queryClient = new QueryClient()
const MonthlyChart = lazy(() => import('./components/MonthlyChart').then(module => ({ default: module.MonthlyChart })))

function App() {
  const [source, setSource] = useState<Source>('mvi_cad')
  const [scope, setScope] = useState<'partial' | 'complete'>('partial')
  const [file, setFile] = useState<File | null>(null)
  const [validatedFile, setValidatedFile] = useState('')
  const [year, setYear] = useState('')
  const [municipality, setMunicipality] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [specializedReport, setSpecializedReport] = useState<SpecializedReportRequest | null>(null)
  const [batchPage, setBatchPage] = useState(1)
  const [activeSource, setActiveSource] = useState<'mvi_cad' | 'mvi_neac'>('mvi_cad')
  const [token, setToken] = useState(getSessionToken)
  const health = useQuery({ queryKey: ['health'], queryFn: () => getHealth(apiUrl), retry: 1 })
  const demo = health.data?.mode === 'demo'
  const auth = useQuery({ queryKey: ['auth-me', token], queryFn: () => getMe(token),
    enabled: health.data?.mode === 'local' && !!token, retry: false })
  const canRead = demo || auth.isSuccess
  const canImport = !demo && auth.data?.role !== 'viewer'
  const summary = useQuery({ queryKey: ['summary', year, municipality], queryFn: () => getSummary(year ? Number(year) : undefined, municipality || undefined), enabled: health.isSuccess && canRead })
  const batches = useQuery({ queryKey: ['batches', batchPage], queryFn: () => getBatches(batchPage), enabled: health.isSuccess && canRead })
  useEffect(() => {
    const expired = () => { clearSession(); setToken(''); queryClient.clear() }
    window.addEventListener('gtb-session-expired', expired)
    return () => window.removeEventListener('gtb-session-expired', expired)
  }, [])
  const importer = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Selecione um arquivo CSV, XLS ou XLSX.')
      return upload(source, file, scope)
    },
    onSuccess: () => { setValidatedFile(''); setBatchPage(1); void queryClient.invalidateQueries({ queryKey: ['summary'] }); void queryClient.invalidateQueries({ queryKey: ['batches'] }); void queryClient.invalidateQueries({ queryKey: ['batch-audit'] }); void queryClient.invalidateQueries({ queryKey: ['records'] }); void queryClient.invalidateQueries({ queryKey: ['tco-analysis'] }); void queryClient.invalidateQueries({ queryKey: ['domestic-analysis'] }); void queryClient.invalidateQueries({ queryKey: ['arms-analysis'] }); void queryClient.invalidateQueries({ queryKey: ['drugs-analysis'] }); void queryClient.invalidateQueries({ queryKey: ['teams-analysis'] }); void queryClient.invalidateQueries({ queryKey: ['mvi-analysis'] }); void queryClient.invalidateQueries({ queryKey: ['mvi-comparison'] }); void queryClient.invalidateQueries({ queryKey: ['mvi-detail'] }); void queryClient.invalidateQueries({ queryKey: ['mvi-versions'] }); void queryClient.invalidateQueries({ queryKey: ['operational-analysis'] }) },
  })
  const validator = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Selecione um arquivo CSV, XLS ou XLSX.')
      return validateUpload(source, file)
    },
    onSuccess: data => setValidatedFile(`${data.source}:${data.sha256}`),
  })
  const validationReady = !!validator.data && validatedFile === `${source}:${validator.data.sha256}`

  if (health.data?.mode === 'setup' || (health.data?.mode === 'local' && (!token || auth.isError)))
    return <LoginScreen setup={health.data?.mode === 'setup'} onLogin={value => { saveSession(value); setToken(value); void queryClient.invalidateQueries({ queryKey: ['health'] }) }} />
  if (health.data?.mode === 'local' && auth.isPending)
    return <main className="shell"><p className="empty">Validando sessão local…</p></main>

  return <LegacyLayout version={health.data?.version || '0.1.54'} demo={demo} username={auth.data?.username} onLogout={() => { void logout(token).finally(() => { clearSession(); setToken(''); queryClient.clear() }) }}><main className="shell">
    <section className="hero"><div><p className="eyebrow">{demo ? 'Prévia com dados sintéticos' : 'Ambiente local para bases reais'}</p><h1>Dados separados. Resultados auditáveis.</h1><p>{demo ? 'Explore indicadores, casos e histórico com exemplos fictícios. Esta demonstração é somente para consulta e não recebe arquivos.' : 'Valide e importe bases reais somente neste computador, confira o histórico de alterações e compare CAD e NEAC sem combinar as fontes. O sistema anterior continua em produção.'}</p></div><div className="status" role="status"><span className={health.isSuccess ? 'dot active' : 'dot'} />{health.isPending ? 'Verificando API…' : health.isError ? 'API local indisponível' : 'API local ativa'}</div></section>
    {demo && <nav className="quick-nav" aria-label="Explorar demonstração"><a href="#andamento">Andamento</a><a href="#indicadores">Indicadores</a><a href="#mvi">MVI por fonte</a><a href="#operacoes">Outros indicadores</a><a href="#importacoes">Importações sintéticas</a></nav>}
    {demo && <div className="demo-banner" role="status"><strong>Demonstração isolada</strong><span>Os números abaixo vêm apenas de planilhas fictícias. A importação está bloqueada nesta prévia.</span></div>}
    <div className="notice">Indicadores provisórios: regras extraídas do legado. A paridade ainda precisa ser conferida com amostras anonimizadas e números oficiais.</div>
    <div id="andamento"><ProjectProgress /></div>
    <section className="filters" aria-label="Filtros de indicadores"><label>Ano<input type="number" min="1900" max="2100" placeholder="Todos" value={year} onChange={event => setYear(event.target.value)} /></label><label>Município<input type="search" placeholder="Todos os municípios" value={municipality} onChange={event => setMunicipality(event.target.value)} /></label><button type="button" onClick={() => { setYear(''); setMunicipality('') }}>Limpar filtros</button><button type="button" className="primary" onClick={() => { setSpecializedReport(null); setReportOpen(true) }}>Ver relatório</button></section>
    <section id="indicadores" className="metrics five" aria-label="Indicadores"><article><span>MVI CAD</span><strong>{summary.data?.mvi_cad ?? '—'}</strong><small>Vítimas · fonte CAD</small></article><article><span>MVI NEAC</span><strong>{summary.data?.mvi_neac ?? '—'}</strong><small>Vítimas · fonte NEAC</small></article><article><span>CVP</span><strong>{summary.data?.cvp ?? '—'}</strong><small>Ocorrências de roubo</small></article><article><span>Tentativas</span><strong>{summary.data?.tentativas ?? '—'}</strong><small>Ocorrências de homicídio tentado</small></article><article><span>TCO</span><strong>{summary.data?.tco ?? '—'}</strong><small>Termos elaborados pela PM</small></article><article><span>Mandados</span><strong>{summary.data?.mandados ?? '—'}</strong><small>Cumprimentos reconhecidos</small></article><article><span>Visitas</span><strong>{summary.data?.visitas ?? '—'}</strong><small>Orientativas e preventivas</small></article><article><span>Sossego</span><strong>{summary.data?.sossego ?? '—'}</strong><small>Perturbação reconhecida</small></article><article><span>Doméstica</span><strong>{summary.data?.domestica ?? '—'}</strong><small>Casos reconhecidos para revisão</small></article></section>
    {summary.isError && <p className="error" role="alert">Não foi possível consultar os indicadores.</p>}
    {reportOpen && <SummaryReport summary={summary.data} year={year ? Number(year) : undefined} municipality={municipality || undefined} onClose={() => setReportOpen(false)} />}
    {specializedReport && <SpecializedReport request={specializedReport} onClose={() => setSpecializedReport(null)} />}
    <section className="panel"><div className="section-head"><div><p className="eyebrow">Evolução mensal</p><h2>MVI por fonte</h2></div><span>CAD e NEAC permanecem independentes</span></div><Suspense fallback={<p className="empty">Carregando gráfico…</p>}><MonthlyChart monthly={summary.data?.monthly || {}} /></Suspense></section>
    <section className="panel"><div className="section-head"><div><p className="eyebrow">Relação individual</p><h2>Vítimas elegíveis</h2></div></div><div className="tabs" role="tablist" aria-label="Fonte MVI"><button type="button" role="tab" aria-selected={activeSource === 'mvi_cad'} onClick={() => setActiveSource('mvi_cad')}>MVI CAD</button><button type="button" role="tab" aria-selected={activeSource === 'mvi_neac'} onClick={() => setActiveSource('mvi_neac')}>MVI NEAC</button></div><SourceTable source="mvi_cad" active={activeSource === 'mvi_cad'} /><SourceTable source="mvi_neac" active={activeSource === 'mvi_neac'} /></section>
    <div id="mvi" className="section-anchor" />
    <MviAnalysis source={activeSource} year={year ? Number(year) : undefined} municipality={municipality || undefined} />
    <MviComparison year={year ? Number(year) : undefined} municipality={municipality || undefined} />
    <div id="cvp"><CvpAnalysis summary={summary.data} year={year ? Number(year) : undefined} municipality={municipality || undefined} /></div>
    <div id="tentativas"><AttemptAnalysis year={year ? Number(year) : undefined} municipality={municipality || undefined} /></div>
    <div id="tco"><TcoAnalysis year={year ? Number(year) : undefined} municipality={municipality || undefined} /></div>
    <div id="operacoes" className="section-anchor" />
    <div id="mandados"><OperationalAnalysis kind="Mandados" year={year ? Number(year) : undefined} municipality={municipality || undefined} /></div>
    <div id="visitas"><OperationalAnalysis kind="Visitas" year={year ? Number(year) : undefined} municipality={municipality || undefined} /></div>
    <div id="sossego"><OperationalAnalysis kind="Sossego" year={year ? Number(year) : undefined} municipality={municipality || undefined} /></div>
    <div id="domestica"><DomesticAnalysis year={year ? Number(year) : undefined} municipality={municipality || undefined} /></div>
    <div id="armas"><ArmsAnalysis year={year ? Number(year) : undefined} municipality={municipality || undefined} onReport={request => { setReportOpen(false); setSpecializedReport(request) }} /></div>
    <div id="drogas"><DrugsAnalysis year={year ? Number(year) : undefined} municipality={municipality || undefined} onReport={request => { setReportOpen(false); setSpecializedReport(request) }} /></div>
    <div id="guarnicoes"><TeamsAnalysis year={year ? Number(year) : undefined} municipality={municipality || undefined} onReport={request => { setReportOpen(false); setSpecializedReport(request) }} /></div>
    <div id="municipios"><MunicipalityOverview year={year ? Number(year) : undefined} /></div>
    <div id="tabela-geral"><ConsolidatedTable year={year ? Number(year) : undefined} municipality={municipality || undefined} /></div>
    <div id="assistente-local"><LocalAssistant summary={summary.data} year={year ? Number(year) : undefined} municipality={municipality || undefined} /></div>
    <div id="importacoes" className="section-anchor" />
    <div className="two-col"><section className="panel"><div className="section-head"><div><p className="eyebrow">Entrada de dados</p><h2>{demo ? 'Importação desativada na prévia' : auth.data?.role === 'viewer' ? 'Importação restrita ao perfil de consulta' : 'Importar base real'}</h2></div></div><p className="muted">A planilha é pré-validada antes da gravação. O arquivo bruto, o histórico e o backup automático anterior ao lote ficam somente neste computador, fora do Git e das prévias online.</p><form onSubmit={event => { event.preventDefault(); if (canImport && validationReady) importer.mutate() }}><label>Fonte<select value={source} onChange={event => { setSource(event.target.value as Source); setValidatedFile(''); validator.reset(); importer.reset() }}>{sources.map(item => <option key={item} value={item}>{labels[item]}</option>)}</select></label><label>Escopo<select value={scope} onChange={event => setScope(event.target.value as 'partial' | 'complete')}><option value="partial">Parcial — acrescenta e atualiza</option><option value="complete">Completo — também aponta ausências para revisão</option></select></label><label>Arquivo CSV, XLS ou XLSX<input type="file" accept=".csv,.xls,.xlsx" onChange={event => { setFile(event.target.files?.[0] || null); setValidatedFile(''); validator.reset(); importer.reset() }} required /></label><div className="import-actions"><button type="button" onClick={() => validator.mutate()} disabled={!canImport || !file || validator.isPending || importer.isPending || !health.isSuccess}>{validator.isPending ? 'Validando…' : '1. Pré-validar arquivo'}</button><button type="submit" className="primary" disabled={!canImport || !validationReady || importer.isPending || !health.isSuccess}>{importer.isPending ? 'Importando…' : '2. Importar base validada'}</button></div></form>{validator.isError && <p className="error" role="alert">{validator.error.message}</p>}{validator.data && <div className={validator.data.quarantined ? 'validation-result warning' : 'validation-result success'} role="status"><strong>{validationReady ? 'Arquivo pronto para importação' : 'Validação expirada; valide novamente'}</strong><span>{validator.data.row_count.toLocaleString('pt-BR')} linhas lidas · {validator.data.accepted.toLocaleString('pt-BR')} aceitas · {validator.data.quarantined.toLocaleString('pt-BR')} em quarentena · {validator.data.ineligible.toLocaleString('pt-BR')} fora da regra do indicador</span>{validator.data.reasons.slice(0, 4).map(item => <small key={item.reason}>{item.count.toLocaleString('pt-BR')} × {item.reason}</small>)}</div>}{importer.isError && <p className="error" role="alert">{importer.error.message}</p>}{importer.data && <p className="success" role="status">{importer.data.repeated ? 'Arquivo já importado.' : `Lote concluído: ${importer.data.inserted} novos, ${importer.data.updated} atualizados, ${importer.data.quarantined} em quarentena.`}</p>}</section><ImportAudit batches={batches.data?.items || []} total={batches.data?.total || 0} page={batchPage} size={batches.data?.size || 20} loading={batches.isPending} onPageChange={setBatchPage} /></div>
    {auth.data && <div id="perfil"><ProfilePanel user={auth.data} /></div>}
    <div id="usuarios">{auth.data?.role === 'admin' && <UserManagement token={token} />}</div>
    <div id="armazenamento"><StorageStatus /></div>
    {!!batches.data?.items.some(batch => batch.differences > 0) && <p className="notice" role="status">Há registros ausentes em arquivo completo nesta página. Abra “Conferir lote” na auditoria para revisar; nenhum registro foi apagado.</p>}
    <footer>{demo ? 'Prévia sintética privada · sem importação ou sincronização externa.' : 'Execução local para bases reais · pré-validação obrigatória · backup automático por lote · sem sincronização externa.'}</footer>
  </main></LegacyLayout>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></React.StrictMode>)
