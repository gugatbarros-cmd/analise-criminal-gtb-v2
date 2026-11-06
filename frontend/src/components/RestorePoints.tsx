import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRestorePoints, restorePoint, type Source } from '../services/api'

export function RestorePoints({ source, label, onRestored }: {
  source: Source; label: string; onRestored: () => void
}) {
  const client = useQueryClient()
  const [selectedId, setSelectedId] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const points = useQuery({ queryKey: ['restore-points', source], queryFn: () => getRestorePoints(source) })
  const selected = points.data?.find(point => point.id === selectedId)
  const restoration = useMutation({
    mutationFn: () => restorePoint(source, selectedId),
    onSuccess: async result => {
      await client.cancelQueries()
      onRestored()
      setSelectedId('')
      setConfirmation('')
      setMessage(`${label} restaurado: ${result.restored_records.toLocaleString('pt-BR')} registros atuais. Um ponto de segurança permite desfazer esta restauração.`)
      await client.invalidateQueries()
    },
  })
  return <section className="panel restore-points" aria-label={`Recuperação de ${label}`}>
    <div className="section-head"><div><p className="eyebrow">Recuperação por indicador</p><h2>Restaurar {label}</h2></div></div>
    <p className="muted">O sistema guarda automaticamente uma cópia local antes de cada importação. Escolha o estado anterior ao lote errado. A recuperação altera somente a base {label}; os indicadores calculados a partir dessa base são atualizados.</p>
    {points.isPending && <p role="status">Buscando pontos de recuperação…</p>}
    {points.isError && <p className="error" role="alert">Não foi possível consultar as cópias locais.</p>}
    {points.data?.length === 0 && <p className="muted">Ainda não há cópia disponível para este indicador.</p>}
    {!!points.data?.length && <>
      <label>Ponto de recuperação<select value={selectedId} onChange={event => { setSelectedId(event.target.value); setConfirmation(''); restoration.reset(); setMessage('') }}>
        <option value="">Selecione uma versão anterior</option>
        {points.data.map(point => <option key={point.id} value={point.id}>{point.kind === 'batch' ? 'Antes de importar' : 'Cópia de segurança'}: {point.label} · {new Date(point.created_at).toLocaleString('pt-BR')}</option>)}
      </select></label>
      {selected && <div className="restore-confirmation">
        <p><strong>Versão escolhida:</strong> {selected.kind === 'batch' ? `antes da importação de ${selected.label}` : selected.label}.</p>
        <p className="muted">As importações posteriores desta base também serão desfeitas. A recuperação cria outra cópia de segurança antes de alterar os dados. Digite <strong>RESTAURAR</strong> para confirmar.</p>
        <label>Confirmação<input value={confirmation} autoComplete="off" onChange={event => setConfirmation(event.target.value)} /></label>
        <button type="button" className="primary" disabled={confirmation !== 'RESTAURAR' || restoration.isPending} onClick={() => restoration.mutate()}>{restoration.isPending ? 'Restaurando…' : `Restaurar ${label}`}</button>
      </div>}
    </>}
    {restoration.isError && <p className="error" role="alert">{restoration.error.message}</p>}
    {message && <p className="success" role="status">{message}</p>}
  </section>
}
