import { useEffect, useRef, useState } from 'react'
import { isCloud } from '../services/cloud'
import { APP_VERSION, getPublishedVersion, isNewerVersion } from '../services/version-update'

type UpdateState = 'checking' | 'current' | 'available' | 'ahead' | 'unavailable' | 'updating'

export function VersionUpdateIndicator() {
  const [state, setState] = useState<UpdateState>('checking')
  const [published, setPublished] = useState('')
  const checking = useRef(false)

  useEffect(() => {
    let active = true
    const check = async () => {
      if (checking.current || document.visibilityState === 'hidden') return
      checking.current = true
      try {
        const version = await getPublishedVersion()
        if (active) { setPublished(version); setState(isNewerVersion(version, APP_VERSION) ? 'available'
          : isNewerVersion(APP_VERSION, version) ? 'ahead' : 'current') }
      } catch { if (active) setState('unavailable') }
      finally { checking.current = false }
    }
    void check()
    const timer = window.setInterval(() => { void check() }, 30 * 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  const update = () => {
    setState('updating')
    const url = new URL(window.location.href)
    url.searchParams.set('appVersion', published)
    window.location.replace(url.href)
  }
  return <aside className={`version-update-indicator version-update-${state}`} aria-live="polite" aria-label="Estado da versão do sistema">
    <span className="version-update-dot" aria-hidden="true" />
    <div><strong>{state === 'available' ? `Nova versão ${published} disponível`
      : state === 'updating' ? `Atualizando para ${published}…`
          : state === 'checking' ? 'Verificando atualização…'
            : state === 'ahead' ? `Versão ${APP_VERSION} · aguardando manifesto online`
          : state === 'unavailable' ? 'Verificação indisponível'
            : `Sistema atualizado · v${APP_VERSION}`}</strong>
      {state === 'available' && <small>{isCloud ? `Versão em uso: ${APP_VERSION}` : 'A atualização será instalada automaticamente na próxima abertura do programa.'}</small>}
      {state === 'unavailable' && <small>Versão em uso: {APP_VERSION}</small>}
    </div>
    {state === 'available' && isCloud && <button type="button" onClick={update}>Atualizar agora</button>}
  </aside>
}
