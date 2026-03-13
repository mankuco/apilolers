import { NavLink } from 'react-router-dom'
import { Trophy, Swords, ScrollText, Gamepad2, GitCompareArrows, Settings, Target } from 'lucide-react'

const NAV = [
  { to: '/ladder',     icon: Trophy,           label: 'Ladder' },
  { to: '/match',      icon: Swords,           label: 'Match' },
  { to: '/versus',     icon: GitCompareArrows, label: 'Versus' },
  { to: '/history',    icon: ScrollText,       label: 'History' },
  { to: '/champions',  icon: Gamepad2,         label: 'Champions' },
  { to: '/duels',      icon: Target,           label: '1v1 Arena' },
  { to: '/tournament', icon: Settings,         label: 'Tournament' },
]

export default function Sidebar() {
  return (
    <aside className="w-20 lg:w-64 shrink-0 h-screen bg-surface-900/80 border-r border-surface-700/40
                       flex flex-col items-center lg:items-stretch backdrop-blur-xl">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-surface-700/40">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-blue-glow
                        flex items-center justify-center text-lg font-bold shrink-0">
          T
        </div>
        <div className="hidden lg:block">
          <h1 className="text-sm font-bold tracking-wide text-white">Tournament</h1>
          <p className="text-[11px] text-surface-400 tracking-wider uppercase">Manager</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-3">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200
               ${isActive
                 ? 'bg-accent/15 text-accent font-semibold shadow-lg shadow-accent/5'
                 : 'text-surface-400 hover:text-white hover:bg-surface-800'
               }`
            }
          >
            <Icon size={20} className="shrink-0" />
            <span className="hidden lg:inline text-sm">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="hidden lg:block px-5 py-4 border-t border-surface-700/40">
        <p className="text-[10px] text-surface-500 uppercase tracking-widest">Internal League v2.0</p>
      </div>
    </aside>
  )
}
