import { describe, expect, it } from 'vitest'
import { completedPhases, completionPercent, phases, phasePercent, remainingPercent } from './progress'

describe('andamento da implantação', () => {
  it('soma 100% de peso e mostra apenas fases aceitas como concluídas', () => {
    expect(phases.reduce((total, phase) => total + phase.weight, 0)).toBe(100)
    expect(completedPhases.map(phase => phase.id)).toEqual([1])
    expect(completionPercent).toBe(40)
    expect(remainingPercent).toBe(60)
  })

  it('calcula cada fase a partir das entregas concluídas', () => {
    expect(phases.map(phasePercent)).toEqual([50, 100, 60, 30, 25, 0])
  })
})
