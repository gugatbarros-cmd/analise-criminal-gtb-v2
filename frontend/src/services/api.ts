import { demoFetch } from './static-demo'
import { getSessionToken } from './auth'

export type Source = 'mvi_cad' | 'mvi_neac' | 'ocorrencias' | 'armas' | 'drogas' | 'guarnicoes'
export type Summary = { mvi_cad: number; mvi_neac: number; cvp: number; tentativas: number; tco: number; mandados: number; visitas: number; sossego: number; domestica: number; by_source: Record<Source, number>; monthly: Record<string, Partial<Record<Source, number>>>; categories: Partial<Record<Source, Record<string, number>>>; quarantined_rows: number }
export type Batch = { id: string; source: Source; filename: string; imported_at: string; row_count: number; inserted: number; updated: number; unchanged: number; quarantined: number; differences: number; status: string }
export type BatchPage = AuditPage<Batch>
export type AuditPage<T> = { items: T[]; total: number; page: number; size: number }
export type BatchAudit = {
  divergences: AuditPage<{ source: Source; natural_key: string; reason: string }>
  quarantine: AuditPage<{ row_number: number; reason: string; fields: Record<string, string> }>
}
export type ImportResult = Pick<Batch, 'id' | 'row_count' | 'inserted' | 'updated' | 'unchanged' | 'quarantined' | 'differences' | 'status'> & { repeated: boolean }
export type RecordItem = { natural_key: string; event_date: string; municipality: string; occurrence: string; victim: string; nature: string; category: string; eligible: boolean; reason: string; version: number; solution: string; instrument: string; action_evidence: string; indicators: string[]; arm_quantity?: number; arm_situation?: string; arm_caliber?: string; arm_seized?: boolean; arm_restricted?: boolean; drug_quantity?: number; drug_unit?: string; drug_weight_grams?: number; drug_location?: string; team_score?: number; team_role?: string; team_group?: 'roster' | 'extra' | 'unlisted'; team_officers?: { name: string; registration: string; role: string }[] }
export type RecordPage = { total: number; page: number; size: number; items: RecordItem[] }
export type TcoAnalysis = { total: number; monthly: { period: string; total: number }[]; municipalities: { name: string; total: number }[]; natures: { name: string; total: number }[] }
export type OperationalKind = 'Mandados' | 'Visitas' | 'Sossego'
export type OperationalAnalysis = TcoAnalysis
export type DomesticAnalysis = TcoAnalysis & { reviews: { pending: number; excluded: number; outside: number } }
export type ArmsAnalysis = { total: number; seized: number; restricted: number; records: number; available_types: string[]; available_situations: string[]; monthly: { period: string; total: number }[]; municipalities: { name: string; total: number }[]; types: { name: string; total: number }[]; calibers: { name: string; total: number }[]; situations: { name: string; total: number }[] }
export type ArmsFilters = { month?: number; startDate?: string; endDate?: string; armType?: string; situation?: string }
export type DrugsAnalysis = { total: number; total_weight_grams: number; weighted_records: number; available_types: string[]; monthly: { period: string; total: number }[]; municipalities: { name: string; total: number }[]; types: { name: string; total: number }[]; locations: { name: string; total: number }[]; weights_by_type: { name: string; grams: number }[] }
export type DrugsFilters = { month?: number; startDate?: string; endDate?: string; drugType?: string }
export type TeamsAnalysis = { roster_occurrences: number; weighted_points: number; teams: number; officers: number; extra_occurrences: number; unlisted_occurrences: number; available_teams: string[]; ranking: { name: string; occurrences: number; points: number }[]; officer_ranking: { name: string; registration: string; occurrences: number; points: number }[]; natures: { name: string; total: number }[] }
export type TeamsFilters = { month?: number; startDate?: string; endDate?: string; teamName?: string }
export type MviSource = 'mvi_cad' | 'mvi_neac'
export type MviAnalysis = { source: MviSource; total: number; yearly: { year: number; total: number }[]; monthly: { period: string; total: number }[]; weekdays: { name: string; total: number }[]; municipalities: { name: string; total: number }[]; classifications: { name: string; total: number }[]; instruments: { name: string; total: number }[]; time_coverage: { valid: number; total: number }; time_bands: { name: string; total: number }[]; city_time_bands: { municipality: string; total: number; valid: number; top_band: string | null; top_band_total: number; top_category: string | null }[] }
export type MviComparison = { cad_total: number; neac_total: number; candidate_pairs: number; cad_only: number; neac_only: number; ambiguous: number; examples: { cad: { natural_key: string; occurrence: string; victim: string; date: string; municipality: string; category: string }; neac: { natural_key: string; occurrence: string; victim: string; date: string; municipality: string; category: string }; same_date: boolean; same_municipality: boolean }[] }
export type MviRecordDetail = { source: MviSource; natural_key: string; occurrence: string; victim: string; event_date: string; municipality: string; category: string; eligible: boolean; reason: string; version: number; batch_id: string; is_current: boolean; fields: Record<string, string> }
export type MviRecordVersion = { version: number; is_current: boolean; valid_from: string; valid_to: string | null; batch_id: string; eligible: boolean; category: string }
const baseUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const apiFetch: typeof fetch = (input, init) => {
  if (import.meta.env.VITE_STATIC_DEMO === '1') return demoFetch(String(input), init)
  const token = getSessionToken()
  if (!token) return fetch(input, init)
  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers }).then(response => {
    if (response.status === 401) window.dispatchEvent(new Event('gtb-session-expired'))
    return response
  })
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: string }
    throw new Error(body.detail || `Falha HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function getSummary(year?: number, municipality?: string): Promise<Summary> {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  if (municipality) params.set('municipality', municipality)
  return json(await apiFetch(`${baseUrl}/indicators/summary?${params}`))
}

export async function getTcoAnalysis(year?: number, municipality?: string): Promise<TcoAnalysis> {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  if (municipality) params.set('municipality', municipality)
  return json(await apiFetch(`${baseUrl}/indicators/tco/analysis?${params}`))
}

export async function getDomesticAnalysis(year?: number, municipality?: string): Promise<DomesticAnalysis> {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  if (municipality) params.set('municipality', municipality)
  return json(await apiFetch(`${baseUrl}/indicators/domestic/analysis?${params}`))
}

export async function getArmsAnalysis(year?: number, municipality?: string, filters: ArmsFilters = {}): Promise<ArmsAnalysis> {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  if (municipality) params.set('municipality', municipality)
  if (filters.month) params.set('month', String(filters.month))
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)
  if (filters.armType) params.set('arm_type', filters.armType)
  if (filters.situation) params.set('situation', filters.situation)
  return json(await apiFetch(`${baseUrl}/indicators/arms/analysis?${params}`))
}

export async function getDrugsAnalysis(year?: number, municipality?: string, filters: DrugsFilters = {}): Promise<DrugsAnalysis> {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  if (municipality) params.set('municipality', municipality)
  if (filters.month) params.set('month', String(filters.month))
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)
  if (filters.drugType) params.set('drug_type', filters.drugType)
  return json(await apiFetch(`${baseUrl}/indicators/drugs/analysis?${params}`))
}

export async function getTeamsAnalysis(year?: number, municipality?: string, filters: TeamsFilters = {}): Promise<TeamsAnalysis> {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  if (municipality) params.set('municipality', municipality)
  if (filters.month) params.set('month', String(filters.month))
  if (filters.startDate) params.set('start_date', filters.startDate)
  if (filters.endDate) params.set('end_date', filters.endDate)
  if (filters.teamName) params.set('team_name', filters.teamName)
  return json(await apiFetch(`${baseUrl}/indicators/teams/analysis?${params}`))
}

export async function getOperationalAnalysis(kind: OperationalKind, year?: number, municipality?: string): Promise<OperationalAnalysis> {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  if (municipality) params.set('municipality', municipality)
  return json(await apiFetch(`${baseUrl}/indicators/operations/${kind}/analysis?${params}`))
}

export async function getMviAnalysis(source: MviSource, year?: number, municipality?: string): Promise<MviAnalysis> {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  if (municipality) params.set('municipality', municipality)
  return json(await apiFetch(`${baseUrl}/indicators/mvi/${source}/analysis?${params}`))
}

export async function getMviComparison(year?: number, municipality?: string): Promise<MviComparison> {
  const params = new URLSearchParams()
  if (year) params.set('year', String(year))
  if (municipality) params.set('municipality', municipality)
  return json(await apiFetch(`${baseUrl}/indicators/mvi/comparison?${params}`))
}

export async function getMviRecordDetail(source: MviSource, naturalKey: string, version?: number): Promise<MviRecordDetail> {
  const url = `${baseUrl}/mvi/${source}/records/${encodeURIComponent(naturalKey)}`
  return json(await apiFetch(version === undefined ? url : `${url}?version=${version}`))
}

export async function getMviRecordVersions(source: MviSource, naturalKey: string): Promise<MviRecordVersion[]> {
  const response = await json<{ items: MviRecordVersion[] }>(await apiFetch(`${baseUrl}/mvi/${source}/records/${encodeURIComponent(naturalKey)}/versions`))
  return response.items
}

export async function getBatches(page = 1): Promise<BatchPage> {
  return json(await apiFetch(`${baseUrl}/imports?page=${page}&size=20`))
}

export async function getBatchAudit(batchId: string, quarantinePage = 1, divergencePage = 1): Promise<BatchAudit> {
  const prefix = `${baseUrl}/imports/${encodeURIComponent(batchId)}`
  const [divergences, quarantine] = await Promise.all([
    json<BatchAudit['divergences']>(await apiFetch(`${prefix}/divergences?page=${divergencePage}&size=100`)),
    json<BatchAudit['quarantine']>(await apiFetch(`${prefix}/quarantine?page=${quarantinePage}&size=100`)),
  ])
  return { divergences, quarantine }
}

export async function getRecords(source: Source, page: number, year?: number, municipality?: string, victim?: string, categoryPrefix?: string, indicator?: string, startDate?: string, endDate?: string, month?: number, armType?: string, situation?: string, drugType?: string, teamName?: string): Promise<RecordPage> {
  const params = new URLSearchParams({ page: String(page), size: '20', eligible_only: 'true' })
  if (year) params.set('year', String(year))
  if (municipality) params.set('municipality', municipality)
  if (victim) params.set('victim', victim)
  if (categoryPrefix) params.set('category_prefix', categoryPrefix)
  if (indicator) params.set('indicator', indicator)
  if (startDate) params.set('start_date', startDate)
  if (endDate) params.set('end_date', endDate)
  if (month) params.set('month', String(month))
  if (armType) params.set('arm_type', armType)
  if (situation) params.set('situation', situation)
  if (drugType) params.set('drug_type', drugType)
  if (teamName) params.set('team_name', teamName)
  return json(await apiFetch(`${baseUrl}/records/${source}?${params}`))
}

export async function upload(source: Source, file: File, scope: 'partial' | 'complete'): Promise<ImportResult> {
  return json(await apiFetch(`${baseUrl}/imports/${source}?scope=${scope}`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) }, body: file,
  }))
}
