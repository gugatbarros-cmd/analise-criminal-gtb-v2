import { useEffect, useRef } from 'react'
import { init, use, type ECharts } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { Summary } from '../services/api'

use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

export function MonthlyChart({ monthly }: { monthly: Summary['monthly'] }) {
  const element = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!element.current) return
    const chart: ECharts = init(element.current, undefined, { renderer: 'canvas' })
      const months = Object.keys(monthly).sort()
      chart.setOption({
        backgroundColor: 'transparent', color: ['#74cfc0', '#d9a968'],
        tooltip: { trigger: 'axis' },
        legend: { data: ['MVI CAD', 'MVI NEAC'], textStyle: { color: '#b9cbd5' } },
        grid: { left: 45, right: 20, top: 45, bottom: 42 },
        xAxis: { type: 'category', data: months, axisLabel: { color: '#b9cbd5' }, axisLine: { lineStyle: { color: '#37505c' } } },
        yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#b9cbd5' }, splitLine: { lineStyle: { color: '#253e49' } } },
        series: [
          { name: 'MVI CAD', type: 'bar', data: months.map(month => monthly[month].mvi_cad || 0) },
          { name: 'MVI NEAC', type: 'bar', data: months.map(month => monthly[month].mvi_neac || 0) },
        ],
      })
    return () => chart.dispose()
  }, [monthly])
  if (!Object.keys(monthly).length) return <p className="empty">Importe uma base sintética para ver a série mensal.</p>
  return <div ref={element} className="chart" role="img" aria-label="Série mensal separada de MVI CAD e MVI NEAC" />
}
