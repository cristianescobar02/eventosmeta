import { useEffect, useState } from 'react'
import { Plus, FolderOpen, Trash2, FileText, ChevronRight, Lock } from 'lucide-react'
import { supabase, canCreateProject } from '../lib/supabase'
import type { Project } from '../types'
import BudgetEditor from './BudgetEditor'
import { useAuth } from '../contexts/AuthContext'
import type { NavPage } from '../types'

type View = 'list' | 'create' | 'budget'

interface Props {
  onNavigate: (p: NavPage) => void
}

export default function ProjectsPage({ onNavigate }: Props) {
  const { user, profile } = useAuth()
  const [view, setView] = useState<View>('list')
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [form, setForm] = useState({ name: '', client: '', location: '', department: '', date: '', description: '' })
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(true)

  const plan = profile?.plan ?? 'free'

  useEffect(() => { loadProjects() }, [user])

  async function loadProjects() {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setProjects((data as Project[]) ?? [])
    setLoading(false)
  }

  async function createProject() {
    if (!user) return
    if (!form.name.trim() || !form.client.trim()) {
      setFormError('El nombre del proyecto y el cliente son obligatorios.')
      return
    }
    if (!canCreateProject(plan, projects.length)) {
      setFormError('Tu plan gratuito solo permite 1 proyecto. Actualiza tu plan para crear más.')
      return
    }

    const { data, error } = await supabase
      .from('projects')
      .insert({ ...form, user_id: user.id })
      .select()
      .single()

    if (error) { setFormError(error.message); return }

    const created = data as Project
    setSelectedProject(created)
    setView('budget')
    setForm({ name: '', client: '', location: '', department: '', date: '', description: '' })
    setFormError('')
    loadProjects()
  }

  async function deleteProject(id: number) {
    if (!confirm('¿Eliminar este proyecto y todos sus presupuestos?')) return
    await supabase.from('projects').delete().eq('id', id)
    loadProjects()
  }

  const canCreate = canCreateProject(plan, projects.length)

  if (view === 'budget' && selectedProject) {
    return <BudgetEditor project={selectedProject} onBack={() => { setView('list'); loadProjects() }} onNavigate={onNavigate} />
  }

  if (view === 'create') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView('list')} className="text-sm text-blue-600 hover:underline">← Volver</button>
          <h2 className="font-bold text-gray-800">Nuevo proyecto</h2>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nombre del proyecto *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
            <Field label="Cliente *" value={form.client} onChange={v => setForm(f => ({ ...f, client: v }))} />
            <Field label="Municipio / Ciudad" value={form.location} onChange={v => setForm(f => ({ ...f, location: v }))} />
            <Field label="Departamento" value={form.department} onChange={v => setForm(f => ({ ...f, department: v }))} />
            <Field label="Fecha" type="date" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción / Objeto</label>
            <textarea rows={3} value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Descripción del proyecto..."
            />
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={createProject}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              Crear proyecto y elaborar presupuesto →
            </button>
            <button onClick={() => setView('list')}
              className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-800">Mis proyectos</h2>
        {canCreate ? (
          <button onClick={() => setView('create')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus size={16} />
            Nuevo proyecto
          </button>
        ) : (
          <button onClick={() => onNavigate('pricing')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
            <Lock size={14} />
            Actualizar plan para más proyectos
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2" />
          Cargando...
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
          <FolderOpen size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 text-sm mb-4">No hay proyectos aún</p>
          <button onClick={() => setView('create')}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            Crear primer proyecto
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => { setSelectedProject(project); setView('budget') }}
              onDelete={() => deleteProject(project.id!)}
            />
          ))}
        </div>
      )}

      {!canCreate && projects.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700 text-center">
          Plan gratuito: 1 proyecto máximo.{' '}
          <button onClick={() => onNavigate('pricing')} className="font-semibold underline">
            Actualiza tu plan →
          </button>
        </div>
      )}
    </div>
  )
}

function ProjectCard({ project, onOpen, onDelete }: { project: Project; onOpen: () => void; onDelete: () => void }) {
  const [budgetCount, setBudgetCount] = useState(0)

  useEffect(() => {
    if (!project.id) return
    supabase.from('budgets').select('id', { count: 'exact', head: true }).eq('project_id', project.id)
      .then(({ count }) => setBudgetCount(count ?? 0))
  }, [project.id])

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
      <div className="p-2.5 bg-blue-100 rounded-lg shrink-0">
        <FolderOpen size={20} className="text-blue-700" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800">{project.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {project.client}{project.location ? ` · ${project.location}` : ''}{project.department ? `, ${project.department}` : ''}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {budgetCount} presupuesto{budgetCount !== 1 ? 's' : ''} ·{' '}
          {project.created_at ? new Date(project.created_at).toLocaleDateString('es-CO') : ''}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onOpen}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
          <FileText size={13} />
          Presupuesto
          <ChevronRight size={13} />
        </button>
        <button onClick={onDelete} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
    </div>
  )
}
