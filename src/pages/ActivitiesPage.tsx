import { useEffect, useState, useCallback } from 'react'
import { Search, ChevronDown, ChevronUp, X, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { canUseAuxAPU } from '../lib/supabase'
import type { APU } from '../types'
import { formatCOP, formatNumber } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'

interface Activity {
  id: number
  code: string
  chapter: string
  description: string
  unit: string
  unit_price: number
}

export default function ActivitiesPage() {
  const { profile } = useAuth()
  const [activities, setActivities] = useState<Activity[]>([])
  const [filtered, setFiltered] = useState<Activity[]>([])
  const [chapters, setChapters] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [selectedChapter, setSelectedChapter] = useState('')
  const [expandedCode, setExpandedCode] = useState<string | null>(null)
  const [apu, setApu] = useState<APU | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('activities')
        .select('id, code, chapter, description, unit, unit_price')
        .order('chapter')
        .order('code')
      const all = (data ?? []) as Activity[]
      setActivities(all)
      setFiltered(all)
      setChapters([...new Set(all.map(a => a.chapter))].sort())
      setLoading(false)
    }
    load()
  }, [])

  const applyFilters = useCallback((q: string, chapter: string) => {
    const lower = q.toLowerCase()
    const result = activities.filter(a => {
      const matchChapter = !chapter || a.chapter === chapter
      const matchSearch  = !q || a.description.toLowerCase().includes(lower) || a.code.toLowerCase().includes(lower)
      return matchChapter && matchSearch
    })
    setFiltered(result)
    setPage(0)
  }, [activities])

  useEffect(() => { applyFilters(search, selectedChapter) }, [search, selectedChapter, applyFilters])

  async function toggleAPU(code: string) {
    if (expandedCode === code) { setExpandedCode(null); setApu(null); return }
    setExpandedCode(code)
    const { data } = await supabase
      .from('apus')
      .select('*')
      .eq('activity_code', code)
      .single()
    setApu(data ? {
      activityCode: data.activity_code,
      materials:    data.materials    ?? [],
      labor:        data.labor        ?? [],
      equipment:    data.equipment    ?? [],
      totalMaterials:  data.total_materials,
      totalLabor:      data.total_labor,
      totalEquipment:  data.total_equipment,
      totalDirect:     data.total_direct,
    } : null)
  }

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const plan = profile?.plan ?? 'free'

  if (loading) return (
    <div className="flex items-center justify-center py-24 text-gray-400">
      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
      Cargando actividades...
    </div>
  )

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
            className="w-full pl-9 pr-8 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
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

      <p className="text-xs text-gray-500">
        Mostrando {paginated.length} de {filtered.length} actividades
        {filtered.length !== activities.length && ` (total: ${activities.length})`}
      </p>

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
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Código</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Capítulo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Descripción</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Und</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Precio unit.</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">APU</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.map(activity => (
                  <>
                    <tr
                      key={activity.id}
                      className={`hover:bg-blue-50 transition-colors ${expandedCode === activity.code ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{activity.code}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px] truncate">{activity.chapter}</td>
                      <td className="px-4 py-3 text-gray-800">{activity.description}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{activity.unit}</td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-700">{formatCOP(activity.unit_price)}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => toggleAPU(activity.code)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 transition-colors"
                        >
                          {expandedCode === activity.code ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          APU
                        </button>
                      </td>
                    </tr>
                    {expandedCode === activity.code && (
                      <tr key={`apu-${activity.id}`}>
                        <td colSpan={6} className="px-6 py-4 bg-indigo-50 border-t border-indigo-100">
                          <APUDetail
                            apu={apu}
                            activity={{ description: activity.description, unit: activity.unit, unitPrice: activity.unit_price, code: activity.code }}
                            canSeeAux={canUseAuxAPU(plan)}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white">
                ← Anterior
              </button>
              <p className="text-xs text-gray-500">Página {page + 1} de {totalPages}</p>
              <button disabled={page === totalPages - 1} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-white">
                Siguiente →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function APUDetail({ apu, activity, canSeeAux }: {
  apu: APU | null
  activity: { description: string; unit: string; unitPrice: number; code: string }
  canSeeAux: boolean
}) {
  if (!apu) return (
    <p className="text-sm text-gray-500">
      No hay APU registrado para <strong>{activity.code}</strong>.
      {!canSeeAux && (
        <span className="ml-2 inline-flex items-center gap-1 text-indigo-500">
          <Lock size={12} /> APU Auxiliares disponibles en plan Pro
        </span>
      )}
    </p>
  )

  const sections: { label: string; items: APU['materials']; total: number }[] = [
    { label: 'Materiales',          items: apu.materials, total: apu.totalMaterials },
    { label: 'Mano de obra',        items: apu.labor,     total: apu.totalLabor },
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
                  <td colSpan={4} className="pt-1 text-right font-semibold text-gray-600">
                    Subtotal {section.label}
                  </td>
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
            <p className="text-xs text-gray-400">Precio unitario (todo costo): {formatCOP(activity.unitPrice)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
