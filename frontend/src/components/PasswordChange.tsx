import { useState } from 'react'
import { changePassword } from '../services/auth'

export function PasswordChange({ token, required, onChanged }: { token: string; required?: boolean; onChanged: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  return <section className="panel auth-panel" aria-label="Alterar senha">
    <h2>{required ? 'Troque sua senha temporária' : 'Alterar minha senha'}</h2>
    <p className="muted">Use pelo menos 12 caracteres, com maiúscula, minúscula e caractere especial.</p>
    <form onSubmit={async event => {
      event.preventDefault()
      if (next !== confirm) { setError('As senhas não conferem.'); return }
      setBusy(true); setError(''); setSuccess('')
      try {
        await changePassword(token, current, next)
        setCurrent(''); setNext(''); setConfirm('')
        setSuccess('Senha alterada. As outras sessões desta conta foram encerradas.')
        onChanged()
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível alterar a senha.') }
      finally { setBusy(false) }
    }}>
      <label>Senha atual ou temporária<input type="password" autoComplete="current-password" value={current} required onChange={event => setCurrent(event.target.value)} /></label>
      <label>Nova senha<input type="password" autoComplete="new-password" minLength={12} maxLength={256} value={next} required onChange={event => setNext(event.target.value)} /></label>
      <label>Confirme a nova senha<input type="password" autoComplete="new-password" value={confirm} required onChange={event => setConfirm(event.target.value)} /></label>
      <button type="submit" className="primary" disabled={busy}>{busy ? 'Alterando…' : 'Alterar senha'}</button>
      {error && <p className="error" role="alert">{error}</p>}
      {success && <p className="success" role="status">{success}</p>}
    </form>
  </section>
}
