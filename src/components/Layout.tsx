import { useState } from 'react'
import {
  LayoutDashboard,
  ListChecks,
  FolderOpen,
  Upload,
  Menu,
  X,
  HardHat,
} from 'lucide-react'
import type { NavPage } from '../types'

interface Props {
  current: NavPage
  onChange: (page: NavPage) => void
  children: React.ReactNode
}

const navItems: { id: NavPage; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
  { id: 'projects', label: 'Proyectos', icon: FolderOpen },
  { id: 'activities', label: 'Actividades', icon: ListChecks },
  { id: 'import', label: 'Importar datos', icon: Upload },
]

export default function Layout({ current, onChange, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-blue-900 text-white z-30 transform transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:z-auto`}
      >
        <div className="flex items-center gap-3 px-5 py-5 border-b border-blue-800">
          <HardHat size={26} className="text-yellow-400 shrink-0" />
          <div>
            <p className="font-bold text-sm leading-tight">PresupuestoObra</p>
            <p className="text-blue-300 text-xs">Colombia · COP</p>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <nav className="mt-4 px-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = current === item.id
            return (
              <button
                key={item.id}
                onClick={() => { onChange(item.id); setSidebarOpen(false) }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${active ? 'bg-blue-700 text-white' : 'text-blue-200 hover:bg-blue-800 hover:text-white'}`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="absolute bottom-4 left-0 right-0 px-5">
          <p className="text-blue-400 text-xs text-center">v1.0.0 · Presupuestos de Obra</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shrink-0">
          <button
            className="lg:hidden p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          <h1 className="font-semibold text-gray-700 text-sm capitalize">
            {navItems.find(n => n.id === current)?.label ?? ''}
          </h1>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4">
          {children}
        </main>
      </div>
    </div>
  )
}
