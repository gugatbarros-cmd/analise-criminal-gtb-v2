import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnalysisChart } from './AnalysisChart'
import { logActivity } from '../services/api'
import { printReport } from '../services/report-document'
import {
  ageDistribution, brDate, countBy, demoSeizedItems, emptyFilters, fetchSeizedMaterials, filterItems, monthlyDeposits,
  processStage, selectForReport, SEIZED_SHARE_URL, summarizeDepots, type SeizedFilters, type SeizedItem, type Situation,
} from '../services/seized-materials'
import { buildSeizedReportHtml, exportSeizedWorkbook } from '../services/seized-report'
import '../seized-materials.css'

const PAGE_SIZE = 25
const shortDepot = (label: string) => label.replace(/^Depósito (10º BPM · )?/, '')
const n = (value: number) => value.toLocaleString('pt-BR')
const situations: { value: Situation; label: string }[] = [{ value: 'apreendido', label: 'Apreendidos' }, { value: 'devolvido', label: 'Devolvidos' }]

function DepotCard({ title, total, seized, returned, featured, onSelect, active }: {
  title: string; total: number; seized: number; returned: number; featured?: boolean; onSelect: () => void; active: boolean
}) {
  return <button type="button" className={`seized-card${featured ? ' featured' : ''}${active ? ' active' : ''}`} onClick={onSelect}
    aria-pressed={active} title={featured ? 'Mostrar todos os depósitos' : `Filtrar: ${title}`}>
    <span className="seized-card-title">{title}</span>
    <span className="seized-card-row"><span>Apreendidos</span><strong>{n(seized)}</strong></span>
    <span className="seized-card-row"><span>Devolvidos</span><strong>{n(returned)}</strong></span>
    <small>{n(total)} registro(s) no total</small>
  </button>
}

export function SeizedMaterials({ demo, username, version }: { demo: boolean; username?: string; version: string }) {
  const query = useQuery({
    queryKey: ['seized-materials', demo],
    queryFn: () => demo ? Promise.resolve(demoSeizedItems()) : fetchSeizedMaterials(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
  const items = useMemo(() => query.data || [], [query.data])
  const [filters, setFilters] = useState<SeizedFilters>(emptyFilters)
  const [page, setPage] = useState(1)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportDepots, setReportDepots] = useState<string[]>([])
  const [reportSituations, setReportSituations] = useState<Situation[]>(['apreendido'])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const depots = useMemo(() => summarizeDepots(items), [items])
  useEffect(() => setReportDepots(depots.map(depot => depot.key)), [depots])
  useEffect(() => setPage(1), [filters])
  const filtered = useMemo(() => filterItems(items, filters), [items, filters])
  const categories = useMemo(() => countBy(items, item => item.category).map(item => item.name), [items])
  const cities = useMemo(() => countBy(items, item => item.city).map(item => item.name), [items])
  const readAt = query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toLocaleString('pt-BR') : ''

  const seized = filtered.filter(item => item.situation === 'apreendido')
  const seizedDays = seized.map(item => item.days).filter((days): days is number => days !== null)
  const averageDays = seizedDays.length ? Math.round(seizedDays.reduce((sum, days) => sum + days, 0) / seizedDays.length) : 0
  const oldest = seizedDays.length ? Math.max(...seizedDays) : 0
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const set = (key: keyof SeizedFilters) => (value: string) => setFilters(current => ({ ...current, [key]: value }))

  const reportItems = useMemo(() => selectForReport(items, { depots: reportDepots, situations: reportSituations }), [items, reportDepots, reportSituations])
  const reportScope = () => {
    const depotNames = depots.filter(depot => reportDepots.includes(depot.key)).map(depot => depot.label)
    const situationNames = situations.filter(item => reportSituations.includes(item.value)).map(item => item.label.toLowerCase())
    return `Depósitos: ${depotNames.join(', ') || 'nenhum'} · Situação: ${situationNames.join(' e ') || 'nenhuma'}`
  }
  const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter(item => item !== value) : [...list, value]
  const generate = async (format: 'pdf' | 'xlsx') => {
    setMessage(''); setBusy(true)
    const info = { scopeLabel: reportScope(), author: username || '', version: `v${version}`, readAt }
    try {
      if (format === 'pdf') { await printReport(buildSeizedReportHtml(reportItems, info)); logActivity('report_printed', `Materiais apreendidos · ${info.scopeLabel}`) }
      else { await exportSeizedWorkbook(reportItems, info); logActivity('xlsx_exported', `Materiais apreendidos · ${info.scopeLabel}`) }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível gerar o relatório.') }
    finally { setBusy(false) }
  }
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(SEIZED_SHARE_URL); setMessage('Link da aba copiado. Quem abrir precisa entrar com a conta do GTB.') }
    catch { setMessage(`Copie o link: ${SEIZED_SHARE_URL}`) }
  }

  return <section className="panel seized-materials" aria-label="Materiais apreendidos do 10º BPM">
    <div className="section-head">
      <div><p className="eyebrow">Controle de depósitos · consulta somente leitura</p><h2>Materiais apreendidos · 10º BPM</h2></div>
      <div className="seized-head-actions">
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>{query.isFetching ? 'Atualizando…' : 'Atualizar dados'}</button>
        <button type="button" onClick={() => void copyLink()}>Copiar link da aba</button>
      </div>
    </div>
    <p className="muted">{demo ? 'Demonstração com itens fictícios.' : 'Dados lidos diretamente da planilha de controle, sem qualquer alteração nela.'}
      {readAt && ` Leitura: ${readAt}.`} Autor, CPF, RG, telefone e endereço dos envolvidos não são carregados.</p>
    {message && <p className="notice" role="status">{message}</p>}
    {query.isPending && <p className="empty" role="status">Lendo a planilha de materiais apreendidos…</p>}
    {query.isError && <p className="error" role="alert">{query.error instanceof Error ? query.error.message : 'Não foi possível ler a planilha.'}</p>}

    {query.data && <>
      <div className="seized-cards">
        <DepotCard featured title="Geral" total={items.length} seized={items.filter(item => item.situation === 'apreendido').length}
          returned={items.filter(item => item.situation === 'devolvido').length} active={!filters.depot} onSelect={() => set('depot')('')} />
        {depots.map(depot => <DepotCard key={depot.key} title={depot.label} total={depot.total} seized={depot.seized} returned={depot.returned}
          active={filters.depot === depot.key} onSelect={() => set('depot')(filters.depot === depot.key ? '' : depot.key)} />)}
      </div>

      <div className="report-actions seized-report-toggle">
        <button type="button" className="primary" onClick={() => setReportOpen(open => !open)} aria-expanded={reportOpen}>Gerar relatório dos materiais apreendidos</button>
      </div>
      {reportOpen && <fieldset className="seized-report">
        <legend>Escolha o que consultar</legend>
        <div className="seized-report-groups">
          <div><strong>Depósitos</strong>{depots.map(depot => <label key={depot.key}><input type="checkbox" checked={reportDepots.includes(depot.key)}
            onChange={() => setReportDepots(list => toggle(list, depot.key))} /> {depot.label} <small>({n(depot.total)})</small></label>)}</div>
          <div><strong>Situação</strong>{situations.map(item => <label key={item.value}><input type="checkbox" checked={reportSituations.includes(item.value)}
            onChange={() => setReportSituations(list => toggle(list, item.value))} /> {item.label}</label>)}</div>
        </div>
        <p className="muted">{n(reportItems.length)} item(ns) selecionado(s). Colunas: Nº do processo (ESAJ), data da ocorrência, Nº da ocorrência, bem apreendido, depósito, situação, andamento e dias em depósito.</p>
        <div className="report-actions">
          <button type="button" disabled={busy || !reportItems.length} onClick={() => void generate('pdf')}>Gerar PDF</button>
          <button type="button" disabled={busy || !reportItems.length} onClick={() => void generate('xlsx')}>Gerar planilha (Excel)</button>
        </div>
      </fieldset>}

      <div className="filters seized-filters">
        <label>Depósito<select value={filters.depot} onChange={event => set('depot')(event.target.value)}><option value="">Todos</option>{depots.map(depot => <option key={depot.key} value={depot.key}>{depot.label}</option>)}</select></label>
        <label>Situação<select value={filters.situation} onChange={event => set('situation')(event.target.value)}><option value="">Todas</option>{situations.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label>Categoria<select value={filters.category} onChange={event => set('category')(event.target.value)}><option value="">Todas</option>{categories.map(name => <option key={name}>{name}</option>)}</select></label>
        <label>Município do fato<select value={filters.city} onChange={event => set('city')(event.target.value)}><option value="">Todos</option>{cities.map(name => <option key={name}>{name}</option>)}</select></label>
        <label>Buscar<input type="search" value={filters.search} onChange={event => set('search')(event.target.value)} placeholder="Ocorrência, processo ou bem" /></label>
        {JSON.stringify(filters) !== JSON.stringify(emptyFilters) && <button type="button" onClick={() => setFilters(emptyFilters)}>Limpar filtros</button>}
      </div>

      <div className="seized-kpis" aria-label="Resumo do recorte">
        <p>Registros<strong>{n(filtered.length)}</strong></p>
        <p>Apreendidos<strong>{n(seized.length)}</strong></p>
        <p>Devolvidos<strong>{n(filtered.filter(item => item.situation === 'devolvido').length)}</strong></p>
        <p>Média em depósito<strong>{n(averageDays)} dias</strong></p>
        <p>Mais antigo apreendido<strong>{n(oldest)} dias</strong></p>
      </div>

      <div className="seized-dashboard">
        <article><h3>Apreendidos por depósito</h3><AnalysisChart kind="doughnut" title="Apreendidos por depósito" items={countBy(seized, item => item.depot)} /></article>
        <article><h3>Por categoria</h3><AnalysisChart title="Itens por categoria" items={countBy(filtered, item => item.category, 6)} /></article>
        <article className="wide"><h3>Entradas no depósito por mês</h3><AnalysisChart kind="line" title="Entradas no depósito por mês" items={monthlyDeposits(filtered)} /></article>
        <article><h3>Tempo em depósito (apreendidos)</h3><AnalysisChart title="Tempo em depósito" items={ageDistribution(filtered)} /></article>
        <article><h3>Município do fato</h3><AnalysisChart title="Itens por município do fato" items={countBy(filtered, item => item.city, 8)} /></article>
        <article className="wide"><h3>Andamento no ESAJ</h3><AnalysisChart title="Andamento no ESAJ" items={countBy(filtered, item => processStage(item.processStatus), 8)} /></article>
      </div>

      <h3 className="seized-list-title">Relação de materiais <small>{n(filtered.length)} registro(s)</small></h3>
      {!filtered.length ? <p className="empty">Nenhum material neste recorte.</p> : <>
        <div className="table-scroll"><table className="seized-table"><thead><tr>
          <th>Nº do processo (ESAJ)</th><th>Data ocorrência</th><th>Nº ocorrência</th><th>Categoria</th><th>Bem apreendido</th><th>Depósito</th><th>Situação e andamento</th><th>Dias</th>
        </tr></thead><tbody>{visible.map((item: SeizedItem) => <tr key={`${item.id}-${item.occurrence}`}>
          <td className="seized-process">{item.process || '—'}</td><td>{brDate(item.occurrenceDate)}</td><td>{item.occurrence}</td><td>{item.category}</td>
          <td className="seized-description">{item.description}</td><td title={item.depot}>{shortDepot(item.depot)}</td>
          <td><span className={`seized-status ${item.situation}`}>{item.situationLabel}</span>{item.returnDate && <small> em {brDate(item.returnDate)}</small>}
            {item.processStatus && <small className="seized-stage">{item.processStatus}</small>}</td>
         <td>{item.days ?? '—'}</td>
        </tr>)}</tbody></table></div>
        {pages > 1 && <div className="pagination"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button>
          <span>Página {page} de {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</button></div>}
      </>}
    </>}
  </section>
}
