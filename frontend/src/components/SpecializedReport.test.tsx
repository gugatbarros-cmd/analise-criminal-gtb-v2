import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SpecializedReport, type SpecializedReportRequest } from './SpecializedReport'

describe('relatórios especializados', () => {
  it('mostra unidades, apreensões e o recorte exato de armas', () => {
    const request: SpecializedReportRequest = { kind: 'arms', scope: { year: 2026, municipality: 'Igaci' },
      filters: { month: 1, armType: 'Pistola', situation: 'Apreendida' },
      data: { total: 2, seized: 2, restricted: 1, records: 1, available_types: [],
        available_situations: [], monthly: [{ period: '2026-01', total: 2 }],
        municipalities: [], types: [], calibers: [], situations: [] } }
    const html = renderToStaticMarkup(<SpecializedReport request={request} onClose={() => {}} />)
    expect(html).toContain('Relatório especializado de armas')
    expect(html).toContain('Município: Igaci')
    expect(html).toContain('Situação: Apreendida')
    expect(html).toContain('Unidades apreendidas')
    expect(html).toContain('2026-01')
  })

  it('mostra cobertura de peso e o tipo no relatório de drogas', () => {
    const request: SpecializedReportRequest = { kind: 'drugs', scope: { year: 2026 },
      filters: { drugType: 'Crack', startDate: '2026-03-01' },
      data: { total: 2, total_weight_grams: 0.1, weighted_records: 1,
        available_types: [], monthly: [], municipalities: [], types: [], locations: [], weights_by_type: [] } }
    const html = renderToStaticMarkup(<SpecializedReport request={request} onClose={() => {}} />)
    expect(html).toContain('Tipo: Crack')
    expect(html).toContain('Registros com peso reconhecido')
    expect(html).toContain('1 de 2')
    expect(html).toContain('Data inicial: 2026-03-01')
  })

  it('separa escala, força-tarefa e outros recursos no relatório de guarnições', () => {
    const request: SpecializedReportRequest = { kind: 'teams', scope: {},
      filters: { teamName: 'RP 01', officerRegistration: 'SYN001' },
      data: { roster_occurrences: 2, weighted_points: 7, teams: 1, officers: 1,
        extra_occurrences: 0, unlisted_occurrences: 0, available_teams: [],
        available_natures: [], available_officers: [], ranking: [], officer_ranking: [], natures: [] } }
    const html = renderToStaticMarkup(<SpecializedReport request={request} onClose={() => {}} />)
    expect(html).toContain('Equipe: RP 01')
    expect(html).toContain('Policial (matrícula): SYN001')
    expect(html).toContain('Vínculos de força-tarefa')
    expect(html).toContain('Outros recursos fora da escala')
  })
})
