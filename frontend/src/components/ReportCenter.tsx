import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getReportDataset } from '../services/api'
import { bpmCities, reportCatalog, type ReportId, type ReportOptions, type ReportScope } from '../services/report-model'
import { buildReportDocument, printReport, reportCsv, summaryCsv } from '../services/report-document'
import { openDomesticPresentation } from '../services/domestic-presentation'
import { exportReportWorkbook } from '../services/report-spreadsheet'
import { buildMviNeacWhatsapp } from '../services/mvi-neac-share'
import { SystemIcon } from './SystemIcon'
import '../reports.css'

export function ReportCenter({ year, municipality, version, allowed }: { year?: number; municipality?: string; version: string; allowed: boolean }) {
  const [scope, setScope] = useState<ReportScope>({ year, city: municipality })
  const [options, setOptions] = useState<ReportOptions>({ author: '', unit: 'Polícia Militar de Alagoas · 10º BPM', notes: '', actions: '', referenceDate: new Date().toLocaleDateString('en-CA') })
  const [selected, setSelected] = useState<ReportId>('executivo')
  const [preview, setPreview] = useState('')
  const [planning, setPlanning] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const data = useQuery({ queryKey: ['report-dataset'], queryFn: getReportDataset, enabled: allowed })
  const authorized = useRef(allowed)
  authorized.current = allowed
  useEffect(() => { authorized.current = allowed; return () => { authorized.current = false; document.querySelector<HTMLDialogElement>('.domestic-report-studio')?.close() } }, [allowed])
  useEffect(() => { setPreview('') }, [data.data])
  useEffect(() => { setScope(previous => ({ ...previous, year, city: municipality })); setPreview('') }, [year, municipality])
  const update = (patch: Partial<ReportScope>) => { setScope(value => ({ ...value, ...patch })); setPreview(''); setError(''); setCopied(false) }
  const customize = (patch: Partial<ReportOptions>) => { setOptions(value => ({ ...value, ...patch })); setPreview('') }
  const chosen = reportCatalog.find(item => item.id === selected)!
  const whatsappText = preview && selected === 'mvi-neac' && data.data ? buildMviNeacWhatsapp(data.data, scope) : ''
  const prepare = async (id: ReportId) => {
    setSelected(id); setError(''); setPlanning(false); setPreview(''); setCopied(false)
    if (scope.start && scope.end && scope.start > scope.end) { setError('A data inicial deve ser anterior ou igual à data final.'); return }
    if (id.startsWith('mvi-') && !options.referenceDate) { setError('Informe a data de referência dos dias sem MVI.'); return }
    if (id === 'planejamento') { setPlanning(true); return }
    if (!data.data) return
    try {
      if (id === 'domestica-apresentacao') await openDomesticPresentation(data.data, scope, version, options, () => authorized.current)
      else setPreview(buildReportDocument(data.data, id, scope, options, version))
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível preparar o relatório.') }
  }
  const downloadCsv = (summary = false) => {
    if (!data.data) return
    const url = URL.createObjectURL(new Blob([summary ? summaryCsv(data.data, scope) : reportCsv(data.data, selected, scope)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `gtb-${selected}-${scope.year || 'todos'}-${new Date().toISOString().slice(0, 10)}.csv`; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const exportCsv = () => downloadCsv(false)
  const exportWorkbook = () => { if (data.data) void exportReportWorkbook(data.data, selected, scope, () => authorized.current).catch(failure => setError(String(failure.message))) }
  const unique = (field: 'nature' | 'category' | 'situation' | 'team') => [...new Set((data.data?.rows || []).map(row => row[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return <section className="panel report-center" aria-label="Central de relatórios e apresentações">
    <div className="section-head"><div><p className="eyebrow">Documentos e apresentações</p><h2>Relatórios do sistema anterior</h2></div><span>{reportCatalog.length} opções · PDF, CSV e apresentação temática</span></div>
    {!allowed ? <p className="notice">A geração de relatórios é reservada ao administrador, como no sistema anterior.</p> : <>
      <p className="muted">Escolha o documento, confira o recorte e prepare a prévia. Para salvar em PDF, use o botão de impressão. A apresentação temática mantém o editor original e permite baixar PowerPoint editável. O planejamento abre o tabuleiro com exportação PDF e PNG.</p>
      <div className="report-filters">
        <label>Ano do relatório<input type="number" min="1900" max="2100" placeholder="Todos" value={scope.year || ''} onChange={event => update({ year: Number(event.target.value) || undefined })} /></label>
        <label>Município do relatório<select value={scope.city || ''} onChange={event => update({ city: event.target.value || undefined })}><option value="">Todos do 10º BPM</option>{bpmCities.map(city => <option key={city}>{city}</option>)}</select></label>
        <label>Mês<select value={scope.month || ''} onChange={event => update({ month: Number(event.target.value) || undefined })}><option value="">Todos</option>{Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{new Date(2026, index, 1).toLocaleString('pt-BR', { month: 'long' })}</option>)}</select></label>
        <label>Data inicial<input type="date" value={scope.start || ''} onChange={event => update({ start: event.target.value || undefined })} /></label>
        <label>Data final<input type="date" value={scope.end || ''} onChange={event => update({ end: event.target.value || undefined })} /></label>
        <label>Natureza<select value={scope.nature || ''} onChange={event => update({ nature: event.target.value || undefined })}><option value="">Todas</option>{unique('nature').map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Classificação / tipo<select value={scope.category || ''} onChange={event => update({ category: event.target.value || undefined })}><option value="">Todos</option>{unique('category').map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Situação da arma<select value={scope.situation || ''} onChange={event => update({ situation: event.target.value || undefined })}><option value="">Todas</option>{unique('situation').map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Guarnição<select value={scope.team || ''} onChange={event => update({ team: event.target.value || undefined })}><option value="">Todas</option>{unique('team').map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
      <details className="report-customization"><summary>Identificação, observações e referência dos dias sem MVI</summary><div className="report-filters">
        <label>Título personalizado<input maxLength={120} value={options.title || ''} placeholder="Usar título do modelo" onChange={event => customize({ title: event.target.value })} /></label>
        <label>Responsável<input maxLength={100} value={options.author} onChange={event => customize({ author: event.target.value })} /></label>
        <label>Instituição / unidade<input maxLength={120} value={options.unit} onChange={event => customize({ unit: event.target.value })} /></label>
        <label>Referência dos dias sem MVI<input type="date" required value={options.referenceDate} onChange={event => customize({ referenceDate: event.target.value })} /></label>
        <label>Análise e observações<textarea rows={4} maxLength={4000} value={options.notes} onChange={event => customize({ notes: event.target.value })} /></label>
        <label>Ações, efetivo, responsáveis e prazos<textarea rows={4} maxLength={4000} value={options.actions} onChange={event => customize({ actions: event.target.value })} /></label>
      </div></details>
      {data.isPending && <p role="status">Carregando os dados dos relatórios…</p>}
      <button type="button" disabled={!data.data} onClick={() => downloadCsv(true)}>Exportar resumo CSV do recorte</button>
      {preview && <button type="button" onClick={exportWorkbook}>Exportar relatório selecionado em Excel (XLSX)</button>}
      {data.isError && <div className="error" role="alert">{data.error.message} <button type="button" onClick={() => void data.refetch()}>Tentar novamente</button></div>}
      <div className="report-catalog">{reportCatalog.map(item => <button type="button" data-report-id={item.id} key={item.id} className={selected === item.id ? 'report-choice selected' : 'report-choice'} disabled={!data.data && item.id !== 'planejamento'} onClick={() => void prepare(item.id)}><SystemIcon name={item.icon} /><strong>{item.title}</strong><span>{item.description}</span><small>{item.id === 'domestica-apresentacao' ? 'Abrir editor · PDF e PPTX →' : item.id === 'planejamento' ? 'Abrir tabuleiro · PDF e PNG →' : 'Preparar relatório →'}</small></button>)}</div>
      {error && <p className="error" role="alert">{error}</p>}
      {preview && <div className="report-preview" aria-label="Prévia do relatório selecionado"><div className="section-head"><h3>{chosen.title}</h3><div className="report-toolbar"><button type="button" className="primary" onClick={() => { void printReport(preview).catch(failure => setError(String(failure.message))) }}>Imprimir ou salvar PDF</button><button type="button" onClick={exportCsv}>Exportar CSV</button><button type="button" onClick={() => setPreview('')}>Fechar prévia</button></div></div><iframe title={`Prévia: ${chosen.title}`} srcDoc={preview} sandbox="allow-same-origin" />{whatsappText && <div className="whatsapp-report"><h4>Resumo para WhatsApp</h4><p className="muted">Confira o texto antes de compartilhar. Ele contém apenas totais e distribuições, sem identificação de vítimas.</p><textarea aria-label="Texto do resumo MVI NEAC para WhatsApp" readOnly value={whatsappText} rows={16} /><div className="report-toolbar"><a className="whatsapp-share" href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`} target="_blank" rel="noopener noreferrer">Abrir no WhatsApp</a><button type="button" onClick={() => { if (!navigator.clipboard?.writeText) { setError('Não foi possível copiar o texto. Selecione e copie a prévia acima.'); return } void navigator.clipboard.writeText(whatsappText).then(() => setCopied(true)).catch(() => setError('Não foi possível copiar o texto. Selecione e copie a prévia acima.')) }}>Copiar texto</button></div>{copied && <p className="success" role="status">Resumo copiado.</p>}</div>}</div>}
      {planning && <div className="report-preview"><div className="section-head"><h3>Tabuleiro do planejamento operacional</h3><button type="button" onClick={() => setPlanning(false)}>Fechar tabuleiro</button></div><p className="muted">Cenários salvos neste navegador. Mapa de ruas depende de conexão; a exportação PNG é uma prancha esquemática.</p><iframe title="Planejamento operacional com PDF e PNG" src={`${import.meta.env.BASE_URL}assets/reports/planning.html`} /></div>}
    </>}
  </section>
}
