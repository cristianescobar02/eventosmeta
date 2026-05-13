import { useEffect, useState } from 'react'
import { Plus, FolderOpen, Trash2, FileText, ChevronRight } from 'lucide-react'
import { db } from '../db/database'
import type { Project } from '../types'
import BudgetEditor from './BudgetEditor'

type View = 'list' | 'create' | 'budget'

export default function ProjectsPage() {
  const [view, setView] = useState<View>('list')
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [form, setForm] = useState<Omit<Project, 'id' | 'createdAt'>>({
    name: '', client: '', location: '', department: '', date: '', description: '',
  })
  const [formError, setFormError] = useState('')

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    const all = await db.projects.orderBy('createdAt').reverse().toArray()
    setProjects(all)
  }

  async function createProject() {
    if (!form.name.trim() || !form.client.trim()) {
      setFormError('El nombre del proyecto y el cliente son obligatorios.')
      return
    }
    const project: Project = { ...form, createdAt: new Date().toISOString() }
    const id = await db.projects.add(project) as number
    const created = { ...project, id }
    setSelectedProject(created)
    setView('budget')
    setForm({ name: '', client: '', location: '', department: '', date: '', description: '' })
    setFormError('')
    loadProjects()
  }

  async function deleteProject(id: number) {
    if (!confirm('¿Eliminar este proyecto y todos sus presupuestos?')) return
    await db.projects.delete(id)
    await db.budgets.where('projectId').equals(id).delete()
    loadProjects()
  }

  if (view === 'budget' && selectedProject) {
    return (
      <BudgetEditor
        project={selectedProject}
        onBack={() => { setView('list'); setSelectedProject(null) }}
      />
    )
  }

  if (view === 'create') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView('list')} className="text-sm text-blue-600 hover:underline">
            ← Volver
          </button>
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
            <textarea
              rows={3}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Descripción del proyecto..."
            />
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}

          <div className="flex gap-3 pt-2">
            <button
              onClick={createProject}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Crear proyecto y elaborar presupuesto →
            </button>
            <button onClick={() => setView('list')} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
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
        <button
          onClick={() => setView('create')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus size={16} />
          Nuevo proyecto
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-16 text-center">
          <FolderOpen size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 text-sm mb-4">No hay proyectos aún</p>
          <button
            onClick={() => setView('create')}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
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
    </div>
  )
}

function ProjectCard({ project, onOpen, onDelete }: { project: Project; onOpen: () => void; onDelete: () => void }) {
  const [budgetCount, setBudgetCount] = useState(0)

  useEffect(() => {
    db.budgets.where('projectId').equals(project.id!).count().then(setBudgetCount)
  }, [project.id])

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
      <div className="p-2.5 bg-blue-100 rounded-lg shrink-0">
        <FolderOpen size={20} className="text-blue-700" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-800">{project.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {project.client} · {project.location}{project.department ? `, ${project.department}` : ''}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {budgetCount} presupuesto{budgetCount !== 1 ? 's' : ''} ·{' '}
          {new Date(project.createdAt).toLocaleDateString('es-CO')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onOpen}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
        >
          <FileText size={13} />
          Presupuesto
          <ChevronRight size={13} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
        >
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
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    </div>
  )
}
