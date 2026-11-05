import { describe, expect, it } from 'vitest'
import { mapFacts, mapSignal, mapTotals } from './crime-map-model'
import type { ComparisonFact } from './comparison-model'

const fact = (values: Partial<ComparisonFact>): ComparisonFact => ({
  source: 'ocorrencias', date: '2026-05-01', city: 'Igaci', nature: 'Roubo', category: '', eligible: true,
  indicators: [], teamGroup: '', records: 1, units: 0, grams: 0, weighted: 0, points: 0, ...values,
})

describe('mapa criminal', () => {
  it('separa MVI NEAC de crimes, descarta município externo e não duplica um registro em camadas', () => {
    const facts = mapFacts([
      fact({ source: 'mvi_neac', records: 2 }),
      fact({ indicators: ['CVP', 'Doméstica'], records: 3 }),
      fact({ indicators: ['Tentativa de homicídio'] }),
      fact({ city: 'Maceió', records: 9 }),
      fact({ eligible: false, records: 8 }),
    ])
    expect(facts.map(item => item.layer)).toEqual(['mvi', 'cvp', 'tentativas'])
    expect(mapTotals(facts)[0]).toMatchObject({ city: 'Igaci', total: 6, byLayer: { mvi: 2, cvp: 3, tentativas: 1 } })
  })

  it('só projeta uma tendência quando há histórico e volume mínimos', () => {
    const scarce = mapFacts([fact({ date: '2026-05-01', records: 2 })])
    expect(mapSignal(scarce, '2026-06-01').estimate).toBeNull()
    const history = mapFacts([fact({ date: '2026-01-01', records: 8 }), fact({ date: '2026-05-01', records: 12 })])
    expect(mapSignal(history, '2026-06-01')).toMatchObject({ recent: 12, previous: 8, estimate: 4, trend: 'Em alta' })
  })
})
