import { useEffect, useRef, useState } from 'react'
import { isCloud } from '../services/cloud'
import { getMe, getSessionToken } from '../services/auth'
import { APP_VERSION, getPublishedVersion, installedVersion, isNewerVersion, localUpdateRequest } from '../services/version-update'

type UpdateState = 'checking' | 'current' | 'available' | 'ahead' | 'unavailable' | 'updating'

export function VersionUpdateIndicator() {
  const [state, setState] = useState<UpdateState>('checking')
  const [published, setPublished] = useState('')
  const [message, setMessage] = useState('')
  const [canInstall, setCanInstall] = useState(false)
  const checking = useRef(false)
  const updating = useRef(false)
  const autoAttempted = useRef(false)

  useEffect(() => {
    let active = true
    const check = async () => {
      if (checking.current || updating.current || document.visibilityState === 'hidden') return
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

  useEffect(() => {
    if (isCloud || state !== 'available') return
    let active = true
    const checkAccess = () => {
      const token = getSessionToken()
      if (!token) { setCanInstall(false); return }
      void getMe(token).then(user => { if (active) setCanInstall(user.role === 'admin') })
        .catch(() => { if (active) setCanInstall(false) })
    }
    checkAccess()
    const timer = window.setInterval(checkAccess, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [state])

  const update = () => {
    setState('updating')
    const url = new URL(window.location.href)
    url.searchParams.set('appVersion', published)
    window.location.replace(url.href)
  }
  const installLocal = async () => {
    autoAttempted.current = true
    updating.current = true
    setMessage('Iniciando a atualização…')
    setState('updating')
    try {
      await localUpdateRequest('POST')
    } catch (error) {
      updating.current = false
      setMessage(error instanceof Error ? error.message : 'Falha ao iniciar a atualização.')
      setState('available')
      return
    }
    const started = Date.now()
    const timer = window.setInterval(async () => {
      try {
        if (isNewerVersion(await installedVersion(), APP_VERSION)) {
          window.clearInterval(timer)
          const url = new URL(window.location.href)
          url.searchParams.set('appVersion', published)
          window.location.replace(url.href)
          return
        }
        const status = await localUpdateRequest('GET')
        setMessage(status.message)
        if (status.phase === 'failed' || status.phase === 'ready') {
          window.clearInterval(timer)
          updating.current = false
          setState('available')
          if (status.phase === 'ready') setMessage('O instalador desta versão ainda não está disponível. Tente novamente em alguns minutos.')
        }
      } catch { setMessage('Instalando e reiniciando o sistema…') }
      if (Date.now() - started > 10 * 60 * 1000) {
        window.clearInterval(timer)
        updating.current = false
        setMessage('A atualização demorou mais que o esperado. Confira o estado do programa e tente novamente.')
        setState('available')
      }
    }, 1500)
  }

  useEffect(() => {
    if (isCloud || state !== 'available' || !canInstall || autoAttempted.current) return
    let timer: number
    const schedule = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => { if (!updating.current) void installLocal() }, 90 * 1000)
    }
    schedule()
    document.addEventListener('pointerdown', schedule)
    document.addEventListener('keydown', schedule)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', schedule)
      document.removeEventListener('keydown', schedule)
    }
  }, [canInstall, state])
  return <aside className={`version-update-indicator version-update-${state}`} aria-live="polite" aria-label="Estado da versão do sistema">
    <span className="version-update-dot" aria-hidden="true" />
    <div><strong>{state === 'available' ? `Nova versão ${published} disponível`
      : state === 'updating' ? `Atualizando para ${published}…`
          : state === 'checking' ? 'Verificando atualização…'
            : state === 'ahead' ? `Versão ${APP_VERSION} · aguardando manifesto online`
          : state === 'unavailable' ? 'Verificação indisponível'
            : `Sistema atualizado · v${APP_VERSION}`}</strong>
      {state === 'available' && <small>{message || (isCloud ? `Versão em uso: ${APP_VERSION}` : canInstall ? 'Instale agora ou aguarde 90 segundos sem usar o sistema para a instalação automática.' : 'Peça ao administrador para instalar a atualização.')}</small>}
      {state === 'updating' && !isCloud && <small>{message}</small>}
      {state === 'unavailable' && <small>Versão em uso: {APP_VERSION}</small>}
    </div>
    {state === 'available' && isCloud && <button type="button" onClick={update}>Atualizar agora</button>}
    {state === 'available' && !isCloud && canInstall && <button type="button" onClick={() => { void installLocal() }}>Atualizar agora</button>}
  </aside>
}
