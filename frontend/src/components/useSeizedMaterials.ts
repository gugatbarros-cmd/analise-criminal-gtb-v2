import { useQuery } from '@tanstack/react-query'
import { demoSeizedItems, fetchSeizedMaterials } from '../services/seized-materials'

/** Leitura única da planilha, compartilhada entre a aba e o dashboard geral. */
export function useSeizedMaterials(demo: boolean) {
  return useQuery({
    queryKey: ['seized-materials', demo],
    queryFn: () => demo ? Promise.resolve(demoSeizedItems()) : fetchSeizedMaterials(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}
