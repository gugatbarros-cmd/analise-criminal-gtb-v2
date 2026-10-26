import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LegacyLayout } from './LegacyLayout'

describe('interface herdada do sistema anterior', () => {
  it('mantém a identidade institucional e todos os grupos de menu', () => {
    const html = renderToStaticMarkup(<LegacyLayout version="0.1.53" demo username="operador"><div>Conteúdo</div></LegacyLayout>)

    expect(html).toContain('Sistema de Análise Criminal')
    expect(html).toContain('logo-10bpm-3d-ui.png')
    expect(html).toContain('Análises criminais')
    expect(html).toContain('Gestão operacional')
    expect(html).toContain('Inteligência')
    expect(html).toContain('Relatórios e dados')
    expect(html).toContain('Administração')
    expect(html).toContain('Violência doméstica')
    expect(html).toContain('Produtividade das guarnições')
    expect(html).toContain('Controle de acesso')
    expect(html).not.toContain('Em migração')
    expect(html).toContain('v0.1.53')
  })
})
