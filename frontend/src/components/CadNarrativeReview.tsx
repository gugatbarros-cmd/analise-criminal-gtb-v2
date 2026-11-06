import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMviCadReviewCases, reviewMviCad, type MviCadReviewCase } from '../services/api'

const categories = ['Homicídio doloso', 'Feminicídio', 'Latrocínio', 'Lesão corporal seguida de morte']

function ReviewCase({ item, onDecision, busy }: { item: MviCadReviewCase; onDecision: (item: MviCadReviewCase, decision: 'confirmed' | 'rejected' | 'pending', category?: string) => void; busy: boolean }) {
  const [category, setCategory] = useState(categories.includes(item.category) ? item.category : categories[0])
  return <article className="cad-review-case">
    <div><strong>{item.occurrence || 'Ocorrência sem número'} · {item.victim || 'Vítima não informada'}</strong><small>{item.event_date} · {item.municipality} · {item.nature || 'Natureza não informada'}</small></div>
    <p>{item.reason || 'Relato com indício de MVI para revisão.'}</p>
    {item.decision && <p>Revisão: {item.decision === 'confirmed' ? 'confirmado' : 'descartado'} por {item.reviewer} em {item.reviewed_at}</p>}
    <details><summary>Ler relato ou histórico</summary>{item.narratives.map((value, index) => <p key={index} className="cad-review-narrative">{value}</p>)}</details>
    <div className="cad-review-actions"><label>Classificação<select value={category} onChange={event => setCategory(event.target.value)}>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
      <button type="button" disabled={busy} onClick={() => onDecision(item, 'confirmed', category)}>Confirmar MVI</button>
      <button type="button" disabled={busy} onClick={() => onDecision(item, 'rejected')}>Descartar</button>
      {item.decision && <button type="button" disabled={busy} onClick={() => onDecision(item, 'pending')}>Reabrir revisão</button>}
    </div>
  </article>
}

export function CadNarrativeReview() {
  const [status, setStatus] = useState('pending')
  const [page, setPage] = useState(1)
  const client = useQueryClient()
  const cases = useQuery({ queryKey: ['mvi-cad-reviews', status, page], queryFn: () => getMviCadReviewCases(page, status) })
  const mutation = useMutation({ mutationFn: ({ item, decision, category }: { item: MviCadReviewCase; decision: 'confirmed' | 'rejected' | 'pending'; category?: string }) => reviewMviCad(item.natural_key, item.row_hash, decision, category),
    onSuccess: () => { void client.invalidateQueries() } })
  return <section className="panel cad-review-panel" aria-labelledby="cad-review-title"><div className="section-head"><div><p className="eyebrow">Conferência humana · CAD</p><h2 id="cad-review-title">Relatos para confirmar MVI</h2></div><span>{cases.data?.total ?? '—'} caso(s)</span></div>
    <p className="muted">Textos com menção a morte ou homicídio aparecem aqui quando a base não confirma o óbito. Leia o histórico e confirme somente quando houver evidência de morte violenta consumada. A confirmação altera a contagem do MVI CAD; o NEAC permanece independente.</p>
    <label>Exibir <select value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="pending">Pendentes</option><option value="reviewed">Revisados</option><option value="all">Todos</option></select></label>
    {cases.isPending && <p role="status">Carregando relatos…</p>}{cases.isError && <p role="alert">Não foi possível carregar os relatos.</p>}
    {mutation.isError && <p role="alert">{mutation.error.message}</p>}
    {cases.data?.items.map(item => <ReviewCase key={item.natural_key} item={item} busy={mutation.isPending} onDecision={(selected, decision, category) => mutation.mutate({ item: selected, decision, category })} />)}
    {cases.data && !cases.data.total && <p className="muted">Nenhum relato nesta lista.</p>}
    <div className="pager"><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page}</span><button type="button" disabled={!cases.data || page * cases.data.size >= cases.data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div>
  </section>
}
