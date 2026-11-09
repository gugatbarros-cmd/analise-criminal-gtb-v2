import { useState } from 'react'
import { createFirstUser, login } from '../services/auth'
import { isCloud } from '../services/cloud'
import { useGreeting } from '../services/greeting'

export function LoginScreen({ setup, onLogin }: { setup: boolean; onLogin: (token: string) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { greeting, date } = useGreeting()
  return <main className="shell auth-shell legacy-auth-shell">
    <header className="legacy-auth-brand"><img src={`${import.meta.env.BASE_URL}logo-10bpm-3d-ui.png`} alt="10º BPM" /><div><span>Polícia Militar de Alagoas</span><strong>Sistema de Análise Criminal</strong><small>10º BPM · Palmeira dos Índios</small></div><span className="badge">{isCloud ? 'Acesso online' : 'Acesso local'}</span></header>
    <section className="panel auth-panel"><p className="eyebrow">{isCloud ? 'Acesso protegido às bases sincronizadas' : 'Ambiente protegido · dados neste computador'}</p><p className="access-greeting">{greeting}! <span>{date}</span></p><h1>{setup ? 'Criar a primeira conta' : 'Entrar no sistema'}</h1>
      {isCloud && <p>Entre com sua conta online autorizada do GTB 2.0. A conta administrativa também aceita o login Tavares.</p>}
      {setup && <p>Crie uma conta administradora para este computador. Use uma senha de pelo menos 12 caracteres, com letra maiúscula, letra minúscula e caractere especial.</p>}
      <form onSubmit={async event => { event.preventDefault(); if (setup && password !== confirmation) { setError('As senhas não conferem.'); return } setBusy(true); setError(''); try { const session = setup ? await createFirstUser(username, password) : await login(username, password); onLogin(session.token) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.') } finally { setBusy(false) } }}>
        <label>{isCloud ? 'E-mail ou login' : 'Usuário'}<input type="text" value={username} autoComplete="username" required onChange={event => setUsername(event.target.value)} /></label>
        <label>Senha<input type="password" value={password} autoComplete={setup ? 'new-password' : 'current-password'} minLength={setup ? 12 : undefined} required onChange={event => setPassword(event.target.value)} /></label>
        {setup && <label>Confirme a senha<input type="password" value={confirmation} autoComplete="new-password" required onChange={event => setConfirmation(event.target.value)} /></label>}
        <button type="submit" className="primary" disabled={busy}>{busy ? 'Aguarde…' : setup ? 'Criar administrador' : 'Entrar'}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </section>
  </main>
}
