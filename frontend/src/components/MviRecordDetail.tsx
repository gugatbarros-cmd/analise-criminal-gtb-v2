import { useQuery } from '@tanstack/react-query'
import { getMviRecordDetail, type MviSource } from '../services/api'

export function MviRecordDetail({ source, naturalKey, onClose }: {
  source: MviSource; naturalKey: string; onClose: () => void
}) {
  const detail = useQuery({
    queryKey: ['mvi-detail', source, naturalKey],
    queryFn: () => getMviRecordDetail(source, naturalKey),
  })
  return <section className="record-detail" aria-label="Ficha da vítima">
    <div className="section-head"><div><p className="eyebrow">Registro original · {source === 'mvi_cad' ? 'CAD' : 'NEAC'}</p><h3>Ficha da vítima</h3></div><button type="button" onClick={onClose}>Fechar ficha</button></div>
    {detail.isPending && <p className="empty">Carregando ficha…</p>}
    {detail.isError && <p className="error" role="alert">Não foi possível carregar a ficha.</p>}
    {detail.data && <>
      <p className="muted">{detail.data.victim} · {detail.data.occurrence || 'Ocorrência não informada'} · versão {detail.data.version}</p>
      <dl className="record-fields">{Object.entries(detail.data.fields).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{String(value || '—')}</dd></div>)}</dl>
    </>}
  </section>
}
