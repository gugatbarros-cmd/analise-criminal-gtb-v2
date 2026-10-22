import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSummary, upload } from './api'

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
})
