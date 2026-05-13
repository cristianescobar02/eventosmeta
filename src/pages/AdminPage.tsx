import { useRef, useState, useEffect } from 'react'
import { Upload, Users, CheckCircle, AlertCircle, RefreshCw, Shield } from 'lucide-react'
import { parseFullFile } from '../utils/importExcel'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type UploadStatus = 'idle' | 'loading' | 'success' | 'error'

export default function AdminPage() {
  const { profile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const laborRef = useRef<HTMLInputElement>(null)
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle')
  const [uploadMsg, setUploadMsg] = useState('')
  const [laborStatus, setLaborStatus] = useState<UploadStatus>('idle')
  const [laborMsg, setLaborMsg] = useState('')
  const [users, setUsers] = useState<Profile[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [stats, setStats] = useState({ activities: 0, apus: 0, materials: 0, labor: 0 })

  useEffect(() => {
    loadUsers()
    loadStats()
  }, [])

  async function loadUsers() {
    setLoadingUsers(true)
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
    setUsers((data as Profile[]) ?? [])
    setLoadingUsers(false)
  }

  async function loadStats() {
    const [act, apu, mat, lab] = await Promise.all([
      supabase.from('activities').select('id', { count: 'exact', head: true }),
      supabase.from('apus').select('id', { count: 'exact', head: true }),
      supabase.from('materials').select('id', { count: 'exact', head: true }),
      supabase.from('labor_prices').select('id', { count: 'exact', head: true }),
    ])
    setStats({
      activities: act.count ?? 0,
      apus: apu.count ?? 0,
      materials: mat.count ?? 0,
      labor: lab.count ?? 0,
    })
  }

  async function handleMainFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadStatus('loading')
    setUploadMsg('Procesando archivo Excel...')

    try {
      const data = await parseFullFile(file)

      if (data.activities.length === 0 && data.apus.length === 0)
        throw new Error('No se encontraron datos. Verifica las hojas del archivo.')

      // Subir actividades a Supabase (limpiar y reinsertar)
      if (data.activities.length > 0) {
        setUploadMsg(`Subiendo ${data.activities.length} actividades...`)
        await supabase.from('activities').delete().neq('id', 0)
        const chunks = chunkArray(data.activities.map(a => ({
          code: a.code, chapter: a.chapter, description: a.description,
          unit: a.unit, unit_price: a.unitPrice,
        })), 500)
        for (const chunk of chunks) {
          const { error } = await supabase.from('activities').insert(chunk)
          if (error) throw new Error(`Error insertando actividades: ${error.message}`)
        }
      }

      // Subir APU
      if (data.apus.length > 0) {
        setUploadMsg(`Subiendo ${data.apus.length} APU...`)
        await supabase.from('apus').delete().neq('id', 0)
        const chunks = chunkArray(data.apus.map(a => ({
          activity_code: a.activityCode,
          materials: a.materials,
          labor: a.labor,
          equipment: a.equipment,
          total_materials: a.totalMaterials,
          total_labor: a.totalLabor,
          total_equipment: a.totalEquipment,
          total_direct: a.totalDirect,
        })), 200)
        for (const chunk of chunks) {
          const { error } = await supabase.from('apus').insert(chunk)
          if (error) throw new Error(`Error insertando APU: ${error.message}`)
        }
      }

      // Subir APU Auxiliares
      if (data.auxApus.length > 0) {
        setUploadMsg(`Subiendo ${data.auxApus.length} APU auxiliares...`)
        await supabase.from('aux_apus').delete().neq('id', 0)
        const chunks = chunkArray(data.auxApus.map(a => ({
          code: a.code, description: a.description, unit: a.unit,
          items: a.items, total: a.total,
        })), 200)
        for (const chunk of chunks) {
          await supabase.from('aux_apus').insert(chunk)
        }
      }

      const parts = data.sheetsFound.length > 0 ? data.sheetsFound.join(' · ') : 'Datos subidos'
      setUploadStatus('success')
      setUploadMsg(parts)
      loadStats()
    } catch (err) {
      setUploadStatus('error')
      setUploadMsg(err instanceof Error ? err.message : 'Error desconocido')
    }
    e.target.value = ''
  }

  async function handleLaborFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLaborStatus('loading')
    setLaborMsg('Procesando mano de obra...')

    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

      const laborRows = rows
        .map(r => {
          const desc = String(r['DESCRIPCION'] ?? r['DESCRIPCIÓN'] ?? r['description'] ?? '').trim()
          const unit = String(r['UNIDAD'] ?? r['unit'] ?? r['UND'] ?? 'Día').trim()
          const price = parseFloat(String(r['PRECIO UNITARIO'] ?? r['PRECIO'] ?? r['price'] ?? '0').replace(/[$.,\s]/g, ''))
          const cat  = String(r['CATEGORIA'] ?? r['CATEGORÍA'] ?? r['category'] ?? 'GENERAL').trim()
          return { description: desc, unit, unit_price: isNaN(price) ? 0 : price, category: cat }
        })
        .filter(r => r.description && r.unit_price > 0)

      if (laborRows.length === 0)
        throw new Error('No se encontraron registros. Columnas: DESCRIPCION, UNIDAD, PRECIO UNITARIO')

      await supabase.from('labor_prices').delete().neq('id', 0)
      const chunks = chunkArray(laborRows, 500)
      for (const chunk of chunks) {
        const { error } = await supabase.from('labor_prices').insert(chunk)
        if (error) throw new Error(error.message)
      }

      setLaborStatus('success')
      setLaborMsg(`${laborRows.length} precios de mano de obra subidos`)
      loadStats()
    } catch (err) {
      setLaborStatus('error')
      setLaborMsg(err instanceof Error ? err.message : 'Error desconocido')
    }
    e.target.value = ''
  }

  async function changePlan(userId: string, plan: Profile['plan']) {
    const expiresAt = plan === 'free'
      ? null
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('profiles')
      .update({ plan, plan_expires_at: expiresAt })
      .eq('id', userId)
    loadUsers()
  }

  if (profile?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <Shield size={40} className="mb-3 opacity-40" />
        <p>Acceso restringido a administradores.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Panel de administrador</h2>
        <p className="text-sm text-gray-500 mt-1">Sube datos y gestiona los clientes.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Actividades', value: stats.activities },
          { label: 'APU', value: stats.apus },
          { label: 'Materiales', value: stats.materials },
          { label: 'Mano de obra', value: stats.labor },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{s.value.toLocaleString('es-CO')}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Upload: archivo principal */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Subir base de datos (Actividades + APU)</h3>
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Upload size={14} />
            Subir archivo Excel
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Archivo con hojas: <strong>ACTIVIDADES</strong>, <strong>APU</strong>, <strong>APU AUXILIARES</strong>.
          Al subir, todos los clientes verán los cambios al instante.
        </p>
        {uploadStatus !== 'idle' && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
            uploadStatus === 'loading' ? 'bg-blue-50 text-blue-700' :
            uploadStatus === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {uploadStatus === 'loading' && <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
            {uploadStatus === 'success' && <CheckCircle size={16} />}
            {uploadStatus === 'error' && <AlertCircle size={16} />}
            {uploadMsg}
          </div>
        )}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleMainFile} />
      </div>

      {/* Upload: mano de obra */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Subir precios de mano de obra</h3>
          <button onClick={() => laborRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
            <Upload size={14} />
            Subir archivo
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Columnas requeridas: <code className="bg-gray-100 px-1 rounded">DESCRIPCION</code>{' '}
          <code className="bg-gray-100 px-1 rounded">UNIDAD</code>{' '}
          <code className="bg-gray-100 px-1 rounded">PRECIO UNITARIO</code>{' '}
          <code className="bg-gray-100 px-1 rounded">CATEGORIA</code> (opcional).
          Solo accesible para clientes con plan <strong>Pro</strong>.
        </p>
        {laborStatus !== 'idle' && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
            laborStatus === 'loading' ? 'bg-blue-50 text-blue-700' :
            laborStatus === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}>
            {laborStatus === 'loading' && <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />}
            {laborStatus === 'success' && <CheckCircle size={16} />}
            {laborStatus === 'error' && <AlertCircle size={16} />}
            {laborMsg}
          </div>
        )}
        <input ref={laborRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleLaborFile} />
      </div>

      {/* Users */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-gray-500" />
            <h3 className="font-semibold text-gray-800">Clientes ({users.length})</h3>
          </div>
          <button onClick={loadUsers} className="text-gray-400 hover:text-gray-600">
            <RefreshCw size={15} />
          </button>
        </div>

        {loadingUsers ? (
          <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2" />
            Cargando...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-gray-500 font-medium text-xs">Usuario</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs">Rol</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs">Plan</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs">Vence</th>
                  <th className="text-center px-4 py-3 text-gray-500 font-medium text-xs">Cambiar plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-800">{u.full_name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {u.role === 'admin' ? 'Admin' : 'Cliente'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        u.plan === 'pro'   ? 'bg-indigo-100 text-indigo-700' :
                        u.plan === 'basic' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {u.plan === 'pro' ? 'Pro' : u.plan === 'basic' ? 'Básico' : 'Gratis'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-gray-400">
                      {u.plan_expires_at
                        ? new Date(u.plan_expires_at).toLocaleDateString('es-CO')
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {u.role !== 'admin' && (
                        <select
                          value={u.plan}
                          onChange={e => changePlan(u.id, e.target.value as Profile['plan'])}
                          className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          <option value="free">Gratis</option>
                          <option value="basic">Básico</option>
                          <option value="pro">Pro</option>
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}
