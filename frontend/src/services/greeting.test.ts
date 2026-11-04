import { describe, expect, it } from 'vitest'
import { greetingFor } from './greeting'

describe('saudação local', () => {
  it.each([
    [0, 'Bom dia'], [11, 'Bom dia'], [12, 'Boa tarde'],
    [17, 'Boa tarde'], [18, 'Boa noite'], [23, 'Boa noite'],
  ])('usa a faixa horária das %ih', (hour, expected) => {
    expect(greetingFor(new Date(2026, 10, 4, hour))).toBe(expected)
  })
})
