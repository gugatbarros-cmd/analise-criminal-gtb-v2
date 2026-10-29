import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { IndicatorCard } from './IndicatorNavigation'

it('preserva o valor do cartão e oferece navegação por botão nativo', () => {
  const html = renderToStaticMarkup(<IndicatorCard target="mvi-neac" label="MVI NEAC"><span>MVI NEAC</span><strong>24</strong></IndicatorCard>)
  expect(html).toContain('type="button"')
  expect(html).toContain('data-indicator-target="mvi-neac"')
  expect(html).toContain('aria-label="Ver análise de MVI NEAC"')
  expect(html).toContain('<strong>24</strong>')
})
