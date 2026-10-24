import { useState } from 'react'

export function useAnalysisScope(year?: number, municipality?: string) {
  const [independent, setIndependent] = useState(false)
  const [localYear, setLocalYear] = useState('')
  const [localMunicipality, setLocalMunicipality] = useState('')
  const scopeYear = independent && localYear ? Number(localYear) : independent ? undefined : year
  const scopeMunicipality = independent ? localMunicipality.trim() || undefined : municipality
  const controls = <div className="filters" aria-label="Recorte próprio da análise">
    <label><input type="checkbox" checked={independent} onChange={event => setIndependent(event.target.checked)} /> Usar ano e município próprios</label>
    {independent && <>
      <label>Ano da análise<input type="number" min="1900" max="2100" placeholder="Todos" value={localYear} onChange={event => setLocalYear(event.target.value)} /></label>
      <label>Município da análise<input type="search" placeholder="Todos os municípios" value={localMunicipality} onChange={event => setLocalMunicipality(event.target.value)} /></label>
    </>}
  </div>
  return { scopeYear, scopeMunicipality, controls }
}
