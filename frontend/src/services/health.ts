import { isCloud } from './cloud'
import { APP_VERSION } from './version-update'
export type Health = { status: string; version: string; mode: string }

export async function getHealth(baseUrl: string): Promise<Health> {
  if (isCloud) return { status: 'ok', version: APP_VERSION, mode: 'online' }
  if (import.meta.env.VITE_STATIC_DEMO === '1')
    return { status: 'ok', version: APP_VERSION, mode: 'demo' }
  const response = await fetch(`${baseUrl}/health`)
  if (!response.ok) throw new Error('A API local não respondeu.')
  return response.json() as Promise<Health>
}
