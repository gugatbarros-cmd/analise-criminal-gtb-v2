import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CriminalOverview } from './CriminalOverview'
import type { Summary } from '../services/api'

describe('Dashboard criminal', () => {
  it('mostra fontes separadas e o recorte aplicado sem inventar totais', () => {
    const summary = { occurrences: 1234, mvi_cad: 8, mvi_neac: 6 } as Summary
    const html = renderToStaticMarkup(<CriminalOverview summary={summary} year="2026" municipality="Igaci" loading={false} serviceAvailable demo={false} cloud={false} />)
    expect(html).toContain('1.234')
    expect(html).toContain('MVI CAD</span><strong>8')
    expect(html).toContain('MVI NEAC</span><strong>6')
    expect(html).toContain('2026 · Igaci')
    expect(html).toContain('href="#indicadores"')
  })

  it('indica indisponibilidade antes da carga e erro do serviço', () => {
    const html = renderToStaticMarkup(<CriminalOverview year="" municipality="" loading={false} serviceAvailable={false} demo={false} cloud={false} />)
    expect(html).toContain('Serviço indisponível')
    expect(html).toContain('Ocorrências</span><strong>—')
  })
})
