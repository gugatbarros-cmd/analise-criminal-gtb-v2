import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { IndicatorNavigationContext } from './IndicatorNavigation'
import { isCloud } from '../services/cloud'
import { iconForIndicator, SystemIcon, type IconName } from './SystemIcon'

type MenuItem = { label: string; target: string; icon?: IconName; planned?: boolean }
type MenuGroup = { label: string; items: MenuItem[] }

const menuGroups: MenuGroup[] = [
  { label: 'Visão geral', items: [
    { label: 'Visão Executiva', target: 'indicadores' },
    { label: 'MVI CAD', target: 'mvi-cad' },
    { label: 'MVI NEAC', target: 'mvi-neac' },
  ] },
  { label: 'Análises criminais', items: [
    { label: 'Ocorrências', target: 'ocorrencias' },
    { label: 'Análise CVP', target: 'cvp' },
    { label: 'Tentativas de homicídio', target: 'tentativas' },
    { label: 'Violência doméstica', target: 'domestica' },
    { label: 'Cumprimento de mandados', target: 'mandados' },
    { label: 'Visitas orientativas', target: 'visitas' },
    { label: 'Avaliação TCO', target: 'tco' },
    { label: 'Perturbação do sossego', target: 'sossego' },
  ] },
  { label: 'Gestão operacional', items: [
    { label: 'Análise de armas', target: 'armas' },
    { label: 'Estimativa de drogas', target: 'drogas' },
    { label: 'Produtividade das guarnições', target: 'guarnicoes' },
    { label: 'Planejamento operacional', target: 'municipios', icon: 'compass' },
    { label: 'Municípios do 10º BPM', target: 'municipios' },
  ] },
  { label: 'Inteligência', items: [
    { label: 'Análise avançada', target: 'tabela-geral' },
    { label: 'Inteligência estatística', target: 'indicadores', icon: 'chart' },
    { label: 'Soluções IA', target: 'assistente-local' },
    { label: 'Stiven', target: 'assistente-local' },
  ] },
  { label: 'Relatórios e dados', items: [
    { label: 'Relatórios e apresentações', target: 'relatorios', icon: 'report' },
    { label: 'Importações', target: 'importacoes' },
    { label: 'Tabela geral consolidada', target: 'tabela-geral' },
  ] },
  { label: 'Administração', items: [
    { label: 'Meu perfil', target: 'perfil' },
    { label: 'Controle de acesso', target: 'usuarios' },
    { label: 'Sincronização online', target: 'online-sync' },
    { label: 'Uso do Firebase', target: 'armazenamento' },
  ] },
]

export function LegacyLayout({ children, version, demo, username, onLogout, onNavigate }: {
  children: ReactNode
  version: string
  demo: boolean
  username?: string
  onLogout?: () => void
  onNavigate?: (target: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [active, setActive] = useState('Visão Executiva')
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => menuGroups.map(group => ({
    ...group,
    items: group.items.filter(item => item.label.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))),
  })).filter(group => group.items.length), [search])

  const navigateTarget = useCallback((target: string, label?: string, updateHistory = true) => {
    const item = menuGroups.flatMap(group => group.items).find(item => item.target === target)
    if (!item) return
    setActive(label || item.label)
    setMobileOpen(false)
    onNavigate?.(target)
    if (updateHistory && window.location.hash !== `#${target}`) window.history.pushState(null, '', `#${target}`)
    // Aguarda a troca da fonte CAD/NEAC antes de localizar o destino.
    window.requestAnimationFrame(() => {
      const destination = document.getElementById(target)
      if (!destination) return
      destination.setAttribute('tabindex', '-1')
      destination.focus({ preventScroll: true })
      destination.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [onNavigate])
  useEffect(() => {
    const restore = () => navigateTarget(window.location.hash.slice(1), undefined, false)
    restore()
    window.addEventListener('popstate', restore)
    window.addEventListener('hashchange', restore)
    return () => { window.removeEventListener('popstate', restore); window.removeEventListener('hashchange', restore) }
  }, [navigateTarget])
  const navigate = (item: MenuItem) => navigateTarget(item.target, item.label)
  const current = menuGroups.flatMap(group => group.items).find(item => item.label === active)

  return <IndicatorNavigationContext.Provider value={navigateTarget}><div className={`legacy-app${collapsed ? ' menu-collapsed' : ''}${mobileOpen ? ' menu-open' : ''}`}>
    <aside className="legacy-sidebar" aria-label="Menu principal">
      <div className="legacy-sidebar-brand">
        <img src={`${import.meta.env.BASE_URL}logo-10bpm-3d-ui.png`} alt="10º BPM" />
        <div><strong>Sistema de Análise Criminal</strong><span>10º BPM / PMAL</span></div>
      </div>
      <div className="legacy-menu-head">
        <span>Navegação</span>
        <button type="button" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>{collapsed ? '›' : '‹'}</button>
      </div>
      <label className="legacy-menu-search"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar no menu" aria-label="Buscar função no menu" /></label>
      <nav className="legacy-menu-groups">
        {filtered.map(group => <section key={group.label} className="legacy-menu-group">
          <h2>{group.label}</h2>
          {group.items.map(item => <button type="button" key={item.label} className={active === item.label ? 'active' : ''} onClick={() => navigate(item)} title={item.label}>
            <span className="legacy-menu-icon"><SystemIcon name={item.icon || iconForIndicator(item.target)} /></span><span className="legacy-menu-label">{item.label}</span>{item.planned && <small>Em migração</small>}
          </button>)}
        </section>)}
        {!filtered.length && <p className="legacy-menu-empty">Nenhuma função encontrada.</p>}
      </nav>
      <div className="legacy-sidebar-footer"><strong>10º BPM / PMAL</strong><span>Palmeira dos Índios · AL</span><small>● Sistema online</small></div>
    </aside>
    <button className="legacy-backdrop" type="button" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />
    <div className="legacy-workspace">
      <header className="legacy-header">
        <button className="legacy-mobile-menu" type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">☰</button>
        <img src={`${import.meta.env.BASE_URL}logo-10bpm-3d-ui.png`} alt="" />
        <div className="legacy-title"><span>Polícia Militar de Alagoas · 10º Batalhão</span><h1>{current?.label || 'Visão Executiva'}</h1><p>{current?.planned ? 'Módulo identificado no legado e programado para migração.' : 'Indicadores operacionais e criminais com rastreabilidade local.'}</p></div>
        <div className="legacy-header-state"><span>{isCloud ? 'Ambiente online' : demo ? 'Demonstração pública' : 'Ambiente local'}</span><strong>v{version}</strong></div>
        {username && <div className="legacy-user"><span className="legacy-avatar">10</span><div><small>Olá</small><strong>{username}</strong></div><button type="button" onClick={onLogout}>Sair</button></div>}
      </header>
      {children}
    </div>
  </div></IndicatorNavigationContext.Provider>
}
