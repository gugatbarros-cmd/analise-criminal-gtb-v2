/**
 * Materiais apreendidos do 10º BPM, lidos ao vivo da planilha compartilhada no Google Sheets.
 *
 * A leitura é somente de consulta: o sistema nunca grava na planilha. Apenas as colunas
 * necessárias são aproveitadas; autor, CPF, RG, telefone, endereço e peticionador são
 * descartados durante a leitura e não chegam à interface, aos relatórios ou ao cache.
 */

export const SEIZED_SHEET_ID = '1gjghVFzpHaE4mdcSNdWAu8LNzUEIDYNy1XlPztzL19E'
export const SEIZED_SHEET_GID = '1459598561'
export const SEIZED_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SEIZED_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SEIZED_SHEET_GID}`
export const SEIZED_TARGET = 'materiais-apreendidos'
export const SEIZED_SHARE_URL = `https://gugatbarros-cmd.github.io/analise-criminal-gtb-v2/#${SEIZED_TARGET}`

export type Situation = 'apreendido' | 'devolvido' | 'outro'
export type SeizedItem = {
  id: string
  occurrence: string
  occurrenceDate: string // AAAA-MM-DD ou vazio
  category: string
  description: string
  depotKey: string
  depot: string
  depositDate: string
  process: string
  processStatus: string
  situation: Situation
  situationLabel: string
  returnDate: string
  city: string
  comarca: string
  typification: string
  days: number | null
}
export type DepotSummary = { key: string; label: string; total: number; seized: number; returned: number }

/** Colunas aproveitadas. Qualquer outra coluna da planilha é ignorada. */
const COLUMNS = {
  id: 'ID',
  occurrence: 'N° OCORRÊNCIA',
  occurrenceDate: 'DATA OCORRENCIA',
  category: 'CATEGORIA',
  description: 'DESCRIÇÃO',
  depot: 'LOCAL DA GUARDA DO MATERIAL',
  depositDate: 'DATA DE DEPÓSITO',
  process: 'ESAJ',
  processStatus: 'STATUS ESAJ',
  situation: 'SITUAÇÃO',
  returnDate: 'DATA DEVOLUÇÃO/ DESTRUIÇÃO',
  totalDays: 'QUANT DIAS TOTAL',
  city: 'CIDADE DO FATO',
  comarca: 'COMARCA',
  typification: 'TIPICIDADE GERAL',
} as const

export const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, ' ').trim().toUpperCase()

/** CSV com aspas, vírgulas e quebras de linha dentro das células. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const source = text.replace(/^﻿/, '')
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index++ }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(cell); cell = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(values => values.some(value => value.trim()))
}

/** dd/mm/aaaa → aaaa-mm-dd; valores inválidos viram texto vazio. */
export function isoDate(value: string): string {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!match) return ''
  const [, day, month, year] = match
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  const date = new Date(`${iso}T12:00:00Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? '' : iso
}

export const brDate = (iso: string) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : ''
const dayDiff = (start: string, end: string) => Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000)

export function depotFor(raw: string): { key: string; label: string } {
  const folded = fold(raw)
  if (!folded) return { key: 'nao-informado', label: 'Depósito não informado' }
  if (folded.includes('GUARDA') || /\bGCM\b/.test(folded)) return { key: 'gcm-palmeira', label: 'Depósito GCM Palmeira dos Índios' }
  if (folded.includes('CISP') && folded.includes('PALMEIRA')) return { key: 'cisp-palmeira', label: 'Depósito 10º BPM · CISP Palmeira' }
  return { key: folded.toLowerCase().replace(/ /g, '-'), label: raw.trim() }
}

const categoryLabel = (raw: string) => {
  const text = raw.trim().toLocaleLowerCase('pt-BR')
  return text ? text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1) : 'Não informada'
}

const cleanCity = (raw: string) => { const text = raw.trim(); return !text || text === '#N/D' ? 'Não informado' : text }

export function normalizeRows(rows: string[][], today = new Date().toISOString().slice(0, 10)): SeizedItem[] {
  const header = rows[0]?.map(value => fold(value)) || []
  const position = Object.fromEntries(Object.entries(COLUMNS).map(([key, name]) => [key, header.indexOf(fold(name))])) as Record<keyof typeof COLUMNS, number>
  for (const key of ['occurrence', 'depot', 'situation'] as const)
    if (position[key] < 0) throw Error(`A planilha não tem a coluna “${COLUMNS[key]}”. Confira se a aba compartilhada é a PLAN DADOS COMPLETOS.`)
  const read = (row: string[], key: keyof typeof COLUMNS) => position[key] >= 0 ? (row[position[key]] || '').trim() : ''
  return rows.slice(1).filter(row => read(row, 'occurrence') || read(row, 'description')).map((row, index) => {
    const depot = depotFor(read(row, 'depot'))
    const situationText = fold(read(row, 'situation'))
    const situation: Situation = situationText.startsWith('DEVOLV') ? 'devolvido' : situationText.startsWith('APREEN') ? 'apreendido' : 'outro'
    const depositDate = isoDate(read(row, 'depositDate'))
    const returnDate = isoDate(read(row, 'returnDate'))
    const sheetDays = Number(read(row, 'totalDays'))
    const end = situation === 'apreendido' ? today : returnDate
    const days = situation !== 'apreendido' && Number.isFinite(sheetDays) && read(row, 'totalDays') !== '' ? sheetDays
      : depositDate && end ? Math.max(0, dayDiff(depositDate, end)) : null
    return {
      id: read(row, 'id') || String(index + 1),
      occurrence: read(row, 'occurrence'),
      occurrenceDate: isoDate(read(row, 'occurrenceDate')),
      category: categoryLabel(read(row, 'category')),
      description: read(row, 'description'),
      depotKey: depot.key,
      depot: depot.label,
      depositDate,
      process: read(row, 'process'),
      processStatus: read(row, 'processStatus'),
      situation,
      situationLabel: situation === 'apreendido' ? 'Apreendido' : situation === 'devolvido' ? 'Devolvido' : read(row, 'situation') || 'Não informada',
      returnDate,
      city: cleanCity(read(row, 'city')),
      comarca: cleanCity(read(row, 'comarca')),
      typification: read(row, 'typification') === '#N/D' ? '' : read(row, 'typification'),
      days,
    }
  })
}

export async function fetchSeizedMaterials(fetcher: typeof fetch = fetch): Promise<SeizedItem[]> {
  const url = `${SEIZED_SHEET_URL}&_=${Date.now()}`
  let response: Response
  try { response = await fetcher(url, { cache: 'no-store', credentials: 'omit' }) }
  catch { throw Error('Sem conexão com a planilha de materiais apreendidos. Verifique a internet e tente novamente.') }
  if (!response.ok) throw Error('A planilha de materiais apreendidos não respondeu. Tente novamente em instantes.')
  const text = await response.text()
  if (/^\s*</.test(text)) throw Error('A planilha não está acessível pelo link. Ela precisa estar compartilhada como “Qualquer pessoa com o link: leitor”.')
  return normalizeRows(parseCsv(text))
}

/** Statuses do ESAJ trazem a data entre parênteses; agrupa pelo andamento. */
export const processStage = (status: string) => status.replace(/\s*\(.*$/, '').trim() || 'Sem andamento'

export function summarizeDepots(items: SeizedItem[]): DepotSummary[] {
  const map = new Map<string, DepotSummary>()
  for (const item of items) {
    const entry = map.get(item.depotKey) || { key: item.depotKey, label: item.depot, total: 0, seized: 0, returned: 0 }
    entry.total++
    if (item.situation === 'apreendido') entry.seized++
    if (item.situation === 'devolvido') entry.returned++
    map.set(item.depotKey, entry)
  }
  const order = ['cisp-palmeira', 'gcm-palmeira']
  return [...map.values()].sort((a, b) => {
    const left = order.indexOf(a.key), right = order.indexOf(b.key)
    return (left < 0 ? 99 : left) - (right < 0 ? 99 : right) || b.total - a.total
  })
}

export function countBy(items: SeizedItem[], key: (item: SeizedItem) => string, limit = 0): { name: string; total: number }[] {
  const counts = new Map<string, number>()
  for (const item of items) { const name = key(item); counts.set(name, (counts.get(name) || 0) + 1) }
  const sorted = [...counts].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'))
  if (!limit || sorted.length <= limit) return sorted
  const rest = sorted.slice(limit - 1).reduce((sum, item) => sum + item.total, 0)
  return [...sorted.slice(0, limit - 1), { name: 'Demais', total: rest }]
}

export const AGE_BANDS = ['Até 90 dias', '91 a 180 dias', '181 dias a 1 ano', '1 a 2 anos', 'Mais de 2 anos'] as const
export function ageBand(days: number): (typeof AGE_BANDS)[number] {
  return days <= 90 ? AGE_BANDS[0] : days <= 180 ? AGE_BANDS[1] : days <= 365 ? AGE_BANDS[2] : days <= 730 ? AGE_BANDS[3] : AGE_BANDS[4]
}

/** Tempo em depósito dos itens ainda apreendidos, por faixa. */
export function ageDistribution(items: SeizedItem[]) {
  const counts = new Map<string, number>(AGE_BANDS.map(band => [band, 0]))
  for (const item of items) if (item.situation === 'apreendido' && item.days !== null) counts.set(ageBand(item.days), counts.get(ageBand(item.days))! + 1)
  return AGE_BANDS.map(name => ({ name, total: counts.get(name)! }))
}

/** Entradas no depósito por mês (últimos meses com registro). */
export function monthlyDeposits(items: SeizedItem[], months = 18) {
  const counts = new Map<string, number>()
  for (const item of items) if (item.depositDate) { const month = item.depositDate.slice(0, 7); counts.set(month, (counts.get(month) || 0) + 1) }
  const keys = [...counts.keys()].sort()
  if (!keys.length) return []
  const [lastYear, lastMonth] = keys[keys.length - 1].split('-').map(Number)
  const series: { name: string; total: number }[] = []
  for (let offset = months - 1; offset >= 0; offset--) {
    const date = new Date(Date.UTC(lastYear, lastMonth - 1 - offset, 1))
    const key = date.toISOString().slice(0, 7)
    series.push({ name: `${key.slice(5)}/${key.slice(2, 4)}`, total: counts.get(key) || 0 })
  }
  return series
}

export type SeizedFilters = { depot: string; situation: string; category: string; city: string; comarca: string; search: string }
export const emptyFilters: SeizedFilters = { depot: '', situation: '', category: '', city: '', comarca: '', search: '' }

export function filterItems(items: SeizedItem[], filters: SeizedFilters): SeizedItem[] {
  const search = fold(filters.search)
  return items.filter(item => (!filters.depot || item.depotKey === filters.depot)
    && (!filters.situation || item.situation === filters.situation)
    && (!filters.category || item.category === filters.category)
    && (!filters.city || item.city === filters.city)
    && (!filters.comarca || item.comarca === filters.comarca)
    && (!search || fold([item.occurrence, item.process, item.description, item.category, item.city].join(' ')).includes(search)))
}

/** comarcas ausente = todas as comarcas. */
export type ReportSelection = { depots: string[]; situations: Situation[]; comarcas?: string[] }
export function selectForReport(items: SeizedItem[], selection: ReportSelection): SeizedItem[] {
  return items.filter(item => selection.depots.includes(item.depotKey) && selection.situations.includes(item.situation)
    && (!selection.comarcas || selection.comarcas.includes(item.comarca)))
    .sort((a, b) => a.depot.localeCompare(b.depot, 'pt-BR') || (b.days ?? -1) - (a.days ?? -1))
}

export const REPORT_HEADERS = ['Nº do processo (ESAJ)', 'Data da ocorrência', 'Nº da ocorrência', 'Categoria', 'Bem apreendido', 'Depósito', 'Comarca', 'Situação', 'Andamento ESAJ', 'Data de depósito', 'Dias em depósito']
export const reportRow = (item: SeizedItem): (string | number)[] => [item.process || '—', brDate(item.occurrenceDate), item.occurrence, item.category, item.description,
  item.depot, item.comarca, item.situationLabel, item.processStatus, brDate(item.depositDate), item.days ?? '']

/** Dados fictícios usados apenas na demonstração pública. */
export function demoSeizedItems(today = new Date().toISOString().slice(0, 10)): SeizedItem[] {
  const categories = ['Cano de escape', 'Arma branca', 'Aparelho de som', 'Materiais diversos']
  const cities = ['Palmeira dos Índios', 'Igaci', 'Maribondo', 'Cacimbinhas', 'Quebrangulo']
  const stages = ['PROTOCOLADO', 'ARQUIVADO', 'CONCLUSO PARA JULGAMENTO', 'PETIÇÃO JUNTADA']
  const base = Date.parse(`${today}T12:00:00Z`)
  return Array.from({ length: 48 }, (_, index) => {
    const depot = index % 5 < 3 ? depotFor('CISP - Palmeira dos Índios') : depotFor('Guarda Civil Municipal de Palmeira dos Índios')
    const deposit = new Date(base - (20 + index * 17) * 86_400_000).toISOString().slice(0, 10)
    const returned = index % 9 === 0
    const returnDate = returned ? new Date(base - index * 3 * 86_400_000).toISOString().slice(0, 10) : ''
    return {
      id: String(index + 1), occurrence: String(900000 + index * 37), occurrenceDate: deposit,
      category: categories[index % categories.length], description: `Item fictício de demonstração nº ${index + 1}`,
      depotKey: depot.key, depot: depot.label, depositDate: deposit, process: `0000${String(index).padStart(3, '0')}-00.2025.8.02.0000`,
      processStatus: stages[index % stages.length], situation: returned ? 'devolvido' : 'apreendido',
      situationLabel: returned ? 'Devolvido' : 'Apreendido', returnDate, city: cities[index % cities.length],
      comarca: cities[index % cities.length], typification: '', days: dayDiff(deposit, returned ? returnDate : today),
    }
  })
}
