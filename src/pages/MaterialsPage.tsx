import { useEffect, useState, useCallback } from 'react'
import { Search, X, Lock } from 'lucide-react'
import { supabase, canUseMaterials } from '../lib/supabase'
import { formatCOP } from '../utils/format'
import { useAuth } from '../contexts/AuthContext'
import type { NavPage } from '../types'

interface Material {
  id: number
  description: string
  unit: string
  unit_price: number
  category: string
}

interface LaborPrice {
  id: number
  description: string
  unit: string
  unit_price: number
  category: string
}

type Tab = 'materials' | 'labor'

interface Props {
  onNavigate: (p: NavPage) => void
}

export default function MaterialsPage({ onNavigate }: Props) {
  const { profile } = useAuth()
  const plan = profile?.plan ?? 'free'
  const hasAccess = canUseMaterials(plan) || profile?.role === 'admin'
  const [tab, setTab] = useState<Tab>('materials')
  const [items, setItems] = useState<(Material | LaborPrice)[]>([])
  const [filtered, setFiltered] = useState<(Material | LaborPrice)[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('')
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (t: Tab) => {
    setLoading(true)
    const table = t === 'materials' ? 'materials' : 'labor_prices'
    const { data } = await supabase.from(table).select('*').order('description')
    const all = (data ?? []) as Material[]
    setItems(all)
    setFiltered(all)
    setCategories([...new Set(all.map(i => i.category))].sort())
    setLoading(false)
  }, [])

  useEffect(() => { if (hasAccess) load(tab) }, [tab, hasAccess, load])

  const applyFilters = useCallback((q: string, c: string) => {
    const lower = q.toLowerCase()
    setFiltered(items.filter(i => {
      const matchCat = !c || i.category === c
      const matchQ = !q || i.description.toLowerCase().includes(lower)
      return matchCat && matchQ
    }))
  }, [items])

  useEffect(() => { applyFilters(search, cat) }, [search, cat, applyFilters])

  if (!hasAccess) {
    return (
      <div className="max-w-lg mx-auto mt-12 text-center">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock size={28} className="text-indigo-600" />
          </div>
          <h2 className="font-bold text-gray-800 text-lg">Función exclusiva del plan Pro</h2>
          <p className="text-gray-500 text-sm mt-2">
            Accede a la base de datos completa de materiales, equipos y precios de mano de obra
            actualizada para Colombia.
          </p>
          <button
            onClick={() => onNavigate('pricing')}
            className="mt-6 px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700"
          >
            Ver plan Pro →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        {(['materials', 'labor'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setSearch(''); setCat('') }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {t === 'materials' ? 'Materiales y equipos' : 'Mano de obra'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Buscar ${tab === 'materials' ? 'material o equipo' : 'mano de obra'}...`}
            className="w-full pl-9 pr-8 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <X size={14} />
            </button>
          )}
        </div>
        {categories.length > 0 && (
          <select
            value={cat}
            onChange={e => setCat(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">Todas las categorías</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      <p className="text-xs text-gray-500">{filtered.length} registros</p>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
          Cargando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
          <p className="text-sm">
            {items.length === 0
              ? 'No hay datos cargados aún. El administrador debe subir la base de precios.'
              : 'No se encontraron resultados.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Descripción</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Und</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Precio unitario</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Categoría</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(item => (
                <tr key={item.id} className="hover:bg-indigo-50 transition-colors">
                  <td className="px-4 py-3 text-gray-800">{item.description}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{item.unit}</td>
                  <td className="px-4 py-3 text-right font-semibold text-indigo-700">{formatCOP(item.unit_price)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{item.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
