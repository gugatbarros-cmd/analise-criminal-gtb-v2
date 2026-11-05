import { useId, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getComparisonDataset } from '../services/api'
import { comparisonCsv, comparisonLabels, comparisonSource, indicatorFacts, monthRange, previousYearDay, rangeDays, rangeTotal, sourceFacts, validRange, variation, yearRange, type ComparisonMetric, type ComparisonValue } from '../services/comparison-model'
import { AnalysisChart } from './AnalysisChart'
import type { Source } from '../services/api'

const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const format = (value: number | null) => value === null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 6 })
const signed = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${format(value)}`
const percent = (base: number | null, compared: number | null) => {
  const delta = variation(base, compared)
  return delta.percent === null ? base === 0 && compared !== null ? 'Sem base percentual (0)' : '—' : `${signed(Number(delta.percent.toFixed(2)))}%`
}
const dateLabel = (day: string) => day.split('-').reverse().join('/')
const colors = ['#315f9c', '#c1121f']
type Props = { id: string; year?: number; municipality?: string; lastImportedAt?: Partial<Record<Source, string | null>> }

export function IndicatorComparisons(props: Props) {
  // Trocar fonte ou ano do painel reinicia os seletores sem carregar estado de outra fonte.
  return <Comparisons key={`${props.id}:${props.year || ''}:${props.municipality || ''}`} {...props} />
}
function Comparisons({ id, year, municipality, lastImportedAt }: Props) {
  const uid = useId()
  const query = useQuery({ queryKey: ['comparison-dataset'], queryFn: getComparisonDataset, staleTime: 60000 })
  const source = useMemo(() => sourceFacts(query.data?.rows || [], id, municipality), [query.data, id, municipality])
  const availableYears = [...new Set(source.map(row => Number(row.date.slice(0, 4))))].sort((a, b) => b - a)
  const referenceYear = year || availableYears[0] || new Date().getFullYear()
  const [baseYear, setBaseYear] = useState<number | null>(null)
  const [targetYear, setTargetYear] = useState<number | null>(null)
  const aYear = baseYear ?? referenceYear - 1, bYear = targetYear ?? referenceYear
  const [mode, setMode] = useState<'years' | 'periods' | 'months'>('periods')
  const [category, setCategory] = useState('')
  const [teamGroup, setTeamGroup] = useState('roster')
  const [metric, setMetric] = useState<ComparisonMetric>(id === 'armas' ? 'units' : 'records')
  const [custom, setCustom] = useState<string[] | null>(null)
  const latest = source.filter(row => row.date.startsWith(`${bYear}-`)).map(row => row.date).sort().at(-1)
  const importDay = lastImportedAt?.[comparisonSource(id)]?.slice(0, 10)
  const end = importDay?.startsWith(`${bYear}-`) ? importDay : latest || `${bYear}-12-31`
  const dates = custom || [`${aYear}-01-01`, previousYearDay(`${aYear + 1}${end.slice(4)}`), `${bYear}-01-01`, end]
  const setDate = (index: number, value: string) => setCustom(dates.map((day, i) => i === index ? value : day))
  const selected = useMemo(() => indicatorFacts(source, id, category, teamGroup), [source, id, category, teamGroup])
  const categories = [...new Set(indicatorFacts(source, id, '', teamGroup).map(row => row.category))].filter(Boolean).sort()
  const unit = metric === 'kg' ? 'kg reconhecidos' : metric === 'units' ? 'armas apreendidas · unidades' : metric === 'points' ? 'pontos' : id.startsWith('mvi-') ? 'vítimas' : id === 'guarnicoes' ? 'vínculos de atendimento' : 'registros'
  const ranges = mode === 'periods' ? [{ start: dates[0], end: dates[1] }, { start: dates[2], end: dates[3] }] : [yearRange(aYear), yearRange(bYear)]
  const invalid = ranges.some(range => !validRange(range)) || aYear < 1900 || aYear > 2100 || bYear < 1900 || bYear > 2100
  const totals = ranges.map(range => rangeTotal(source, selected, range, metric))
  const monthly = months.map((name, index) => ({ name, values: [aYear, bYear].map(value => rangeTotal(source, selected, monthRange(value, index + 1), metric)), previous: [aYear, bYear].map(value => rangeTotal(source, selected, monthRange(index === 0 ? value - 1 : value, index === 0 ? 12 : index), metric)) }))
  const labels = mode === 'periods' ? ranges.map((range, index) => `${index ? 'B' : 'A'} · ${dateLabel(range.start)} a ${dateLabel(range.end)}`) : [String(aYear), String(bYear)]
  const rows = mode === 'months' ? monthly.map(row => ({ label: row.name, values: row.values, previous: row.previous })) : [{ label: mode === 'periods' ? 'Períodos' : 'Anos', values: totals, previous: undefined }]
  const exportCsv = () => {
    const csv = comparisonCsv(['Indicador', 'Município', 'Medida', 'Tipo', 'Recorte', labels[0], labels[1], 'Diferença B − A', 'Variação %', ...(mode === 'months' ? [`${aYear} diferença mês anterior`, `${aYear} % mês anterior`, `${bYear} diferença mês anterior`, `${bYear} % mês anterior`] : [])], rows.map(row => [comparisonLabels[id], municipality || '10º BPM', unit, category || 'Todos', row.label, format(row.values[0].value), format(row.values[1].value), signed(variation(row.values[0].value, row.values[1].value).difference), percent(row.values[0].value, row.values[1].value), ...(row.previous ? row.values.flatMap((value, index) => [signed(variation(row.previous![index].value, value.value).difference), percent(row.previous![index].value, value.value)]) : [])]))
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `comparativo-${id}-${mode}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="panel indicator-comparisons" aria-label={`Comparativos de ${comparisonLabels[id]}`} data-comparison-indicator={id}>
    <div className="section-head"><div><p className="eyebrow">Evolução e comparação temporal</p><h2>{comparisonLabels[id]} · comparativos</h2></div><span>{municipality || '11 municípios do 10º BPM'}</span></div>
    <p className="muted">Seletores próprios para comparar todos os anos importados. O município segue o filtro do painel; os filtros das análises acima são independentes deste quadro.</p>
    {query.isPending && <p role="status">Carregando comparativos…</p>}
    {query.isError && <p className="error" role="alert">{query.error.message}<button type="button" onClick={() => void query.refetch()}>Tentar novamente</button></p>}
    {query.data && <>
      <div className="tabs" role="group" aria-label="Comparar por">{([['years', 'Entre anos'], ['periods', 'Entre períodos'], ['months', 'Meses de cada ano']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}</div>
      <div className="filters">
        <label>Ano A · referência<input type="number" min="1900" max="2100" list={uid} value={aYear} onChange={event => { setBaseYear(Number(event.target.value)); setCustom(null) }} /></label>
        <label>Ano B · comparação<input type="number" min="1900" max="2100" list={uid} value={bYear} onChange={event => { setTargetYear(Number(event.target.value)); setCustom(null) }} /></label>
        <datalist id={uid}>{availableYears.map(value => <option key={value} value={value} />)}</datalist>
        <label>Tipo / classificação<select value={category} onChange={event => setCategory(event.target.value)}><option value="">Todos</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
        {id === 'drogas' && <label>Medida<select value={metric} onChange={event => setMetric(event.target.value as ComparisonMetric)}><option value="records">Registros</option><option value="kg">Peso reconhecido · kg</option></select></label>}
        {id === 'guarnicoes' && <><label>Grupo<select value={teamGroup} onChange={event => { setTeamGroup(event.target.value); setCategory('') }}><option value="roster">Escala</option><option value="extra">Força-tarefa</option><option value="unlisted">Fora da escala</option></select></label><label>Medida<select value={metric} onChange={event => setMetric(event.target.value as ComparisonMetric)}><option value="records">Vínculos de atendimento</option><option value="points">Pontos ponderados</option></select></label></>}
      </div>
      <p className="muted">Anos com registros da fonte: {availableYears.join(', ') || 'nenhum'}. Medida: {unit}.</p>
      {mode === 'periods' && <><div className="filters">{['A · início', 'A · fim', 'B · início', 'B · fim'].map((label, index) => <label key={label}>{label}<input type="date" value={dates[index]} onChange={event => setDate(index, event.target.value)} /></label>)}<button type="button" onClick={() => { setBaseYear(bYear - 1); setCustom([previousYearDay(`${bYear}-01-01`), previousYearDay(end), `${bYear}-01-01`, end]) }}>Mesmo período do ano anterior</button></div><p className="muted">A: {rangeDays(ranges[0])} dias · B: {rangeDays(ranges[1])} dias. {rangeDays(ranges[0]) !== rangeDays(ranges[1]) ? 'Os intervalos têm durações diferentes; os totais não são ajustados por dia.' : 'Intervalos com a mesma duração.'} Corte sugerido: última data registrada da fonte no ano B ({dateLabel(end)}).</p></>}
      {invalid ? <p className="error" role="alert">Informe anos de 1900 a 2100 e intervalos válidos, com início anterior ou igual ao fim.</p> : <>
        {mode === 'months' ? <MonthlyComparison years={[aYear, bYear]} rows={monthly} unit={unit} /> : <AnalysisChart title={`Comparativo de ${comparisonLabels[id]} · ${unit}`} items={totals.flatMap((value, index) => value.value === null ? [] : [{ name: labels[index], total: value.value }])} />}
        <div className="table-scroll"><table><caption>{mode === 'months' ? 'Comparação mês a mês' : 'Totais e variação'} · {unit} · B em relação a A</caption><thead><tr><th>Recorte</th><th>{labels[0]}</th><th>{labels[1]}</th><th>Diferença B − A</th><th>Variação</th>{mode === 'months' && <><th>{aYear} · mês anterior</th><th>{bYear} · mês anterior</th></>}</tr></thead><tbody>{rows.map(row => <ComparisonRow key={row.label} label={row.label} values={row.values} previous={row.previous} />)}</tbody>{mode === 'months' && <tfoot><ComparisonRow label="Total anual importado" values={totals} previous={[]} /></tfoot>}</table></div>
        {mode === 'months' && <p className="muted">As duas últimas colunas comparam cada mês com o mês anterior dentro da série de cada ano, em quantidade e percentual. Janeiro usa dezembro do ano anterior, quando importado.</p>}
        {metric === 'kg' && <p className="muted">Peso calculado apenas com unidades reconhecidas. Cobertura dos totais anuais/períodos: A {totals[0].weighted}/{totals[0].records} registros com peso · B {totals[1].weighted}/{totals[1].records}. Registros sem unidade reconhecida não viram peso zero.</p>}
        <button type="button" onClick={exportCsv}>Baixar comparativo CSV</button>
      </>}
      <p className="muted">“—” indica ausência de registros da fonte no intervalo ou peso não reconhecido; 0 indica fonte presente, sem registros do indicador/filtro. As importações podem estar incompletas: os totais mostram somente dados importados, sem garantir fechamento do mês ou ano. Variações percentuais não são calculadas sobre referência zero.</p>
    </>}
  </section>
}
function ComparisonRow({ label, values, previous }: { label: string; values: ComparisonValue[]; previous?: ComparisonValue[] }) {
  const [a, b] = values.map(item => item.value)
  return <tr><th scope="row">{label}</th><td>{format(a)}</td><td>{format(b)}</td><td>{signed(variation(a, b).difference)}</td><td>{percent(a, b)}</td>{previous && values.map((value, index) => <td key={index}>{previous[index] ? `${signed(variation(previous[index].value, value.value).difference)} · ${percent(previous[index].value, value.value)}` : '—'}</td>)}</tr>
}
function MonthlyComparison({ years, rows, unit }: { years: number[]; rows: { name: string; values: ComparisonValue[] }[]; unit: string }) {
  const maximum = Math.max(1, ...rows.flatMap(row => row.values.map(item => item.value || 0)))
  return <div className="comparison-monthly"><div className="comparison-legend">{years.map((year, index) => <span key={index}><i style={{ background: colors[index] }} />{year}</span>)}</div><div className="comparison-month-grid" role="img" aria-label={`Meses de ${years.join(' e ')} · ${unit}. Valores completos na tabela abaixo.`}>{rows.map(row => <div className="comparison-month" key={row.name}><strong>{row.name}</strong>{row.values.map((value, index) => <div key={index} className="comparison-month-bar" title={`${years[index]} · ${row.name}: ${format(value.value)} ${unit}`}><i style={{ width: `${(value.value || 0) / maximum * 100}%`, background: colors[index] }} /><span>{years[index]}: {format(value.value)}</span></div>)}</div>)}</div></div>
}
