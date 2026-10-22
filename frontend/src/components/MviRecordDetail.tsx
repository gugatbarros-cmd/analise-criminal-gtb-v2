import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getMviRecordDetail, getMviRecordVersions, type MviSource } from '../services/api'

export function MviRecordDetail({ source, naturalKey, onClose }: {
  source: MviSource; naturalKey: string; onClose: () => void
}) {
  const [version, setVersion] = useState<number | null>(null)
  const versions = useQuery({
    queryKey: ['mvi-versions', source, naturalKey],
    queryFn: () => getMviRecordVersions(source, naturalKey),
  })
  const detail = useQuery({
    queryKey: ['mvi-detail', source, naturalKey, version],
    queryFn: () => getMviRecordDetail(source, naturalKey, version ?? undefined),
  })
  return <section className="record-detail" aria-label="Ficha da vítima">
    <div className="section-head"><div><p className="eyebrow">Registro original · {source === 'mvi_cad' ? 'CAD' : 'NEAC'}</p><h3>Ficha da vítima</h3></div><button type="button" onClick={onClose}>Fechar ficha</button></div>
    {versions.isPending && <p className="muted">Carregando histórico de versões…</p>}
    {versions.isError && <p className="error" role="alert">Não foi possível carregar o histórico de versões.</p>}
    {!!versions.data?.length && <label className="version-select">Versão do caso <select value={version ?? 'current'} onChange={event => setVersion(event.target.value === 'current' ? null : Number(event.target.value))}>
      <option value="current">Atual · versão {versions.data.find(item => item.is_current)?.version}</option>
      {versions.data.filter(item => !item.is_current).map(item => <option key={item.version} value={item.version}>Anterior · versão {item.version}</option>)}
    </select></label>}
    {detail.isPending && <p className="empty">Carregando ficha…</p>}
    {detail.isError && <p className="error" role="alert">Não foi possível carregar a ficha.</p>}
    {detail.data && <>
      <p className="muted">{detail.data.victim} · {detail.data.occurrence || 'Ocorrência não informada'} · versão {detail.data.version} · {detail.data.is_current ? 'atual' : 'histórica'}</p>
      {!detail.data.is_current && <p className="muted">Esta versão foi substituída e não participa da contagem atual.</p>}
      <dl className="record-fields">{Object.entries(detail.data.fields).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{String(value || '—')}</dd></div>)}</dl>
    </>}
  </section>
}
