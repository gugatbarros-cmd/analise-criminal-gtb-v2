import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getBatchAudit, type Batch, type Source } from '../services/api'

const labels: Record<Source, string> = {
  mvi_cad: 'MVI CAD', mvi_neac: 'MVI NEAC', ocorrencias: 'Ocorrências',
  armas: 'Armas', drogas: 'Drogas', guarnicoes: 'Guarnições',
}

export function ImportAudit({ batches, total, page, size, loading, onPageChange }: {
  batches: Batch[]; total: number; page: number; size: number; loading: boolean
  onPageChange: (page: number) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [quarantinePage, setQuarantinePage] = useState(1)
  const [divergencePage, setDivergencePage] = useState(1)
  const changePage = (next: number) => { setSelectedId(null); onPageChange(next) }
  const selected = batches.find(batch => batch.id === selectedId)
  const audit = useQuery({
    queryKey: ['batch-audit', selectedId, quarantinePage, divergencePage],
    queryFn: () => getBatchAudit(selectedId!, quarantinePage, divergencePage),
    enabled: !!selectedId,
  })
  return <section className="panel" aria-label="Auditoria das importações">
    <div className="section-head"><div><p className="eyebrow">Auditoria</p><h2>Importações recentes</h2></div></div>
    {loading ? <p className="empty">Carregando importações…</p> : !total ? <p className="empty">Nenhuma importação registrada.</p> : <div className="batch-list">{batches.map(batch => <article key={batch.id}>
      <div><strong>{labels[batch.source]}</strong><span>{new Date(batch.imported_at).toLocaleString('pt-BR')}</span></div>
      <p>{batch.filename}</p>
      <small>{batch.row_count} linhas · {batch.inserted} novos · {batch.updated} alterados · {batch.quarantined} em quarentena · {batch.differences} divergências</small>
      <button type="button" aria-expanded={selectedId === batch.id} onClick={() => { setSelectedId(selectedId === batch.id ? null : batch.id); setQuarantinePage(1); setDivergencePage(1) }}> {selectedId === batch.id ? 'Fechar auditoria' : 'Conferir lote'} </button>
    </article>)}</div>}
    {!loading && total > 0 && <div className="pagination"><span>{total} lote(s) · página {page}</span><div><button type="button" disabled={page <= 1} onClick={() => changePage(page - 1)}>Anterior</button><button type="button" disabled={page * size >= total} onClick={() => changePage(page + 1)}>Próxima</button></div></div>}
    {selected && <div className="import-audit-detail">
      <h3>Revisão de {labels[selected.source]} · {selected.filename}</h3>
      <p className="muted">Linhas em quarentena não entram nos indicadores. Registros ausentes de um arquivo completo continuam preservados até revisão.</p>
      {audit.isPending && <p className="empty">Carregando divergências e quarentena…</p>}
      {audit.isError && <p className="error" role="alert">Não foi possível consultar a auditoria deste lote.</p>}
      {audit.data && <>
        <h4>Linhas em quarentena · {selected.quarantined}</h4>
        {!audit.data.quarantine.total ? <p className="muted">Nenhuma linha em quarentena.</p> : <><div className="table-scroll"><table><thead><tr><th>Linha</th><th>Motivo</th><th>Campos originais</th></tr></thead><tbody>{audit.data.quarantine.items.map(item => <tr key={item.row_number}><td>{item.row_number}</td><td>{item.reason}</td><td><details><summary>Ver campos</summary><dl>{Object.entries(item.fields).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value || '—'}</dd></div>)}</dl></details></td></tr>)}</tbody></table></div><div className="pagination"><span>{audit.data.quarantine.total} linha(s) · página {quarantinePage}</span><div><button type="button" disabled={quarantinePage <= 1} onClick={() => setQuarantinePage(page => page - 1)}>Anterior</button><button type="button" disabled={quarantinePage * audit.data.quarantine.size >= audit.data.quarantine.total} onClick={() => setQuarantinePage(page => page + 1)}>Próxima</button></div></div></>}
        <h4>Divergências de arquivo completo · {selected.differences}</h4>
        {!audit.data.divergences.total ? <p className="muted">Nenhum registro ausente sinalizado.</p> : <><div className="table-scroll"><table><thead><tr><th>Chave preservada</th><th>Motivo</th></tr></thead><tbody>{audit.data.divergences.items.map(item => <tr key={item.natural_key}><td>{item.natural_key}</td><td>{item.reason}</td></tr>)}</tbody></table></div><div className="pagination"><span>{audit.data.divergences.total} registro(s) · página {divergencePage}</span><div><button type="button" disabled={divergencePage <= 1} onClick={() => setDivergencePage(page => page - 1)}>Anterior</button><button type="button" disabled={divergencePage * audit.data.divergences.size >= audit.data.divergences.total} onClick={() => setDivergencePage(page => page + 1)}>Próxima</button></div></div></>}
      </>}
    </div>}
  </section>
}
