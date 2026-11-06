import { describe, expect, it } from 'vitest'
import { hasExactCoordinates, mapFacts, mapSignal, mapTotals } from './crime-map-model'
import { publicStreet } from './street-geocode'
import type { ComparisonFact } from './comparison-model'

const fact = (values: Partial<ComparisonFact>): ComparisonFact => ({
  source: 'ocorrencias', date: '2026-05-01', city: 'Igaci', nature: 'Roubo', category: '', eligible: true,
  indicators: [], teamGroup: '', records: 1, units: 0, grams: 0, weighted: 0, points: 0, ...values,
})

describe('mapa criminal', () => {
  it('separa MVI NEAC de crimes, descarta município externo e não duplica um registro em camadas', () => {
    const facts = mapFacts([
      fact({ source: 'mvi_neac', records: 2 }),
      fact({ source: 'mvi_cad', records: 1, address: 'Rua Sintética, Centro', latitude: -9.5369, longitude: -36.6338 }),
      fact({ indicators: ['CVP', 'Doméstica'], records: 3 }),
      fact({ indicators: ['Tentativa de homicídio'] }),
      fact({ city: 'Maceió', records: 9 }),
      fact({ eligible: false, records: 8 }),
    ])
    expect(facts.map(item => item.layer)).toEqual(['mvi', 'cad', 'cvp', 'tentativas'])
    expect(facts[1]).toMatchObject({ address: 'Rua Sintética, Centro', latitude: -9.5369, longitude: -36.6338 })
    expect(mapTotals(facts)[0]).toMatchObject({ city: 'Igaci', total: 7, byLayer: { mvi: 2, cad: 1, cvp: 3, tentativas: 1 } })
  })

  it('só projeta uma tendência quando há histórico e volume mínimos', () => {
    const scarce = mapFacts([fact({ date: '2026-05-01', records: 2 })])
    expect(mapSignal(scarce, '2026-06-01').estimate).toBeNull()
    const history = mapFacts([fact({ date: '2026-01-01', records: 8 }), fact({ date: '2026-05-01', records: 12 })])
    expect(mapSignal(history, '2026-06-01')).toMatchObject({ recent: 12, previous: 8, estimate: 4, trend: 'Em alta' })
  })

  it('valida coordenadas na região e retira o número antes da busca pela rua', () => {
    const facts = mapFacts([
      fact({ source: 'mvi_cad', latitude: -9.5369, longitude: -36.6338, street: 'Rua 15 de Novembro' }),
      fact({ source: 'mvi_cad', latitude: -9.4057, longitude: -35.6328, street: 'Rua Exemplo, 123' }),
    ])
    expect(hasExactCoordinates(facts[0])).toBe(true)
    expect(hasExactCoordinates(facts[1])).toBe(false)
    expect(publicStreet('Rua 15 de Novembro, 123')).toBe('Rua 15 de Novembro')
    expect(publicStreet('Rua Sintética 123-A')).toBe('Rua Sintética')
  })

  it('usa pontos individuais também para CVP e MVI NEAC', () => {
    const facts = mapFacts([
      fact({ indicators: ['CVP'], street: 'Rua Teste', latitude: -9.5369, longitude: -36.6338 }),
      fact({ source: 'mvi_neac', street: 'Rua Exemplo', latitude: -9.5368, longitude: -36.6337 }),
    ])
    expect(facts.map(item => item.layer)).toEqual(['cvp', 'mvi'])
    expect(facts.every(hasExactCoordinates)).toBe(true)
  })
})
