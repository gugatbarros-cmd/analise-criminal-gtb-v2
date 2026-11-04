import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { cancelCadImport, disconnectCad, getCadStatus, startCadImport, submitCadToken } from '../services/api'
import { cadPeriodError } from '../services/cad-period'

export function CadImport({ onComplete }: { onComplete: () => void }) {
  const cpf = useRef<HTMLInputElement>(null)
  const password = useRef<HTMLInputElement>(null)
  const token = useRef<HTMLInputElement>(null)
  const startInput = useRef<HTMLInputElement>(null)
  const endInput = useRef<HTMLInputElement>(null)
  const completed = useRef(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [localError, setLocalError] = useState('')
  const [dateError, setDateError] = useState('')
  const status = useQuery({ queryKey: ['cad-status'], queryFn: getCadStatus, refetchInterval: 1500 })
  const start = useMutation({ mutationFn: ({ cpf, password, first, last }: { cpf: string; password: string; first: string; last: string }) =>
    startCadImport(cpf, password, first, last), onSuccess: () => { setLocalError(''); void status.refetch() },
    onError: error => setLocalError(error.message) })
  const verify = useMutation({ mutationFn: submitCadToken,
    onSuccess: () => { setLocalError(''); void status.refetch() },
    onError: error => setLocalError(error.message) })
  const disconnect = useMutation({ mutationFn: disconnectCad, onSuccess: () => void status.refetch(),
    onError: error => setLocalError(error.message) })
  const cancel = useMutation({ mutationFn: cancelCadImport, onSuccess: () => void status.refetch(),
    onError: error => setLocalError(error.message) })

  useEffect(() => {
    if (status.data?.phase === 'complete' && !completed.current) {
      completed.current = true
      onComplete()
    }
    if (['opening', 'filtering'].includes(status.data?.phase || '')) completed.current = false
  }, [status.data?.phase, onComplete])

  const busy = start.isPending || verify.isPending ||
    !!status.data && !['idle', 'error', 'complete', 'cancelled', 'ready'].includes(status.data.phase)
  const canCancel = !!status.data && ['opening', 'token', 'verifying', 'filtering', 'downloading', 'validating'].includes(status.data.phase)

  return <section className="panel" aria-labelledby="cad-import-title">
    <div className="section-head"><div><p className="eyebrow">Alternativa de importação</p>
      <h2 id="cad-import-title">Buscar ocorrências no CAD</h2></div></div>
    <p className="muted">Escolha o intervalo. O sistema consulta Polícia Militar e 10º BPM, seleciona todas as colunas, baixa o XLS e importa na base local de ocorrências. A sessão do CAD fica aberta até expirar ou você encerrá-la; CPF, senha e token não são salvos.</p>
    <form noValidate onSubmit={event => {
      event.preventDefault()
      const first = startInput.current?.value || ''
      const last = endInput.current?.value || ''
      const invalid = cadPeriodError(first, last)
      setDateError(invalid)
      if (invalid) return
      const value = password.current?.value || ''
      const documentId = (cpf.current?.value || '').replace(/\D/g, '')
      if (!status.data?.session_active && (documentId.length !== 11 || !value)) {
        setLocalError('Informe CPF e senha do CAD para iniciar a consulta.')
        return
      }
      if (password.current) password.current.value = ''
      if (cpf.current) cpf.current.value = ''
      setLocalError('')
      start.mutate({ cpf: documentId, password: value, first, last })
    }}>
      <label>Data inicial<input ref={startInput} type="date" value={startDate} onChange={event => { setStartDate(event.target.value); setDateError('') }} onInput={event => { if (event.currentTarget.validity.badInput) setDateError('Confira a data inicial: o dia informado não existe neste mês.') }} aria-invalid={!!dateError} required /></label>
      <label>Data final<input ref={endInput} type="date" value={endDate} min={startDate} onChange={event => { setEndDate(event.target.value); setDateError('') }} onInput={event => { if (event.currentTarget.validity.badInput) setDateError('Confira a data final: o dia informado não existe neste mês.') }} aria-invalid={!!dateError} required /></label>
      {dateError && <p className="error" role="alert">{dateError}</p>}
      {!status.data?.session_active && <><label>CPF do CAD<input ref={cpf} inputMode="numeric" autoComplete="off" maxLength={14} required /></label>
      <label>Senha do CAD<input ref={password} type="password" autoComplete="off" required /></label></>}
      <div className="import-actions"><button type="submit" className="primary" disabled={!!busy}>Consultar e importar</button></div>
    </form>
    {status.data?.session_active && <p className="success" role="status">Sessão do CAD ativa. Escolha outro período para reutilizar o acesso.</p>}
    {status.data?.phase === 'token' && <form onSubmit={event => {
      event.preventDefault()
      const value = token.current?.value.trim() || ''
      if (token.current) token.current.value = ''
      verify.mutate(value)
    }}><label>Token recebido do CAD<input ref={token} autoComplete="one-time-code" required /></label>
      <div className="import-actions"><button type="submit" disabled={verify.isPending}>Confirmar token</button></div></form>}
    {status.data && <p role="status">{status.data.message}</p>}
    {status.data && !['idle', 'error', 'cancelled'].includes(status.data.phase) && <div className="cad-progress">
      <div className="cad-progress-heading"><strong>Andamento da consulta e importação</strong>
        <span>{status.data.progress}%</span></div>
      <progress value={status.data.progress} max={100} aria-label="Andamento da importação do CAD" />
      <small>O percentual avança quando cada etapa é confirmada. A gravação no banco termina em 100%.</small>
    </div>}
    {status.data?.result && <p className="success" role="status">{status.data.result.repeated ? 'Arquivo já importado.' :
      `Lote concluído: ${status.data.result.inserted} novos, ${status.data.result.updated} atualizados, ${status.data.result.quarantined} em quarentena.`}</p>}
    {status.isError && <p className="error" role="alert">{status.error.message}</p>}
    {localError && <p className="error" role="alert">{localError}</p>}
    <div className="import-actions">
      {canCancel && <button type="button" onClick={() => cancel.mutate()} disabled={cancel.isPending}>Cancelar consulta</button>}
      {(status.data?.session_active || busy) && status.data?.phase !== 'importing' &&
        <button type="button" onClick={() => disconnect.mutate()} disabled={disconnect.isPending || status.data?.phase === 'disconnecting'}>Encerrar sessão do CAD</button>}
    </div>
  </section>
}
