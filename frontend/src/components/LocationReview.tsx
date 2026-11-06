import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMapLocationReviews, saveMapLocationReview, type MapLocationReviewCase } from '../services/api'

const sourceName = { mvi_cad: 'MVI CAD', mvi_neac: 'MVI NEAC', ocorrencias: 'Ocorrências' }

function LocationCase({ item, onSave, busy }: { item: MapLocationReviewCase; onSave: (item: MapLocationReviewCase, latitude: number | null, longitude: number | null) => void; busy: boolean }) {
  const [latitude, setLatitude] = useState(item.latitude === null ? '' : String(item.latitude))
  const [longitude, setLongitude] = useState(item.longitude === null ? '' : String(item.longitude))
  const [error, setError] = useState('')
  const submit = () => {
    const lat = Number(latitude.replace(',', '.'))
    const lon = Number(longitude.replace(',', '.'))
    if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      setError('Informe latitude e longitude válidas.'); return
    }
    setError('')
    onSave(item, lat, lon)
  }
  return <article className="location-review-case"><div><strong>{item.street} · {item.municipality}</strong><small>{sourceName[item.source]} · {item.event_date} · ocorrência {item.occurrence || 'sem número'} · {item.nature}</small></div>
    {item.reviewer && <small>Local conferido por {item.reviewer} em {item.reviewed_at}</small>}
    <div className="location-review-inputs"><label>Latitude<input type="text" inputMode="decimal" value={latitude} placeholder="-9,40570" onChange={event => setLatitude(event.target.value)} /></label><label>Longitude<input type="text" inputMode="decimal" value={longitude} placeholder="-36,63280" onChange={event => setLongitude(event.target.value)} /></label>
      <button type="button" disabled={busy} onClick={submit}>Confirmar ponto</button>
      {item.latitude !== null && <button type="button" disabled={busy} onClick={() => onSave(item, null, null)}>Remover ponto</button>}
    </div>{error && <p role="alert">{error}</p>}
  </article>
}

export function LocationReview() {
  const [status, setStatus] = useState('pending')
  const [page, setPage] = useState(1)
  const client = useQueryClient()
  const cases = useQuery({ queryKey: ['map-location-reviews', status, page], queryFn: () => getMapLocationReviews(page, status) })
  const mutation = useMutation({ mutationFn: ({ item, latitude, longitude }: { item: MapLocationReviewCase; latitude: number | null; longitude: number | null }) => saveMapLocationReview(item, latitude, longitude),
    onSuccess: () => { void client.invalidateQueries() } })
  return <section className="panel location-review-panel" aria-labelledby="location-review-title"><div className="section-head"><div><p className="eyebrow">Mapa · conferência local</p><h2 id="location-review-title">Revisar endereços sem coordenadas</h2></div><span>{cases.data?.total ?? '—'} caso(s)</span></div>
    <p className="muted">Confira o endereço na base e informe as coordenadas do local do fato. O sistema valida a proximidade com o município e guarda a decisão neste computador. Nenhum endereço é enviado a um serviço de busca.</p>
    <label>Exibir <select value={status} onChange={event => { setStatus(event.target.value); setPage(1) }}><option value="pending">Pendentes</option><option value="reviewed">Conferidos</option><option value="all">Todos</option></select></label>
    {cases.isPending && <p role="status">Carregando endereços…</p>}{cases.isError && <p role="alert">Não foi possível carregar a revisão de endereços.</p>}{mutation.isError && <p role="alert">{mutation.error.message}</p>}
    {cases.data?.items.map(item => <LocationCase key={`${item.source}:${item.natural_key}`} item={item} busy={mutation.isPending} onSave={(selected, latitude, longitude) => mutation.mutate({ item: selected, latitude, longitude })} />)}
    {cases.data && !cases.data.total && <p className="muted">Nenhum endereço nesta lista.</p>}
    <div className="pager"><button type="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page}</span><button type="button" disabled={!cases.data || page * cases.data.size >= cases.data.total} onClick={() => setPage(value => value + 1)}>Próxima</button></div>
  </section>
}
