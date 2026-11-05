import type { ComparisonFact } from './comparison-model'
import { fold } from './report-model'

export const municipalityPoints: Record<string, [number, number]> = {
  'Palmeira dos Índios': [-9.4057, -36.6328],
  Belém: [-9.5705, -36.4904],
  "Tanque d'Arca": [-9.5332, -36.4360],
  Maribondo: [-9.5835, -36.3044],
  Igaci: [-9.5369, -36.6338],
  Quebrangulo: [-9.3185, -36.4722],
  'Paulo Jacinto': [-9.3672, -36.3672],
  'Mar Vermelho': [-9.4474, -36.3881],
  'Estrela de Alagoas': [-9.3909, -36.7644],
  'Minador do Negrão': [-9.3123, -36.8696],
  Cacimbinhas: [-9.4012, -36.9911],
}
const cityNames = new Map(Object.keys(municipalityPoints).map(city => [fold(city), city]))

export const mapLayers = [
  { id: 'mvi', label: 'MVI NEAC', color: '#dc4251' },
  { id: 'cad', label: 'MVI CAD', color: '#e8bd69' },
  { id: 'cvp', label: 'CVP', color: '#e59445' },
  { id: 'tentativas', label: 'Tentativas', color: '#bd73d8' },
  { id: 'domestica', label: 'Violência doméstica', color: '#667ee7' },
  { id: 'outros', label: 'Outras ocorrências', color: '#48b8a8' },
] as const
export type MapLayerId = typeof mapLayers[number]['id']
export type MapFact = { date: string; city: string; layer: MapLayerId; count: number; nature: string; address?: string; street?: string; latitude?: number; longitude?: number }
export function nearMunicipality(latitude: number, longitude: number, city: string): boolean {
  const center = municipalityPoints[city]
  if (!center || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return false
  const radians = Math.PI / 180
  const deltaLat = (latitude - center[0]) * radians
  const deltaLon = (longitude - center[1]) * radians
  const arc = Math.sin(deltaLat / 2) ** 2 + Math.cos(center[0] * radians) * Math.cos(latitude * radians) * Math.sin(deltaLon / 2) ** 2
  return 12742 * Math.asin(Math.min(1, Math.sqrt(arc))) <= 35
}
export const hasExactCoordinates = (fact: MapFact) => fact.layer === 'cad' && nearMunicipality(fact.latitude!, fact.longitude!, fact.city)

export function mapFacts(rows: ComparisonFact[]): MapFact[] {
  return rows.flatMap<MapFact>(row => {
    const city = cityNames.get(fold(row.city))
    if (!city || !row.eligible || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return []
    if (row.source === 'mvi_neac') return [{ date: row.date, city, layer: 'mvi' as const, count: row.records, nature: row.category || row.nature }]
    if (row.source === 'mvi_cad') return [{ date: row.date, city, layer: 'cad' as const, count: row.records, nature: row.category || row.nature,
      address: row.address || undefined, street: row.street || undefined, latitude: row.latitude ?? undefined, longitude: row.longitude ?? undefined }]
    if (row.source !== 'ocorrencias' || (fold(row.nature).includes('apoioaojudiciario') && fold(row.nature).includes('fiscalizacaodemedidaprotetiva'))) return []
    const layer: MapLayerId = row.indicators.includes('CVP') ? 'cvp'
      : row.indicators.includes('Tentativa de homicídio') ? 'tentativas'
        : row.indicators.includes('Doméstica') ? 'domestica' : 'outros'
    return [{ date: row.date, city, layer, count: row.records, nature: row.nature || row.category }]
  })
}

export function mapTotals(facts: MapFact[]) {
  const totals = new Map<string, { city: string; total: number; byLayer: Record<MapLayerId, number> }>()
  for (const fact of facts) {
    const item = totals.get(fact.city) || { city: fact.city, total: 0, byLayer: { mvi: 0, cad: 0, cvp: 0, tentativas: 0, domestica: 0, outros: 0 } }
    item.total += fact.count
    item.byLayer[fact.layer] += fact.count
    totals.set(fact.city, item)
  }
  return [...totals.values()].sort((a, b) => b.total - a.total || a.city.localeCompare(b.city, 'pt-BR'))
}

const daysBefore = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10)
export function mapSignal(facts: MapFact[], end: string) {
  const recentStart = daysBefore(end, 89)
  const previousStart = daysBefore(end, 179)
  const previousEnd = daysBefore(end, 90)
  const recent = facts.filter(row => row.date >= recentStart && row.date <= end).reduce((sum, row) => sum + row.count, 0)
  const previous = facts.filter(row => row.date >= previousStart && row.date <= previousEnd).reduce((sum, row) => sum + row.count, 0)
  const enoughHistory = facts.some(row => row.date <= previousEnd) && recent + previous >= 12
  if (!enoughHistory) return { recent, previous, estimate: null, trend: 'Base insuficiente' as const, change: null }
  const change = previous ? Math.round((recent - previous) / previous * 100) : null
  const trend = previous === 0 ? 'Sem referência' : change! >= 20 ? 'Em alta' : change! <= -20 ? 'Em queda' : 'Estável'
  return { recent, previous, estimate: Math.round(recent / 3), trend, change }
}
