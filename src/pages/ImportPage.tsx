import { useRef, useState } from 'react'
import { Upload, CheckCircle, AlertCircle, Download, FileSpreadsheet, Info } from 'lucide-react'
import { parseFullFile, parseActivitiesFile, parseAPUFile } from '../utils/importExcel'
import { clearActivities, importActivities, importAPUs, importAuxAPUs } from '../db/database'
import * as XLSX from 'xlsx'

type Status = 'idle' | 'loading' | 'success' | 'error'

interface UploadResult {
  status: Status
  message: string
  details?: string[]
}

export default function ImportPage() {
  const mainRef  = useRef<HTMLInputElement>(null)
  const actRef   = useRef<HTMLInputElement>(null)
  const apuRef   = useRef<HTMLInputElement>(null)

  const [mainResult, setMainResult] = useState<UploadResult>({ status: 'idle', message: '' })
  const [actResult,  setActResult]  = useState<UploadResult>({ status: 'idle', message: '' })
  const [apuResult,  setApuResult]  = useState<UploadResult>({ status: 'idle', message: '' })

  // ── Opción 1: archivo completo con todas las hojas ──
  async function handleMainFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMainResult({ status: 'loading', message: 'Leyendo todas las hojas del archivo...' })
    try {
      const data = await parseFullFile(file)

      if (data.activities.length === 0 && data.apus.length === 0) {
        throw new Error(
          'No se encontraron datos. Verifica que el archivo tenga hojas llamadas ' +
          '"ACTIVIDADES" y/o "APU".'
        )
      }

      if (data.activities.length > 0) {
        await clearActivities()
        await importActivities(data.activities)
      }
      if (data.apus.length > 0)     await importAPUs(data.apus)
      if (data.auxApus.length > 0)  await importAuxAPUs(data.auxApus)

      setMainResult({
        status: 'success',
        message: `Archivo importado correctamente`,
        details: data.sheetsFound.length > 0 ? data.sheetsFound : ['Sin hojas reconocidas'],
      })
    } catch (err) {
      setMainResult({ status: 'error', message: err instanceof Error ? err.message : 'Error al procesar el archivo' })
    }
    e.target.value = ''
  }

  // ── Opción 2a: solo actividades ──
  async function handleActivities(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setActResult({ status: 'loading', message: 'Procesando actividades...' })
    try {
      const activities = await parseActivitiesFile(file)
      if (activities.length === 0)
        throw new Error('No se encontraron actividades. Verifica la hoja "ACTIVIDADES".')
      await clearActivities()
      await importActivities(activities)
      setActResult({ status: 'success', message: `${activities.length} actividades importadas`, details: [`Hoja ACTIVIDADES`] })
    } catch (err) {
      setActResult({ status: 'error', message: err instanceof Error ? err.message : 'Error al procesar' })
    }
    e.target.value = ''
  }

  // ── Opción 2b: solo APU ──
  async function handleAPU(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setApuResult({ status: 'loading', message: 'Procesando APU...' })
    try {
      const { apus, auxApus } = await parseAPUFile(file)
      if (apus.length === 0 && auxApus.length === 0)
        throw new Error('No se encontraron APU. Verifica las hojas "APU" y "APU AUXILIARES".')
      if (apus.length > 0)     await importAPUs(apus)
      if (auxApus.length > 0)  await importAuxAPUs(auxApus)
      const details = []
      if (apus.length > 0)    details.push(`APU: ${apus.length}`)
      if (auxApus.length > 0) details.push(`APU Auxiliares: ${auxApus.length}`)
      setApuResult({ status: 'success', message: 'APU importados correctamente', details })
    } catch (err) {
      setApuResult({ status: 'error', message: err instanceof Error ? err.message : 'Error al procesar' })
    }
    e.target.value = ''
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new()

    // Sheet: ACTIVIDADES
    const wsAct = XLSX.utils.aoa_to_sheet([
      ['BASE DE DATOS DE ACTIVIDADES Y PRECIOS DE OBRA', '', '', '', '', ''],
      [], [], [], [],
      ['ÍTEM', 'DESCRIPCIÓN', 'NIDA', 'ANTIDA', 'VR UNITARIO', 'VR PARCIAL'],
      ['1', 'PRELIMINARES', '', '', '', ''],
      ['1.01', 'Descapote y limpieza manual del terreno', 'm²', '1,00', 4500, 4500],
      ['1.02', 'Replanteo y localización de la obra', 'm²', '1,00', 2800, 2800],
      ['2', 'EXCAVACIONES', '', '', '', ''],
      ['2.01', 'Excavación manual en material común', 'm³', '1,00', 38000, 38000],
    ])
    wsAct['!cols'] = [{ wch: 8 }, { wch: 55 }, { wch: 8 }, { wch: 8 }, { wch: 16 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, wsAct, 'ACTIVIDADES')

    // Sheet: APU
    const wsAPU = XLSX.utils.aoa_to_sheet([
      ['BASE DE DATOS DE ANALISIS DE PRECIOS UNITARIOS', '', '', '', ''],
      [], [], [], [],
      ['1.01  Descapote y limpieza manual del terreno', '', '', '', 'UNIDAD: m²'],
      ['DESCRIPCIÓN', 'UNIDAD', 'CANT/ REND', 'PRECIO UNITARIO', 'VR PARCIAL'],
      ['EQUIPO y HERRAMIENTAS:', '', '', '', ''],
      ['Herramienta menor', 'glb', '1,00', 1200, 1200],
      ['', '', 'Subtotal =', '', 1200],
      [],
      ['MANO de OBRA:', '', '', '', ''],
      ['Cuadrilla 1 Ay', 'Día', '0,08', 85000, 6800],
      ['', '', 'Subtotal =', '', 6800],
      [],
      ['', '', '', 'VR COSTO DIRECTO =', 8000],
    ])
    wsAPU['!cols'] = [{ wch: 40 }, { wch: 8 }, { wch: 12 }, { wch: 18 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, wsAPU, 'APU')

    XLSX.writeFile(wb, 'Plantilla_PresupuestosObra.xlsx')
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Importar datos</h2>
        <p className="text-sm text-gray-500 mt-1">
          Carga tu archivo Excel con las hojas: <strong>ACTIVIDADES</strong>, <strong>APU</strong> y <strong>APU AUXILIARES</strong>.
        </p>
      </div>

      {/* Info sobre formato */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2 text-blue-800 font-semibold text-sm">
          <Info size={15} />
          Formato detectado en tu archivo
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 text-xs text-blue-700">
          <div className="bg-white rounded-lg p-3 border border-blue-100">
            <p className="font-semibold mb-1">Hoja: ACTIVIDADES</p>
            <p className="text-gray-500">Fila 6 = encabezados: ÍTEM | DESCRIPCIÓN | NIDA | ANTIDA | VR UNITARIO</p>
            <p className="text-gray-500 mt-1">Capítulos: fila con número entero en ÍTEM (1, 2, 3...)</p>
            <p className="text-gray-500">Actividades: ÍTEM con código decimal (1.01, 1.02...)</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-blue-100">
            <p className="font-semibold mb-1">Hoja: APU</p>
            <p className="text-gray-500">Bloques por actividad, detecta secciones:</p>
            <p className="text-gray-500">MATERIALES · EQUIPO y HERRAMIENTAS · MANO de OBRA</p>
            <p className="text-gray-500 mt-1">Fin de bloque: "VR COSTO DIRECTO ="</p>
          </div>
        </div>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-white border border-blue-300 rounded-lg text-xs text-blue-700 hover:bg-blue-50"
        >
          <Download size={13} />
          Descargar plantilla de ejemplo
        </button>
      </div>

      {/* ── Opción 1: archivo completo ── */}
      <div className="bg-white border-2 border-blue-600 rounded-xl p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg shrink-0">
            <FileSpreadsheet size={20} className="text-blue-700" />
          </div>
          <div>
            <p className="font-bold text-gray-800">Importar archivo completo <span className="text-blue-600">(Recomendado)</span></p>
            <p className="text-xs text-gray-500 mt-0.5">
              Sube tu archivo Excel con todas las hojas: <strong>ACTIVIDADES</strong>, <strong>APU</strong> y <strong>APU AUXILIARES</strong>.
              La app detecta y procesa cada hoja automáticamente.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <ResultBlock
            result={mainResult}
            onUpload={() => mainRef.current?.click()}
            uploadLabel="Seleccionar archivo Excel completo"
            onReimport={() => mainRef.current?.click()}
          />
          <input ref={mainRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleMainFile} />
        </div>
      </div>

      {/* ── Opción 2: hojas separadas ── */}
      <details className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <summary className="px-5 py-4 cursor-pointer text-sm font-semibold text-gray-700 hover:bg-gray-50 select-none">
          Importar hojas por separado (avanzado)
        </summary>
        <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
          <p className="text-xs text-gray-400">Usa esta opción si tienes las hojas en archivos separados.</p>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Solo hoja ACTIVIDADES</p>
            <ResultBlock
              result={actResult}
              onUpload={() => actRef.current?.click()}
              uploadLabel="Subir archivo de Actividades"
              onReimport={() => actRef.current?.click()}
            />
            <input ref={actRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleActivities} />
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Solo hojas APU / APU AUXILIARES</p>
            <ResultBlock
              result={apuResult}
              onUpload={() => apuRef.current?.click()}
              uploadLabel="Subir archivo de APU"
              onReimport={() => apuRef.current?.click()}
            />
            <input ref={apuRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleAPU} />
          </div>
        </div>
      </details>

      {/* Notas */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600">Notas:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Formato soportado: <strong>.xlsx</strong> (Excel). Evita el formato .xls antiguo si puedes.</li>
          <li>Los precios se leen en formato colombiano: <strong>$15.171,00</strong> = $15.171 COP.</li>
          <li>Al reimportar actividades se <strong>reemplaza</strong> toda la base de datos anterior.</li>
          <li>Los datos quedan guardados <strong>en el dispositivo</strong> (sin internet).</li>
        </ul>
      </div>
    </div>
  )
}

function ResultBlock({ result, onUpload, uploadLabel, onReimport }: {
  result: UploadResult
  onUpload: () => void
  uploadLabel: string
  onReimport: () => void
}) {
  if (result.status === 'idle' || result.status === 'error') {
    return (
      <div className="space-y-2">
        <button
          onClick={onUpload}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          <Upload size={16} />
          {uploadLabel}
        </button>
        {result.status === 'error' && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-red-50 rounded-lg border border-red-100">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <span className="text-xs text-red-700">{result.message}</span>
          </div>
        )}
      </div>
    )
  }

  if (result.status === 'loading') {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 rounded-lg">
        <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-blue-700">{result.message}</span>
      </div>
    )
  }

  return (
    <div className="px-4 py-3 bg-green-50 rounded-lg border border-green-100 space-y-1">
      <div className="flex items-center gap-2">
        <CheckCircle size={15} className="text-green-600 shrink-0" />
        <span className="text-sm font-medium text-green-800">{result.message}</span>
        <button onClick={onReimport} className="ml-auto text-xs text-green-600 underline shrink-0">
          Reimportar
        </button>
      </div>
      {result.details && result.details.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-5">
          {result.details.map(d => (
            <span key={d} className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">{d}</span>
          ))}
        </div>
      )}
    </div>
  )
}
