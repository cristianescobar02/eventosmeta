import { useEffect, useState } from 'react'
import { HardHat, ListChecks, FolderOpen, TrendingUp, AlertCircle } from 'lucide-react'
import { db, getActivityStats } from '../db/database'
import { formatCOP } from '../utils/format'
import type { NavPage } from '../types'

interface Props {
  onNavigate: (page: NavPage) => void
}

export default function Dashboard({ onNavigate }: Props) {
  const [stats, setStats] = useState({ activities: 0, chapters: 0, projects: 0, budgets: 0 })
  const [recentProjects, setRecentProjects] = useState<{ id?: number; name: string; client: string; createdAt: string }[]>([])
  const [totalBudgeted, setTotalBudgeted] = useState(0)

  useEffect(() => {
    async function load() {
      const { total, chapters } = await getActivityStats()
      const projects = await db.projects.count()
      const budgets = await db.budgets.toArray()
      const total$ = budgets.reduce((s, b) => s + b.total, 0)
      const recent = await db.projects.orderBy('createdAt').reverse().limit(4).toArray()
      setStats({ activities: total, chapters, projects, budgets: budgets.length })
      setTotalBudgeted(total$)
      setRecentProjects(recent)
    }
    load()
  }, [])

  const cards = [
    { label: 'Actividades', value: stats.activities.toLocaleString('es-CO'), icon: ListChecks, color: 'bg-blue-600', action: 'activities' as NavPage },
    { label: 'Capítulos', value: stats.chapters.toLocaleString('es-CO'), icon: HardHat, color: 'bg-indigo-600', action: null },
    { label: 'Proyectos', value: stats.projects.toLocaleString('es-CO'), icon: FolderOpen, color: 'bg-emerald-600', action: 'projects' as NavPage },
    { label: 'Presupuestado', value: formatCOP(totalBudgeted), icon: TrendingUp, color: 'bg-orange-500', action: 'projects' as NavPage },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-blue-800 to-blue-600 rounded-2xl p-6 text-white">
        <h2 className="text-xl font-bold">Presupuestos de Obra</h2>
        <p className="text-blue-200 text-sm mt-1">
          Gestiona actividades, APU y presupuestos de construcción · Colombia
        </p>
        {stats.activities === 0 && (
          <div className="mt-4 flex items-start gap-2 bg-blue-700/50 rounded-xl p-3">
            <AlertCircle size={16} className="text-yellow-300 mt-0.5 shrink-0" />
            <p className="text-sm text-blue-100">
              Aún no has importado actividades.{' '}
              <button className="underline text-yellow-300 font-semibold" onClick={() => onNavigate('import')}>
                Importar ahora →
              </button>
            </p>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <button
              key={c.label}
              onClick={() => c.action && onNavigate(c.action)}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-left hover:shadow-md transition-shadow"
            >
              <div className={`inline-flex p-2 rounded-lg ${c.color} mb-2`}>
                <Icon size={16} className="text-white" />
              </div>
              <p className="text-2xl font-bold text-gray-800 leading-tight">{c.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
            </button>
          )
        })}
      </div>

      {/* Recent projects */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Proyectos recientes</h3>
          <button
            onClick={() => onNavigate('projects')}
            className="text-sm text-blue-600 hover:underline"
          >
            Ver todos →
          </button>
        </div>

        {recentProjects.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <FolderOpen size={36} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">No hay proyectos aún</p>
            <button
              onClick={() => onNavigate('projects')}
              className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              Crear primer proyecto
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentProjects.map((p) => (
              <div key={p.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800 text-sm">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.client}</p>
                </div>
                <p className="text-xs text-gray-400">{new Date(p.createdAt).toLocaleDateString('es-CO')}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onNavigate('projects')}
          className="bg-white border border-gray-100 rounded-xl p-4 text-left shadow-sm hover:shadow-md transition-shadow"
        >
          <p className="font-semibold text-gray-800 text-sm">Nuevo presupuesto</p>
          <p className="text-xs text-gray-500 mt-1">Crea un proyecto y elabora el presupuesto de obra</p>
        </button>
        <button
          onClick={() => onNavigate('activities')}
          className="bg-white border border-gray-100 rounded-xl p-4 text-left shadow-sm hover:shadow-md transition-shadow"
        >
          <p className="font-semibold text-gray-800 text-sm">Explorar actividades</p>
          <p className="text-xs text-gray-500 mt-1">Consulta las {stats.activities.toLocaleString('es-CO')} actividades con sus APU</p>
        </button>
      </div>
    </div>
  )
}
