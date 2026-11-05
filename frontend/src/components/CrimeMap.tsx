import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getComparisonDataset } from '../services/api'
import { mapFacts, mapLayers, mapSignal, mapTotals, municipalityPoints, type MapLayerId } from '../services/crime-map-model'
import '../crime-map.css'

type Leaflet = any
let leafletReady: Promise<Leaflet> | undefined
function loadScript(url: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url; script.onload = () => resolve(); script.onerror = () => reject(new Error('Mapa indisponível'))
    document.head.appendChild(script)
  })
}
function leaflet(): Promise<Leaflet> {
  if (leafletReady) return leafletReady
  const base = `${import.meta.env.BASE_URL}assets/reports/leaflet/`
  const css = document.createElement('link')
  css.rel = 'stylesheet'; css.href = `${base}leaflet.min.css`; document.head.appendChild(css)
  leafletReady = loadScript(`${base}leaflet.min.js`).then(() => loadScript(`${base}leaflet-heat.min.js`)).then(() => (window as unknown as { L: Leaflet }).L)
  return leafletReady
}

const dateText = (day: string) => day ? day.split('-').reverse().join('/') : '—'
const allLayers = mapLayers.map(item => item.id)

export function CrimeMap({ year, municipality, cutoff }: { year: number; municipality?: string; cutoff?: string | null }) {
  const [visible, setVisible] = useState(false)
  const [city, setCity] = useState(municipality || '')
  const [start, setStart] = useState(`${year}-01-01`)
  const [end, setEnd] = useState(cutoff || `${year}-12-31`)
  const [layers, setLayers] = useState<MapLayerId[]>(allLayers)
  const [nature, setNature] = useState('')
  const [heat, setHeat] = useState(false)
  const [mapError, setMapError] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const section = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const map = useRef<any>(null)
  const overlay = useRef<any>(null)
  const lib = useRef<Leaflet>(null)
  const query = useQuery({ queryKey: ['comparison-dataset'], queryFn: getComparisonDataset, enabled: visible, staleTime: 60000 })

  useEffect(() => {
    const element = section.current
    if (!element) return
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) setVisible(true) }, { rootMargin: '350px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { setStart(`${year}-01-01`); setEnd(cutoff || `${year}-12-31`) }, [year, cutoff])
  useEffect(() => setCity(municipality || ''), [municipality])
  useEffect(() => {
    if (!visible || !canvas.current || map.current) return
    let cancelled = false
    let resize: ResizeObserver | undefined
    leaflet().then(L => {
      if (cancelled || !canvas.current) return
      lib.current = L
      map.current = L.map(canvas.current, { zoomControl: true, scrollWheelZoom: false, preferCanvas: true }).fitBounds(Object.values(municipalityPoints), { padding: [24, 24], maxZoom: 11 })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 17, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map.current)
      map.current.invalidateSize()
      resize = new ResizeObserver(() => map.current?.invalidateSize())
      resize.observe(canvas.current)
      setMapReady(true)
    }).catch(() => setMapError(true))
    return () => { cancelled = true; resize?.disconnect(); map.current?.remove(); map.current = null }
  }, [visible])
  useEffect(() => {
    if (!mapReady || !map.current) return
    if (city && municipalityPoints[city]) map.current.flyTo(municipalityPoints[city], 12, { animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches, duration: .55 })
    else map.current.fitBounds(Object.values(municipalityPoints), { padding: [24, 24], maxZoom: 11, animate: false })
  }, [city, mapReady])

  const facts = useMemo(() => mapFacts(query.data?.rows || []), [query.data])
  const choices = useMemo(() => [...new Set(facts.filter(item => layers.includes(item.layer) && (!city || item.city === city)).map(item => item.nature).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [facts, layers, city])
  const filtered = useMemo(() => facts.filter(item => layers.includes(item.layer) && (!city || item.city === city)
    && item.date >= start && item.date <= end && (!nature || item.nature === nature)), [facts, layers, city, start, end, nature])
  const totals = useMemo(() => mapTotals(filtered), [filtered])
  const selectedHistory = useMemo(() => facts.filter(item => layers.includes(item.layer) && (!city || item.city === city) && (!nature || item.nature === nature)), [facts, layers, city, nature])
  const signalEnd = cutoff && end > cutoff ? cutoff : end
  const signal = useMemo(() => /^\d{4}-\d{2}-\d{2}$/.test(signalEnd) ? mapSignal(selectedHistory, signalEnd) : null, [selectedHistory, signalEnd])
  const total = filtered.reduce((sum, item) => sum + item.count, 0)
  const mvi = filtered.filter(item => item.layer === 'mvi').reduce((sum, item) => sum + item.count, 0)

  useEffect(() => {
    const L = lib.current, current = map.current
    if (!L || !current) return
    overlay.current?.remove()
    const group = L.layerGroup()
    if (heat && totals.length && L.heatLayer) {
      const maximum = Math.max(...totals.map(item => item.total))
      L.heatLayer(totals.map(item => [...municipalityPoints[item.city], item.total / maximum]), {
        radius: 48, blur: 30, maxZoom: 12, minOpacity: .34,
        gradient: { .2: '#51b9d1', .48: '#f2ce64', .75: '#f38a52', 1: '#d84657' },
      }).addTo(group)
    }
    for (const item of totals) {
      const entries = mapLayers.filter(layer => item.byLayer[layer.id]).map(layer => `${layer.label}: ${item.byLayer[layer.id]}`).join('<br>')
      L.circleMarker(municipalityPoints[item.city], {
        radius: heat ? 7 : Math.min(30, 9 + Math.sqrt(item.total) * 3), color: '#fff', weight: 2,
        fillColor: heat ? '#123854' : item.byLayer.mvi ? '#d84657' : '#287fb5', fillOpacity: heat ? .9 : .78,
        className: 'crime-map-marker',
      }).bindPopup(`<strong>${item.city}</strong><br>${item.total} registro(s)<br>${entries}<small>Centro do município; posição aproximada.</small>`)
        .on('click', () => setCity(item.city)).addTo(group)
    }
    group.addTo(current)
    overlay.current = group
  }, [totals, heat, mapReady])

  const toggle = (id: MapLayerId) => { setLayers(value => value.includes(id) ? value.filter(item => item !== id) : [...value, id]); setNature('') }
  const reset = () => { setCity(municipality || ''); setStart(`${year}-01-01`); setEnd(cutoff || `${year}-12-31`); setLayers(allLayers); setNature(''); setHeat(false) }

  return <section ref={section} className="crime-map" aria-label="Mapa criminal MVI NEAC e ocorrências">
    <div className="crime-map-heading"><div><p className="eyebrow">Inteligência territorial · 10º BPM</p><h2>Mapa criminal</h2><p>MVI NEAC, crimes e tendências em uma única leitura territorial.</p></div><div className="crime-map-live"><span /> BASE PROCESSADA · {dateText(cutoff || end)}</div></div>
    <div className="crime-map-filters" aria-label="Filtros do mapa">
      <label>Município<select value={city} onChange={event => setCity(event.target.value)}><option value="">Todos os municípios</option>{Object.keys(municipalityPoints).map(name => <option key={name}>{name}</option>)}</select></label>
      <label>De<input type="date" value={start} onChange={event => setStart(event.target.value)} /></label>
      <label>Até<input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label>
      <label>Natureza<select value={nature} onChange={event => setNature(event.target.value)}><option value="">Todas as naturezas</option>{choices.map(value => <option key={value}>{value}</option>)}</select></label>
      <button type="button" onClick={reset}>Restaurar recorte</button>
    </div>
    <div className="crime-map-layerbar" aria-label="Camadas do mapa">{mapLayers.map(layer => <button type="button" key={layer.id} aria-pressed={layers.includes(layer.id)} onClick={() => toggle(layer.id)} style={{ '--layer-color': layer.color } as CSSProperties}><span />{layer.label}</button>)}<button type="button" className="heat-toggle" aria-pressed={heat} onClick={() => setHeat(value => !value)}>✦ Mapa de calor</button></div>
    <div className="crime-map-body"><div className="crime-map-stage"><div ref={canvas} className="crime-map-canvas" role="img" aria-label="Mapa de registros agregados por município" />{!visible && <div className="crime-map-loading">Preparando mapa…</div>}{query.isPending && visible && <div className="crime-map-loading">Carregando indicadores…</div>}{mapError && <div className="crime-map-loading">Não foi possível abrir o mapa base. Confira a conexão.</div>}<div className="crime-map-mapnote">● Cada círculo representa o centro do município, não o endereço do crime.</div></div>
      <aside className="crime-map-insights"><div className="crime-map-kpis"><article><span>REGISTROS VISÍVEIS</span><strong>{total.toLocaleString('pt-BR')}</strong><small>{dateText(start)} a {dateText(end)}</small></article><article><span>MVI NEAC</span><strong>{mvi.toLocaleString('pt-BR')}</strong><small>Fonte separada das ocorrências</small></article><article><span>MUNICÍPIOS</span><strong>{totals.length}</strong><small>com registros no recorte</small></article></div>
        <div className="crime-map-signal"><span>LEITURA DE TENDÊNCIA</span><strong>{signal?.trend || 'Sem dados'}</strong><p>{signal?.estimate !== null && signal?.estimate !== undefined ? `≈ ${signal.estimate} registros nos 30 dias após ${dateText(signalEnd)}, se o ritmo recente persistir.` : 'Histórico insuficiente para projetar os 30 dias após o recorte.'}</p><small>Últimos 90 dias: {signal?.recent ?? 0} · 90 dias anteriores: {signal?.previous ?? 0}. Estimativa exploratória, não previsão de casos individuais.</small></div>
        <div className="crime-map-ranking"><div><span>CONCENTRAÇÃO POR MUNICÍPIO</span><strong>{city || 'Região inteira'}</strong></div>{totals.length ? totals.slice(0, 7).map(item => <button type="button" key={item.city} onClick={() => setCity(item.city)}><span>{item.city}</span><div><i style={{ width: `${item.total / totals[0].total * 100}%` }} /></div><b>{item.total}</b></button>) : <p>Sem registros nesse recorte.</p>}</div>
      </aside></div>
    {query.isError && <p className="error" role="alert">Não foi possível carregar os dados do mapa.</p>}
    <p className="crime-map-footnote">O calor indica concentração municipal dos registros filtrados. Não identifica pontos exatos, pessoas ou risco individual. Compare apenas períodos e fontes com cobertura equivalente.</p>
  </section>
}
