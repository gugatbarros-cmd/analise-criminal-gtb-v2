import type { ReactNode } from 'react'

// Vetores locais: nítidos em qualquer escala, inclusive sem conexão.
const drawings = {
  skull: <><path className="icon-wash" d="M5 15.5a8 8 0 1 1 14 0l-2 1V21H7v-4.5Z"/><path d="M5 15.5a8 8 0 1 1 14 0l-2 1V21H7v-4.5Z"/><circle cx="8.5" cy="11" r="1.5"/><circle cx="15.5" cy="11" r="1.5"/><path d="m11 15 1-1 1 1M10 18v3m4-3v3"/></>,
  drugs: <><path className="icon-wash" d="M12 3c-2 3-2 6 0 9-3-4-5-5-8-5 0 4 2 7 6 8-3-1-5 0-7 2 3 2 6 2 9 0 3 2 6 2 9 0-2-2-4-3-7-2 4-1 6-4 6-8-3 0-5 1-8 5 2-3 2-6 0-9Z"/><path d="M12 21V3c-2 3-2 6 0 9-3-4-5-5-8-5 0 4 2 7 6 8-3-1-5 0-7 2 3 2 6 2 9 0 3 2 6 2 9 0-2-2-4-3-7-2 4-1 6-4 6-8-3 0-5 1-8 5"/></>,
  weight: <><path className="icon-wash" d="M7 8h10l4 13H3Z"/><path d="M7 8h10l4 13H3ZM9 8V6a3 3 0 0 1 6 0v2M9 15h6m-3-3v6"/></>,
  arms: <><path className="icon-wash" d="M3 5h18v5H11l-2 3 2 7H5l-2-8Z"/><path d="M3 5h18v5H11l-2 3 2 7H5l-2-8ZM6 5V3m3 7v3h5a2 2 0 0 0 2-2v-1M4 8h14"/></>,
  siren: <><path className="icon-wash" d="M6 18v-6a6 6 0 0 1 12 0v6Z"/><path d="M6 18v-6a6 6 0 0 1 12 0v6M4 18h16v3H4Zm8-17v2M3 4l2 2m16-2-2 2M1 12h2m18 0h2M9 12a3 3 0 0 1 3-3"/></>,
  robbery: <><path className="icon-wash" d="m8 3 4 2 4-2-2 5c5 3 7 6 6 10-1 4-15 4-16 0-1-4 1-7 6-10Z"/><path d="m8 3 4 2 4-2-2 5c5 3 7 6 6 10-1 4-15 4-16 0-1-4 1-7 6-10ZM9 8h6m-1 5h-3a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3h-3m2-7v8"/></>,
  attempt: <><path className="icon-wash" d="M20.5 5.5a5 5 0 0 0-7-1L12 6l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-9.5a5 5 0 0 0 0-6Z"/><path d="M20.5 5.5a5 5 0 0 0-7-1L12 6l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-9.5a5 5 0 0 0 0-6ZM3 12h5l2-3 3 6 2-3h6"/></>,
  domestic: <><path className="icon-wash" d="m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6Z"/><path d="m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6Zm-6 9 6-5 6 5M8 10v7h8v-7m-5 7v-4h2v4"/></>,
  warrant: <><path className="icon-wash" d="m13 3 7 7-4 4-7-7Z"/><path d="m13 3 7 7-4 4-7-7Zm-3 7L3 17l4 4 7-7M11 2l10 10M13 20h8v2h-8"/></>,
  visit: <><path className="icon-wash" d="m2 10 8-7 8 7v10H4V10Z"/><path d="m2 10 8-7 8 7M4 9v11h7M8 20v-6h4m4 7v-1a4 4 0 0 1 8 0v1"/><circle cx="20" cy="13" r="2.5"/></>,
  clipboard: <><path className="icon-wash" d="M5 5h14v17H5Z"/><rect x="5" y="5" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1.5"/><path d="m8 14 3 3 5-6"/></>,
  sound: <><path className="icon-wash" d="M3 9h4l5-5v16l-5-5H3Z"/><path d="M3 9h4l5-5v16l-5-5H3Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></>,
  team: <><path className="icon-wash" d="M2 22v-3a6 6 0 0 1 12 0v3Zm12-12 5-2 4 2v4c0 3-3 5-4 6-2-1-5-3-5-6Z"/><circle cx="8" cy="7" r="4"/><path d="M2 22v-3a6 6 0 0 1 10-4m2-5 5-2 4 2v4c0 3-3 5-4 6-2-1-5-3-5-6Zm3 4 1.5 1.5L21 12"/></>,
  dashboard: <><rect className="icon-wash" x="3" y="3" width="7" height="10" rx="2"/><rect className="icon-wash" x="14" y="11" width="7" height="10" rx="2"/><rect x="3" y="3" width="7" height="10" rx="2"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="3" y="17" width="7" height="4" rx="1"/><rect x="14" y="11" width="7" height="10" rx="2"/></>,
  map: <><path className="icon-wash" d="M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0Z"/><path d="M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0Z"/><circle cx="12" cy="9" r="2.5"/></>,
  compass: <><circle className="icon-wash" cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="10"/><path d="m16 8-2 6-6 2 2-6ZM12 2v2m0 16v2M2 12h2m16 0h2"/></>,
  chart: <><path className="icon-wash" d="M4 19 9 10l5 4 6-9v15H4Z"/><path d="M3 3v18h18M6 15l4-6 5 4 6-8"/></>,
  report: <><path className="icon-wash" d="M5 2h10l5 5v15H5Z"/><path d="M5 2h10l5 5v15H5ZM14 2v6h6M8 18v-3m4 3v-7m4 7v-5"/></>,
  table: <><rect className="icon-wash" x="3" y="3" width="18" height="5" rx="1"/><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18M3 14h18M9 8v13m6-13v13"/></>,
  sparkles: <><path className="icon-wash" d="m10 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z"/><path d="m10 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3Zm10-2v6m-3-3h6m-3 14v5m-2.5-2.5h5"/></>,
  upload: <><path className="icon-wash" d="M3 15h18v6H3Z"/><path d="M3 15v6h18v-6M12 16V3m-5 5 5-5 5 5"/></>,
  user: <><circle className="icon-wash" cx="12" cy="7" r="4"/><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
  access: <><path className="icon-wash" d="m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6Z"/><path d="m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6Z"/><rect x="8" y="11" width="8" height="6" rx="1"/><path d="M10 11V9a2 2 0 0 1 4 0v2"/></>,
  sync: <><path className="icon-wash" d="M5 17a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5 5 0 0 1 3 9Z"/><path d="M4 16a5 5 0 0 1 0-9 7 7 0 0 1 13-1 5 5 0 0 1 3 9M7 16l3-3 3 3m-3-3v8m4-3 3 3 3-3m-3 3v-8"/></>,
  database: <><path className="icon-wash" d="M3 6v12c0 5 18 5 18 0V6Z"/><ellipse cx="12" cy="6" rx="9" ry="4"/><path d="M3 6v12c0 5 18 5 18 0V6M3 12c0 5 18 5 18 0"/></>,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof drawings

const tones: Partial<Record<IconName, string>> = {
  skull: 'rose', drugs: 'green', weight: 'green', arms: 'slate', robbery: 'amber',
  attempt: 'orange', domestic: 'violet', warrant: 'amber', visit: 'teal',
  sound: 'orange', team: 'teal', sparkles: 'violet', access: 'violet',
}
const indicatorIcons: Record<string, IconName> = {
  'mvi-cad': 'skull', 'mvi-neac': 'skull', ocorrencias: 'siren', drogas: 'drugs',
  armas: 'arms', cvp: 'robbery', tentativas: 'attempt', domestica: 'domestic',
  mandados: 'warrant', visitas: 'visit', tco: 'clipboard', sossego: 'sound',
  guarnicoes: 'team', municipios: 'map', 'tabela-geral': 'table',
  'assistente-local': 'sparkles', importacoes: 'upload', perfil: 'user',
  usuarios: 'access', 'online-sync': 'sync', armazenamento: 'database',
}

export function iconForIndicator(target: string): IconName {
  return indicatorIcons[target] || 'dashboard'
}

export function SystemIcon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`system-icon icon-${tones[name] || 'blue'} ${className}`} data-icon={name}
    xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"
    fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{drawings[name]}</svg>
}
