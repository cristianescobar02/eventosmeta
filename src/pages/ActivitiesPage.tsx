import { useEffect, useState, useCallback } from 'react'
import { Search, ChevronDown, ChevronUp, X } from 'lucide-react'
import { db } from '../db/database'
import type { Activity, APU } from '../types'
import { formatCOP, formatNumber } from '../utils/format'

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [filtered, setFiltered] = useState<Activity[]>([])
  const [chapters, setChapters] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [selectedChapter, setSelectedChapter] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [apu, setApu] = useState<APU | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  useEffect(() => {
    async function load() {
      const all = await db.activities.toArray()
      setActivities(all)
      setFiltered(all)
      const chs = [...new Set(all.map(a => a.chapter))].sort()
      setChapters(chs)
      setLoading(false)
    }
    load()
  }, [])

  const applyFilters = useCallback((q: string, chapter: string) => {
    const lower = q.toLowerCase()
    const result = activities.filter(a => {
      const matchChapter = !chapter || a.chapter === chapter
      const matchSearch = !q || a.description.toLowerCase().includes(lower) || a.code.toLowerCase().includes(lower)
      return matchChapter && matchSearch
    })
    setFiltered(result)
    setPage(0)
  }, [activities])

  useEffect(() => {
    applyFilters(search, selectedChapter)
  }, [search, selectedChapter, applyFilters])

  async function toggleAPU(activity: Activity) {
    if (expandedId === activity.id) {
      setExpandedId(null)
      setApu(null)
      return
    }
    setExpandedId(activity.id ?? null)
    const found = await db.apus.where('activityCode').equals(activity.code).first()
    setApu(found ?? null)
  }

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
        Cargando actividades...
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar actividad o código..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        <select
          value={selectedChapter}
          onChange={e => setSelectedChapter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="">Todos los capítulos</option>
          {chapters.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Count */}
      <p className="text-xs text-gray-500">
        Mostrando {paginated.length} de {filtered.length} actividades
        {filtered.length !== activities.length && ` (total: ${activities.length})`}
      </p>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
          <Search size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No se encontraron actividades</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Código</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Capítulo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Descripción</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Und</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Precio unitario</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">APU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.map(activity => (
                  <>
                    <tr
                      key={activity.id}
                      className={`hover:bg-blue-50 transition-colors ${expandedId === activity.id ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{activity.code}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px] truncate">{activity.chapter}</td>
                      <td className="px-4 py-3 text-gray-800">{activity.description}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{activity.unit}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">{formatCOP(activity.unitPrice)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleAPU(activity)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 transition-colors"
                        >
                          {expandedId === activity.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          APU
                        </button>
                      </td>
                    </tr>
                    {expandedId === activity.id && (
                      <tr key={`apu-${activity.id}`}>
                        <td colSpan={6} className="px-6 py-4 bg-indigo-50 border-t border-indigo-100">
                          <APUDetail apu={apu} activity={activity} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
              <button
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white"
              >
                ← Anterior
              </button>
              <p className="text-xs text-gray-500">Página {page + 1} de {totalPages}</p>
              <button
                disabled={page === totalPages - 1}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white"
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function APUDetail({ apu, activity }: { apu: APU | null; activity: Activity }) {
  if (!apu) {
    return (
      <div className="text-sm text-gray-500">
        No hay APU registrado para <strong>{activity.code}</strong>. Importa el archivo APU para ver el desglose.
      </div>
    )
  }

  const sections: { label: string; items: APU['materials']; total: number }[] = [
    { label: 'Materiales', items: apu.materials, total: apu.totalMaterials },
    { label: 'Mano de obra', items: apu.labor, total: apu.totalLabor },
    { label: 'Equipos y herramienta', items: apu.equipment, total: apu.totalEquipment },
  ].filter(s => s.items.length > 0)

  return (
    <div>
      <p className="font-semibold text-indigo-800 text-sm mb-3">
        APU — {activity.description} ({activity.unit})
      </p>
      <div className="space-y-3">
        {sections.map(section => (
          <div key={section.label}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{section.label}</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left pb-1">Descripción</th>
                  <th className="text-center pb-1">Und</th>
                  <th className="text-right pb-1">Cantidad</th>
                  <th className="text-right pb-1">Costo unit.</th>
                  <th className="text-right pb-1">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-indigo-100">
                {section.items.map((item, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2 text-gray-700">{item.description}</td>
                    <td className="py-1 text-center text-gray-500">{item.unit}</td>
                    <td className="py-1 text-right text-gray-600">{formatNumber(item.quantity)}</td>
                    <td className="py-1 text-right text-gray-600">{formatCOP(item.unitCost)}</td>
                    <td className="py-1 text-right font-medium text-indigo-700">{formatCOP(item.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-1 text-right font-semibold text-gray-600">Subtotal {section.label}</td>
                  <td className="pt-1 text-right font-bold text-indigo-800">{formatCOP(section.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ))}
        <div className="flex justify-end pt-2 border-t border-indigo-200">
          <div className="text-right">
            <p className="text-xs text-gray-500">Costo directo total</p>
            <p className="text-base font-bold text-indigo-900">{formatCOP(apu.totalDirect)}</p>
            <p className="text-xs text-gray-400">Precio unitario con AIU: {formatCOP(activity.unitPrice)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
