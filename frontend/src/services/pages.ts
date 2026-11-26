/** Converte o destino do menu (ou do endereço #) na tela correspondente. */
export function pageForTarget(target: string): string {
  if (!target || ['dashboard', 'indicadores', 'andamento'].includes(target)) return 'dashboard'
  if (['mvi', 'mvi-cad', 'mvi-neac'].includes(target)) return 'mvi'
  if (target === 'operacoes') return 'mandados'
  return target
}

/** Telas sem os filtros de ano e município do painel. */
export const pagesWithoutFilters = new Set(['importacoes', 'perfil', 'online-sync', 'usuarios', 'armazenamento'])
