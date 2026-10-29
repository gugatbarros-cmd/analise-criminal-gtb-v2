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
  audit: Record<string, { divergences: { source: Source; natural_key: string; reason: string }[]; quarantine: { row_number: number; reason: string; fields: Record<string, string> }[] }>
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

function filteredArms(data: Snapshot, params: URLSearchParams): RecordItem[] {
  const year = Number(params.get('year'))
  const city = params.get('municipality')
  const month = Number(params.get('month'))
  const start = params.get('start_date')
  const end = params.get('end_date')
  const type = params.get('arm_type')
  const situation = params.get('situation')
  return data.records.armas.filter(item => item.eligible &&
    (!year || Number(item.event_date.slice(0, 4)) === year) &&
    (!city || fold(item.municipality) === fold(city)) &&
    (!month || Number(item.event_date.slice(5, 7)) === month) &&
    (!start || item.event_date >= start) && (!end || item.event_date <= end) &&
    (!type || fold(item.category || 'Não informado') === fold(type)) &&
    (!situation || fold(item.arm_situation || 'Não informado') === fold(situation)))
}

function armsAnalysis(items: RecordItem[]): ArmsAnalysis {
  const monthly: Record<string, number> = {}
  const groups: Record<string, Record<string, number>> = {
    municipalities: {}, types: {}, calibers: {}, situations: {},
  }
  let total = 0; let seized = 0; let restricted = 0
  for (const item of items) {
    const units = item.arm_quantity || 1
    total += units
    if (item.arm_seized) {
      seized += units
      const period = item.event_date.slice(0, 7)
      monthly[period] = (monthly[period] || 0) + units
    }
    if (item.arm_restricted) restricted += units
    for (const [group, value] of Object.entries({ municipalities: item.municipality,
      types: item.category || 'Não informado', calibers: item.arm_caliber || 'Não informado',
      situations: item.arm_situation || 'Não informado' })) {
      groups[group][value] = (groups[group][value] || 0) + units
    }
  }
  const ranking = (values: Record<string, number>) => Object.entries(values)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 10)
    .map(([name, amount]) => ({ name, total: amount }))
  return { total, seized, restricted, records: items.length,
    available_types: Object.keys(groups.types).sort(),
    available_situations: Object.keys(groups.situations).sort(),
    monthly: Object.entries(monthly).sort(([a], [b]) => a < b ? -1 : 1)
      .map(([period, amount]) => ({ period, total: amount })),
    municipalities: ranking(groups.municipalities), types: ranking(groups.types),
    calibers: ranking(groups.calibers), situations: ranking(groups.situations) }
}

function filteredDrugs(data: Snapshot, params: URLSearchParams): RecordItem[] {
  const year = Number(params.get('year'))
  const city = params.get('municipality')
  const month = Number(params.get('month'))
  const start = params.get('start_date')
  const end = params.get('end_date')
  const type = params.get('drug_type')
  return data.records.drogas.filter(item => item.eligible &&
    (!year || Number(item.event_date.slice(0, 4)) === year) &&
    (!city || fold(item.municipality) === fold(city)) &&
    (!month || Number(item.event_date.slice(5, 7)) === month) &&
    (!start || item.event_date >= start) && (!end || item.event_date <= end) &&
    (!type || fold(item.category || 'Não informado') === fold(type)))
}

function drugsAnalysis(items: RecordItem[]): DrugsAnalysis {
  const monthly: Record<string, number> = {}
  const groups: Record<string, Record<string, number>> = {
    types: {}, municipalities: {}, locations: {},
  }
  const weights: Record<string, number> = {}
  let totalWeight = 0; let weightedRecords = 0
  for (const item of items) {
    const period = item.event_date.slice(0, 7)
    monthly[period] = (monthly[period] || 0) + 1
    const type = item.category || 'Não informado'
    for (const [group, value] of Object.entries({ types: type,
      municipalities: item.municipality, locations: item.drug_location || 'Não informado' })) {
      groups[group][value] = (groups[group][value] || 0) + 1
    }
    if (item.drug_weight_grams !== null && item.drug_weight_grams !== undefined) {
      weightedRecords += 1
      totalWeight += item.drug_weight_grams
      weights[type] = (weights[type] || 0) + item.drug_weight_grams
    }
  }
  const ranking = (values: Record<string, number>) => Object.entries(values)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 10)
    .map(([name, total]) => ({ name, total }))
  return { total: items.length, total_weight_grams: Number(totalWeight.toFixed(3)),
    weighted_records: weightedRecords, available_types: Object.keys(groups.types).sort(),
    monthly: Object.entries(monthly).sort(([a], [b]) => a < b ? -1 : 1)
      .map(([period, total]) => ({ period, total })),
    types: ranking(groups.types), municipalities: ranking(groups.municipalities),
    locations: ranking(groups.locations),
    weights_by_type: Object.entries(weights)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .map(([name, grams]) => ({ name, grams: Number(grams.toFixed(3)) })) }
}

function filteredTeams(data: Snapshot, params: URLSearchParams): RecordItem[] {
  const year = Number(params.get('year'))
  const city = params.get('municipality')
  const month = Number(params.get('month'))
  const start = params.get('start_date')
  const end = params.get('end_date')
  const team = params.get('team_name')
  const officer = params.get('officer_registration')
  const nature = params.get('nature_filter')
  return data.records.guarnicoes.filter(item => item.eligible &&
    (!year || Number(item.event_date.slice(0, 4)) === year) &&
    (!city || fold(item.municipality) === fold(city)) &&
    (!month || Number(item.event_date.slice(5, 7)) === month) &&
    (!start || item.event_date >= start) && (!end || item.event_date <= end) &&
    (!team || fold(item.category || 'Não informado') === fold(team)) &&
    (!officer || (item.team_officers || []).some(member => fold(member.registration) === fold(officer))) &&
    (!nature || fold(item.nature || 'Não informada') === fold(nature)))
}

function teamsAnalysis(items: RecordItem[]): TeamsAnalysis {
  const teams: Record<string, { occurrences: number; points: number }> = {}
  const officers: Record<string, { name: string; registration: string; occurrences: number; points: number }> = {}
  const officerOccurrences = new Set<string>()
  const natures: Record<string, number> = {}
  let roster = 0; let extra = 0; let unlisted = 0; let points = 0
  for (const item of items) {
    const score = item.team_score || 1
    if (item.team_group === 'roster') {
      roster += 1; points += score
      const team = teams[item.category] ||= { occurrences: 0, points: 0 }
      team.occurrences += 1; team.points += score
      const nature = item.nature || 'Não informada'
      natures[nature] = (natures[nature] || 0) + 1
    } else if (item.team_group === 'extra') extra += 1
    else unlisted += 1
    for (const officer of item.team_officers || []) {
      const marker = `${officer.registration}|${item.occurrence || item.natural_key}`
      if (officerOccurrences.has(marker)) continue
      officerOccurrences.add(marker)
      const entry = officers[officer.registration] ||= { name: officer.name,
        registration: officer.registration, occurrences: 0, points: 0 }
      entry.occurrences += 1; entry.points += score
    }
  }
  return { roster_occurrences: roster, weighted_points: points,
    teams: Object.keys(teams).length, officers: Object.keys(officers).length,
    extra_occurrences: extra, unlisted_occurrences: unlisted,
    available_teams: [...new Set(items.map(item => item.category).filter(Boolean))].sort(),
    available_natures: [...new Set(items.map(item => item.nature).filter(Boolean))].sort(),
    available_officers: [...new Set(items.flatMap(item =>
      (item.team_officers || []).map(officer => officer.registration)))].sort(),
    ranking: Object.entries(teams).sort((a, b) => b[1].points - a[1].points ||
      b[1].occurrences - a[1].occurrences || a[0].localeCompare(b[0]))
      .map(([name, value]) => ({ name, ...value })),
    officer_ranking: Object.values(officers).sort((a, b) => b.points - a.points ||
      b.occurrences - a.occurrences || a.name.localeCompare(b.name)),
    natures: Object.entries(natures).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 10).map(([name, total]) => ({ name, total })) }
}

export async function demoFetch(input: string, init?: RequestInit): Promise<Response> {
  if (init?.method && init.method !== 'GET') return response({ detail: 'Demonstração somente para consulta' }, 403)
  const data = await snapshot()
  const url = new URL(input)
  const path = url.pathname
  const view = viewFor(data, url.searchParams)
  if (path === '/indicators/summary') return response(view.summary)
  if (path === '/indicators/crimes/analysis') {
    const kind = url.searchParams.get('kind') || ''
    if (!['CVP', 'Tentativa de homicídio'].includes(kind)) return response({ detail: 'Indicador desconhecido' }, 422)
    const year = Number(url.searchParams.get('year'))
    const city = url.searchParams.get('municipality')
    const rows = data.records.ocorrencias.filter(item => item.eligible && item.indicators.includes(kind) &&
      (!year || Number(item.event_date.slice(0, 4)) === year) && (!city || fold(item.municipality) === fold(city)))
    const distribution = (field: (item: RecordItem) => string) => {
      const counts: Record<string, number> = {}
      rows.forEach(item => { const key = field(item); counts[key] = (counts[key] || 0) + 1 })
      return Object.entries(counts).map(([name, total]) => ({ name, total }))
    }
    return response({ total: rows.length,
      monthly: distribution(item => item.event_date.slice(0, 7)).sort((a, b) => a.name.localeCompare(b.name)).map(item => ({ period: item.name, total: item.total })),
      municipalities: distribution(item => item.municipality).sort((a, b) => b.total - a.total),
      natures: distribution(item => item.nature || 'Não informada').sort((a, b) => b.total - a.total) })
  }
  if (path === '/indicators/tco/analysis') return response(view.tco)
  if (path === '/indicators/domestic/analysis') return response(view.domestic)
  if (path === '/indicators/arms/analysis') return response(
    ['month', 'start_date', 'end_date', 'arm_type', 'situation'].some(name => url.searchParams.has(name))
      ? armsAnalysis(filteredArms(data, url.searchParams)) : view.arms)
  if (path === '/indicators/drugs/analysis') return response(
    ['month', 'start_date', 'end_date', 'drug_type'].some(name => url.searchParams.has(name))
      ? drugsAnalysis(filteredDrugs(data, url.searchParams)) : view.drugs)
  if (path === '/indicators/teams/analysis') return response(
    ['month', 'start_date', 'end_date', 'team_name', 'officer_registration', 'nature_filter']
      .some(name => url.searchParams.has(name))
      ? teamsAnalysis(filteredTeams(data, url.searchParams)) : view.teams)
  const operation = path.match(/^\/indicators\/operations\/(Mandados|Visitas|Sossego)\/analysis$/)
  if (operation) return response(view.operations[operation[1]])
  const mvi = path.match(/^\/indicators\/mvi\/(mvi_cad|mvi_neac)\/analysis$/)
  if (mvi) return response(view.mvi[mvi[1]])
  if (path === '/indicators/mvi/comparison') return response(view.mvi_comparison)
  if (path === '/imports') {
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    const size = Math.min(100, Math.max(1, Number(url.searchParams.get('size')) || 20))
    return response({ items: data.batches.slice((page - 1) * size, page * size),
      total: data.batches.length, page, size })
  }
  const audit = path.match(/^\/imports\/([^/]+)\/(divergences|quarantine)$/)
  if (audit) {
    const items = data.audit[decodeURIComponent(audit[1])]?.[audit[2] as 'divergences' | 'quarantine'] || []
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    const size = Math.min(1000, Math.max(1, Number(url.searchParams.get('size')) || 100))
    return response({ items: items.slice((page - 1) * size, page * size), total: items.length, page, size })
  }
  if (path === '/consolidated-records') {
    const source = url.searchParams.get('source') as Source | null
    const year = Number(url.searchParams.get('year'))
    const city = url.searchParams.get('municipality')
    const search = url.searchParams.get('search')?.toLowerCase()
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    const size = Math.min(100, Math.max(1, Number(url.searchParams.get('size')) || 50))
    const items = (Object.entries(data.records) as [Source, RecordItem[]][]).flatMap(([itemSource, records]) =>
      records.map(item => ({ ...item, source: itemSource }))).filter(item =>
        (!source || item.source === source) &&
        (!year || Number(item.event_date.slice(0, 4)) === year) &&
        (!city || fold(item.municipality) === fold(city)) &&
        (!search || `${item.occurrence} ${item.victim} ${item.nature} ${item.category}`.toLowerCase().includes(search)))
      .sort((a, b) => b.event_date.localeCompare(a.event_date) || a.source.localeCompare(b.source))
    return response({ total: items.length, page, size, items: items.slice((page - 1) * size, page * size) })
  }
  if (path === '/municipalities/overview') {
    const year = Number(url.searchParams.get('year'))
    const rows: Record<string, { municipality: string; total: number; ocorrencias: number; mvi_cad: number; mvi_neac: number; armas: number; drogas: number; guarnicoes: number }> = {}
    for (const [source, records] of Object.entries(data.records) as [Source, RecordItem[]][]) for (const item of records) {
      if ((year && Number(item.event_date.slice(0, 4)) !== year) || !item.municipality) continue
      const row = rows[item.municipality] ||= { municipality: item.municipality, total: 0, ocorrencias: 0, mvi_cad: 0, mvi_neac: 0, armas: 0, drogas: 0, guarnicoes: 0 }
      row.total += 1
      if (!source.startsWith('mvi_') || item.eligible) row[source] += 1
    }
    return response({ items: Object.values(rows).sort((a, b) => b.total - a.total || a.municipality.localeCompare(b.municipality)) })
  }
  const records = path.match(/^\/records\/(mvi_cad|mvi_neac|ocorrencias|armas|drogas|guarnicoes)$/)
  if (records) {
    const source = records[1] as Source
    const year = Number(url.searchParams.get('year'))
    const startDate = url.searchParams.get('start_date')
    const endDate = url.searchParams.get('end_date')
    const city = url.searchParams.get('municipality')
    const victim = url.searchParams.get('victim')
    const prefix = url.searchParams.get('category_prefix')
    const indicator = url.searchParams.get('indicator')
    const month = Number(url.searchParams.get('month'))
    const armType = url.searchParams.get('arm_type')
    const situation = url.searchParams.get('situation')
    const drugType = url.searchParams.get('drug_type')
    const teamName = url.searchParams.get('team_name')
    const officerRegistration = url.searchParams.get('officer_registration')
    const natureFilter = url.searchParams.get('nature_filter')
    const onlyEligible = url.searchParams.get('eligible_only') === 'true'
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
    const size = Math.min(100, Math.max(1, Number(url.searchParams.get('size')) || 20))
    const items = data.records[source].filter(item =>
      (!year || Number(item.event_date.slice(0, 4)) === year) &&
      (!month || Number(item.event_date.slice(5, 7)) === month) &&
      (!startDate || item.event_date >= startDate) &&
      (!endDate || item.event_date <= endDate) &&
      (!armType || fold(item.category || 'Não informado') === fold(armType)) &&
      (!situation || fold(item.arm_situation || 'Não informado') === fold(situation)) &&
      (!drugType || fold(item.category || 'Não informado') === fold(drugType)) &&
      (!teamName || fold(item.category || 'Não informado') === fold(teamName)) &&
      (!officerRegistration || (item.team_officers || []).some(member =>
        fold(member.registration) === fold(officerRegistration))) &&
      (!natureFilter || fold(item.nature || 'Não informada') === fold(natureFilter)) &&
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
