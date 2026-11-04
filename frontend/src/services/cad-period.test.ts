import { describe, expect, it } from 'vitest'
import { cadPeriodError } from './cad-period'

describe('intervalo da consulta CAD', () => {
  it('explica datas inexistentes e intervalos invertidos', () => {
    expect(cadPeriodError('2025-01-01', '2025-06-31')).toContain('data final válida')
    expect(cadPeriodError('2025-01-01', '2025-06-30')).toBe('')
    expect(cadPeriodError('2025-06-30', '2025-01-01')).toContain('posterior')
  })
})
