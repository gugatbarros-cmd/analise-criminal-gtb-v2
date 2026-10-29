import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

function storage() {
  const values = new Map<string, string>()
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
  vi.stubGlobal('window', new EventTarget())
  return values
}

it('recusa conta inativa e remove a sessão sem carregar as bases', async () => {
  const values = storage()
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ idToken: 'synthetic-token', refreshToken: 'synthetic-refresh',
    email: 'test@example.test', localId: 'test', expiresIn: '3600' }))
    .mockResolvedValueOnce(Response.json({ fields: { status: { stringValue: 'pending' } } }))
  vi.stubGlobal('fetch', fetcher)
  const cloud = await import('./cloud')
  await expect(cloud.cloudLogin('test@example.test', 'synthetic-only')).rejects.toThrow('não autorizada')
  expect(values.has('gtb-online-session')).toBe(false)
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('consulta blocos autenticados, verifica hash e detecta nova importação', async () => {
  const values = storage()
  values.set('gtb-online-session', JSON.stringify({ token: 'synthetic-token', refresh: 'synthetic-refresh',
    email: 'test@example.test', uid: 'test', expires: Date.now() + 3600000 }))
  let revision = 'a'.repeat(32)
  const snapshot = { version: 'test-version', records: {}, views: {}, details: {}, syncedAt: '2026-10-29T12:00:00Z' }
  const stream = new Blob([JSON.stringify(snapshot)]).stream().pipeThrough(new CompressionStream('gzip'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  const content = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
  const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer synthetic-token')
    if (url.includes('/chunks/')) return Response.json({ fields: { generation: { stringValue: 'gtb2-' + revision },
      index: { integerValue: '0' }, content: { stringValue: content } } })
    return Response.json({ fields: { generation: { stringValue: 'gtb2-' + revision }, chunkCount: { integerValue: '1' },
      chunkHashes: { arrayValue: { values: [{ stringValue: hash }] } } } })
  })
  vi.stubGlobal('fetch', fetcher)
  const cloud = await import('./cloud')
  expect((await cloud.refreshCloud()).version).toBe('test-version')
  expect(fetcher).toHaveBeenCalledTimes(2)
  await cloud.refreshCloud()
  expect(fetcher).toHaveBeenCalledTimes(3)
  const updated = vi.fn()
  window.addEventListener('gtb-cloud-updated', updated)
  revision = 'b'.repeat(32)
  await cloud.refreshCloud()
  expect(updated).toHaveBeenCalledOnce()
  cloud.cloudLogout()
  await expect(cloud.refreshCloud()).rejects.toThrow('Entre na sua conta')
  expect(cloud.cloudInfo().version).toBeUndefined()
})

it('não substitui falha de permissão por dados fictícios', async () => {
  const values = storage()
  values.set('gtb-online-session', JSON.stringify({ token: 'synthetic-token', uid: 'test', expires: Date.now() + 3600000 }))
  const fetcher = vi.fn().mockResolvedValue(Response.json({}, { status: 403 }))
  vi.stubGlobal('fetch', fetcher)
  const cloud = await import('./cloud')
  await expect(cloud.cloudFetch('http://localhost/indicators/summary')).rejects.toThrow('Acesso recusado')
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(String(fetcher.mock.calls[0][0])).not.toContain('demo-data.json')
})
