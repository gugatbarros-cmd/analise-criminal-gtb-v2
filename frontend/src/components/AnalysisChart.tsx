import { useContext, useEffect, useId, useRef, useState } from 'react'
import { IndicatorChartTargetContext, IndicatorNavigationContext } from './IndicatorNavigation'

export type ChartItem = { name: string; total: number }
const palette = ['#123c7c', '#c1121f', '#315f9c', '#e85d75', '#6f8fc5', '#a47530']

type Props = { title: string; items: ChartItem[]; kind?: 'bar' | 'line' | 'doughnut' }

export function AnalysisChart(props: Props) {
  const target = useContext(IndicatorChartTargetContext)
  const navigate = useContext(IndicatorNavigationContext)
  const chart = <ChartDrawing {...props} />
  return target && props.items.length ? <button type="button" className="indicator-chart-link"
    data-chart-target={target} aria-label={`Ver indicador: ${props.title}`}
    onClick={() => navigate(target)}>{chart}<span className="chart-open">Ver indicador →</span></button> : chart
}

function ChartDrawing({ title, items, kind = 'bar' }: Props) {
  const id = useId()
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(700)
  useEffect(() => {
    if (kind !== 'line' || !container.current) return
    const element = container.current
    const measure = () => {
      const measured = element.isConnected ? element.getBoundingClientRect().width : 0
      if (measured > 0) setWidth(Math.round(measured))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [kind, items.length])
  const valid = items.filter(item => Number.isFinite(item.total) && item.total >= 0)
  const maximum = Math.max(1, ...valid.map(item => item.total))
  const total = valid.reduce((sum, item) => sum + item.total, 0)
  if (!valid.length) return <p className="empty">Sem dados neste recorte.</p>
  const formatted = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  if (kind === 'doughnut') {
    let offset = 0
    return <div className="legacy-doughnut"><svg viewBox="0 0 220 220" role="img" aria-labelledby={id}>
      <title id={id}>{`${title}: ${formatted(total)} no total`}</title>
      <circle cx="110" cy="110" r="75" fill="none" stroke="#dce3ed" strokeWidth="30" />
      {valid.map((item, index) => {
        const length = total ? item.total / total * 100 : 0
        const start = offset; offset += length
        return <circle key={item.name} cx="110" cy="110" r="75" pathLength="100" fill="none"
          stroke={palette[index % palette.length]} strokeWidth="30" strokeDasharray={`${length} ${100 - length}`}
          strokeDashoffset={-start} transform="rotate(-90 110 110)"><title>{`${item.name}: ${formatted(item.total)}`}</title></circle>
      })}
      <text x="110" y="110" textAnchor="middle" dominantBaseline="middle" className="legacy-chart-total">{formatted(total)}</text>
    </svg><ul>{valid.map((item, index) => <li key={item.name}><i style={{ background: palette[index % palette.length] }} />{item.name} <strong>{formatted(item.total)}</strong></li>)}</ul></div>
  }
  if (kind === 'line') {
    const x = (index: number) => 55 + index * (width - 77) / Math.max(1, valid.length - 1)
    const y = (value: number) => 200 - value / maximum * 155
    const labels = Math.max(2, Math.floor((width - 55) / 70))
    const showLabel = (index: number) => index % Math.ceil(valid.length / labels) === 0 || index === valid.length - 1
    return <div ref={container} className="series-chart-container"><svg viewBox={`0 0 ${width} 255`} role="img" aria-labelledby={id} className="legacy-series-chart">
      <title id={id}>{`${title}; ${valid.map(item => `${item.name}: ${formatted(item.total)}`).join('; ')}`}</title>
      {[0, .25, .5, .75, 1].map(fraction => <g key={fraction}><line x1="55" x2={width - 22} y1={y(maximum * fraction)} y2={y(maximum * fraction)} stroke="currentColor" opacity=".14" /><text x="45" y={y(maximum * fraction) + 4} textAnchor="end">{formatted(maximum * fraction)}</text></g>)}
      <polyline points={valid.map((item, index) => `${x(index)},${y(item.total)}`).join(' ')} fill="none" stroke="#315f9c" strokeWidth="3" />
      {valid.map((item, index) => <g key={item.name}><circle cx={x(index)} cy={y(item.total)} r="5" fill="#c1121f"><title>{`${item.name}: ${formatted(item.total)}`}</title></circle>{showLabel(index) && <><text x={x(index)} y={y(item.total) - 12} textAnchor="middle">{formatted(item.total)}</text><text x={x(index)} y="225" textAnchor="end" transform={`rotate(-25 ${x(index)} 225)`}>{item.name}</text></>}</g>)}
    </svg></div>
  }
  return <div className="legacy-bar-chart" role="img" aria-label={title}>{valid.map((item, index) => <div className="legacy-bar-row" key={item.name}><span>{item.name}</span><div><i style={{ width: `${item.total / maximum * 100}%`, background: palette[index % palette.length] }} /><strong>{formatted(item.total)}</strong></div></div>)}</div>
}
