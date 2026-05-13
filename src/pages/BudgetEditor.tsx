import { useEffect, useState, useCallback } from 'react'
import {
  Plus, Trash2, Search, X, FileDown, Calculator,
  ChevronDown, ChevronUp, Save, FolderOpen,
} from 'lucide-react'
import { db } from '../db/database'
import type { Activity, Budget, BudgetItem, Project } from '../types'
import { formatCOP, formatNumber, generateId, parseNumber } from '../utils/format'
import { exportBudgetPDF } from '../utils/exportPDF'
import { exportBudgetExcel } from '../utils/exportExcel'

interface Props {
  project: Project
  onBack: () => void
}

export default function BudgetEditor({ project, onBack }: Props) {
  const [budget, setBudget] = useState<Budget>({
    projectId: project.id!,
    name: `Presupuesto - ${project.name}`,
    items: [],
    aiu: { admin: 10, unforeseen: 5, utility: 5 },
    subtotal: 0,
    aiuAmount: 0,
    total: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  const [budgetId, setBudgetId] = useState<number | null>(null)
  const [savedBudgets, setSavedBudgets] = useState<Budget[]>([])
  const [showActivitySearch, setShowActivitySearch] = useState(false)
  const [showSavedList, setShowSavedList] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => { loadSaved() }, [project.id])

  async function loadSaved() {
    const list = await db.budgets.where('projectId').equals(project.id!).toArray()
    setSavedBudgets(list)
  }

  const recalc = useCallback((items: BudgetItem[], aiu: Budget['aiu']) => {
    const subtotal = items.reduce((s, i) => s + i.total, 0)
    const aiuPct = (aiu.admin + aiu.unforeseen + aiu.utility) / 100
    const aiuAmount = subtotal * aiuPct
    const total = subtotal + aiuAmount
    return { subtotal, aiuAmount, total }
  }, [])

  function updateItems(items: BudgetItem[]) {
    const { subtotal, aiuAmount, total } = recalc(items, budget.aiu)
    setBudget(b => ({ ...b, items, subtotal, aiuAmount, total, updatedAt: new Date().toISOString() }))
  }

  function updateAIU(aiu: Budget['aiu']) {
    const { subtotal, aiuAmount, total } = recalc(budget.items, aiu)
    setBudget(b => ({ ...b, aiu, subtotal, aiuAmount, total }))
  }

  function addActivity(activity: Activity) {
    const existing = budget.items.find(i => i.activityCode === activity.code)
    if (existing) {
      const updated = budget.items.map(i =>
        i.activityCode === activity.code
          ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.adjustedUnitPrice }
          : i
      )
      updateItems(updated)
    } else {
      const item: BudgetItem = {
        id: generateId(),
        activityCode: activity.code,
        chapter: activity.chapter,
        description: activity.description,
        unit: activity.unit,
        quantity: 1,
        unitPrice: activity.unitPrice,
        adjustedUnitPrice: activity.unitPrice,
        total: activity.unitPrice,
      }
      updateItems([...budget.items, item])
    }
  }

  function updateItem(id: string, field: 'quantity' | 'adjustedUnitPrice' | 'chapter', value: number | string) {
    const updated = budget.items.map(i => {
      if (i.id !== id) return i
      const next = { ...i, [field]: value }
      next.total = next.quantity * next.adjustedUnitPrice
      return next
    })
    updateItems(updated)
  }

  function removeItem(id: string) {
    updateItems(budget.items.filter(i => i.id !== id))
  }

  async function saveBudget() {
    setSaving(true)
    const data = { ...budget, updatedAt: new Date().toISOString() }
    if (budgetId) {
      await db.budgets.update(budgetId, data)
    } else {
      const id = await db.budgets.add(data) as number
      setBudgetId(id)
    }
    setSaving(false)
    setSaveMsg('Guardado')
    setTimeout(() => setSaveMsg(''), 2000)
    loadSaved()
  }

  async function loadBudget(b: Budget) {
    setBudget(b)
    setBudgetId(b.id ?? null)
    setShowSavedList(false)
  }

  async function deleteBudget(id: number) {
    if (!confirm('¿Eliminar este presupuesto?')) return
    await db.budgets.delete(id)
    if (budgetId === id) {
      setBudgetId(null)
      setBudget(b => ({ ...b, items: [], subtotal: 0, aiuAmount: 0, total: 0 }))
    }
    loadSaved()
  }

  const chapters = [...new Set(budget.items.map(i => i.chapter))].sort()

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onBack} className="text-sm text-blue-600 hover:underline shrink-0">
          ← Proyectos
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-gray-800 truncate">{project.name}</h2>
          <p className="text-xs text-gray-500">{project.client} · {project.location}</p>
        </div>

        {/* Save / Load */}
        <div className="flex gap-2">
          {savedBudgets.length > 0 && (
            <button
              onClick={() => setShowSavedList(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50"
            >
              <FolderOpen size={13} />
              Mis presupuestos ({savedBudgets.length})
            </button>
          )}
          <button
            onClick={saveBudget}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
          >
            <Save size={13} />
            {saving ? 'Guardando...' : saveMsg || 'Guardar'}
          </button>
        </div>
      </div>

      {/* Saved budgets dropdown */}
      {showSavedList && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-500 mb-2">Presupuestos guardados</p>
          {savedBudgets.map(b => (
            <div key={b.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-800">{b.name}</p>
                <p className="text-xs text-gray-400">{new Date(b.updatedAt).toLocaleString('es-CO')} · {b.items.length} ítems · {formatCOP(b.total)}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => loadBudget(b)} className="text-xs text-blue-600 hover:underline">Abrir</button>
                <button onClick={() => deleteBudget(b.id!)} className="text-xs text-red-500 hover:underline">Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Budget items */}
        <div className="lg:col-span-2 space-y-4">
          {/* Budget name */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">Nombre del presupuesto</label>
            <input
              value={budget.name}
              onChange={e => setBudget(b => ({ ...b, name: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Items by chapter */}
          {chapters.length > 0 ? (
            <div className="space-y-3">
              {chapters.map((chapter, ci) => {
                const chItems = budget.items.filter(i => i.chapter === chapter)
                const chTotal = chItems.reduce((s, i) => s + i.total, 0)
                return (
                  <ChapterGroup
                    key={chapter}
                    chapter={chapter}
                    index={ci + 1}
                    items={chItems}
                    chTotal={chTotal}
                    onUpdate={updateItem}
                    onRemove={removeItem}
                  />
                )
              })}
            </div>
          ) : (
            <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 p-12 text-center text-gray-400">
              <Calculator size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">El presupuesto está vacío</p>
              <p className="text-xs mt-1">Agrega actividades usando el botón de abajo</p>
            </div>
          )}

          {/* Add activity button */}
          <button
            onClick={() => setShowActivitySearch(true)}
            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-blue-300 rounded-xl text-sm text-blue-600 hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <Plus size={16} />
            Agregar actividad al presupuesto
          </button>
        </div>

        {/* Right: Summary + AIU */}
        <div className="space-y-4">
          {/* AIU */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="font-semibold text-gray-800 text-sm mb-3">AIU (%)</p>
            <div className="space-y-3">
              {(['admin', 'unforeseen', 'utility'] as const).map(key => {
                const labels = { admin: 'Administración', unforeseen: 'Imprevistos', utility: 'Utilidad' }
                return (
                  <div key={key}>
                    <label className="text-xs text-gray-500">{labels[key]}</label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={budget.aiu[key]}
                        onChange={e => updateAIU({ ...budget.aiu, [key]: parseNumber(e.target.value) })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      />
                      <span className="text-gray-400 text-sm">%</span>
                    </div>
                  </div>
                )
              })}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500">Total AIU</p>
                <p className="font-bold text-blue-700 text-lg">
                  {formatNumber(budget.aiu.admin + budget.aiu.unforeseen + budget.aiu.utility, 1)}%
                </p>
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
            <p className="font-semibold text-gray-800 text-sm mb-3">Resumen</p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Ítems</span>
              <span className="font-medium">{budget.items.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Costo directo</span>
              <span className="font-semibold text-gray-800">{formatCOP(budget.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">AIU ({formatNumber(budget.aiu.admin + budget.aiu.unforeseen + budget.aiu.utility, 1)}%)</span>
              <span className="font-medium text-gray-700">{formatCOP(budget.aiuAmount)}</span>
            </div>
            <div className="flex justify-between text-base pt-2 border-t border-gray-200">
              <span className="font-bold text-gray-800">TOTAL</span>
              <span className="font-bold text-blue-700">{formatCOP(budget.total)}</span>
            </div>
          </div>

          {/* Export */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
            <p className="font-semibold text-gray-800 text-sm mb-3">Exportar</p>
            <button
              onClick={() => exportBudgetPDF(budget, project)}
              disabled={budget.items.length === 0}
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40"
            >
              <FileDown size={15} />
              Exportar PDF
            </button>
            <button
              onClick={() => exportBudgetExcel(budget, project)}
              disabled={budget.items.length === 0}
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40"
            >
              <FileDown size={15} />
              Exportar Excel
            </button>
          </div>
        </div>
      </div>

      {/* Activity search modal */}
      {showActivitySearch && (
        <ActivitySearchModal
          onAdd={addActivity}
          onClose={() => setShowActivitySearch(false)}
        />
      )}
    </div>
  )
}

function ChapterGroup({ chapter, index, items, chTotal, onUpdate, onRemove }: {
  chapter: string
  index: number
  items: BudgetItem[]
  chTotal: number
  onUpdate: (id: string, field: 'quantity' | 'adjustedUnitPrice' | 'chapter', value: number | string) => void
  onRemove: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-blue-800 text-white text-sm font-semibold"
      >
        <span>Capítulo {index}: {chapter}</span>
        <div className="flex items-center gap-3">
          <span className="text-blue-200 font-normal">{formatCOP(chTotal)}</span>
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </div>
      </button>

      {!collapsed && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 text-gray-500">Código</th>
                <th className="text-left px-3 py-2 text-gray-500">Descripción</th>
                <th className="text-center px-3 py-2 text-gray-500">Und</th>
                <th className="text-right px-3 py-2 text-gray-500 w-24">Cantidad</th>
                <th className="text-right px-3 py-2 text-gray-500 w-32">Vr. Unitario</th>
                <th className="text-right px-3 py-2 text-gray-500 w-32">Total</th>
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-500">{item.activityCode}</td>
                  <td className="px-3 py-2 text-gray-800">{item.description}</td>
                  <td className="px-3 py-2 text-center text-gray-500">{item.unit}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.quantity}
                      onChange={e => onUpdate(item.id, 'quantity', parseNumber(e.target.value))}
                      className="w-24 ml-auto block border border-gray-200 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      value={item.adjustedUnitPrice}
                      onChange={e => onUpdate(item.id, 'adjustedUnitPrice', parseNumber(e.target.value))}
                      className="w-32 ml-auto block border border-gray-200 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-blue-700">{formatCOP(item.total)}</td>
                  <td className="px-2 py-2">
                    <button onClick={() => onRemove(item.id)} className="text-gray-300 hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ActivitySearchModal({ onAdd, onClose }: { onAdd: (a: Activity) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [chapter, setChapter] = useState('')
  const [results, setResults] = useState<Activity[]>([])
  const [chapters, setChapters] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    db.activities.orderBy('chapter').uniqueKeys().then(chs => setChapters(chs as string[]))
  }, [])

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true)
      const lower = query.toLowerCase()
      let col = db.activities.toCollection()
      const all = await col.toArray()
      const filtered = all.filter(a => {
        const matchChapter = !chapter || a.chapter === chapter
        const matchQ = !query || a.description.toLowerCase().includes(lower) || a.code.toLowerCase().includes(lower)
        return matchChapter && matchQ
      }).slice(0, 80)
      setResults(filtered)
      setLoading(false)
      void col
    }, 200)
    return () => clearTimeout(timer)
  }, [query, chapter])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-800">Agregar actividad</h3>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-3 border-b border-gray-100 space-y-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por descripción o código..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <select
            value={chapter}
            onChange={e => setChapter(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">Todos los capítulos</option>
            {chapters.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2" />
              Buscando...
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No se encontraron actividades</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {results.map(a => (
                <button
                  key={a.id}
                  onClick={() => { onAdd(a); onClose() }}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 text-left transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-800 truncate">{a.description}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.code} · {a.chapter} · {a.unit}</p>
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <p className="text-sm font-semibold text-blue-700">{formatCOP(a.unitPrice)}</p>
                    <p className="text-xs text-gray-400">/{a.unit}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400 text-center">
          Mostrando {results.length} resultado{results.length !== 1 ? 's' : ''} · Toca una actividad para agregarla
        </div>
      </div>
    </div>
  )
}
