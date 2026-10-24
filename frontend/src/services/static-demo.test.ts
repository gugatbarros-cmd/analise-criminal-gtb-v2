import { afterEach, expect, it, vi } from 'vitest'
import { demoFetch } from './static-demo'

afterEach(() => vi.unstubAllGlobals())

it('serve consultas sintéticas com filtros e bloqueia escrita', async () => {
  const caseItem = {
    natural_key: '2026|demo1', event_date: '2026-01-05', municipality: 'Igaci',
    occurrence: 'DEMO-1', victim: '', nature: 'Visita orientativa', category: '',
    eligible: true, reason: '', version: 1, solution: '', instrument: '',
    action_evidence: '', indicators: ['Visitas'],
  }
  const data = {
    version: '0.1.31', years: [2026], cities: ['Igaci'],
    views: { '*|*': { summary: { visitas: 1 }, arms: { total: 4, seized: 3 }, drugs: { total: 4, total_weight_grams: 1000.1 }, teams: { roster_occurrences: 3, weighted_points: 11 }, mvi_comparison: { candidate_pairs: 1 } }, '1900|*': { summary: { visitas: 0 }, arms: { total: 0, seized: 0 }, drugs: { total: 0, total_weight_grams: 0 }, teams: { roster_occurrences: 0, weighted_points: 0 }, mvi_comparison: { candidate_pairs: 0 } } },
    records: { ocorrencias: [caseItem] }, evidence: { 'Visitas|2026|demo1': 'Visita confirmada' },
    details: {}, batches: [], audit: { 'demo-batch-mvi_cad': { divergences: [{ source: 'mvi_cad', natural_key: 'k', reason: 'ausente' }], quarantine: [{ row_number: 2, reason: 'sem chave', fields: { Nome: 'Pessoa Fictícia' } }] } },
  }
  const read = vi.fn().mockResolvedValue(Response.json(data))
  vi.stubGlobal('fetch', read)
  const summary = await demoFetch('http://127.0.0.1:8000/indicators/summary')
  expect((await summary.json()).visitas).toBe(1)
  const arms = await demoFetch('http://127.0.0.1:8000/indicators/arms/analysis')
  expect((await arms.json()).seized).toBe(3)
  const drugs = await demoFetch('http://127.0.0.1:8000/indicators/drugs/analysis')
  expect((await drugs.json()).total_weight_grams).toBe(1000.1)
  const teams = await demoFetch('http://127.0.0.1:8000/indicators/teams/analysis')
  expect((await teams.json()).weighted_points).toBe(11)
  const comparison = await demoFetch('http://127.0.0.1:8000/indicators/mvi/comparison')
  expect((await comparison.json()).candidate_pairs).toBe(1)
  const quarantine = await demoFetch('http://127.0.0.1:8000/imports/demo-batch-mvi_cad/quarantine')
  expect((await quarantine.json()).items[0].reason).toBe('sem chave')
  const matching = await demoFetch('http://127.0.0.1:8000/records/ocorrencias?indicator=Visitas&municipality=igaci')
  expect((await matching.json()).items[0].action_evidence).toBe('Visita confirmada')
  const excluded = await demoFetch('http://127.0.0.1:8000/records/ocorrencias?year=2025')
  expect((await excluded.json()).total).toBe(0)
  const blocked = await demoFetch('http://127.0.0.1:8000/imports/ocorrencias', { method: 'POST' })
  expect(blocked.status).toBe(403)
  expect(read).toHaveBeenCalledTimes(1)
})
