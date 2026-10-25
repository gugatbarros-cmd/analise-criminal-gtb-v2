import { afterEach, describe, expect, it, vi } from 'vitest'
import { getHealth } from './health'

afterEach(() => vi.unstubAllGlobals())

describe('API local', () => {
  it('lê o estado de saúde', async () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'ok', version: '0.1.45', mode: 'local' }) })
    vi.stubGlobal('fetch', mock)
    await expect(getHealth('http://127.0.0.1:8000')).resolves.toEqual({ status: 'ok', version: '0.1.45', mode: 'local' })
    expect(mock).toHaveBeenCalledWith('http://127.0.0.1:8000/health')
  })

  it('expõe indisponibilidade da API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    await expect(getHealth('http://127.0.0.1:8000')).rejects.toThrow('A API local não respondeu.')
  })
})
