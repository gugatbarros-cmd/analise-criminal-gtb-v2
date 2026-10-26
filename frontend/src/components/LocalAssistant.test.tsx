import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LocalAssistant } from './LocalAssistant'

describe('assistente analítico local', () => {
  it('explica os limites de privacidade e não oferece consulta individual', () => {
    const summary = { mvi_cad: 1, mvi_neac: 1, cvp: 2, tentativas: 0, tco: 1, mandados: 0, visitas: 0, sossego: 0, domestica: 1, by_source: { mvi_cad: 1, mvi_neac: 1, ocorrencias: 2, armas: 0, drogas: 0, guarnicoes: 0 }, monthly: {}, categories: {}, quarantined_rows: 0 }
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><LocalAssistant summary={summary} /></QueryClientProvider>)
    expect(html).toContain('Assistente analítico local')
    expect(html).toContain('Sem envio externo')
    expect(html).toContain('Não consulta nomes ou ocorrências individuais')
  })
})
