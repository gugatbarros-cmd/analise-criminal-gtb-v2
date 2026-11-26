import { useEffect, useRef, useState } from 'react'
import { isCloud } from '../services/cloud'
import { getMe, getSessionToken } from '../services/auth'
import {
  APP_VERSION, IDLE_RELOAD_MINUTES, autoUpdateStatus, getPublishedVersion, installedVersion, isNewerVersion,
  localUpdateRequest, millisecondsSinceInteraction, startInteractionTracking, type AutoUpdateStatus,
} from '../services/version-update'

type UpdateState = 'checking' | 'current' | 'available' | 'ahead' | 'unavailable' | 'updating'

/** Recarrega a página na mesma tela para carregar a versão nova da interface. */
function reloadWithVersion(version: string) {
  const url = new URL(window.location.href)
  url.searchParams.set('appVersion', version)
  window.location.replace(url.href)
}

function minutesText(seconds: number | null | undefined) {
  if (!seconds) return 'em instantes'
  const minutes = Math.ceil(seconds / 60)
  return minutes <= 1 ? 'em cerca de 1 minuto sem uso' : `após ${minutes} minutos sem uso`
}

export function VersionUpdateIndicator() {
  const [state, setState] = useState<UpdateState>('checking')
  const [published, setPublished] = useState('')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [canInstall, setCanInstall] = useState(false)
  const [automatic, setAutomatic] = useState<AutoUpdateStatus | null>(null)
  const [restarting, setRestarting] = useState(false)
  const checking = useRef(false)
  const updating = useRef(false)
  const installingRef = useRef(false)
  installingRef.current = !!automatic?.installing

  useEffect(() => startInteractionTracking(), [])

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

  // Aplicativo local: o servidor instala sozinho quando o sistema fica sem uso e reinicia.
  // A página acompanha o reinício e recarrega na mesma tela com a versão nova.
  useEffect(() => {
    if (isCloud || import.meta.env.VITE_STATIC_DEMO === '1') return
    let active = true
    const follow = async () => {
      try {
        const installed = await installedVersion()
        if (!active) return
        setRestarting(false)
        if (isNewerVersion(installed, APP_VERSION)) { reloadWithVersion(installed); return }
        if (getSessionToken()) {
          const status = await autoUpdateStatus()
          if (active) setAutomatic(status)
        }
      } catch {
        // Sem resposta do servidor enquanto a versão nova é instalada.
        if (active && (installingRef.current || updating.current)) setRestarting(true)
      }
    }
    void follow()
    const timer = window.setInterval(() => { void follow() }, 15 * 1000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  // Consulta online: recarrega sozinha com a versão nova depois de um período sem uso.
  useEffect(() => {
    if (!isCloud || state !== 'available' || !published) return
    const timer = window.setInterval(() => {
      if (millisecondsSinceInteraction() >= IDLE_RELOAD_MINUTES * 60 * 1000) reloadWithVersion(published)
    }, 30 * 1000)
    return () => window.clearInterval(timer)
  }, [state, published])

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
    const timer = window.setInterval(checkAccess, 30 * 1000)
    return () => { active = false; window.clearInterval(timer) }
  }, [state])

  const installLocal = async () => {
    updating.current = true
    setProgress(null)
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
          reloadWithVersion(published)
          return
        }
        const status = await localUpdateRequest('GET')
        setMessage(status.message)
        setProgress(typeof status.progress === 'number' ? status.progress : null)
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

  const pendingVersion = automatic?.pending_version || published
  const autoInstalling = restarting || !!automatic?.installing
  const shownState: UpdateState = autoInstalling ? 'updating' : state
  const availableHint = isCloud
    ? `A página será atualizada sozinha após ${IDLE_RELOAD_MINUTES} minutos sem uso.`
    : automatic?.enabled && automatic.pending_version
      ? `Instalação e reinício automáticos ${minutesText(automatic.seconds_until_install)}.`
      : automatic?.enabled
        ? 'O sistema confere a publicação e instala sozinho quando ficar sem uso.'
        : canInstall ? 'Use “Atualizar agora” para instalar.' : 'Peça ao administrador para instalar a atualização.'
  return <aside className={`version-update-indicator version-update-${shownState}`} aria-live="polite" aria-label="Estado da versão do sistema">
    <span className="version-update-dot" aria-hidden="true" />
    <div><strong>{shownState === 'available' ? `Nova versão ${pendingVersion} disponível`
      : shownState === 'updating' ? `Atualizando para ${pendingVersion}…`
        : state === 'checking' ? 'Verificando atualização…'
          : state === 'ahead' ? `Versão ${APP_VERSION} · aguardando manifesto online`
            : state === 'unavailable' ? 'Verificação indisponível'
              : `Sistema atualizado · v${APP_VERSION}`}</strong>
      {shownState === 'available' && <small>{message || availableHint}</small>}
      {shownState === 'updating' && !isCloud && <><small>{autoInstalling ? 'Instalando e reiniciando o sistema. A página recarrega sozinha.' : message}</small>
        <progress className="version-update-progress" value={progress ?? undefined} max={100}
          aria-label="Andamento da atualização" />
        {progress !== null && <small>{progress}% do instalador baixado</small>}</>}
      {state === 'unavailable' && <small>Versão em uso: {APP_VERSION}</small>}
    </div>
    {shownState === 'available' && isCloud && <button type="button" onClick={() => reloadWithVersion(published)}>Atualizar agora</button>}
    {shownState === 'available' && !isCloud && canInstall && <button type="button" onClick={() => { void installLocal() }}>Atualizar agora</button>}
  </aside>
}
