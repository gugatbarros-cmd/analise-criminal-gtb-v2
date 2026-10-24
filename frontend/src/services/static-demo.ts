import type { ArmsAnalysis, Batch, DomesticAnalysis, DrugsAnalysis, MviAnalysis, MviComparison, MviRecordDetail, MviRecordVersion, OperationalAnalysis, RecordItem, Source, Summary, TeamsAnalysis } from './api'

type View = {
  summary: Summary
  tco: OperationalAnalysis
  domestic: DomesticAnalysis
  arms: ArmsAnalysis
  drugs: DrugsAnalysis
  teams: TeamsAnalysis
  operations: Record<string, OperationalAnalysis>
  mvi: Record<string, MviAnalysis>
  mvi_comparison: MviComparison
}
type Snapshot = {
  version: string
  years: number[]
  cities: string[]
  views: Record<string, View>
  records: Record<Source, RecordItem[]>
  evidence: Record<string, string>
  details: Record<string, Record<string, { current: MviRecordDetail; versions: MviRecordVersion[] }>>
  batches: Batch[]
}

let snapshotPromise: Promise<Snapshot> | undefined

function snapshot(): Promise<Snapshot> {
  snapshotPromise ??= fetch(`${import.meta.env.BASE_URL}demo-data.json`).then(response => {
    if (!response.ok) throw new Error('Dados sintéticos da demonstração indisponíveis.')
    return response.json() as Promise<Snapshot>
  })
  return snapshotPromise
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function viewFor(data: Snapshot, params: URLSearchParams): View {
  const requestedYear = Number(params.get('year'))
  const year = requestedYear && data.years.includes(requestedYear) ? requestedYear : params.has('year') ? 1900 : '*'
  const requestedCity = params.get('municipality')
  const city = requestedCity ? data.cities.find(item => fold(item) === fold(requestedCity))?.toLowerCase() || '__sem_resultado__' : '*'
  return data.views[`${year}|${city}`]
}

function response(value: unknown, status = 200): Response {
  return Response.json(value, { status })
}

export async function demoFetch(input: string, init?: RequestInit): Promise<Response> {
  if (init?.method && init.method !== 'GET') return response({ detail: 'Demonstração somente para consulta' }, 403)
  const data = await snapshot()
  const url = new URL(input)
  const path = url.pathname
  const view = viewFor(data, url.searchParams)
  if (path === '/indicators/summary') return response(view.summary)
  if (path === '/indicators/tco/analysis') return response(view.tco)
  if (path === '/indicators/domestic/analysis') return response(view.domestic)
  if (path === '/indicators/arms/analysis') return response(view.arms)
  if (path === '/indicators/drugs/analysis') return response(view.drugs)
  if (path === '/indicators/teams/analysis') return response(view.teams)
  const operation = path.match(/^\/indicators\/operations\/(Mandados|Visitas|Sossego)\/analysis$/)
  if (operation) return response(view.operations[operation[1]])
  const mvi = path.match(/^\/indicators\/mvi\/(mvi_cad|mvi_neac)\/analysis$/)
  if (mvi) return response(view.mvi[mvi[1]])
  if (path === '/indicators/mvi/comparison') return response(view.mvi_comparison)
  if (path === '/imports') return response({ items: data.batches })
  const records = path.match(/^\/records\/(mvi_cad|mvi_neac|ocorrencias|armas|drogas|guarnicoes)$/)
  if (records) {
    const source = records[1] as Source
    const year = Number(url.searchParams.get('year'))
    const city = url.searchParams.get('municipality')
    const victim = url.searchParams.get('victim')
    const prefix = url.searchParams.get('category_prefix')
    const indicator = url.searchParams.get('indicator')
    const onlyEligible = url.searchParams.get('eligible_only') === 'true'
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    const size = Math.min(100, Math.max(1, Number(url.searchParams.get('size')) || 20))
    const items = data.records[source].filter(item =>
      (!year || Number(item.event_date.slice(0, 4)) === year) &&
      (!city || fold(item.municipality) === fold(city)) &&
      (!victim || item.victim.toLowerCase().includes(victim.toLowerCase())) &&
      (!prefix || item.category.startsWith(prefix)) &&
      (!indicator || item.indicators.includes(indicator)) &&
      (!onlyEligible || item.eligible),
    ).map(item => indicator && data.evidence[`${indicator}|${item.natural_key}`]
      ? { ...item, action_evidence: data.evidence[`${indicator}|${item.natural_key}`] } : item)
    return response({ total: items.length, page, size, items: items.slice((page - 1) * size, page * size) })
  }
  const detail = path.match(/^\/mvi\/(mvi_cad|mvi_neac)\/records\/([^/]+)(\/versions)?$/)
  if (detail) {
    const entry = data.details[detail[1]]?.[decodeURIComponent(detail[2])]
    if (!entry) return response({ detail: 'Caso MVI não encontrado' }, 404)
    if (detail[3]) return response({ items: entry.versions })
    const version = url.searchParams.get('version')
    return !version || Number(version) === entry.current.version
      ? response(entry.current) : response({ detail: 'Versão não encontrada' }, 404)
  }
  return response({ detail: 'Rota indisponível na demonstração' }, 404)
}
