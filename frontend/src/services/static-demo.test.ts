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
  const armItem = { ...caseItem, natural_key: '2026|arm1', occurrence: 'ARM-1',
    category: 'Pistola', arm_quantity: 2, arm_situation: 'Apreendida',
    arm_caliber: '9 mm', arm_seized: true, arm_restricted: true }
  const armOther = { ...armItem, natural_key: '2026|arm2', occurrence: 'ARM-2',
    event_date: '2026-02-05', arm_quantity: 1, arm_situation: 'Não apreendida',
    arm_seized: false, arm_restricted: false }
  const drugItem = { ...caseItem, natural_key: '2026|drug1', event_date: '2026-03-05',
    category: 'Crack', drug_weight_grams: 0.1, drug_location: 'Via pública' }
  const teamItem = { ...caseItem, natural_key: '2026|team1', category: 'RP 01',
    team_group: 'roster', team_score: 5,
    team_officers: [{ name: 'AGENTE FICTÍCIO', registration: 'SYN001', role: 'COMANDANTE' }] }
  const data = {
    version: '0.1.48', years: [2026], cities: ['Igaci'],
    views: { '*|*': { summary: { visitas: 1 }, arms: { total: 4, seized: 3 }, drugs: { total: 4, total_weight_grams: 1000.1 }, teams: { roster_occurrences: 3, weighted_points: 11 }, mvi_comparison: { candidate_pairs: 1 } }, '1900|*': { summary: { visitas: 0 }, arms: { total: 0, seized: 0 }, drugs: { total: 0, total_weight_grams: 0 }, teams: { roster_occurrences: 0, weighted_points: 0 }, mvi_comparison: { candidate_pairs: 0 } } },
    records: { ocorrencias: [caseItem], armas: [armItem, armOther], drogas: [drugItem], guarnicoes: [teamItem] }, evidence: { 'Visitas|2026|demo1': 'Visita confirmada' },
    details: {}, batches: [{ id: 'demo-batch-mvi_cad', source: 'mvi_cad' }], audit: { 'demo-batch-mvi_cad': { divergences: [{ source: 'mvi_cad', natural_key: 'k', reason: 'ausente' }], quarantine: [{ row_number: 2, reason: 'sem chave', fields: { Nome: 'Pessoa Fictícia' } }] } },
  }
  const read = vi.fn().mockResolvedValue(Response.json(data))
  vi.stubGlobal('fetch', read)
  const summary = await demoFetch('http://127.0.0.1:8000/indicators/summary')
  expect((await summary.json()).visitas).toBe(1)
  const arms = await demoFetch('http://127.0.0.1:8000/indicators/arms/analysis')
  expect((await arms.json()).seized).toBe(3)
  const armsFiltered = await demoFetch('http://127.0.0.1:8000/indicators/arms/analysis?month=1&arm_type=Pistola&situation=Apreendida')
  expect(await armsFiltered.json()).toMatchObject({ total: 2, seized: 2, restricted: 2, records: 1 })
  const notSeized = await demoFetch('http://127.0.0.1:8000/indicators/arms/analysis?situation=N%C3%A3o%20apreendida')
  expect(await notSeized.json()).toMatchObject({ total: 1, seized: 0, records: 1 })
  const armRecords = await demoFetch('http://127.0.0.1:8000/records/armas?month=2')
  expect((await armRecords.json()).total).toBe(1)
  const drugs = await demoFetch('http://127.0.0.1:8000/indicators/drugs/analysis')
  expect((await drugs.json()).total_weight_grams).toBe(1000.1)
  const drugsFiltered = await demoFetch('http://127.0.0.1:8000/indicators/drugs/analysis?month=3&drug_type=Crack')
  expect(await drugsFiltered.json()).toMatchObject({ total: 1, total_weight_grams: 0.1, weighted_records: 1 })
  const drugRecords = await demoFetch('http://127.0.0.1:8000/records/drogas?month=1')
  expect((await drugRecords.json()).total).toBe(0)
  const teams = await demoFetch('http://127.0.0.1:8000/indicators/teams/analysis')
  expect((await teams.json()).weighted_points).toBe(11)
  const teamsFiltered = await demoFetch('http://127.0.0.1:8000/indicators/teams/analysis?month=1&team_name=RP%2001')
  expect(await teamsFiltered.json()).toMatchObject({ roster_occurrences: 1, weighted_points: 5, officers: 1 })
  const officerFiltered = await demoFetch('http://127.0.0.1:8000/indicators/teams/analysis?officer_registration=SYN001&nature_filter=Visita%20orientativa')
  expect(await officerFiltered.json()).toMatchObject({ roster_occurrences: 1, weighted_points: 5 })
  const teamRecords = await demoFetch('http://127.0.0.1:8000/records/guarnicoes?month=2')
  expect((await teamRecords.json()).total).toBe(0)
  const comparison = await demoFetch('http://127.0.0.1:8000/indicators/mvi/comparison')
  expect((await comparison.json()).candidate_pairs).toBe(1)
  const quarantine = await demoFetch('http://127.0.0.1:8000/imports/demo-batch-mvi_cad/quarantine')
  expect(await quarantine.json()).toMatchObject({ total: 1, page: 1, items: [{ reason: 'sem chave' }] })
  const nextPage = await demoFetch('http://127.0.0.1:8000/imports/demo-batch-mvi_cad/quarantine?page=2&size=1')
  expect(await nextPage.json()).toMatchObject({ total: 1, page: 2, items: [] })
  const batches = await demoFetch('http://127.0.0.1:8000/imports?page=2&size=1')
  expect(await batches.json()).toMatchObject({ total: 1, page: 2, items: [] })
  const matching = await demoFetch('http://127.0.0.1:8000/records/ocorrencias?indicator=Visitas&municipality=igaci')
  expect((await matching.json()).items[0].action_evidence).toBe('Visita confirmada')
  const excluded = await demoFetch('http://127.0.0.1:8000/records/ocorrencias?year=2025')
  expect((await excluded.json()).total).toBe(0)
  const dateMatch = await demoFetch('http://127.0.0.1:8000/records/ocorrencias?start_date=2026-01-05&end_date=2026-01-05')
  expect((await dateMatch.json()).total).toBe(1)
  const dateExcluded = await demoFetch('http://127.0.0.1:8000/records/ocorrencias?start_date=2026-01-06')
  expect((await dateExcluded.json()).total).toBe(0)
  const blocked = await demoFetch('http://127.0.0.1:8000/imports/ocorrencias', { method: 'POST' })
  expect(blocked.status).toBe(403)
  expect(read).toHaveBeenCalledTimes(1)
})
