import { NavLink, useParams } from 'react-router-dom'
import { CompanySwitcher } from './CompanySwitcher'

const dataLinks = [
  { to: '', label: 'Oversikt', icon: '\u{1F4CA}' },
  { to: '/kontoplan', label: 'Kontoplan', icon: '\u{1F4CB}' },
  { to: '/huvudbok', label: 'Huvudbok', icon: '\u{1F4D6}' },
  { to: '/verifikationer', label: 'Verifikationer', icon: '\u{1F4DD}' },
]

const reportLinks = [
  { to: '/balansrapport', label: 'Balansrapport', icon: '\u2696\uFE0F' },
  { to: '/resultatrapport', label: 'Resultatrapport', icon: '\u{1F4C8}' },
]

const toolLinks = [
  { to: '/validering', label: 'Validering', icon: '\u2705' },
  { to: '/dimensioner', label: 'Dimensioner', icon: '\u{1F3F7}\uFE0F' },
]

function SidebarLink({ to, label, icon }: { to: string; label: string; icon: string }) {
  const { companyId } = useParams()
  const fullPath = companyId ? `/company/${companyId}${to}` : '#'

  return (
    <NavLink
      to={fullPath}
      end={to === ''}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3.5 py-2.5 rounded-[10px] text-sm font-medium
        transition-colors duration-150
        ${isActive
          ? 'bg-accent-light text-accent-dark font-semibold'
          : 'text-brown-mid hover:bg-bg-alt'
        }`
      }
    >
      <span className="text-base">{icon}</span>
      {label}
    </NavLink>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="px-3.5 py-1 text-[11px] font-bold text-text-muted uppercase tracking-widest">
      {children}
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="w-[260px] bg-white border-r border-border flex flex-col flex-shrink-0 h-screen sticky top-0">
      <CompanySwitcher />
      <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5 overflow-y-auto">
        {/* Import link */}
        <NavLink
          to="/import"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3.5 py-2.5 rounded-[10px] text-sm font-medium
            transition-colors duration-150
            ${isActive ? 'bg-accent-light text-accent-dark font-semibold' : 'text-brown-mid hover:bg-bg-alt'}`
          }
        >
          <span className="text-base">{'\u{1F4C2}'}</span>
          Importera SIE4
        </NavLink>

        <div className="h-px bg-border my-2 mx-1" />
        <SectionLabel>Data</SectionLabel>
        {dataLinks.map(link => (
          <SidebarLink key={link.to} {...link} />
        ))}

        <div className="h-px bg-border my-2 mx-1" />
        <SectionLabel>Rapporter</SectionLabel>
        {reportLinks.map(link => (
          <SidebarLink key={link.to} {...link} />
        ))}

        <div className="h-px bg-border my-2 mx-1" />
        <SectionLabel>Verktyg</SectionLabel>
        {toolLinks.map(link => (
          <SidebarLink key={link.to} {...link} />
        ))}
      </nav>
    </aside>
  )
}
