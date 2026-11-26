import { expect, it } from 'vitest'
import { pageForTarget, pagesWithoutFilters } from './pages'

it('cada item do menu abre a própria tela', () => {
  expect(pageForTarget('')).toBe('dashboard')
  expect(pageForTarget('indicadores')).toBe('dashboard')
  expect(pageForTarget('mvi-cad')).toBe('mvi')
  expect(pageForTarget('mvi-neac')).toBe('mvi')
  expect(pageForTarget('operacoes')).toBe('mandados')
  expect(pageForTarget('importacoes')).toBe('importacoes')
  expect(pageForTarget('mapa-criminal')).toBe('mapa-criminal')
  expect(pagesWithoutFilters.has('importacoes')).toBe(true)
  expect(pagesWithoutFilters.has('cvp')).toBe(false)
})
