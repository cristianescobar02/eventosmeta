import { useRef, useState } from 'react'
import { Upload, CheckCircle, AlertCircle, Download, FileSpreadsheet } from 'lucide-react'
import { parseActivitiesFile, parseAPUFile } from '../utils/importExcel'
import { clearActivities, importActivities, importAPUs, importAuxAPUs } from '../db/database'
import * as XLSX from 'xlsx'

type Status = 'idle' | 'loading' | 'success' | 'error'

interface UploadState {
  status: Status
  message: string
  count?: number
}

export default function ImportPage() {
  const actRef = useRef<HTMLInputElement>(null)
  const apuRef = useRef<HTMLInputElement>(null)
  const auxRef = useRef<HTMLInputElement>(null)

  const [actState, setActState] = useState<UploadState>({ status: 'idle', message: '' })
  const [apuState, setApuState] = useState<UploadState>({ status: 'idle', message: '' })
  const [auxState, setAuxState] = useState<UploadState>({ status: 'idle', message: '' })

  async function handleActivities(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setActState({ status: 'loading', message: 'Procesando archivo...' })
    try {
      const activities = await parseActivitiesFile(file)
      if (activities.length === 0) throw new Error('No se encontraron actividades. Verifica que el archivo tenga las columnas correctas.')
      await clearActivities()
      await importActivities(activities)
      setActState({ status: 'success', message: `${activities.length} actividades importadas correctamente`, count: activities.length })
    } catch (err) {
      setActState({ status: 'error', message: err instanceof Error ? err.message : 'Error al procesar el archivo' })
    }
    e.target.value = ''
  }

  async function handleAPU(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setApuState({ status: 'loading', message: 'Procesando APU...' })
    try {
      const { apus } = await parseAPUFile(file)
      await importAPUs(apus)
      setApuState({ status: 'success', message: `${apus.length} APU importados correctamente`, count: apus.length })
    } catch (err) {
      setApuState({ status: 'error', message: err instanceof Error ? err.message : 'Error al procesar el archivo' })
    }
    e.target.value = ''
  }

  async function handleAuxAPU(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAuxState({ status: 'loading', message: 'Procesando APU auxiliares...' })
    try {
      const { auxApus } = await parseAPUFile(file)
      await importAuxAPUs(auxApus)
      setAuxState({ status: 'success', message: `${auxApus.length} APU auxiliares importados`, count: auxApus.length })
    } catch (err) {
      setAuxState({ status: 'error', message: err instanceof Error ? err.message : 'Error al procesar el archivo' })
    }
    e.target.value = ''
  }

  function downloadTemplate(type: 'activities' | 'apu') {
    const wb = XLSX.utils.book_new()

    if (type === 'activities') {
      const ws = XLSX.utils.aoa_to_sheet([
        ['CODIGO', 'CAPITULO', 'DESCRIPCION', 'UNIDAD', 'PRECIO UNITARIO'],
        ['01.01.001', 'PRELIMINARES', 'Descapote y limpieza manual del terreno', 'm²', 4500],
        ['01.01.002', 'PRELIMINARES', 'Replanteo y localización de la obra', 'm²', 2800],
        ['02.01.001', 'EXCAVACIONES', 'Excavación manual en material común', 'm³', 38000],
      ])
      ws['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 55 }, { wch: 10 }, { wch: 18 }]
      XLSX.utils.book_append_sheet(wb, ws, 'Actividades')
    } else {
      const ws = XLSX.utils.aoa_to_sheet([
        ['CODIGO ACTIVIDAD', 'DESCRIPCION', 'TIPO', 'UNIDAD', 'CANTIDAD', 'COSTO UNITARIO'],
        ['01.01.001', 'Herramienta menor', 'E', 'glb', 1, 1200],
        ['01.01.001', 'Palin', 'E', 'und', 0.05, 45000],
        ['01.01.001', 'Obrero', 'L', 'jor', 0.08, 85000],
        ['', '', '', '', '', ''],
        ['01.01.002', 'Estacas de madera', 'M', 'und', 4, 1500],
        ['01.01.002', 'Topógrafo', 'L', 'hr', 0.5, 45000],
      ])
      ws['!cols'] = [{ wch: 18 }, { wch: 35 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 16 }]
      XLSX.utils.book_append_sheet(wb, ws, 'APU')
    }

    XLSX.writeFile(wb, `Plantilla_${type === 'activities' ? 'Actividades' : 'APU'}.xlsx`)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Importar datos</h2>
        <p className="text-sm text-gray-500 mt-1">
          Carga tus archivos Excel o CSV con actividades, APU y precios de mano de obra.
        </p>
      </div>

      {/* Plantillas */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-blue-800 mb-3">Descargar plantillas de ejemplo</p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => downloadTemplate('activities')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-300 rounded-lg text-sm text-blue-700 hover:bg-blue-50"
          >
            <Download size={14} />
            Plantilla Actividades
          </button>
          <button
            onClick={() => downloadTemplate('apu')}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-blue-300 rounded-lg text-sm text-blue-700 hover:bg-blue-50"
          >
            <Download size={14} />
            Plantilla APU
          </button>
        </div>
      </div>

      {/* Upload: Actividades */}
      <UploadCard
        title="1. Actividades y precios unitarios"
        description="Archivo con código, capítulo, descripción, unidad y precio unitario todo costo de cada actividad."
        columns={['CODIGO', 'CAPITULO', 'DESCRIPCION', 'UNIDAD', 'PRECIO UNITARIO']}
        state={actState}
        inputRef={actRef}
        onChange={handleActivities}
      />

      {/* Upload: APU */}
      <UploadCard
        title="2. Análisis de Precios Unitarios (APU)"
        description="Archivo con el desglose de materiales (M), mano de obra (L) y equipos (E) por actividad."
        columns={['CODIGO ACTIVIDAD', 'DESCRIPCION', 'TIPO (M/L/E)', 'UNIDAD', 'CANTIDAD', 'COSTO UNITARIO']}
        state={apuState}
        inputRef={apuRef}
        onChange={handleAPU}
      />

      {/* Upload: APU Auxiliares */}
      <UploadCard
        title="3. APU Auxiliares (opcional)"
        description="Archivo con APU auxiliares para insumos compuestos como mezclas, morteros, etc."
        columns={['CODIGO', 'DESCRIPCION', 'TIPO (M/L/E)', 'UNIDAD', 'CANTIDAD', 'COSTO UNITARIO']}
        state={auxState}
        inputRef={auxRef}
        onChange={handleAuxAPU}
      />

      {/* Formato info */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600">Notas importantes:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Formatos soportados: <strong>.xlsx</strong>, <strong>.xls</strong>, <strong>.csv</strong></li>
          <li>Los nombres de columna no distinguen mayúsculas/minúsculas</li>
          <li>Los precios deben estar en <strong>COP (pesos colombianos)</strong> sin separadores de miles</li>
          <li>Al reimportar actividades se <strong>reemplaza</strong> toda la base de datos de actividades</li>
          <li>Para el APU, el campo TIPO puede ser: <strong>M</strong>=Material, <strong>L</strong>=Mano de obra, <strong>E</strong>=Equipo</li>
        </ul>
      </div>
    </div>
  )
}

interface UploadCardProps {
  title: string
  description: string
  columns: string[]
  state: UploadState
  inputRef: React.RefObject<HTMLInputElement | null>
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

function UploadCard({ title, description, columns, state, inputRef, onChange }: UploadCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-blue-100 rounded-lg shrink-0">
          <FileSpreadsheet size={18} className="text-blue-700" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-800 text-sm">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {columns.map((c) => (
              <span key={c} className="px-2 py-0.5 bg-gray-100 rounded text-xs font-mono text-gray-600">{c}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        {state.status === 'idle' || state.status === 'error' ? (
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            <Upload size={16} />
            Seleccionar archivo .xlsx / .csv
          </button>
        ) : null}

        {state.status === 'loading' && (
          <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 rounded-lg">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-blue-700">{state.message}</span>
          </div>
        )}

        {state.status === 'success' && (
          <div className="flex items-center gap-2 px-4 py-3 bg-green-50 rounded-lg">
            <CheckCircle size={16} className="text-green-600 shrink-0" />
            <span className="text-sm text-green-700">{state.message}</span>
            <button onClick={() => inputRef.current?.click()} className="ml-auto text-xs text-green-600 underline">
              Reimportar
            </button>
          </div>
        )}

        {state.status === 'error' && (
          <div className="flex items-start gap-2 px-4 py-3 bg-red-50 rounded-lg">
            <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <span className="text-sm text-red-700">{state.message}</span>
          </div>
        )}

        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onChange} />
      </div>
    </div>
  )
}
