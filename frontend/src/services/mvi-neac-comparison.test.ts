import { describe, expect, it } from 'vitest'
import { formatNeacImportDate, mviNeacComparison } from './mvi-neac-comparison'
import type { ReportDataset, ReportRow } from './report-model'

const row = (date: string, values: Partial<ReportRow> = {}): ReportRow => ({
  source: 'mvi_neac', date, city: 'Igaci', nature: 'Homicídio doloso', category: 'Homicídio doloso', eligible: true,
  indicators: [], occurrence: 'SYNTHETIC', victim: 'Pessoa sintética', hour: null, neighborhood: '', age: '', sex: '',
  instrument: '', solution: '', relationship: '', aggression: '', quantity: 1, seized: false, restricted: false,
  caliber: '', brand: '', situation: '', grams: null, location: '', team: '', teamGroup: '', points: 0, officers: [], ...values,
})
const dataset = (rows: ReportRow[]): ReportDataset => ({ rows, updatedAt: '2026-11-04 12:00:00',
  sourceUpdatedAt: { mvi_neac: '2026-11-03 17:18:00' }, batches: 2, quarantined: 0 })

describe('comparativo MVI NEAC', () => {
  it('usa o mesmo corte nos dois anos e mantém meses sem vítimas', () => {
    const result = mviNeacComparison(dataset([
      row('2026-03-02'), row('2026-03-02'), row('2025-03-01'), row('2025-03-03'),
      row('2025-03-01', { city: 'Belém' }), row('2026-03-01', { source: 'mvi_cad' }),
      row('2026-03-01', { eligible: false }),
    ]), { year: 2026, city: 'Igaci' })!
    expect(result.currentEnd).toBe('2026-03-02')
    expect(result.previousEnd).toBe('2025-03-02')
    expect(result.current).toBe(2)
    expect(result.previous).toBe(1)
    expect(result.variationPercent).toBe(100)
    expect(result.months).toEqual([
      { month: 1, current: 0, previous: 0 }, { month: 2, current: 0, previous: 0 },
      { month: 3, current: 2, previous: 1 },
    ])
  })

  it('ajusta 29 de fevereiro e não usa a atualização de outra fonte como data NEAC', () => {
    const data = dataset([row('2024-02-29'), row('2023-02-28')])
    const result = mviNeacComparison(data, { year: 2024, start: '2024-02-01', end: '2024-02-29' })!
    expect(result.previousEnd).toBe('2023-02-28')
    expect(result.previous).toBe(1)
    expect(formatNeacImportDate(data)).toBe('03/11/2026 17:18')
    expect(formatNeacImportDate({ ...data, sourceUpdatedAt: undefined })).toBe('Não informada na base consultada')
  })

  it('limita o comparativo ao mês escolhido mesmo com datas mais amplas', () => {
    const result = mviNeacComparison(dataset([row('2026-03-02'), row('2026-04-02'), row('2025-03-02')]),
      { year: 2026, month: 3, start: '2026-01-01', end: '2026-12-31' })!
    expect(result.currentStart).toBe('2026-03-01')
    expect(result.currentEnd).toBe('2026-03-31')
    expect(result.months).toEqual([{ month: 3, current: 1, previous: 1 }])
  })
})
