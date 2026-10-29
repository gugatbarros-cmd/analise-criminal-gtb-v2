import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnalysisChart } from './AnalysisChart'
import { Ranking } from './Ranking'
import { IndicatorSection } from './IndicatorNavigation'

describe('gráficos equivalentes às distribuições', () => {
  const items = [{ name: '01/2026', total: 2 }, { name: '02/2026', total: 5 }]
  it('mostra linha temporal com todos os valores e tabela de conferência', () => {
    const html = renderToStaticMarkup(<Ranking title="Evolução mensal" items={items} />)
    expect(html).toContain('<polyline')
    expect(html).toContain('01/2026: 2; 02/2026: 5')
    expect(html).toContain('Conferir números do gráfico')
    expect(html).toContain('<td>5</td>')
  })
  it('mantém o total de categorias sem fundir nem descartar valores', () => {
    const html = renderToStaticMarkup(<AnalysisChart title="Tipos" items={items} kind="doughnut" />)
    expect(html).toContain('Tipos: 7 no total')
    expect(html).toContain('02/2026: 5')
  })
  it('trata série vazia sem inventar números', () => {
    expect(renderToStaticMarkup(<AnalysisChart title="Vazio" items={[]} />)).toContain('Sem dados')
  })
  it('associa o gráfico ao indicador e mantém a tabela fora do botão', () => {
    const html = renderToStaticMarkup(<IndicatorSection id="cvp"><Ranking title="Municípios CVP" items={items} /></IndicatorSection>)
    expect(html).toContain('data-chart-target="cvp"')
    expect(html).toContain('aria-label="Ver indicador: Municípios CVP"')
    expect(html.indexOf('</button>')).toBeLessThan(html.indexOf('<details>'))
  })
})
