import type { LocalUser } from '../services/auth'

const roles = { admin: 'Administrador', analyst: 'Analista', viewer: 'Consulta' }

export function ProfilePanel({ user }: { user: LocalUser }) {
  return <section className="panel profile-panel"><div><p className="eyebrow">Conta local</p><h2>Meu perfil</h2></div><dl><div><dt>Usuário</dt><dd>{user.username}</dd></div><div><dt>Perfil de acesso</dt><dd>{roles[user.role]}</dd></div><div><dt>Sessão válida até</dt><dd>{new Date(user.expires_at).toLocaleString('pt-BR')}</dd></div><div><dt>Armazenamento</dt><dd>Somente neste computador</dd></div></dl></section>
}
