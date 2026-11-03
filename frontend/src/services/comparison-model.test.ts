import { expect, it } from 'vitest'
import { comparisonCsv, indicatorFacts, monthRange, previousYearDay, rangeDays, rangeTotal, sourceFacts, validRange, variation, yearRange, type ComparisonFact } from './comparison-model'

const fact = (extra: Partial<ComparisonFact> = {}): ComparisonFact => ({ source: 'ocorrencias', date: '2026-01-05', city: 'Igaci', nature: 'Roubo', category: 'CVP Consumado', eligible: true, indicators: ['CVP'], teamGroup: '', records: 1, units: 0, grams: 0, weighted: 0, points: 0, ...extra })
it('compara anos, meses e períodos sem recortar pelo ano atual ou somar CAD e NEAC', () => {
  const data = [fact({ date: '2025-01-05', records: 4 }), fact({ records: 6 }), fact({ source: 'mvi_neac' }), fact({ source: 'mvi_cad' }), fact({ city: 'Maceió' })]
  const source = sourceFacts(data, 'cvp', 'Igaci'), selected = indicatorFacts(source, 'cvp')
  const a = rangeTotal(source, selected, yearRange(2025), 'records').value
  const b = rangeTotal(source, selected, monthRange(2026, 1), 'records').value
  expect([a, b]).toEqual([4, 6]); expect(variation(a, b)).toEqual({ difference: 2, percent: 50 })
  expect(rangeTotal(source, selected, { start: '2026-01-06', end: '2026-02-01' }, 'records').value).toBeNull()
  expect(sourceFacts(data, 'mvi-cad')).toHaveLength(1)
  expect(sourceFacts(data, 'mvi-neac')).toHaveLength(1)
})
it('distingue ausência de base de zero e não divide por zero', () => {
  const rows = [fact({ indicators: ['Visitas'] })]
  expect(rangeTotal(rows, indicatorFacts(rows, 'cvp'), yearRange(2026), 'records').value).toBe(0)
  expect(rangeTotal(rows, rows, yearRange(2025), 'records').value).toBeNull()
  expect(variation(0, 3)).toEqual({ difference: 3, percent: null })
  expect(variation(0, 0)).toEqual({ difference: 0, percent: 0 })
  expect(variation(null, 3)).toEqual({ difference: null, percent: null })
})
it('preserva quantidades, kg reconhecidos, grupos e pontos e aplica classificação', () => {
  const arms = [fact({ source: 'armas', units: 3, records: 1 })]
  expect(rangeTotal(arms, arms, yearRange(2026), 'units').value).toBe(3)
  const drugs = [fact({ source: 'drogas', grams: 1500, weighted: 1, records: 2 })]
  expect(rangeTotal(drugs, drugs, yearRange(2026), 'kg')).toEqual({ value: 1.5, weighted: 1, records: 2 })
  expect(rangeTotal(drugs, [fact({ source: 'drogas' })], yearRange(2026), 'kg').value).toBeNull()
  const teams = [fact({ source: 'guarnicoes', teamGroup: 'roster', points: 5 }), fact({ source: 'guarnicoes', teamGroup: 'extra', points: 4 })]
  expect(rangeTotal(teams, indicatorFacts(teams, 'guarnicoes'), yearRange(2026), 'points').value).toBe(5)
  expect(indicatorFacts([fact(), fact({ category: 'CVP Tentado' })], 'cvp', 'CVP Tentado')).toHaveLength(1)
})
it('valida datas inclusivas, períodos invertidos e ajusta 29 de fevereiro', () => {
  expect(previousYearDay('2024-02-29')).toBe('2023-02-28')
  expect(monthRange(2024, 2).end).toBe('2024-02-29')
  expect(rangeDays({ start: '2024-02-28', end: '2024-02-29' })).toBe(2)
  expect(validRange({ start: '2025-02-29', end: '2025-03-01' })).toBe(false)
  expect(validRange({ start: '2026-02-02', end: '2026-02-01' })).toBe(false)
})
it('exporta os valores com escape e delimitador compatível com planilhas', () => {
  expect(comparisonCsv(['Indicador', 'Valor'], [['A "B";C', 2]])).toBe('\uFEFF"Indicador";"Valor"\r\n"A ""B"";C";"2"')
})
