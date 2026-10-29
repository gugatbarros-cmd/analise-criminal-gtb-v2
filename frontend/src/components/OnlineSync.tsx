import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getSessionToken } from '../services/auth'

type State = { configured: boolean; busy: boolean; status: string; message: string; email?: string; lastSyncedAt?: string; url: string }
const base = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
async function online(action: string, body?: unknown): Promise<State> {
  const response = await fetch(`${base}/online/${action}`, {
    method: action === 'status' ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + getSessionToken(), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result = await response.json() as State & { detail?: string }
  if (!response.ok) throw Error(result.detail || 'Não foi possível acessar a sincronização.')
  return result
}

export function OnlineSync() {
  const client = useQueryClient()
  const [email, setEmail] = useState('gugatbarros@hotmail.com')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const state = useQuery({ queryKey: ['online-sync'], queryFn: () => online('status'), refetchInterval: 5000 })
  async function action(name: string, body?: unknown) {
    setBusy(true); setError('')
    try { await online(name, body); setPassword(''); await client.invalidateQueries({ queryKey: ['online-sync'] }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha na conexão.') }
    finally { setBusy(false) }
  }
  return <section className="panel" aria-label="Sincronização online">
    <h2>Versão online e sincronização</h2>
    <p>Este computador será a origem das bases online. Após cada importação e atualização de versão, os dados processados serão enviados automaticamente para consulta com o mesmo acesso do sistema antigo.</p>
    <p>O plano permanece gratuito. Arquivos originais, contas locais, quarentena e divergências continuam neste computador.</p>
    <p role="status">{state.data?.message || 'Verificando sincronização…'}</p>
    {state.data?.lastSyncedAt && <p>Último envio: {new Date(state.data.lastSyncedAt).toLocaleString('pt-BR')}</p>}
    {state.data?.configured ? <div className="import-actions"><span>Conta: {state.data.email}</span>
      <button type="button" disabled={busy || state.data.busy} onClick={() => void action('sync')}>Sincronizar agora</button>
      <button type="button" disabled={busy || state.data.busy} onClick={() => void action('disconnect')}>Desconectar este computador</button></div>
      : <form onSubmit={event => { event.preventDefault(); void action('connect', { email, password }) }}>
        <label>E-mail do sistema antigo<input type="email" autoComplete="username" value={email} required onChange={event => setEmail(event.target.value)} /></label>
        <label>Senha do sistema antigo<input type="password" autoComplete="current-password" value={password} required onChange={event => setPassword(event.target.value)} /></label>
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Conectando…' : 'Conectar e sincronizar'}</button>
      </form>}
    {(error || state.isError) && <p className="error" role="alert">{error || state.error?.message}</p>}
    <p><a href="https://gugatbarros-cmd.github.io/analise-criminal-gtb-v2/" target="_blank" rel="noreferrer">Abrir sistema online</a></p>
  </section>
}
