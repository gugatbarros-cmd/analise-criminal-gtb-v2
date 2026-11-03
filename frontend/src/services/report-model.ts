import type { Source } from './api'

export type ReportRow = {
  source: Source; date: string; city: string; nature: string; category: string
  eligible: boolean; indicators: string[]; occurrence: string; victim: string
  hour: number | null; neighborhood: string; age: string; sex: string; instrument: string
  solution: string; relationship: string; aggression: string; quantity: number; seized: boolean
  restricted: boolean; caliber: string; brand: string; situation: string; grams: number | null
  location: string; team: string; teamGroup: string; points: number
  officers: { name: string; registration: string; role: string }[]
}
export type ReportDataset = { rows: ReportRow[]; updatedAt: string | null; batches: number; quarantined: number }
export type ReportScope = { year?: number; city?: string; month?: number; start?: string; end?: string; nature?: string; category?: string; situation?: string; team?: string }
export type ReportOptions = { title?: string; author: string; unit: string; notes: string; actions: string; issued?: string; referenceDate: string }
export const reportCatalog = [
  { id: 'executivo', title: 'Relatório executivo', icon: 'chart', description: 'Síntese dos indicadores e comparação de períodos equivalentes.', legacy: 'executiveReportButton' },
  { id: 'folder', title: 'Folder executivo', icon: 'report', description: 'Apresentação horizontal com capa, comparativos e leitura para reuniões.', legacy: 'presentationFolderButton' },
  { id: 'consolidado', title: 'Consolidado de todos os indicadores', icon: 'report', description: 'Documento completo com os módulos e suas tabelas, sem corte no ranking.', legacy: 'completeReportButton' },
  { id: 'institucional', title: 'Relatório institucional', icon: 'report', description: 'Panorama completo, qualidade das bases e memória do recorte.', legacy: 'dashboardPdfButton' },
  { id: 'geral', title: 'Painel geral', icon: 'dashboard', description: 'Ocorrências, naturezas, territórios, horários e soluções.', legacy: 'generalPdfButton' },
  { id: 'mvi-cad', title: 'MVI CAD', icon: 'skull', description: 'Vítimas, classificação, perfil, meios, horários e dias sem MVI.', legacy: 'mviPdfButton' },
  { id: 'mvi-neac', title: 'MVI NEAC', icon: 'skull', description: 'Relatório independente da fonte NEAC, com os mesmos quadros de análise.', legacy: 'mviNeacTab' },
  { id: 'conferencia-mvi', title: 'Conferência CAD × NEAC', icon: 'table', description: 'Consolidação para revisão e planilha XLSX com fontes separadas e possíveis pares.', legacy: 'exportMviNeacConsolidation' },
  { id: 'cvp', title: 'Crimes Violentos contra o Patrimônio', icon: 'robbery', description: 'Roubos, evolução, comparativos e distribuição territorial.', legacy: 'cvpPdfButton' },
  { id: 'tentativas', title: 'Tentativas de homicídio', icon: 'attempt', description: 'Ocorrências, meios empregados e perfis de tempo e território.', legacy: 'attemptPdfButton' },
  { id: 'tco', title: 'Relatório individual de TCO', icon: 'clipboard', description: 'Cinco partes: comparação, evolução mensal, municípios, naturezas e perfil municipal.', legacy: 'tcoPdfButton' },
  { id: 'mandados', title: 'Cumprimento de mandados', icon: 'warrant', description: 'Ações reconhecidas, distribuição mensal e relação auditável.', legacy: 'warrantsPdfButton' },
  { id: 'visitas', title: 'Visitas orientativas', icon: 'visit', description: 'Modalidades preventivas, municípios e relação auditável.', legacy: 'visitsPdfButton' },
  { id: 'sossego', title: 'Perturbação do sossego', icon: 'sound', description: 'Comparação temporal, horários, cidades, bairros e naturezas.', legacy: 'disturbancePdfButton' },
  { id: 'armas', title: 'Apreensões de armas', icon: 'arms', description: 'Unidades, tipos, calibres, marcas, situações e relação dos itens.', legacy: 'armsPdfButton' },
  { id: 'drogas', title: 'Estimativa de drogas', icon: 'drugs', description: 'Registros, pesos em g/kg, tipos, locais e evolução mensal.', legacy: 'drugsPdfButton' },
  { id: 'domestica', title: 'Violência doméstica', icon: 'domestic', description: 'Reconhecidas, triagem, perfis, vínculos e encaminhamentos.', legacy: 'domesticPdfButton' },
  { id: 'domestica-apresentacao', title: 'Apresentação temática de violência doméstica', icon: 'domestic', description: 'Editor original: prévia, seções, observações, PDF e PowerPoint editável.', legacy: 'DomesticReport' },
  { id: 'guarnicoes', title: 'Produtividade das guarnições', icon: 'team', description: 'Equipes, policiais e pontos; escala, força-tarefa e outros recursos separados.', legacy: 'teamsTab' },
  { id: 'horarios', title: 'Horários críticos e municípios', icon: 'chart', description: 'Faixas de duas horas e prioridades por cidade, com cobertura dos horários.', legacy: 'timeReportTable' },
  { id: 'planejamento', title: 'Planejamento operacional', icon: 'compass', description: 'Prancha editável com missão, efetivo, ações e prioridades territoriais.', legacy: 'operationPdf' },
] as const
export type ReportId = typeof reportCatalog[number]['id']
export const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
export const bpmCities = ['Palmeira dos Índios', 'Belém', "Tanque d'Arca", 'Maribondo', 'Igaci', 'Quebrangulo', 'Paulo Jacinto', 'Mar Vermelho', 'Estrela de Alagoas', 'Minador do Negrão', 'Cacimbinhas']
const bpmKeys = new Set(bpmCities.map(fold))
export function filterReportRows(rows: ReportRow[], scope: ReportScope): ReportRow[] {
  return rows.filter(row => bpmKeys.has(fold(row.city)) && (!scope.year || Number(row.date.slice(0, 4)) === scope.year)
    && (!scope.city || fold(row.city) === fold(scope.city)) && (!scope.month || Number(row.date.slice(5, 7)) === scope.month)
    && (!scope.start || row.date >= scope.start) && (!scope.end || row.date <= scope.end)
    && (!scope.nature || fold(row.nature) === fold(scope.nature)) && (!scope.category || fold(row.category) === fold(scope.category))
    && (!scope.situation || fold(row.situation) === fold(scope.situation)) && (!scope.team || fold(row.team) === fold(scope.team)))
}
const indicators: Record<string, string> = { cvp: 'CVP', tentativas: 'Tentativa de homicídio', tco: 'TCO', mandados: 'Mandados', visitas: 'Visitas', sossego: 'Sossego', domestica: 'Doméstica' }
export function selectReportRows(rows: ReportRow[], id: ReportId): ReportRow[] {
  if (id.startsWith('mvi-')) return rows.filter(row => row.eligible && row.source === id.replace('-', '_'))
  if (['armas', 'drogas', 'guarnicoes'].includes(id)) return rows.filter(row => row.eligible && row.source === id)
  if (indicators[id]) return rows.filter(row => row.eligible && row.source === 'ocorrencias' && row.indicators.includes(indicators[id]))
  return rows.filter(row => row.eligible && row.source === 'ocorrencias' && !(fold(row.nature).includes('apoioaojudiciario') && fold(row.nature).includes('fiscalizacaodemedidaprotetiva')))
}
export type Entry = [string, number]
export function count(rows: ReportRow[], group: (row: ReportRow) => string, weight: (row: ReportRow) => number = () => 1): Entry[] {
  const values = new Map<string, number>()
  rows.forEach(row => { const label = group(row).trim() || 'Não informado'; values.set(label, (values.get(label) || 0) + weight(row)) })
  return [...values].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
}
export const weekday = (row: ReportRow) => ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][new Date(row.date + 'T12:00:00Z').getUTCDay()]
export const hourBand = (row: ReportRow) => row.hour === null ? 'Não informado' : `${String(Math.floor(row.hour / 2) * 2).padStart(2, '0')}h–${String((Math.floor(row.hour / 2) * 2 + 2) % 24).padStart(2, '0')}h`
export const ageBand = (row: ReportRow) => {
  if (!/^\d{1,3}$/.test(row.age) || Number(row.age) > 120) return 'Não informado'
  const age = Number(row.age)
  return age < 12 ? '0–11 anos' : age < 18 ? '12–17 anos' : age < 30 ? '18–29 anos' : age < 45 ? '30–44 anos' : age < 60 ? '45–59 anos' : '60 anos ou mais'
}
export function comparisonScopes(rows: ReportRow[], scope: ReportScope): { current: ReportScope; previous: ReportScope; cutoff: string; year: number } | null {
  const available = filterReportRows(rows, { ...scope, year: undefined, start: undefined, end: undefined })
  const year = scope.year || Math.max(0, ...available.map(row => Number(row.date.slice(0, 4))))
  const days = available.filter(row => Number(row.date.slice(0, 4)) === year && (!scope.end || row.date <= scope.end)).map(row => row.date).sort()
  if (!days.length) return null
  const cutoff = scope.end || days[days.length - 1]
  const start = scope.start || `${year}-01-01`
  const shift = (value: string) => {
    const month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10))
    const validDay = Math.min(day, new Date(Date.UTC(year - 1, month, 0)).getUTCDate())
    return `${year - 1}-${String(month).padStart(2, '0')}-${String(validDay).padStart(2, '0')}`
  }
  return { year, cutoff, current: { ...scope, year, start, end: cutoff }, previous: { ...scope, year: year - 1, start: shift(start), end: shift(cutoff) } }
}
export function scopeLabel(scope: ReportScope): string {
  return [`Ano: ${scope.year || 'todos'}`, `Município: ${scope.city || '10º BPM'}`, scope.month ? `Mês: ${scope.month}` : '', scope.start ? `De: ${scope.start}` : '', scope.end ? `Até: ${scope.end}` : '', scope.nature ? `Natureza: ${scope.nature}` : '', scope.category ? `Tipo: ${scope.category}` : '', scope.situation ? `Situação: ${scope.situation}` : '', scope.team ? `Equipe: ${scope.team}` : ''].filter(Boolean).join(' · ')
}
