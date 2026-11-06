import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPublishedVersion, isNewerVersion } from './version-update'

afterEach(() => vi.unstubAllGlobals())

describe('indicador de atualização', () => {
  it('compara componentes da versão numericamente', () => {
    expect(isNewerVersion('0.1.95', '0.1.94')).toBe(true)
    expect(isNewerVersion('0.2.0', '0.1.94')).toBe(true)
    expect(isNewerVersion('0.1.9', '0.1.94')).toBe(false)
    expect(isNewerVersion('0.1.94', '0.1.94')).toBe(false)
    expect(isNewerVersion('versão desconhecida', '0.1.94')).toBe(false)
  })

  it('consulta manifesto sem cache e valida a versão publicada', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '0.1.95' }) })
    vi.stubGlobal('fetch', request)
    await expect(getPublishedVersion()).resolves.toBe('0.1.95')
    expect(request.mock.calls[0][1]).toEqual({ cache: 'no-store' })
    expect(String(request.mock.calls[0][0])).toContain('checked=')
  })
})
