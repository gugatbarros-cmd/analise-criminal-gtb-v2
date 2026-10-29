import { createContext, useContext, type ReactNode } from 'react'

export const IndicatorNavigationContext = createContext<(target: string) => void>(() => {})

export function IndicatorCard({ target, label, children }: {
  target: string; label: string; children: ReactNode
}) {
  const navigate = useContext(IndicatorNavigationContext)
  return <article className="indicator-card"><button type="button" className="indicator-card-button"
    data-indicator-target={target} aria-label={`Ver análise de ${label}`} onClick={() => navigate(target)}>
    {children}
  </button></article>
}
