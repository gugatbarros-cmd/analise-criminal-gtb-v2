import { afterEach, describe, expect, it, vi } from 'vitest'
import { ageBand, comparisonScopes, filterReportRows, reportCatalog, selectReportRows, type ReportDataset, type ReportRow } from './report-model'
import { buildReportDocument, reportCsv } from './report-document'
import { domesticPresentationData } from './domestic-presentation'
import { mviConferences } from './report-spreadsheet'

const fact = (values: Partial<ReportRow> = {}): ReportRow => ({ source: 'ocorrencias', date: '2026-03-01', city: 'Igaci', nature: 'Roubo', category: 'Roubo', eligible: true, indicators: ['CVP'], occurrence: 'SYNTHETIC-1', victim: '', hour: null, neighborhood: '', age: '', sex: '', instrument: '', solution: '', relationship: '', aggression: '', quantity: 1, seized: false, restricted: false, caliber: '', brand: '', situation: '', grams: null, location: '', team: '', teamGroup: '', points: 0, officers: [], ...values })
const dataset = (rows: ReportRow[]): ReportDataset => ({ rows, updatedAt: '2026-03-01', batches: 1, quarantined: 0 })
const options = { author: 'Sintético', unit: 'Unidade de teste', notes: '', actions: '', referenceDate: '2026-03-02', issued: '01/03/2026' }
afterEach(() => vi.unstubAllGlobals())
describe('relatórios trazidos do legado', () => {
  it('exporta possíveis pares sem confirmar vínculo e deixa colisões para revisão', () => {
    const cad = fact({ source: 'mvi_cad', victim: 'Pessoa Sintética' })
    const neac = fact({ source: 'mvi_neac', victim: 'Pessoa Sintética' })
    expect(mviConferences([cad, neac])[0].status).toContain('não confirmado')
    const collision = mviConferences([cad, { ...cad, occurrence: 'SYNTHETIC-2' }, neac])[0]
    expect(collision.status).toContain('Ambíguo')
    expect(collision.cad).toBeNull()
    expect(mviConferences([neac])[0].status).toBe('Sem par exato no CAD')
  })
  it('mantém períodos equivalentes, inclusive 29 de fevereiro, e respeita os filtros territoriais', () => {
    const rows = [fact({ date: '2024-02-29' }), fact({ date: '2023-02-28' }), fact({ city: 'Município fora do BPM' })]
    const periods = comparisonScopes(rows, { year: 2024, end: '2024-02-29' })!
    expect(periods.previous.end).toBe('2023-02-28')
    expect(filterReportRows(rows, { year: 2024, month: 2 }).length).toBe(1)
    expect(filterReportRows([fact({ city: "Tanque D’Arca" })], { city: "Tanque d'Arca" }).length).toBe(1)
  })
  it('não soma CAD e NEAC, não converte idade ausente em criança e não mistura triagem doméstica', () => {
    const data = dataset([fact({ source: 'mvi_cad', victim: 'Pessoa CAD' }), fact({ source: 'mvi_neac', victim: 'Pessoa NEAC' }), fact({ indicators: ['Doméstica'], sex: 'Feminino' }), fact({ indicators: ['Doméstica:pending'] })])
    expect(selectReportRows(data.rows, 'mvi-cad').length).toBe(1)
    expect(selectReportRows(data.rows, 'mvi-neac').length).toBe(1)
    expect(ageBand(fact())).toBe('Não informado')
    const thematic = domesticPresentationData(data, {}, 'test')
    expect(thematic.total).toBe(1)
    expect(thematic.screening).toEqual({ screened: 2, pending: 1, excluded: 0, outside: 0 })
    expect(JSON.stringify(thematic)).not.toContain('Pessoa CAD')
    expect(thematic.groups['Horário']).toEqual([['Não informado', 1]])
  })
  it('organiza o informe NEAC para comando e mantém o CAD fora dos totais', () => {
    vi.stubGlobal('location', { origin: 'http://localhost:5173' })
    const rows = [
      fact({ source: 'mvi_neac', victim: 'Vítima Sintética', city: 'Igaci', date: '2026-03-01', hour: 20, category: 'Homicídio doloso' }),
      fact({ source: 'mvi_neac', victim: 'Outra Vítima Sintética', city: 'Igaci', date: '2026-03-02', hour: null, category: 'Homicídio doloso' }),
      fact({ source: 'mvi_neac', victim: 'Anterior Sintética', city: 'Igaci', date: '2025-03-01', hour: 20 }),
      fact({ source: 'mvi_cad', victim: 'Pessoa CAD', city: 'Igaci', date: '2026-03-02' }),
      fact({ source: 'mvi_neac', eligible: false, victim: 'Registro inelegível' }),
    ]
    const data = { ...dataset(rows), sourceUpdatedAt: { mvi_neac: '2026-11-03 17:18:00' } }
    const html = buildReportDocument(data, 'mvi-neac', { year: 2026 }, options, 'test')
    expect(html).toContain('Síntese para o Comando')
    expect(html).toContain('Comparativo com o ano anterior')
    expect(html).toContain('2025-01-01 a 2025-03-02')
    expect(html).toContain('2026-01-01 a 2026-03-02')
    expect(html).toContain('Evolução mês a mês')
    expect(html).toContain('<td>março</td><td>1</td><td>2</td><td>+1</td>')
    expect(html).toContain('Planilha NEAC · última importação:</strong> 03/11/2026 17:18')
    expect(html).toContain('Evolução e distribuição territorial')
    expect(html).toContain('Perfil e qualidade dos registros')
    expect(html).toContain('Vítimas elegíveis</span><strong>2')
    expect(html).toContain('Horários informados</span><strong>1 de 2')
    expect(html).toContain('Vítima Sintética')
    expect(html).not.toContain('Pessoa CAD')
    expect(html).not.toContain('Registro inelegível')
  })
  it('gera todos os modelos documentais com metadados e preserva todas as categorias na tabela', () => {
    vi.stubGlobal('location', { origin: 'http://localhost:5173' })
    const rows = Array.from({ length: 14 }, (_, index) => fact({ city: 'Igaci', nature: `Natureza ${index}` }))
    for (const item of reportCatalog.filter(item => item.id !== 'domestica-apresentacao')) {
      const html = buildReportDocument(dataset(rows), item.id, { year: 2026 }, options, 'test-version')
      expect(html).toContain('test-version')
      expect(html).toContain('Unidade de teste')
      expect(html).toContain('Memória, fonte e qualidade')
    }
    const html = buildReportDocument(dataset(rows), 'geral', {}, options, 'test')
    expect(html).toContain('Natureza 13')
    expect(html).toContain('A tabela abaixo contém todas')
  })
  it('separa unidades, apreensões e peso desconhecido, escapa HTML e neutraliza fórmulas CSV', () => {
    vi.stubGlobal('location', { origin: 'http://localhost:5173' })
    const rows = [fact({ source: 'armas', quantity: 3, seized: true, category: '<img src=x onerror=alert(1)>', occurrence: '=DANGEROUS()' }), fact({ source: 'armas', quantity: 5, seized: false })]
    const html = buildReportDocument(dataset(rows), 'armas', {}, options, 'test')
    expect(html).toContain('Unidades informadas</span><strong>8')
    expect(html).toContain('Unidades apreendidas</span><strong>3')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
    expect(reportCsv(dataset(rows), 'armas', {})).toContain("'=DANGEROUS()")
    expect(reportCsv(dataset([...rows, fact({ source: 'mvi_neac' })]), 'consolidado', {})).toContain('mvi_neac')
  })
})
