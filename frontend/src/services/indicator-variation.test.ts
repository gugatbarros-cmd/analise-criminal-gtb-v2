import { describe, expect, it } from 'vitest'
import { indicatorVariation } from './indicator-variation'
import type { Summary } from './api'
import type { ComparisonDataset, ComparisonFact } from './comparison-model'

const fact = (source: ComparisonFact['source'], date: string, records: number, indicators: string[] = [], units = 0): ComparisonFact => ({
  source, date, city: 'Igaci', nature: 'Teste sintético', category: '', eligible: true,
  indicators, teamGroup: 'roster', records, units, grams: 0, weighted: 0, points: 0,
})
const summary = { source_coverage: { ocorrencias: 1, armas: 1 }, last_imported_at: {
  ocorrencias: '2026-05-10 10:00:00', armas: '2026-05-10 10:00:00',
} } as unknown as Summary

describe('variação dos indicadores', () => {
  it('interpreta queda criminal como favorável e alta como desfavorável no mesmo período', () => {
    const dataset: ComparisonDataset = { updatedAt: null, rows: [
      fact('ocorrencias', '2025-05-08', 12), fact('ocorrencias', '2026-05-08', 8),
      fact('ocorrencias', '2025-05-08', 1, ['CVP']), fact('ocorrencias', '2026-05-08', 3, ['CVP']),
      fact('ocorrencias', '2026-06-01', 20),
    ] }
    expect(indicatorVariation('ocorrencias', 'Ocorrências', summary, dataset, 2026, 'Igaci')).toMatchObject({ tone: 'good' })
    expect(indicatorVariation('cvp', 'CVP', summary, dataset, 2026, 'Igaci')).toMatchObject({ tone: 'bad' })
  })

  it('interpreta mais apreensões como favoráveis e não colore fonte ausente', () => {
    const dataset: ComparisonDataset = { updatedAt: null, rows: [
      fact('armas', '2025-05-08', 1, [], 2), fact('armas', '2026-05-08', 1, [], 4),
    ] }
    expect(indicatorVariation('armas', 'Armas', summary, dataset, 2026).tone).toBe('good')
    expect(indicatorVariation('mvi-neac', 'MVI NEAC', summary, dataset, 2026).tone).toBe('neutral')
  })
})
