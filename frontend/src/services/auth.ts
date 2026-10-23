export type LocalUser = { username: string; role: 'admin' | 'analyst' | 'viewer'; expires_at: string }
export type LocalSession = LocalUser & { token: string }

const baseUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const STORAGE_KEY = 'gtb-v2-session'

export function getSessionToken(): string {
  try { return sessionStorage.getItem(STORAGE_KEY) || '' } catch { return '' }
}

export function saveSession(token: string): void {
  sessionStorage.setItem(STORAGE_KEY, token)
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}

async function read<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: string }
    throw new Error(body.detail || `Falha HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}

export function login(username: string, password: string): Promise<LocalSession> {
  return fetch(`${baseUrl}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }).then(response => read<LocalSession>(response))
}

export function getMe(token: string): Promise<LocalUser> {
  return fetch(`${baseUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then(response => read<LocalUser>(response))
}

export async function logout(token: string): Promise<void> {
  await fetch(`${baseUrl}/auth/logout`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` },
  })
}

export async function getUsers(token: string): Promise<LocalUser[]> {
  return (await read<{ items: LocalUser[] }>(await fetch(`${baseUrl}/auth/users`, {
    headers: { Authorization: `Bearer ${token}` },
  }))).items
}

export async function createUser(token: string, username: string, password: string,
                                 role: LocalUser['role']): Promise<void> {
  await read(await fetch(`${baseUrl}/auth/users`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role }),
  }))
}
