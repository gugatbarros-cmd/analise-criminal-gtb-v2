import packageInfo from '../../package.json'
import { isCloud } from './cloud'
import { getSessionToken } from './auth'

export const APP_VERSION = packageInfo.version
export const ONLINE_VERSION_URL = 'https://gugatbarros-cmd.github.io/analise-criminal-gtb-v2/app-version.json'
const localApi = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

export type LocalUpdateStatus = { phase: string; message: string; progress?: number | null }

export async function localUpdateRequest(method: 'GET' | 'POST'): Promise<LocalUpdateStatus> {
  const response = await fetch(`${localApi}/system/update${method === 'GET' ? '/status' : ''}`, {
    method, headers: { Authorization: `Bearer ${getSessionToken()}` }, cache: 'no-store',
  })
  const body = await response.json() as LocalUpdateStatus & { detail?: string }
  if (!response.ok) throw new Error(body.detail || 'Não foi possível iniciar a atualização.')
  return body
}

export async function installedVersion(): Promise<string> {
  const response = await fetch(`${localApi}/health`, { cache: 'no-store' })
  if (!response.ok) throw new Error('Sistema reiniciando')
  const body = await response.json() as { version?: string }
  return body.version || ''
}

export function isNewerVersion(published: string, current: string): boolean {
  const parse = (value: string) => value.match(/^(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number)
  const next = parse(published)
  const installed = parse(current)
  if (!next || !installed) return false
  return next.some((part, index) => part > installed[index] && next.slice(0, index).every((earlier, position) => earlier === installed[position]))
}

export async function getPublishedVersion(): Promise<string> {
  const base = isCloud ? `${import.meta.env.BASE_URL}app-version.json` : ONLINE_VERSION_URL
  const url = new URL(base, typeof window === 'undefined' ? ONLINE_VERSION_URL : window.location.href)
  url.searchParams.set('checked', String(Date.now()))
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error('Consulta de versão indisponível')
  const data = await response.json() as { version?: unknown }
  if (typeof data.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(data.version))
    throw new Error('Versão publicada inválida')
  return data.version
}

export type AutoUpdateStatus = { enabled: boolean; pending_version: string | null; idle_minutes_required: number | null;
  seconds_until_install: number | null; installing: boolean }

/** Situação da atualização automática do aplicativo local (qualquer conta logada). */
export async function autoUpdateStatus(): Promise<AutoUpdateStatus> {
  const response = await fetch(`${localApi}/system/auto-update`, {
    headers: { Authorization: `Bearer ${getSessionToken()}` }, cache: 'no-store',
  })
  if (!response.ok) throw new Error('Estado da atualização automática indisponível')
  return response.json() as Promise<AutoUpdateStatus>
}

/** Minutos sem uso antes de recarregar a página online com a versão nova. */
export const IDLE_RELOAD_MINUTES = 10
const ACTIVITY_REPORT_MS = 60 * 1000
let lastInteraction = Date.now()
let lastReport = 0

export function millisecondsSinceInteraction(now = Date.now()): number {
  return now - lastInteraction
}

/** Registra uso da interface e informa o aplicativo local, no máximo uma vez por minuto. */
export function noteInteraction(now = Date.now()): boolean {
  lastInteraction = now
  if (isCloud || import.meta.env.VITE_STATIC_DEMO === '1' || !getSessionToken() || now - lastReport < ACTIVITY_REPORT_MS) return false
  lastReport = now
  void fetch(`${localApi}/system/activity`, { method: 'POST', headers: { Authorization: `Bearer ${getSessionToken()}` },
    cache: 'no-store' }).catch(() => undefined)
  return true
}

export function startInteractionTracking(): () => void {
  const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'] as const
  const handler = () => { noteInteraction() }
  for (const name of events) window.addEventListener(name, handler, { passive: true, capture: true })
  return () => { for (const name of events) window.removeEventListener(name, handler, { capture: true }) }
}
