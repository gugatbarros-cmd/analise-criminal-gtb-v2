export type Source = 'mvi_cad' | 'mvi_neac' | 'ocorrencias' | 'armas' | 'drogas' | 'guarnicoes'
export type Summary = { mvi_cad: number; mvi_neac: number; cvp: number; tentativas: number; by_source: Record<Source, number>; monthly: Record<string, Partial<Record<Source, number>>>; categories: Partial<Record<Source, Record<string, number>>>; quarantined_rows: number }
export type Batch = { id: string; source: Source; filename: string; imported_at: string; row_count: number; inserted: number; updated: number; unchanged: number; quarantined: number; differences: number; status: string }
export type ImportResult = Pick<Batch, 'id' | 'row_count' | 'inserted' | 'updated' | 'unchanged' | 'quarantined' | 'differences' | 'status'> & { repeated: boolean }
export type RecordItem = { event_date: string; municipality: string; occurrence: string; victim: string; nature: string; category: string; eligible: boolean; reason: string; version: number; solution: string }
export type RecordPage = { total: number; page: number; size: number; items: RecordItem[] }
const baseUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

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
  return json(await fetch(`${baseUrl}/indicators/summary?${params}`))
}

export async function getBatches(): Promise<Batch[]> {
  return (await json<{ items: Batch[] }>(await fetch(`${baseUrl}/imports`))).items
}

export async function getRecords(source: Source, page: number, year?: number, municipality?: string, victim?: string, categoryPrefix?: string): Promise<RecordPage> {
  const params = new URLSearchParams({ page: String(page), size: '20', eligible_only: 'true' })
  if (year) params.set('year', String(year))
  if (municipality) params.set('municipality', municipality)
  if (victim) params.set('victim', victim)
  if (categoryPrefix) params.set('category_prefix', categoryPrefix)
  return json(await fetch(`${baseUrl}/records/${source}?${params}`))
}

export async function upload(source: Source, file: File, scope: 'partial' | 'complete'): Promise<ImportResult> {
  return json(await fetch(`${baseUrl}/imports/${source}?scope=${scope}`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) }, body: file,
  }))
}
