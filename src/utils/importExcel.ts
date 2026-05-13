import * as XLSX from 'xlsx'
import type { Activity, APU, APUItem, AuxAPU } from '../types'

// Colombian number format: "15.171,00" = 15171.00, "0,0013" = 0.0013
function parseColNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return isNaN(value) ? 0 : value

  let s = String(value).trim().replace(/[$\s]/g, '')
  if (!s) return 0

  // Both . and , present → . is thousands, , is decimal → "15.171,00"
  if (s.includes('.') && s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  }
  // Only comma present
  else if (s.includes(',') && !s.includes('.')) {
    const afterComma = s.slice(s.lastIndexOf(',') + 1)
    if (afterComma.length <= 2) s = s.replace(',', '.') // decimal comma
    else s = s.replace(/,/g, '') // thousands comma
  }
  // Only dot present: if integer part > 0 and exactly 3 decimal digits → thousands ("15.171")
  else if (s.includes('.')) {
    const parts = s.split('.')
    if (parts.length === 2 && parts[1].length === 3 && parseInt(parts[0]) > 0) {
      s = parts[0] + parts[1] // "15.171" → "15171"
    }
    // else leave as decimal "0.0013"
  }

  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function str(v: unknown): string {
  return String(v ?? '').trim()
}

// ─────────────────────────────────────────────
// Parse ACTIVIDADES sheet
// Structure:
//   rows 1-5  → title/logo
//   row 6     → headers (ÍTEM, DESCRIPCIÓN, NIDA, ANTIDA, VR UNITARIO, VR PARCIAL)
//   row 7+    → data:
//     chapter row : col A = "1" | "2" | "3"..., col B = "PRELIMINARES"
//     activity row: col A = "1.01" | "1.02"..., col B = description
// ─────────────────────────────────────────────
export function parseActivitiesSheet(ws: XLSX.WorkSheet): Activity[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  const activities: Activity[] = []
  let currentChapter = 'GENERAL'

  for (let i = 6; i < rows.length; i++) {
    const row = rows[i]
    const itemVal = str(row[0])
    const desc    = str(row[1])
    const unit    = str(row[2])
    const price   = parseColNumber(row[4]) // VR UNITARIO (col E, index 4)

    if (!desc) continue

    // Chapter row: A is a whole integer like "1", "2"
    if (/^\d+$/.test(itemVal) && desc) {
      currentChapter = desc
      continue
    }

    // Activity row: A has decimal like "1.01", "2.03"
    if (/^\d+\.\d+/.test(itemVal) && desc) {
      activities.push({
        code: itemVal,
        chapter: currentChapter,
        description: desc,
        unit,
        unitPrice: price,
      })
    }
  }

  return activities
}

// ─────────────────────────────────────────────
// Parse APU sheet
// Structure per activity block:
//   header row : col A = "1.01  Nombre actividad" (colored), col E = "UNIDAD: m3"
//   col-header row: DESCRIPCIÓN | UNIDAD | CANT/REND | PRECIO UNITARIO | VR PARCIAL
//   section rows: "MATERIALES:" | "EQUIPO y HERRAMIENTAS:" | "MANO de OBRA:" | "TRANSPORTES:"
//   item rows  : description | unit | qty | unit_cost | total
//   subtotal   : blank | blank | "Subtotal =" | blank | $value
//   end row    : blank | blank | blank | "VR COSTO DIRECTO =" | $value
// ─────────────────────────────────────────────
export function parseAPUSheet(ws: XLSX.WorkSheet): APU[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  const apus: APU[] = []

  let current: APU | null = null
  type Section = 'materials' | 'labor' | 'equipment'
  let section: Section = 'materials'

  function saveAndReset() {
    if (!current) return
    current.totalMaterials = current.materials.reduce((s, i) => s + i.total, 0)
    current.totalLabor     = current.labor.reduce((s, i) => s + i.total, 0)
    current.totalEquipment = current.equipment.reduce((s, i) => s + i.total, 0)
    if (current.totalDirect === 0)
      current.totalDirect = current.totalMaterials + current.totalLabor + current.totalEquipment
    apus.push(current)
    current = null
  }

  for (let i = 5; i < rows.length; i++) {
    const row = rows[i]
    const colA = str(row[0])
    const colB = str(row[1])
    const colC = str(row[2])
    const colD = str(row[3])
    const colE = str(row[4])

    // APU header row: col A starts with code like "1.01 ..." AND (col D or E contains "UNIDAD")
    const hasUnit = colD.toUpperCase().includes('UNIDAD') || colE.toUpperCase().includes('UNIDAD')
    if (/^\d+\.\d+/.test(colA) && hasUnit) {
      saveAndReset()
      const match = colA.match(/^(\d+\.\d+)\s*(.*)/)
      current = {
        activityCode: match ? match[1].trim() : colA,
        materials: [], labor: [], equipment: [],
        totalMaterials: 0, totalLabor: 0, totalEquipment: 0, totalDirect: 0,
      }
      section = 'materials'
      continue
    }

    if (!current) continue

    const colAUp = colA.toUpperCase()
    const colCUp = colC.toUpperCase()
    const colDUp = colD.toUpperCase()

    // Section headers
    if (colAUp.startsWith('MATERIAL'))                  { section = 'materials'; continue }
    if (colAUp.includes('EQUIPO') || colAUp.includes('HERRAMIENTA')) { section = 'equipment'; continue }
    if (colAUp.includes('MANO') || colAUp.startsWith('LABOR'))       { section = 'labor';     continue }
    if (colAUp.includes('TRANSPORT'))                   { section = 'equipment'; continue } // treat as equipment

    // VR COSTO DIRECTO row → end of APU
    if (colCUp.includes('VR COSTO DIRECTO') || colDUp.includes('VR COSTO DIRECTO') || colAUp.includes('VR COSTO DIRECTO')) {
      const total = parseColNumber(row[4]) || parseColNumber(row[3])
      current.totalDirect = total
      continue
    }

    // Skip: subtotal rows, header rows, empty rows
    if (colCUp.includes('SUBTOTAL') || colDUp.includes('SUBTOTAL')) continue
    if (colA === 'DESCRIPCIÓN' || colA === 'DESCRIPCION') continue
    if (!colA) continue

    // Item row: must have a quantity and unit cost
    const qty      = parseColNumber(row[2]) // CANT/REND
    const unitCost = parseColNumber(row[3]) // PRECIO UNITARIO
    const total    = parseColNumber(row[4]) // VR PARCIAL

    if (qty === 0 && unitCost === 0) continue

    const item: APUItem = {
      description: colA,
      unit: colB,
      quantity: qty,
      unitCost,
      total: total || qty * unitCost,
    }

    if (section === 'materials')  current.materials.push(item)
    else if (section === 'labor') current.labor.push(item)
    else                          current.equipment.push(item)
  }

  saveAndReset()
  return apus
}

// ─────────────────────────────────────────────
// Parse APU AUXILIARES sheet
// Same structure as APU but:
//   header row: col A = "ANDAMIO TUBULAR..." (no numeric code prefix)
//               col D or E = "UNIDAD: Día"
//   end row: "VR UNITARIO =" (not "VR COSTO DIRECTO")
// ─────────────────────────────────────────────
export function parseAuxAPUSheet(ws: XLSX.WorkSheet): AuxAPU[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  const auxApus: AuxAPU[] = []

  let current: AuxAPU | null = null
  let currentItems: APUItem[] = []

  function save() {
    if (!current) return
    current.items = currentItems
    current.total = currentItems.reduce((s, i) => s + i.total, 0)
    auxApus.push(current)
    current = null
    currentItems = []
  }

  for (let i = 5; i < rows.length; i++) {
    const row = rows[i]
    const colA = str(row[0])
    const colB = str(row[1])
    const colD = str(row[3])
    const colE = str(row[4])

    // Header row: col A has a description (non-empty, no leading digit+dot) AND col D or E has "UNIDAD"
    const hasUnit = colD.toUpperCase().includes('UNIDAD') || colE.toUpperCase().includes('UNIDAD')
    if (colA && hasUnit && !/^\d+\.\d+/.test(colA)) {
      save()
      // Extract unit from "UNIDAD: Día"
      const unitMatch = (colD + colE).match(/UNIDAD[:\s]+(.+)/i)
      current = {
        code: colA.slice(0, 60),
        description: colA,
        unit: unitMatch ? unitMatch[1].trim() : '',
        items: [],
        total: 0,
      }
      continue
    }

    if (!current) continue

    const colAUp = colA.toUpperCase()
    const colCUp = str(row[2]).toUpperCase()

    // Section headers → skip
    if (colAUp.includes('EQUIPO') || colAUp.includes('HERRAMIENTA') ||
        colAUp.includes('MATERIAL') || colAUp.includes('MANO') ||
        colAUp.includes('TRANSPORT')) continue

    // VR UNITARIO = end row
    if (colCUp.includes('VR UNITARIO') || colAUp.includes('VR UNITARIO')) {
      const t = parseColNumber(row[4]) || parseColNumber(row[3])
      if (current) current.total = t
      continue
    }

    // Skip subtotal and header rows
    if (colCUp.includes('SUBTOTAL') || colA === 'DESCRIPCIÓN' || colA === 'DESCRIPCION' || !colA) continue

    const qty      = parseColNumber(row[2])
    const unitCost = parseColNumber(row[3])
    const total    = parseColNumber(row[4])

    if (qty === 0 && unitCost === 0) continue

    currentItems.push({
      description: colA,
      unit: colB,
      quantity: qty,
      unitCost,
      total: total || qty * unitCost,
    })
  }

  save()
  return auxApus
}

// ─────────────────────────────────────────────
// Auto-detect and parse all sheets from ONE file
// ─────────────────────────────────────────────
export interface ParsedData {
  activities: Activity[]
  apus: APU[]
  auxApus: AuxAPU[]
  sheetsFound: string[]
}

export async function parseFullFile(file: File): Promise<ParsedData> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })

  const result: ParsedData = { activities: [], apus: [], auxApus: [], sheetsFound: [] }

  for (const sheetName of wb.SheetNames) {
    const upper = sheetName.toUpperCase()
    const ws = wb.Sheets[sheetName]

    if (upper.includes('ACTIVIDAD')) {
      result.activities = parseActivitiesSheet(ws)
      if (result.activities.length > 0) result.sheetsFound.push(`Actividades (${result.activities.length})`)
    } else if (upper === 'APU' || upper.includes('ANALISIS') || upper.includes('ANÁLISIS')) {
      result.apus = parseAPUSheet(ws)
      if (result.apus.length > 0) result.sheetsFound.push(`APU (${result.apus.length})`)
    } else if (upper.includes('AUXILIAR')) {
      result.auxApus = parseAuxAPUSheet(ws)
      if (result.auxApus.length > 0) result.sheetsFound.push(`APU Auxiliares (${result.auxApus.length})`)
    }
  }

  return result
}

// ─────────────────────────────────────────────
// Legacy single-sheet parsers (kept for separate-file uploads)
// ─────────────────────────────────────────────
export async function parseActivitiesFile(file: File): Promise<Activity[]> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  // Find ACTIVIDADES sheet first, fallback to first sheet
  const sheetName = wb.SheetNames.find(n => n.toUpperCase().includes('ACTIVIDAD')) ?? wb.SheetNames[0]
  return parseActivitiesSheet(wb.Sheets[sheetName])
}

export async function parseAPUFile(file: File): Promise<{ apus: APU[]; auxApus: AuxAPU[] }> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })

  let apus: APU[] = []
  let auxApus: AuxAPU[] = []

  for (const sheetName of wb.SheetNames) {
    const upper = sheetName.toUpperCase()
    const ws = wb.Sheets[sheetName]
    if (upper === 'APU' || (upper.includes('APU') && !upper.includes('AUXILIAR'))) {
      apus = parseAPUSheet(ws)
    } else if (upper.includes('AUXILIAR')) {
      auxApus = parseAuxAPUSheet(ws)
    }
  }

  return { apus, auxApus }
}
