import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getActivity } from '../services/api'

const when = (value: string) => new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Maceio' })

/** Histórico local de relatórios gerados e exportações, visível apenas ao administrador. */
export function ActivityLog() {
  const [page, setPage] = useState(1)
  const activity = useQuery({ queryKey: ['activity', page], queryFn: () => getActivity(page) })
  const pages = activity.data ? Math.max(1, Math.ceil(activity.data.total / activity.data.size)) : 1
  return (
    <section className="panel activity-log" aria-label="Registro de relatórios e exportações">
      <div className="section-head">
        <div>
          <p className="eyebrow">Auditoria local</p>
          <h2>Relatórios e exportações</h2>
        </div>
        <span>{activity.data ? `${activity.data.total} registro(s)` : ''}</span>
      </div>
      <p className="muted">
        Mostra quem gerou, imprimiu ou exportou documentos neste computador. O registro fica somente no banco local de contas e não é
        sincronizado online. São mantidos os 5.000 eventos mais recentes.
      </p>
      {activity.isError && (
        <p className="error" role="alert">
          Não foi possível carregar o registro.
        </p>
      )}
      {activity.data &&
        (activity.data.items.length ? (
          <table className="activity-table">
            <thead>
              <tr>
                <th>Data e hora</th>
                <th>Conta</th>
                <th>Ação</th>
                <th>Recorte</th>
              </tr>
            </thead>
            <tbody>
              {activity.data.items.map((item, index) => (
                <tr key={`${item.at}-${index}`}>
                  <td>{when(item.at)}</td>
                  <td>{item.username}</td>
                  <td>{item.label}</td>
                  <td>{item.detail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Nenhum relatório ou exportação registrado ainda.</p>
        ))}
      {pages > 1 && (
        <div className="activity-pages">
          <button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>
            Anteriores
          </button>
          <span>
            Página {page} de {pages}
          </span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>
            Seguintes
          </button>
        </div>
      )}
    </section>
  )
}
