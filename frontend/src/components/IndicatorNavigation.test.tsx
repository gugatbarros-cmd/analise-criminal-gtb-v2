import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { IndicatorCard, IndicatorUpdateContext, indicatorUpdateSource } from './IndicatorNavigation'
import type { Summary } from '../services/api'

it('preserva o valor do cartão e oferece navegação por botão nativo', () => {
  const html = renderToStaticMarkup(<IndicatorCard target="mvi-neac" label="MVI NEAC"><span>MVI NEAC</span><strong>24</strong></IndicatorCard>)
  expect(html).toContain('type="button"')
  expect(html).toContain('data-indicator-target="mvi-neac"')
  expect(html).toContain('aria-label="Ver análise de MVI NEAC"')
  expect(html).toContain('<strong>24</strong>')
  expect(html).toContain('Última atualização: sem importação')
})

it('mostra a data da fonte usada por cada indicador', () => {
  const summary = { source_coverage: { armas: 1, drogas: 0 }, last_imported_at: {
    ocorrencias: '2026-11-04 09:30:00', armas: '2026-11-03 18:00:00',
    mvi_cad: null, mvi_neac: null, drogas: null, guarnicoes: null,
  } } satisfies Pick<Summary, 'source_coverage' | 'last_imported_at'>
  const render = (target: string) => renderToStaticMarkup(
    <IndicatorUpdateContext.Provider value={summary}>
      <IndicatorCard target={target} label={target}><strong>1</strong></IndicatorCard>
    </IndicatorUpdateContext.Provider>)
  expect(render('armas')).toContain('Última atualização: 03/11/2026')
  expect(render('drogas')).toContain('Última atualização: 04/11/2026')
  expect(render('cvp')).toContain('Última atualização: 04/11/2026')
  expect(render('mvi-cad')).toContain('Última atualização: sem importação')
  expect(indicatorUpdateSource('drogas', { drogas: 1 })).toBe('drogas')
})
