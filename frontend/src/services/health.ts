export type Health = { status: string; version: string; mode: string }

export async function getHealth(baseUrl: string): Promise<Health> {
  if (import.meta.env.VITE_STATIC_DEMO === '1')
    return { status: 'ok', version: '0.1.30', mode: 'demo' }
  const response = await fetch(`${baseUrl}/health`)
  if (!response.ok) throw new Error('A API local não respondeu.')
  return response.json() as Promise<Health>
}
