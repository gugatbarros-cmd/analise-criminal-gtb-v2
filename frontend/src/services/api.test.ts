import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMviAnalysis, getRecords, getSummary, getTcoAnalysis, upload } from './api'

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
})
