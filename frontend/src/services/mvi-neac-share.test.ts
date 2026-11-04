import { describe, expect, it } from 'vitest'
import { buildMviNeacWhatsapp } from './mvi-neac-share'
import type { ReportDataset, ReportRow } from './report-model'

const row = (values: Partial<ReportRow>): ReportRow => ({ source: 'mvi_neac', date: '2026-03-01', city: 'Igaci', nature: 'Homicídio doloso', category: 'Homicídio doloso', eligible: true, indicators: [], occurrence: 'OCORRÊNCIA-SEGREDO', victim: 'NOME-SEGREDO', hour: 20, neighborhood: '', age: '', sex: '', instrument: '', solution: '', relationship: '', aggression: '', quantity: 1, seized: false, restricted: false, caliber: '', brand: '', situation: '', grams: null, location: '', team: '', teamGroup: '', points: 0, officers: [], ...values })

describe('resumo MVI NEAC para WhatsApp', () => {
  it('resume apenas vítimas elegíveis NEAC no recorte sem compartilhar identificadores', () => {
    const data: ReportDataset = { rows: [row({}), row({ date: '2026-04-02', city: 'Belém' }), row({ source: 'mvi_cad' }), row({ eligible: false }), row({ date: '2025-03-01' })], updatedAt: null, batches: 2, quarantined: 0 }
    const message = buildMviNeacWhatsapp(data, { year: 2026 }, new Date(2026, 10, 4))
    expect(message).toContain('*Vítimas elegíveis: 2*')
    expect(message).toContain('03/2026: 1')
    expect(message).toContain('04/2026: 1')
    expect(message).toContain('Igaci: 1')
    expect(message).toContain('Belém: 1')
    expect(message).not.toContain('NOME-SEGREDO')
    expect(message).not.toContain('OCORRÊNCIA-SEGREDO')
    expect(message).toContain('não devem ser somados')
  })
  it('avisa quando não há vítimas no filtro', () => {
    const data: ReportDataset = { rows: [row({})], updatedAt: null, batches: 1, quarantined: 0 }
    expect(buildMviNeacWhatsapp(data, { year: 2025 }, new Date(2026, 10, 4))).toContain('confira se a base NEAC foi importada')
  })
})
