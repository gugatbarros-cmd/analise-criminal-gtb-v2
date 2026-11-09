import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMviCadReviewCases, reviewMviCad, type MviCadReviewCase } from '../services/api'

const categories = ['Homicídio doloso', 'Feminicídio', 'Latrocínio', 'Lesão corporal seguida de morte']
type Decision = 'confirmed' | 'rejected' | 'pending'

function ReviewCase({ item, onDecision, busy }: {
  item: MviCadReviewCase
  onDecision: (item: MviCadReviewCase, decision: Decision, category?: string, note?: string, deathDate?: string) => void
  busy: boolean
}) {
  const [category, setCategory] = useState(categories.includes(item.category) ? item.category : categories[0])
  const [note, setNote] = useState(item.evidence_note || '')
  const [deathDate, setDeathDate] = useState(item.death_date || '')
  return <article className="cad-review-case">
    <div><strong>{item.occurrence || 'Ocorrência sem número'} · {item.victim || 'Vítima não informada'}</strong>
      <small>{item.event_date} · {item.municipality} · {item.nature || 'Natureza não informada'}</small></div>
    {item.attempted && <p className="cad-review-signal">Tentativa de MVI: verificar se a vítima morreu posteriormente. A tentativa não entra no MVI sem confirmação.</p>}
    {item.death_signal && <p className="cad-review-signal">O relato menciona morte; confira se a informação é afirmativa e se se refere a esta vítima.</p>}
    <p>{item.reason || 'Caso para revisão.'}</p>
    {item.neac_candidates.length > 0 && <div className="cad-review-neac"><strong>Possível correspondência no NEAC — pista para conferência</strong>
      <ul>{item.neac_candidates.map((candidate, index) => <li key={`${candidate.occurrence}-${index}`}>
        {candidate.event_date} · {candidate.municipality} · {candidate.category} · ocorrência {candidate.occurrence || 'não informada'}
        {candidate.same_occurrence ? ' · mesmo número de ocorrência' : ' · número de ocorrência diferente'}
      </li>)}</ul><small>Mesmo nome, município e data próxima não comprovam, por si, que é a mesma vítima. Confira o registro oficial.</small></div>}
    {item.decision && <p>Revisão: {item.decision === 'confirmed' ? 'confirmado' : 'descartado'} por {item.reviewer} em {item.reviewed_at}
      {item.evidence_note ? ` · referência: ${item.evidence_note}` : ''}{item.death_date ? ` · óbito: ${item.death_date}` : ''}</p>}
    {item.narratives.length ? <details><summary>Ler relato ou histórico</summary>{item.narratives.map((value, index) => <p key={index} className="cad-review-narrative">{value}</p>)}</details>
      : <p className="muted">Esta linha do CAD não contém relato. Consulte o complemento da ocorrência ou outra fonte oficial antes de confirmar.</p>}
    <div className="cad-review-evidence"><label>Referência da confirmação ou justificativa da revisão
      <textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1000}
        placeholder="Ex.: boletim complementar, registro NEAC ou informação oficial sobre o óbito" /></label>
      <label>Data do óbito, se conhecida<input type="date" min={item.event_date} value={deathDate}
        onChange={event => setDeathDate(event.target.value)} /></label>
      {item.attempted && <small>Para confirmar uma tentativa como MVI, informe uma referência verificável com pelo menos 12 caracteres.</small>}</div>
    <div className="cad-review-actions"><label>Classificação<select value={category} onChange={event => setCategory(event.target.value)}>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
      <button type="button" disabled={busy || (item.attempted && note.trim().length < 12)}
        onClick={() => onDecision(item, 'confirmed', category, note, deathDate)}>Confirmar MVI</button>
      <button type="button" disabled={busy} onClick={() => onDecision(item, 'rejected', undefined, note)}>Descartar</button>
      {item.decision && <button type="button" disabled={busy} onClick={() => onDecision(item, 'pending')}>Reabrir revisão</button>}
    </div>
  </article>
}

export function CadNarrativeReview() {
  const [status, setStatus] = useState('pending')
  const [focus, setFocus] = useState('attempts')
  const [page, setPage] = useState(1)
  const client = useQueryClient()
  const cases = useQuery({ queryKey: ['mvi-cad-reviews', status, focus, page],
    queryFn: () => getMviCadReviewCases(page, status, focus) })
  const mutation = useMutation({ mutationFn: ({ item, decision, category, note, deathDate }: {
    item: MviCadReviewCase; decision: Decision; category?: string; note?: string; deathDate?: string
  }) => reviewMviCad(item.natural_key, item.row_hash, decision, category, note, deathDate),
  onSuccess: () => { void client.invalidateQueries() } })
  return <section className="panel cad-review-panel" aria-labelledby="cad-review-title">
    <div className="section-head"><div><p className="eyebrow">Conferência humana · CAD</p><h2 id="cad-review-title">Conferir tentativas e relatos de MVI</h2></div><span>{cases.data?.total ?? '—'} caso(s)</span></div>
    <p className="muted">A fila mostra tentativas de homicídio, feminicídio ou latrocínio mesmo quando o CAD não traz relato. Também permite conferir relatos com menção a óbito. A confirmação exige evidência humana; não soma nem funde CAD e NEAC automaticamente.</p>
    <div className="cad-review-filters"><label>Exibir <select value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="pending">Pendentes</option><option value="reviewed">Revisados</option><option value="all">Todos</option></select></label>
      <label>Tipo <select value={focus} onChange={event => { setFocus(event.target.value); setPage(1) }}><option value="attempts">Tentativas de MVI</option><option value="death_mentions">Relatos de óbito</option><option value="all">Todos os candidatos</option></select></label></div>
    {cases.isPending && <p role="status">Carregando casos…</p>}{cases.isError && <p role="alert">Não foi possível carregar os casos.</p>}
    {mutation.isError && <p role="alert">{mutation.error.message}</p>}
    {cases.data?.items.map(item => <ReviewCase key={item.natural_key} item={item} busy={mutation.isPending}
      onDecision={(selected, decision, category, note, deathDate) => mutation.mutate({ item: selected, decision, category, note, deathDate })} />)}
    {cases.data && !cases.data.total && <p className="muted">Nenhum caso nesta lista.</p>}
    <div className="pager"><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page}</span><button type="button" disabled={!cases.data || page * cases.data.size >= cases.data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div>
  </section>
}
