import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LegacyLayout } from './LegacyLayout'

describe('interface herdada do sistema anterior', () => {
  it('mantém a identidade institucional e todos os grupos de menu', () => {
    const html = renderToStaticMarkup(<LegacyLayout version="0.1.94" demo username="operador"><div>Conteúdo</div></LegacyLayout>)

    expect(html).toContain('Sistema de Análise Criminal')
    expect(html).toContain('logo-10bpm-3d-ui.png')
    expect(html).toContain('Análises criminais')
    expect(html).toContain('Gestão operacional')
    expect(html).toContain('Inteligência')
    expect(html).toContain('Relatórios e dados')
    expect(html).toContain('Administração')
    expect(html).toContain('Violência doméstica')
    expect(html).toContain('Produtividade das guarnições')
    expect(html).toContain('Central de Acesso')
    expect(html).toMatch(/Bom dia|Boa tarde|Boa noite/)
    expect(html).not.toContain('Em migração')
    expect(html).toContain('Dashboard criminal')
    expect(html).toContain('Hora de Alagoas')
    expect(html).toMatch(/aria-label="Hora de Alagoas: \d{2}:\d{2}:\d{2}"/)
    expect(html.indexOf('workspace-greeting')).toBeLessThan(html.indexOf('Hora de Alagoas'))
    expect(html).toContain('legacy-header-actions')
    expect(html).toContain('v0.1.94')
  })
})
