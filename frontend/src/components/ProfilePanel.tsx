import type { LocalUser } from '../services/auth'
import { PasswordChange } from './PasswordChange'

const roles = { admin: 'Administrador', analyst: 'Analista', viewer: 'Consulta' }

export function ProfilePanel({ user, token, local, onPasswordChanged }: { user: LocalUser; token: string; local: boolean; onPasswordChanged: () => void }) {
  return <><section className="panel profile-panel"><div><p className="eyebrow">{local ? 'Conta local' : 'Conta online'}</p><h2>Meu perfil</h2></div><dl><div><dt>Usuário</dt><dd>{user.username}</dd></div><div><dt>Perfil de acesso</dt><dd>{roles[user.role]}</dd></div><div><dt>Sessão válida até</dt><dd>{new Date(user.expires_at).toLocaleString('pt-BR')}</dd></div><div><dt>Armazenamento</dt><dd>{local ? 'Somente neste computador' : 'Firebase Spark'}</dd></div></dl></section>{local && <PasswordChange token={token} onChanged={onPasswordChanged} />}</>
}
