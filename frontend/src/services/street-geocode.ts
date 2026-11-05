import { municipalityPoints, nearMunicipality } from './crime-map-model'

export type StreetPoint = { latitude: number; longitude: number; label: string }
const cacheKey = 'gtb2-street-geocode-v1'
let lastRequest = 0

export function publicStreet(street: string): string {
  return street.trim().replace(/(?:,\s*|\s+n[ºo.]?\s+)\d{1,6}\b.*$/i, '').replace(/\s+\d{1,6}$/, '').trim()
}

function cache(): Record<string, StreetPoint> {
  try { return JSON.parse(localStorage.getItem(cacheKey) || '{}') as Record<string, StreetPoint> } catch { return {} }
}

export function cachedStreetPoint(street: string, city: string): StreetPoint | undefined {
  const point = cache()[`${publicStreet(street).toLocaleLowerCase('pt-BR')}|${city}`]
  return point && nearMunicipality(point.latitude, point.longitude, city) ? point : undefined
}

export async function locateStreet(street: string, city: string): Promise<StreetPoint> {
  const road = publicStreet(street)
  if (!road || road.length < 4 || !municipalityPoints[city]) throw new Error('Rua insuficiente para localização aproximada')
  const saved = cachedStreetPoint(road, city)
  if (saved) return saved
  const pause = Math.max(0, 1100 - (Date.now() - lastRequest))
  if (pause) await new Promise(resolve => setTimeout(resolve, pause))
  lastRequest = Date.now()
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.search = new URLSearchParams({ q: `${road}, ${city}, Alagoas, Brasil`, format: 'jsonv2', limit: '3', countrycodes: 'br' }).toString()
  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error('Serviço de localização temporariamente indisponível')
  const results = await response.json() as { lat: string; lon: string; display_name?: string }[]
  const match = results.find(item => nearMunicipality(Number(item.lat), Number(item.lon), city))
  if (!match) throw new Error('Rua não localizada com segurança nesse município')
  const point = { latitude: Number(match.lat), longitude: Number(match.lon), label: `${road}, ${city}` }
  try {
    const savedCache = cache()
    savedCache[`${road.toLocaleLowerCase('pt-BR')}|${city}`] = point
    const entries = Object.entries(savedCache).slice(-100)
    localStorage.setItem(cacheKey, JSON.stringify(Object.fromEntries(entries)))
  } catch { /* cache privado indisponível */ }
  return point
}
