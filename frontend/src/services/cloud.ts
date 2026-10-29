import { demoFetch, type Snapshot } from './static-demo'
import type { LocalSession, LocalUser } from './auth'

export const isCloud = import.meta.env.VITE_CLOUD_ONLINE === '1' &&
  !(typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1')
const key = 'AIzaSyCh4pw9HsXVEz7RbIq_Ee5v7oGWxC66qnM'
const root = 'https://firestore.googleapis.com/v1/projects/analisecriminalgtb/databases/(default)/documents'
const documentUrl = root + '/sharedBases/gtb2-online'
const sessionKey = 'gtb-online-session'
type Session = { token: string; refresh: string; expires: number; email: string; uid: string }
type Fields = Record<string, { stringValue?: string; integerValue?: string; arrayValue?: { values?: { stringValue: string }[] } }>
type Document = { fields: Fields }
let data: Snapshot | undefined
let generation = ''
let loading: Promise<Snapshot> | undefined
let refreshing: Promise<Session> | undefined

async function read<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 429) throw Error('Cota gratuita indisponível. Tente mais tarde.')
    if (response.status === 401 || response.status === 403) throw Error('Acesso recusado. Use uma conta ativa autorizada no sistema antigo.')
    if (response.status === 404) throw Error('Nenhuma base sincronizada. Conecte a conta no sistema local e aguarde o primeiro envio.')
    throw Error('Não foi possível acessar o serviço online. Confira a conexão e suas credenciais.')
  }
  return response.json() as Promise<T>
}

function session(): Session {
  const stored = sessionStorage.getItem(sessionKey)
  if (!stored) throw Error('Entre na sua conta online.')
  return JSON.parse(stored) as Session
}

async function validSession(): Promise<Session> {
  const current = session()
  if (current.expires > Date.now() + 60000) return current
  refreshing ??= (async () => {
    const next = await read<{ id_token: string; refresh_token: string; expires_in: string }>(await fetch(
      'https://securetoken.googleapis.com/v1/token?key=' + key, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: current.refresh }),
      }))
    const value = { ...current, token: next.id_token, refresh: next.refresh_token,
      expires: Date.now() + Number(next.expires_in) * 1000 }
    if (sessionStorage.getItem(sessionKey) !== JSON.stringify(current)) throw Error('Sessão encerrada durante a atualização.')
    sessionStorage.setItem(sessionKey, JSON.stringify(value))
    return value
  })().catch(error => {
    cloudLogout()
    window.dispatchEvent(new Event('gtb-session-expired'))
    throw error
  }).finally(() => { refreshing = undefined })
  return refreshing
}

async function getDocument(url: string): Promise<Document> {
  const current = await validSession()
  return read<Document>(await fetch(url, { headers: { Authorization: 'Bearer ' + current.token }, cache: 'no-store' }))
}

export async function cloudLogin(email: string, password: string): Promise<LocalSession> {
  const value = await read<{ idToken: string; refreshToken: string; email: string; localId: string; expiresIn: string }>(await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + key, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password, returnSecureToken: true }),
    }))
  sessionStorage.setItem(sessionKey, JSON.stringify({ token: value.idToken, refresh: value.refreshToken,
    email: value.email, uid: value.localId, expires: Date.now() + Number(value.expiresIn) * 1000 }))
  try {
    const user = await cloudUser()
    return { ...user, token: value.idToken }
  } catch (error) { cloudLogout(); throw error }
}

export async function cloudUser(): Promise<LocalUser> {
  const current = await validSession()
  if (current.email.toLowerCase() !== 'gugatbarros@hotmail.com') {
    const profile = await getDocument(root + '/users/' + encodeURIComponent(current.uid))
    if (profile.fields.status?.stringValue !== 'active') throw Error('Conta ainda não autorizada no sistema antigo.')
  }
  return { username: current.email, role: 'viewer', expires_at: new Date(current.expires).toISOString() }
}

export function cloudLogout(): void {
  sessionStorage.removeItem(sessionKey)
  data = undefined; loading = undefined; generation = ''
}

export async function refreshCloud(): Promise<Snapshot> {
  const initial = session().uid
  const manifest = await getDocument(documentUrl)
  const fields = manifest.fields
  const nextGeneration = fields.generation?.stringValue || ''
  if (data && nextGeneration === generation) return data
  const count = Number(fields.chunkCount?.integerValue)
  const hashes = fields.chunkHashes?.arrayValue?.values || []
  if (!/^gtb2-[a-f0-9]{32}$/.test(nextGeneration) || !Number.isInteger(count) || count < 1 || count > 20 || hashes.length !== count)
    throw Error('Cópia online inválida. A última consulta não foi substituída.')
  // Limitar paralelismo reduz picos de leitura no plano gratuito.
  const chunks: string[] = []
  for (let start = 0; start < count; start += 4) {
    const group = await Promise.all(Array.from({ length: Math.min(4, count - start) }, async (_, offset) => {
      const index = start + offset
      const part = (await getDocument(documentUrl + '/chunks/' + nextGeneration + '-' + index)).fields
      const content = part.content?.stringValue || ''
      if (part.generation?.stringValue !== nextGeneration || Number(part.index?.integerValue) !== index || content.length > 400000)
        throw Error('Bloco online inválido.')
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      if (hash !== hashes[index].stringValue) throw Error('Falha de integridade na sincronização.')
      return content
    }))
    chunks.push(...group)
  }
  const bytes = Uint8Array.from(atob(chunks.join('')), char => char.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  const parsed = JSON.parse(await new Response(stream).text()) as Snapshot
  if (!parsed.version || !parsed.records || !parsed.views || !parsed.details) throw Error('Formato de consulta online inválido.')
  if (session().uid !== initial) throw Error('A sessão foi alterada durante a consulta.')
  const changed = !!generation && generation !== nextGeneration
  data = parsed; generation = nextGeneration
  if (changed) window.dispatchEvent(new Event('gtb-cloud-updated'))
  return parsed
}

export async function cloudFetch(input: string, init?: RequestInit): Promise<Response> {
  if (init?.method && init.method !== 'GET') return new Response(JSON.stringify({ detail: 'Importe as bases no sistema local; esta página é para consulta.' }), { status: 403 })
  loading ??= refreshCloud().catch(error => { loading = undefined; throw error })
  return demoFetch(input, init, data || await loading)
}

export function cloudInfo(): { version?: string; syncedAt?: string } {
  return { version: data?.version, syncedAt: data?.syncedAt }
}
