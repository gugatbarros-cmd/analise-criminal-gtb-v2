import { filterReportRows, fold, selectReportRows, type ReportDataset, type ReportId, type ReportRow, type ReportScope } from './report-model'

export function mviConferences(rows: ReportRow[]) {
  const identity = (row: ReportRow) => [fold(row.victim), row.date, fold(row.city)].join('|')
  const cad = rows.filter(row => row.source === 'mvi_cad' && row.eligible && fold(row.victim))
  const neac = rows.filter(row => row.source === 'mvi_neac' && row.eligible && fold(row.victim))
  const cadGroups = new Map<string, ReportRow[]>(), neacGroups = new Map<string, ReportRow[]>()
  for (const [items, groups] of [[cad, cadGroups], [neac, neacGroups]] as const) {
    for (const row of items) { const key = identity(row); const group = groups.get(key) || []; group.push(row); groups.set(key, group) }
  }
  return neac.map(row => {
    const matches = cadGroups.get(identity(row)) || []
    const ambiguous = matches.length > 1 || (neacGroups.get(identity(row))?.length || 0) > 1
    return { neac: row, cad: matches.length === 1 && !ambiguous ? matches[0] : null,
      status: ambiguous ? 'Ambíguo · revisão necessária' : matches.length === 1 ? 'Possível par exato · não confirmado' : 'Sem par exato no CAD' }
  })
}
type Workbook = object
type XlsxLibrary = { utils: { book_new(): Workbook; aoa_to_sheet(rows: unknown[][]): object; book_append_sheet(book: Workbook, sheet: object, name: string): void }; writeFile(book: Workbook, name: string): void }
declare global { interface Window { XLSX?: XlsxLibrary } }
let loading: Promise<void> | undefined
export async function exportReportWorkbook(data: ReportDataset, id: ReportId, scope: ReportScope, authorized: () => boolean = () => true): Promise<void> {
  if (!window.XLSX) {
    loading ??= new Promise<void>((resolve, reject) => { const script = document.createElement('script'); script.src = `${import.meta.env.BASE_URL}assets/reports/xlsx.full.min.js`; script.onload = () => resolve(); script.onerror = () => { loading = undefined; script.remove(); reject(Error('Não foi possível carregar o exportador Excel.')) }; document.head.appendChild(script) })
    await loading
  }
  if (!authorized()) throw Error('Acesso restrito ao administrador.')
  const library = window.XLSX!, book = library.utils.book_new(), all = filterReportRows(data.rows, scope)
  const sheet = (name: string, values: unknown[][]) => library.utils.book_append_sheet(book, library.utils.aoa_to_sheet(values), name)
  const headers = ['Fonte', 'Data', 'Hora', 'Município', 'Bairro', 'Ocorrência', 'Vítima MVI', 'Natureza', 'Classificação', 'Elegível', 'Unidades armas', 'Peso drogas g', 'Calibre', 'Situação', 'Instrumento']
  const values = (rows: ReportRow[]) => [headers, ...rows.map(row => [row.source, row.date, row.hour === null ? '' : `${row.hour}h`, row.city, row.neighborhood, row.occurrence, row.victim, row.nature, row.category, row.eligible ? 'Sim' : 'Não', row.source === 'armas' ? row.quantity : '', row.source === 'drogas' ? row.grams : '', row.caliber, row.situation, row.instrument])]
  if (['conferencia-mvi', 'mvi-cad', 'mvi-neac'].includes(id)) {
    sheet('MVI CAD', values(all.filter(row => row.source === 'mvi_cad')))
    sheet('MVI NEAC', values(all.filter(row => row.source === 'mvi_neac')))
    sheet('Conferência para revisão', [['Situação', 'Data NEAC', 'Município NEAC', 'Vítima NEAC', 'Ocorrência NEAC', 'Ocorrência CAD', 'Vítima CAD'], ...mviConferences(all).map(item => [item.status, item.neac.date, item.neac.city, item.neac.victim, item.neac.occurrence, item.cad?.occurrence || '', item.cad?.victim || ''])])
  } else sheet('Dados do recorte', values(['consolidado', 'institucional'].includes(id) ? all : selectReportRows(all, id)))
  sheet('Memória', [['Campo', 'Valor'], ['Ano', scope.year || 'Todos'], ['Município', scope.city || '10º BPM'], ['Mês', scope.month || 'Todos'], ['Data inicial', scope.start || ''], ['Data final', scope.end || ''], ['Natureza', scope.nature || 'Todas'], ['Tipo', scope.category || 'Todos'], ['Situação', scope.situation || 'Todas'], ['Guarnição', scope.team || 'Todas'], ['Atualização das bases', data.updatedAt || 'Sem importações'], ['Emissão', new Date().toLocaleString('pt-BR')], ['Regra', 'CAD e NEAC independentes. Possíveis pares não representam vínculo confirmado.']])
  library.writeFile(book, `gtb-${id}-${scope.year || 'todos'}.xlsx`)
}
