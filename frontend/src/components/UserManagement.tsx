import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createUser, getUsers, type LocalUser } from '../services/auth'

const roleLabels: Record<LocalUser['role'], string> = {
  admin: 'Administrador', analyst: 'Analista', viewer: 'Consulta',
}

export function UserManagement({ token }: { token: string }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<LocalUser['role']>('viewer')
  const client = useQueryClient()
  const users = useQuery({ queryKey: ['users'], queryFn: () => getUsers(token) })
  const creation = useMutation({
    mutationFn: () => createUser(token, username, password, role),
    onSuccess: () => { setUsername(''); setPassword(''); setRole('viewer'); void client.invalidateQueries({ queryKey: ['users'] }) },
  })
  return <section className="panel" aria-label="Gerenciar usuários locais">
    <div className="section-head"><div><p className="eyebrow">Acesso ao sistema local</p><h2>Usuários e perfis</h2></div></div>
    <p className="muted">Administrador cria contas; analista pode importar e consultar; perfil de consulta não pode importar. As senhas ficam derivadas no banco local de autenticação.</p>
    {users.isError && <p className="error" role="alert">Não foi possível listar as contas.</p>}
    {users.data && <div className="user-list">{users.data.map(user => <span key={user.username}>{user.username} · {roleLabels[user.role]}</span>)}</div>}
    <form onSubmit={event => { event.preventDefault(); creation.mutate() }}>
      <label>Novo usuário<input value={username} minLength={3} maxLength={32} autoComplete="off" required onChange={event => setUsername(event.target.value)} /></label>
      <label>Senha inicial<input type="password" value={password} minLength={12} maxLength={256} autoComplete="new-password" required onChange={event => setPassword(event.target.value)} /></label>
      <label>Perfil<select value={role} onChange={event => setRole(event.target.value as LocalUser['role'])}><option value="viewer">Consulta</option><option value="analyst">Analista</option><option value="admin">Administrador</option></select></label>
      <button type="submit" className="primary" disabled={creation.isPending}>Criar conta</button>
      {creation.isError && <p className="error" role="alert">{creation.error.message}</p>}
      {creation.isSuccess && <p className="success" role="status">Conta criada.</p>}
    </form>
  </section>
}
