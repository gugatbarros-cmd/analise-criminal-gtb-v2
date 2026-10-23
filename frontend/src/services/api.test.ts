import { afterEach, describe, expect, it, vi } from 'vitest'
import { getArmsAnalysis, getDomesticAnalysis, getDrugsAnalysis, getMviAnalysis, getMviRecordDetail, getMviRecordVersions, getOperationalAnalysis, getRecords, getSummary, getTcoAnalysis, getTeamsAnalysis, upload } from './api'

afterEach(() => vi.unstubAllGlobals())

describe('contrato de importação e indicadores', () => {
  it('envia fonte, escopo e nome codificado do arquivo local', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ inserted: 1 }) })
    vi.stubGlobal('fetch', request)
    const file = new File(['a;b\n1;2'], 'MVI São José.csv', { type: 'text/csv' })
    await expect(upload('mvi_cad', file, 'partial')).resolves.toMatchObject({ inserted: 1 })
    expect(request).toHaveBeenCalledWith(expect.stringContaining('/imports/mvi_cad?scope=partial'), expect.objectContaining({
      method: 'POST', body: file, headers: expect.objectContaining({ 'X-Filename': 'MVI%20S%C3%A3o%20Jos%C3%A9.csv' }),
    }))
  })

  it('consulta filtros sem combinar CAD e NEAC', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ mvi_cad: 2, mvi_neac: 1 }) })
    vi.stubGlobal('fetch', request)
    await expect(getSummary(2026, 'Igaci')).resolves.toMatchObject({ mvi_cad: 2, mvi_neac: 1 })
    expect(request.mock.calls[0][0]).toContain('year=2026&municipality=Igaci')
  })

  it('consulta armas por fonte própria com filtros', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ total: 4, seized: 3 }) })
    vi.stubGlobal('fetch', request)
    await expect(getArmsAnalysis(2026, 'Igaci')).resolves.toMatchObject({ total: 4, seized: 3 })
    const url = new URL(request.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/indicators/arms/analysis')
    expect(url.searchParams.get('municipality')).toBe('Igaci')
  })

  it('consulta drogas por fonte própria com filtros', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ total: 4, total_weight_grams: 1000.1 }) })
    vi.stubGlobal('fetch', request)
    await expect(getDrugsAnalysis(2026, 'Igaci')).resolves.toMatchObject({ total: 4, total_weight_grams: 1000.1 })
    const url = new URL(request.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/indicators/drugs/analysis')
    expect(url.searchParams.get('year')).toBe('2026')
  })

  it('consulta guarnições por fonte própria com filtros', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ roster_occurrences: 3, weighted_points: 11 }) })
    vi.stubGlobal('fetch', request)
    await expect(getTeamsAnalysis(2026, 'Igaci')).resolves.toMatchObject({ roster_occurrences: 3, weighted_points: 11 })
    const url = new URL(request.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/indicators/teams/analysis')
    expect(url.searchParams.get('municipality')).toBe('Igaci')
  })

  it('solicita apenas CVP tentado no recorte selecionado', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ total: 0, items: [] }) })
    vi.stubGlobal('fetch', request)
    await getRecords('ocorrencias', 1, 2026, 'Igaci', undefined, 'CVP Tentado')
    const url = new URL(request.mock.calls[0][0] as string)
    expect(url.searchParams.get('category_prefix')).toBe('CVP Tentado')
    expect(url.searchParams.get('year')).toBe('2026')
    expect(url.searchParams.get('municipality')).toBe('Igaci')
  })

  it('solicita a relação de tentativas por categoria', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ total: 0, items: [] }) })
    vi.stubGlobal('fetch', request)
    await getRecords('ocorrencias', 2, 2026, undefined, undefined, undefined, 'Tentativa de homicídio')
    const url = new URL(request.mock.calls[0][0] as string)
    expect(url.searchParams.get('indicator')).toBe('Tentativa de homicídio')
    expect(url.searchParams.get('page')).toBe('2')
  })

  it('consulta TCO sem remover outros indicadores da ocorrência', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ total: 1, items: [{ indicators: ['CVP', 'TCO'] }] }) })
    vi.stubGlobal('fetch', request)
    const result = await getRecords('ocorrencias', 1, 2026, 'Igaci', undefined, undefined, 'TCO')
    expect(result.items[0].indicators).toEqual(['CVP', 'TCO'])
    const url = new URL(request.mock.calls[0][0] as string)
    expect(url.searchParams.get('indicator')).toBe('TCO')
  })

  it('consulta a série e os rankings TCO no recorte mestre', async () => {
    const analysis = { total: 1, monthly: [{ period: '2026-01', total: 1 }], municipalities: [], natures: [] }
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => analysis })
    vi.stubGlobal('fetch', request)
    await expect(getTcoAnalysis(2026, 'Igaci')).resolves.toEqual(analysis)
    const url = new URL(request.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/indicators/tco/analysis')
    expect(url.searchParams.get('year')).toBe('2026')
    expect(url.searchParams.get('municipality')).toBe('Igaci')
  })

  it('consulta perfis MVI de CAD e NEAC em rotas separadas', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ total: 2, yearly: [], municipalities: [], classifications: [] }) })
    vi.stubGlobal('fetch', request)
    await getMviAnalysis('mvi_cad', 2026, 'Igaci')
    await getMviAnalysis('mvi_neac', 2025)
    const cad = new URL(request.mock.calls[0][0] as string)
    const neac = new URL(request.mock.calls[1][0] as string)
    expect(cad.pathname).toBe('/indicators/mvi/mvi_cad/analysis')
    expect(cad.searchParams.get('year')).toBe('2026')
    expect(cad.searchParams.get('municipality')).toBe('Igaci')
    expect(neac.pathname).toBe('/indicators/mvi/mvi_neac/analysis')
    expect(neac.searchParams.get('year')).toBe('2025')
    expect(neac.searchParams.has('municipality')).toBe(false)
  })

  it('busca a ficha original do caso pela fonte e chave codificada', async () => {
    const detail = { source: 'mvi_cad', version: 2, fields: { Relato: 'Texto retificado' } }
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => detail })
    vi.stubGlobal('fetch', request)
    await expect(getMviRecordDetail('mvi_cad', '2026|cad 1|nic 2')).resolves.toEqual(detail)
    expect(request.mock.calls[0][0]).toContain('/mvi/mvi_cad/records/2026%7Ccad%201%7Cnic%202')
  })

  it('consulta versões anteriores sem mudar a fonte nem a chave do caso', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ version: 2, is_current: true }, { version: 1, is_current: false }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ source: 'mvi_neac', version: 1, is_current: false }) })
    vi.stubGlobal('fetch', request)
    await expect(getMviRecordVersions('mvi_neac', '2026|n1|v1')).resolves.toHaveLength(2)
    await expect(getMviRecordDetail('mvi_neac', '2026|n1|v1', 1)).resolves.toMatchObject({ version: 1 })
    expect(request.mock.calls[0][0]).toContain('/mvi/mvi_neac/records/2026%7Cn1%7Cv1/versions')
    expect(request.mock.calls[1][0]).toContain('/mvi/mvi_neac/records/2026%7Cn1%7Cv1?version=1')
  })

  it('consulta mandados e visitas por indicador com filtros mestres', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ total: 1, monthly: [], municipalities: [], natures: [] }) })
    vi.stubGlobal('fetch', request)
    await getOperationalAnalysis('Mandados', 2026, 'Igaci')
    await getOperationalAnalysis('Visitas', 2025)
    const warrants = new URL(request.mock.calls[0][0] as string)
    const visits = new URL(request.mock.calls[1][0] as string)
    expect(warrants.pathname).toBe('/indicators/operations/Mandados/analysis')
    expect(warrants.searchParams.get('municipality')).toBe('Igaci')
    expect(visits.pathname).toBe('/indicators/operations/Visitas/analysis')
    expect(visits.searchParams.get('year')).toBe('2025')
  })

  it('consulta sossego como indicador próprio da base geral', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ total: 1, monthly: [], municipalities: [], natures: [] }) })
    vi.stubGlobal('fetch', request)
    await getOperationalAnalysis('Sossego', 2026, 'Igaci')
    await getRecords('ocorrencias', 1, 2026, 'Igaci', undefined, undefined, 'Sossego')
    expect(new URL(request.mock.calls[0][0] as string).pathname).toBe('/indicators/operations/Sossego/analysis')
    expect(new URL(request.mock.calls[1][0] as string).searchParams.get('indicator')).toBe('Sossego')
  })

  it('consulta a triagem doméstica no recorte mestre', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ total: 1, reviews: { pending: 1, excluded: 0, outside: 0 } }) })
    vi.stubGlobal('fetch', request)
    const result = await getDomesticAnalysis(2026, 'Igaci')
    expect(result.reviews.pending).toBe(1)
    const url = new URL(request.mock.calls[0][0] as string)
    expect(url.pathname).toBe('/indicators/domestic/analysis')
    expect(url.searchParams.get('municipality')).toBe('Igaci')
  })
})
