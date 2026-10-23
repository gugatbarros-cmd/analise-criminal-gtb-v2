import { useState } from 'react'
import { login } from '../services/auth'

export function LoginScreen({ setup, onLogin }: { setup: boolean; onLogin: (token: string) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return <main className="shell auth-shell">
    <header><div className="brand"><span className="brand-mark">GTB</span><span>Análise Criminal <strong>2.0</strong></span></div><span className="badge">Acesso local</span></header>
    <section className="panel auth-panel"><p className="eyebrow">Dados neste computador</p><h1>{setup ? 'Criar a primeira conta' : 'Entrar no sistema'}</h1>
      {setup ? <><p>O administrador precisa ser criado uma vez no terminal deste computador. A senha não aparece no comando nem fica no código.</p><code>.venv\Scripts\python.exe scripts\criar-usuario.py admin</code><p>Depois, atualize esta página para entrar.</p></> : <form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { const session = await login(username, password); onLogin(session.token) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.') } finally { setBusy(false) } }}>
        <label>Usuário<input value={username} autoComplete="username" required onChange={event => setUsername(event.target.value)} /></label>
        <label>Senha<input type="password" value={password} autoComplete="current-password" required onChange={event => setPassword(event.target.value)} /></label>
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>}
    </section>
  </main>
}
