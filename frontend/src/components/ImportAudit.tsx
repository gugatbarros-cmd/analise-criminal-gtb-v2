import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getBatchAudit, type Batch, type Source } from '../services/api'

const labels: Record<Source, string> = {
  mvi_cad: 'MVI CAD', mvi_neac: 'MVI NEAC', ocorrencias: 'Ocorrências',
  armas: 'Armas', drogas: 'Drogas', guarnicoes: 'Guarnições',
}

export function ImportAudit({ batches }: { batches: Batch[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = batches.find(batch => batch.id === selectedId)
  const audit = useQuery({
    queryKey: ['batch-audit', selectedId],
    queryFn: () => getBatchAudit(selectedId!),
    enabled: !!selectedId,
  })
  return <section className="panel" aria-label="Auditoria das importações">
    <div className="section-head"><div><p className="eyebrow">Auditoria</p><h2>Importações recentes</h2></div></div>
    {!batches.length ? <p className="empty">Nenhuma importação registrada.</p> : <div className="batch-list">{batches.map(batch => <article key={batch.id}>
      <div><strong>{labels[batch.source]}</strong><span>{new Date(batch.imported_at).toLocaleString('pt-BR')}</span></div>
      <p>{batch.filename}</p>
      <small>{batch.row_count} linhas · {batch.inserted} novos · {batch.updated} alterados · {batch.quarantined} em quarentena · {batch.differences} divergências</small>
      <button type="button" aria-expanded={selectedId === batch.id} onClick={() => setSelectedId(selectedId === batch.id ? null : batch.id)}> {selectedId === batch.id ? 'Fechar auditoria' : 'Conferir lote'} </button>
    </article>)}</div>}
    {selected && <div className="import-audit-detail">
      <h3>Revisão de {labels[selected.source]} · {selected.filename}</h3>
      <p className="muted">Linhas em quarentena não entram nos indicadores. Registros ausentes de um arquivo completo continuam preservados até revisão.</p>
      {audit.isPending && <p className="empty">Carregando divergências e quarentena…</p>}
      {audit.isError && <p className="error" role="alert">Não foi possível consultar a auditoria deste lote.</p>}
      {audit.data && <>
        <h4>Linhas em quarentena · {selected.quarantined}</h4>
        {!audit.data.quarantine.length ? <p className="muted">Nenhuma linha em quarentena.</p> : <div className="table-scroll"><table><thead><tr><th>Linha</th><th>Motivo</th><th>Campos originais</th></tr></thead><tbody>{audit.data.quarantine.map(item => <tr key={item.row_number}><td>{item.row_number}</td><td>{item.reason}</td><td><details><summary>Ver campos</summary><dl>{Object.entries(item.fields).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value || '—'}</dd></div>)}</dl></details></td></tr>)}</tbody></table></div>}
        <h4>Divergências de arquivo completo · {selected.differences}</h4>
        {!audit.data.divergences.length ? <p className="muted">Nenhum registro ausente sinalizado.</p> : <div className="table-scroll"><table><thead><tr><th>Chave preservada</th><th>Motivo</th></tr></thead><tbody>{audit.data.divergences.map(item => <tr key={item.natural_key}><td>{item.natural_key}</td><td>{item.reason}</td></tr>)}</tbody></table></div>}
        {(selected.quarantined > audit.data.quarantine.length || selected.differences > audit.data.divergences.length) && <p className="muted">A lista mostra até 1.000 itens por grupo; os totais representam todo o lote.</p>}
      </>}
    </div>}
  </section>
}
