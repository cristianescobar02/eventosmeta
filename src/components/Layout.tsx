import { useState } from 'react'
import {
  LayoutDashboard, ListChecks, FolderOpen, CreditCard,
  Menu, X, HardHat, LogOut, ChevronDown, Shield, Package,
} from 'lucide-react'
import type { NavPage } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { PLANS } from '../lib/supabase'

interface Props {
  current: NavPage
  onChange: (page: NavPage) => void
  children: React.ReactNode
}

const navItems: { id: NavPage; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'dashboard',  label: 'Inicio',      icon: LayoutDashboard },
  { id: 'projects',   label: 'Proyectos',   icon: FolderOpen },
  { id: 'activities', label: 'Actividades', icon: ListChecks },
  { id: 'materials',  label: 'Materiales',  icon: Package },
  { id: 'pricing',    label: 'Planes',      icon: CreditCard },
]

const PLAN_BADGE: Record<string, string> = {
  free:  'bg-gray-500',
  basic: 'bg-blue-500',
  pro:   'bg-indigo-500',
}

export default function Layout({ current, onChange, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const { profile, signOut, isAdmin } = useAuth()

  const plan = profile?.plan ?? 'free'
  const planLabel = PLANS[plan].name

  async function handleSignOut() {
    await signOut()
  }

  const allNavItems = isAdmin
    ? [...navItems, { id: 'admin' as NavPage, label: 'Admin', icon: Shield }]
    : navItems

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full w-64 bg-blue-900 text-white z-30 transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:z-auto flex flex-col`}>

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-blue-800">
          <HardHat size={26} className="text-yellow-400 shrink-0" />
          <div>
            <p className="font-bold text-sm leading-tight">PresupuestosObra</p>
            <p className="text-blue-300 text-xs">Colombia · COP</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="mt-4 px-3 space-y-1 flex-1">
          {allNavItems.map((item) => {
            const Icon = item.icon
            const active = current === item.id
            // Materiales solo para pro
            const locked = item.id === 'materials' && plan !== 'pro' && !isAdmin

            return (
              <button
                key={item.id}
                onClick={() => { onChange(item.id); setSidebarOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${active ? 'bg-blue-700 text-white' : 'text-blue-200 hover:bg-blue-800 hover:text-white'}
                  ${locked ? 'opacity-50' : ''}`}
              >
                <Icon size={18} />
                {item.label}
                {locked && <span className="ml-auto text-xs bg-indigo-600 text-indigo-200 px-1.5 py-0.5 rounded">Pro</span>}
                {item.id === 'admin' && <span className="ml-auto text-xs bg-purple-600 text-purple-200 px-1.5 py-0.5 rounded">Admin</span>}
              </button>
            )
          })}
        </nav>

        {/* User panel */}
        <div className="px-3 pb-4 border-t border-blue-800 pt-3">
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-800 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
              {(profile?.full_name ?? profile?.email ?? 'U').slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm text-white font-medium truncate">
                {profile?.full_name ?? profile?.email ?? 'Usuario'}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`inline-block w-2 h-2 rounded-full ${PLAN_BADGE[plan]}`} />
                <p className="text-xs text-blue-300">Plan {planLabel}</p>
              </div>
            </div>
            <ChevronDown size={14} className={`text-blue-300 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {userMenuOpen && (
            <div className="mt-1 bg-blue-800 rounded-lg overflow-hidden">
              <button
                onClick={() => { onChange('pricing'); setUserMenuOpen(false); setSidebarOpen(false) }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-blue-200 hover:bg-blue-700 hover:text-white"
              >
                <CreditCard size={13} />
                Ver planes
              </button>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-blue-200 hover:bg-red-700 hover:text-white"
              >
                <LogOut size={13} />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
          <button className="lg:hidden p-1.5 rounded-md text-gray-500 hover:bg-gray-100" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <h1 className="font-semibold text-gray-700 text-sm">
            {allNavItems.find(n => n.id === current)?.label ?? ''}
          </h1>
          {plan !== 'free' && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold text-white ${PLAN_BADGE[plan]}`}>
              {planLabel}
            </span>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-4">
          {children}
        </main>
      </div>
    </div>
  )
}
