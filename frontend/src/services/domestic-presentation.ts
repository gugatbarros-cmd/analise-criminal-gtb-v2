import { ageBand, comparisonScopes, count, filterReportRows, scopeLabel, selectReportRows, weekday, type ReportDataset, type ReportOptions, type ReportRow, type ReportScope } from './report-model'

type DomesticStudio = { open: (data: object, authorized: () => boolean) => void }
declare global { interface Window { DomesticReport?: DomesticStudio } }
let library: Promise<void> | undefined
function loadStudio(): Promise<void> {
  if (window.DomesticReport) return Promise.resolve()
  if (!library) library = new Promise<void>((resolve, reject) => {
    const base = `${import.meta.env.BASE_URL}assets/reports/`
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = base + 'domestic-report.css'; document.head.appendChild(style)
    const script = document.createElement('script'); script.src = base + 'domestic-report.js'
    script.onload = () => resolve(); script.onerror = () => { script.remove(); style.remove(); library = undefined; reject(Error('Não foi possível carregar o editor de apresentações.')) }
    document.head.appendChild(script)
  })
  return library
}
export function domesticPresentationData(data: ReportDataset, scope: ReportScope, version: string) {
  const all = filterReportRows(data.rows, scope), rows = selectReportRows(all, 'domestica')
  const get = (fn: (row: ReportRow) => string) => count(rows, fn)
  const periods = comparisonScopes(data.rows, scope)
  const previous = periods ? selectReportRows(filterReportRows(data.rows, periods.previous), 'domestica').length : null
  const current = periods ? selectReportRows(filterReportRows(data.rows, periods.current), 'domestica').length : null
  const screening = (status: string) => all.filter(row => row.source === 'ocorrencias' && row.eligible && row.indicators.includes(`Doméstica:${status}`)).length
  const pending = screening('pending'), excluded = screening('excluded'), outside = screening('outside')
  return {
    total: rows.length, period: scopeLabel(scope), filters: scopeLabel(scope), version,
    issued: new Date().toLocaleString('pt-BR'), missingDate: 0,
    missingHour: rows.filter(row => row.hour === null).length,
    invalidAge: rows.filter(row => row.age && ageBand(row) === 'Não informado').length,
    cities: get(row => row.city), months: get(row => row.date.slice(0, 7)).sort((a, b) => a[0].localeCompare(b[0])),
    comparison: periods ? `Períodos equivalentes: ${periods.previous.start} a ${periods.previous.end}: ${previous} reconhecidas; ${periods.current.start} a ${periods.current.end}: ${current} reconhecidas. A cobertura depende das bases importadas.` : 'Sem período comparável disponível.',
    screening: { screened: rows.length + pending + excluded + outside, pending, excluded, outside },
    typifications: [],
    groups: {
      Turno: get(row => row.hour === null ? '' : row.hour < 6 ? 'Madrugada' : row.hour < 12 ? 'Manhã' : row.hour < 18 ? 'Tarde' : 'Noite'),
      'Dia da semana': get(weekday), 'Horário': get(row => row.hour === null ? '' : `${String(row.hour).padStart(2, '0')}h`),
      'Natureza registrada': get(row => row.nature), 'Tipo de agressão informado': get(row => row.aggression),
      'Meio empregado informado': get(row => row.instrument), Bairro: get(row => row.neighborhood ? `${row.neighborhood} · ${row.city}` : ''),
      'Sexo/gênero da vítima informado': get(row => row.sex), 'Faixa etária da vítima': get(ageBand),
      'Vínculo informado': get(row => row.relationship), 'Solução / encaminhamento': get(row => row.solution),
    },
  }
}
export async function openDomesticPresentation(data: ReportDataset, scope: ReportScope, version: string, options: ReportOptions, authorized: () => boolean): Promise<void> {
  await loadStudio()
  if (!authorized()) throw Error('Acesso restrito ao administrador.')
  window.DomesticReport!.open(domesticPresentationData(data, scope, version), authorized)
  const dialog = document.querySelector('.domestic-report-studio')
  for (const [name, value] of Object.entries({ author: options.author, unit: options.unit, notes: options.notes, actions: options.actions })) {
    const input = dialog?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)
    if (input) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })) }
  }
}
