import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { CadImport } from './CadImport'

it('mantém o botão de consulta disponível para explicar datas inválidas', () => {
  const query = new QueryClient()
  const html = renderToStaticMarkup(<QueryClientProvider client={query}>
    <CadImport onComplete={() => undefined} />
  </QueryClientProvider>)
  expect(html).toContain('<form noValidate=""')
  expect(html).toContain('type="submit" class="primary">Consultar e importar</button>')
})
