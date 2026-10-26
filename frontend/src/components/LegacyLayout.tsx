import { useMemo, useState, type ReactNode } from 'react'

type MenuItem = { label: string; target: string; short: string; planned?: boolean }
type MenuGroup = { label: string; items: MenuItem[] }

const menuGroups: MenuGroup[] = [
  { label: 'Visão geral', items: [
    { label: 'Visão Executiva', target: 'indicadores', short: 'VE' },
    { label: 'MVI CAD', target: 'mvi', short: 'MC' },
    { label: 'MVI NEAC', target: 'mvi', short: 'MN' },
  ] },
  { label: 'Análises criminais', items: [
    { label: 'Ocorrências', target: 'indicadores', short: 'OC' },
    { label: 'Análise CVP', target: 'cvp', short: 'CV' },
    { label: 'Tentativas de homicídio', target: 'tentativas', short: 'TH' },
    { label: 'Violência doméstica', target: 'domestica', short: 'VD' },
    { label: 'Cumprimento de mandados', target: 'mandados', short: 'CM' },
    { label: 'Visitas orientativas', target: 'visitas', short: 'VO' },
    { label: 'Avaliação TCO', target: 'tco', short: 'TC' },
    { label: 'Perturbação do sossego', target: 'sossego', short: 'PS' },
  ] },
  { label: 'Gestão operacional', items: [
    { label: 'Análise de armas', target: 'armas', short: 'AR' },
    { label: 'Estimativa de drogas', target: 'drogas', short: 'DR' },
    { label: 'Produtividade das guarnições', target: 'guarnicoes', short: 'GU' },
    { label: 'Planejamento operacional', target: 'municipios', short: 'PO' },
    { label: 'Municípios do 10º BPM', target: 'municipios', short: 'MU' },
  ] },
  { label: 'Inteligência', items: [
    { label: 'Análise avançada', target: 'tabela-geral', short: 'AA' },
    { label: 'Inteligência estatística', target: 'indicadores', short: 'IE' },
    { label: 'Soluções IA', target: 'andamento', short: 'IA', planned: true },
    { label: 'Stiven', target: 'andamento', short: 'ST', planned: true },
  ] },
  { label: 'Relatórios e dados', items: [
    { label: 'Relatórios e apresentações', target: 'indicadores', short: 'RP' },
    { label: 'Importações', target: 'importacoes', short: 'IM' },
    { label: 'Tabela geral consolidada', target: 'tabela-geral', short: 'TG' },
  ] },
  { label: 'Administração', items: [
    { label: 'Meu perfil', target: 'perfil', short: 'MP' },
    { label: 'Controle de acesso', target: 'usuarios', short: 'CA' },
    { label: 'Uso do Firebase', target: 'andamento', short: 'FB', planned: true },
  ] },
]

export function LegacyLayout({ children, version, demo, username, onLogout }: {
  children: ReactNode
  version: string
  demo: boolean
  username?: string
  onLogout?: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [active, setActive] = useState('Visão Executiva')
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => menuGroups.map(group => ({
    ...group,
    items: group.items.filter(item => item.label.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))),
  })).filter(group => group.items.length), [search])

  const navigate = (item: MenuItem) => {
    setActive(item.label)
    setMobileOpen(false)
    document.getElementById(item.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const current = menuGroups.flatMap(group => group.items).find(item => item.label === active)

  return <div className={`legacy-app${collapsed ? ' menu-collapsed' : ''}${mobileOpen ? ' menu-open' : ''}`}>
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
            <span className="legacy-menu-icon">{item.short}</span><span className="legacy-menu-label">{item.label}</span>{item.planned && <small>Em migração</small>}
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
        <div className="legacy-header-state"><span>{demo ? 'Demonstração pública' : 'Ambiente local'}</span><strong>v{version}</strong></div>
        {username && <div className="legacy-user"><span className="legacy-avatar">10</span><div><small>Olá</small><strong>{username}</strong></div><button type="button" onClick={onLogout}>Sair</button></div>}
      </header>
      {children}
    </div>
  </div>
}
