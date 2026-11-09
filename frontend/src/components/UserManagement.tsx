import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createUser, getUsers, resetUserPassword, updateUser, type LocalUser } from '../services/auth'

const roleLabels: Record<LocalUser['role'], string> = { admin: 'Administrador', analyst: 'Analista', viewer: 'Consulta' }

function UserRow({ user, token, refresh }: { user: LocalUser; token: string; refresh: () => void }) {
  const [role, setRole] = useState(user.role)
  const [status, setStatus] = useState<'active' | 'revoked'>(user.status || 'active')
  const [temporary, setTemporary] = useState('')
  const [notice, setNotice] = useState('')
  const save = useMutation({ mutationFn: () => updateUser(token, user.username, role, status),
    onSuccess: () => { setNotice('Perfil atualizado.'); refresh() } })
  const reset = useMutation({ mutationFn: () => resetUserPassword(token, user.username, temporary),
    onSuccess: () => { setTemporary(''); setNotice('Senha temporária registrada. Entregue-a ao titular por canal seguro; ele deverá trocá-la ao entrar.'); refresh() } })
  return <article className="user-account">
    <strong>{user.username}</strong> <span className="muted">{user.status === 'revoked' ? 'Revogada' : 'Ativa'}</span>
    <div className="user-account-fields">
      <label>Perfil<select value={role} onChange={event => setRole(event.target.value as LocalUser['role'])}>{Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label>Situação<select value={status} onChange={event => setStatus(event.target.value as 'active' | 'revoked')}><option value="active">Ativa</option><option value="revoked">Revogada</option></select></label>
      <button type="button" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar perfil'}</button>
    </div>
    <form className="user-account-fields" onSubmit={event => { event.preventDefault(); reset.mutate() }}>
      <label>Nova senha temporária<input type="password" value={temporary} minLength={12} maxLength={256} autoComplete="new-password" required onChange={event => setTemporary(event.target.value)} /></label>
      <button type="submit" disabled={reset.isPending}>{reset.isPending ? 'Redefinindo…' : 'Redefinir senha'}</button>
    </form>
    {(save.isError || reset.isError) && <p className="error" role="alert">{(save.error || reset.error)?.message}</p>}
    {notice && <p className="success" role="status">{notice}</p>}
  </article>
}

export function UserManagement({ token }: { token: string }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<LocalUser['role']>('viewer')
  const client = useQueryClient()
  const refresh = () => { void client.invalidateQueries({ queryKey: ['users'] }) }
  const users = useQuery({ queryKey: ['users'], queryFn: () => getUsers(token) })
  const creation = useMutation({ mutationFn: () => createUser(token, username, password, role),
    onSuccess: () => { setUsername(''); setPassword(''); setRole('viewer'); refresh() } })
  return <section className="panel" aria-label="Central de Acesso">
    <div className="section-head"><div><p className="eyebrow">Contas e permissões locais</p><h2>Central de Acesso</h2></div></div>
    <p className="muted">Estas contas pertencem a este computador. Senhas são guardadas como derivação criptográfica. A consulta online usa contas Firebase separadas.</p>
    {users.isError && <p className="error" role="alert">Não foi possível listar as contas.</p>}
    {users.data && <div className="user-list">{users.data.map(user => <UserRow key={user.username} user={user} token={token} refresh={refresh} />)}</div>}
    <h3>Criar conta local</h3>
    <form onSubmit={event => { event.preventDefault(); creation.mutate() }}>
      <label>Novo usuário<input value={username} minLength={3} maxLength={32} autoComplete="off" required onChange={event => setUsername(event.target.value)} /></label>
      <label>Senha inicial<input type="password" value={password} minLength={12} maxLength={256} autoComplete="new-password" aria-describedby="password-rules" required onChange={event => setPassword(event.target.value)} /></label>
      <p id="password-rules" className="muted password-rules">Mínimo de 12 caracteres, com letra maiúscula, letra minúscula e caractere especial.</p>
      <label>Perfil<select value={role} onChange={event => setRole(event.target.value as LocalUser['role'])}><option value="viewer">Consulta</option><option value="analyst">Analista</option><option value="admin">Administrador</option></select></label>
      <button type="submit" className="primary" disabled={creation.isPending}>Criar conta</button>
      {creation.isError && <p className="error" role="alert">{creation.error.message}</p>}
      {creation.isSuccess && <p className="success" role="status">Conta criada.</p>}
    </form>
  </section>
}
