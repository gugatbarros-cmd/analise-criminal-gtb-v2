import { describe, expect, it } from 'vitest'
import { buildMviNeacWhatsapp, whatsappShareUrl } from './mvi-neac-share'
import type { ReportDataset, ReportRow } from './report-model'

const row = (values: Partial<ReportRow>): ReportRow => ({ source: 'mvi_neac', date: '2026-03-01', city: 'Igaci', nature: 'Homicídio doloso', category: 'Homicídio doloso', eligible: true, indicators: [], occurrence: 'OCORRÊNCIA-SEGREDO', victim: 'NOME-SEGREDO', hour: 20, neighborhood: '', age: '', sex: '', instrument: '', solution: '', relationship: '', aggression: '', quantity: 1, seized: false, restricted: false, caliber: '', brand: '', situation: '', grams: null, location: '', team: '', teamGroup: '', points: 0, officers: [], ...values })

describe('resumo MVI NEAC para WhatsApp', () => {
  it('resume apenas vítimas elegíveis NEAC no recorte sem compartilhar identificadores', () => {
    const data: ReportDataset = { rows: [row({}), row({ date: '2026-04-02', city: 'Belém' }), row({ source: 'mvi_cad' }), row({ eligible: false }), row({ date: '2025-03-01' })], updatedAt: '2026-11-04 12:00:00', sourceUpdatedAt: { mvi_neac: '2026-11-03 17:18:00' }, batches: 2, quarantined: 0 }
    const message = buildMviNeacWhatsapp(data, { year: 2026 }, new Date(2026, 10, 4))
    expect(message).toContain('*Vítimas elegíveis: 2*')
    expect(message).toContain('\u{1F4CA} *MVI NEAC \u00B7 INFORME AO COMANDO*')
    expect(message).toContain('\u{1F4CB} Planilha NEAC importada em: 03/11/2026 17:18')
    expect(message).toContain('2025: *1* vítima(s) · 2025-01-01 a 2025-04-02')
    expect(message).toContain('2026: *2* vítima(s) · 2026-01-01 a 2026-04-02')
    expect(message).toContain('Diferença: *+1* · Variação: *+100%*')
    expect(message).toContain('- MAR: 1 > 1')
    expect(message).toContain('- ABR: 0 > 1')
    expect(message).toContain('\u{1F4C6} *M\u00caS A M\u00caS')
    expect(message).toContain('Igaci: *1*')
    expect(message).toContain('Belém: *1*')
    expect(message).not.toContain('NOME-SEGREDO')
    expect(message).not.toContain('OCORRÊNCIA-SEGREDO')
    expect(message).toContain('não devem ser somados')
    expect(message).not.toContain('\uFFFD')
    expect(message).not.toContain('\uFE0F')
    expect(message).not.toMatch(/[\u2500-\u257F]/)
    expect(new URL(whatsappShareUrl(message)).searchParams.get('text')).toBe(message)
  })
  it('avisa quando não há vítimas no filtro', () => {
    const data: ReportDataset = { rows: [row({})], updatedAt: null, batches: 1, quarantined: 0 }
    expect(buildMviNeacWhatsapp(data, { year: 2025 }, new Date(2026, 10, 4))).toContain('Confira a importação NEAC e os filtros')
  })
  it('não inventa percentual quando o ano anterior é zero', () => {
    const data: ReportDataset = { rows: [row({})], updatedAt: null, batches: 1, quarantined: 0 }
    const message = buildMviNeacWhatsapp(data, { year: 2026, start: '2026-03-01', end: '2026-03-31' })
    expect(message).toContain('Variação: *sem base percentual*')
    expect(message).toContain('- MAR: 0 > 1')
  })
})
