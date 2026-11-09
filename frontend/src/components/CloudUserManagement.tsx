import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listCloudAccounts, revokeCloudAccount, saveCloudAccount, sendCloudPasswordReset, type CloudAccount } from '../services/cloud'

const ranks = ['Cel PM', 'Ten Cel PM', 'Maj PM', 'Cap PM', '1º Ten PM', '2º Ten PM', 'Asp Of PM', 'Subten PM', '1º Sgt PM', '2º Sgt PM', '3º Sgt PM', 'Cb PM', 'Sd PM', 'Servidor civil']

export function CloudUserManagement() {
  const client = useQueryClient()
  const accounts = useQuery({ queryKey: ['cloud-accounts'], queryFn: listCloudAccounts, staleTime: 30000 })
  const [editing, setEditing] = useState<CloudAccount | null>(null)
  const [message, setMessage] = useState('')
  const mutation = useMutation({
    mutationFn: async ({ account, revoke }: { account: CloudAccount; revoke: boolean }) => {
      if (revoke) await revokeCloudAccount(account)
      else await saveCloudAccount(account)
    },
    onSuccess: () => { setEditing(null); setMessage('Conta atualizada.'); void client.invalidateQueries({ queryKey: ['cloud-accounts'] }) },
  })
  const passwordReset = useMutation({
    mutationFn: sendCloudPasswordReset,
    onSuccess: () => setMessage('E-mail de recuperação enviado ao titular da conta.'),
  })
  return <section className="panel cloud-user-management" aria-label="Central de Acesso online">
    <div className="section-head"><div><p className="eyebrow">Administração online</p><h2>Central de Acesso</h2></div></div>
    <p className="muted">Edite nome, posto e perfil das contas autorizadas. Revogar acesso impede a consulta online. Para redefinir a senha, envie um e-mail de recuperação ao titular da conta.</p>
    {accounts.isPending && <p role="status">Carregando contas…</p>}
    {accounts.isError && <p className="error" role="alert">Não foi possível listar as contas. Confira as permissões de administrador.</p>}
    {accounts.data?.length === 0 && <p>Nenhuma conta autorizada encontrada.</p>}
    {accounts.data && <div className="cloud-user-list">{accounts.data.map(account => <article key={account.uid}>
      <div><strong>{account.rank} {account.name}</strong><span>{account.email} · {account.role === 'analyst' ? 'Analista' : 'Consulta'}</span></div>
      <button type="button" onClick={() => { mutation.reset(); setMessage(''); setEditing({ ...account }) }}>Editar</button>
    </article>)}</div>}
    {editing && <form className="cloud-user-editor" onSubmit={event => { event.preventDefault(); mutation.mutate({ account: editing, revoke: false }) }}>
      <h3>Editar {editing.email}</h3>
      <label>Nome<input value={editing.name} minLength={2} maxLength={120} required onChange={event => setEditing({ ...editing, name: event.target.value })} /></label>
      <label>Posto ou graduação<select value={editing.rank} onChange={event => setEditing({ ...editing, rank: event.target.value })}>{ranks.map(rank => <option key={rank}>{rank}</option>)}</select></label>
      <label>Perfil<select value={editing.role} onChange={event => setEditing({ ...editing, role: event.target.value as CloudAccount['role'] })}><option value="visitor">Consulta</option><option value="analyst">Analista</option></select></label>
      <div className="cloud-user-actions"><button type="submit" className="primary" disabled={mutation.isPending}>Salvar alterações</button><button type="button" onClick={() => setEditing(null)}>Cancelar</button><button type="button" disabled={passwordReset.isPending || !editing.email} onClick={() => { if (window.confirm(`Enviar recuperação de senha para ${editing.email}?`)) { setMessage(''); passwordReset.mutate(editing) } }}>Enviar recuperação de senha</button><button type="button" className="danger" disabled={mutation.isPending} onClick={() => { if (window.confirm(`Revogar acesso online de ${editing.email}?`)) mutation.mutate({ account: editing, revoke: true }) }}>Revogar acesso</button></div>
      {mutation.isError && <p className="error" role="alert">{mutation.error.message}</p>}
      {passwordReset.isError && <p className="error" role="alert">{passwordReset.error.message}</p>}
    </form>}
    {message && <p className="success" role="status">{message}</p>}
  </section>
}
