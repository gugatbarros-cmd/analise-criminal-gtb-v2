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

describe('uso do sistema para a atualização automática', () => {
  it('avisa o aplicativo local no máximo uma vez por minuto', async () => {
    const { noteInteraction, millisecondsSinceInteraction } = await import('./version-update')
    const calls: string[] = []
    vi.stubGlobal('localStorage', { getItem: () => 'token-sintetico' })
    vi.stubGlobal('fetch', (url: string) => { calls.push(url); return Promise.resolve(new Response('{}')) })
    const start = 10_000_000
    expect(noteInteraction(start)).toBe(true)
    expect(noteInteraction(start + 30_000)).toBe(false)
    expect(noteInteraction(start + 61_000)).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain('/system/activity')
    expect(millisecondsSinceInteraction(start + 61_000 + 5_000)).toBe(5_000)
  })
})
