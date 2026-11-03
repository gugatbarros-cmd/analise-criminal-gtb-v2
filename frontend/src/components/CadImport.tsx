import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { disconnectCad, getCadStatus, startCadImport, submitCadToken } from '../services/api'

export function CadImport({ onComplete }: { onComplete: () => void }) {
  const cpf = useRef<HTMLInputElement>(null)
  const password = useRef<HTMLInputElement>(null)
  const token = useRef<HTMLInputElement>(null)
  const completed = useRef(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [localError, setLocalError] = useState('')
  const status = useQuery({ queryKey: ['cad-status'], queryFn: getCadStatus, refetchInterval: 1500 })
  const start = useMutation({ mutationFn: ({ cpf, password }: { cpf: string; password: string }) =>
    startCadImport(cpf, password, startDate, endDate), onSuccess: () => { setLocalError(''); void status.refetch() },
    onError: error => setLocalError(error.message) })
  const verify = useMutation({ mutationFn: submitCadToken,
    onSuccess: () => { setLocalError(''); void status.refetch() },
    onError: error => setLocalError(error.message) })
  const disconnect = useMutation({ mutationFn: disconnectCad, onSuccess: () => void status.refetch(),
    onError: error => setLocalError(error.message) })

  useEffect(() => {
    if (status.data?.phase === 'complete' && !completed.current) {
      completed.current = true
      onComplete()
    }
    if (status.data?.phase === 'opening') completed.current = false
  }, [status.data?.phase, onComplete])

  const busy = start.isPending || verify.isPending ||
    !!status.data && !['idle', 'error', 'complete'].includes(status.data.phase)

  return <section className="panel" aria-labelledby="cad-import-title">
    <div className="section-head"><div><p className="eyebrow">Alternativa de importação</p>
      <h2 id="cad-import-title">Buscar ocorrências no CAD</h2></div></div>
    <p className="muted">Escolha o intervalo. O sistema consulta Polícia Militar e 10º BPM, seleciona todas as colunas, baixa o XLS e importa na base local de ocorrências. CPF, senha e token são usados apenas nesta sessão.</p>
    <form onSubmit={event => {
      event.preventDefault()
      const value = password.current?.value || ''
      const documentId = (cpf.current?.value || '').replace(/\D/g, '')
      if (password.current) password.current.value = ''
      if (cpf.current) cpf.current.value = ''
      start.mutate({ cpf: documentId, password: value })
    }}>
      <label>Data inicial<input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} required /></label>
      <label>Data final<input type="date" value={endDate} min={startDate} onChange={event => setEndDate(event.target.value)} required /></label>
      <label>CPF do CAD<input ref={cpf} inputMode="numeric" autoComplete="off" maxLength={14} required /></label>
      <label>Senha do CAD<input ref={password} type="password" autoComplete="off" required /></label>
      <div className="import-actions"><button type="submit" className="primary" disabled={!!busy || !startDate || !endDate || startDate > endDate}>Consultar e importar</button></div>
    </form>
    {status.data?.phase === 'token' && <form onSubmit={event => {
      event.preventDefault()
      const value = token.current?.value.trim() || ''
      if (token.current) token.current.value = ''
      verify.mutate(value)
    }}><label>Token recebido do CAD<input ref={token} autoComplete="one-time-code" required /></label>
      <div className="import-actions"><button type="submit" disabled={verify.isPending}>Confirmar token</button></div></form>}
    {status.data && <p role="status">{status.data.message}</p>}
    {status.data && status.data.phase !== 'idle' && <div className="cad-progress">
      <div className="cad-progress-heading"><strong>Andamento da consulta e importação</strong>
        <span>{status.data.progress}%</span></div>
      <progress value={status.data.progress} max={100} aria-label="Andamento da importação do CAD" />
      <small>O percentual avança quando cada etapa é confirmada. A gravação no banco termina em 100%.</small>
    </div>}
    {status.data?.result && <p className="success" role="status">{status.data.result.repeated ? 'Arquivo já importado.' :
      `Lote concluído: ${status.data.result.inserted} novos, ${status.data.result.updated} atualizados, ${status.data.result.quarantined} em quarentena.`}</p>}
    {status.isError && <p className="error" role="alert">{status.error.message}</p>}
    {localError && <p className="error" role="alert">{localError}</p>}
    {busy && <button type="button" onClick={() => disconnect.mutate()} disabled={disconnect.isPending}>Desconectar do CAD</button>}
  </section>
}
