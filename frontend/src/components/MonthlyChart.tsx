import { useContext, useEffect, useRef } from 'react'
import { IndicatorNavigationContext } from './IndicatorNavigation'
import { init, use, type ECharts } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { Summary } from '../services/api'

use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

export function MonthlyChart({ monthly }: { monthly: Summary['monthly'] }) {
  const element = useRef<HTMLDivElement>(null)
  const navigate = useContext(IndicatorNavigationContext)
  const hasData = Object.keys(monthly).length > 0
  useEffect(() => {
    if (!element.current || !hasData) return
    const chart: ECharts = init(element.current, undefined, { renderer: 'canvas' })
      const months = Object.keys(monthly).sort()
      chart.setOption({
        backgroundColor: 'transparent', color: ['#123c7c', '#c1121f'],
        tooltip: { trigger: 'axis', confine: true },
        legend: { type: 'scroll', data: ['MVI CAD', 'MVI NEAC'], textStyle: { color: '#315a83' } },
        grid: { left: 12, right: 12, top: 45, bottom: 16, containLabel: true },
        xAxis: { type: 'category', data: months, axisLabel: { color: '#b9cbd5' }, axisLine: { lineStyle: { color: '#37505c' } } },
        yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#b9cbd5' }, splitLine: { lineStyle: { color: '#253e49' } } },
        series: [
          { name: 'MVI CAD', type: 'bar', data: months.map(month => monthly[month].mvi_cad || 0) },
          { name: 'MVI NEAC', type: 'bar', data: months.map(month => monthly[month].mvi_neac || 0) },
        ],
      })
    chart.on('click', (event) => {
      if (event.seriesName === 'MVI CAD') navigate('mvi-cad')
      if (event.seriesName === 'MVI NEAC') navigate('mvi-neac')
    })
    chart.on('legendselectchanged', (event) => {
      if (!event || typeof event !== 'object' || !('name' in event)) return
      chart.setOption({ legend: { selected: { 'MVI CAD': true, 'MVI NEAC': true } } })
      if (event.name === 'MVI CAD') navigate('mvi-cad')
      if (event.name === 'MVI NEAC') navigate('mvi-neac')
    })
    const resize = () => chart.resize()
    const observer = new ResizeObserver(resize)
    observer.observe(element.current)
    window.addEventListener('resize', resize)
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); chart.dispose() }
  }, [monthly, hasData, navigate])
  if (!hasData) return <p className="empty">Importe uma base para ver a série mensal.</p>
  return <><div ref={element} className="chart" role="img" aria-label="Série mensal separada de MVI CAD e MVI NEAC; clique nas barras para abrir a fonte" />
    <div className="chart-source-links"><button type="button" data-chart-target="mvi-cad" onClick={() => navigate('mvi-cad')}>Ver indicador MVI CAD →</button><button type="button" data-chart-target="mvi-neac" onClick={() => navigate('mvi-neac')}>Ver indicador MVI NEAC →</button></div></>
}
