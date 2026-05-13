import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import type { Activity, APU, APUItem, AuxAPU } from '../types'
import { parseNumber } from './format'

function normalizeRow(row: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const key of Object.keys(row)) {
    result[key.trim().toLowerCase()] = String(row[key] ?? '').trim()
  }
  return result
}

export async function parseActivitiesFile(file: File): Promise<Activity[]> {
  const data = await readFile(file)
  const activities: Activity[] = []

  for (const row of data) {
    const r = normalizeRow(row)
    const code = r['codigo'] || r['code'] || r['cod'] || ''
    const description = r['descripcion'] || r['description'] || r['actividad'] || ''
    const unit = r['unidad'] || r['unit'] || r['und'] || ''
    const unitPrice = parseNumber(r['precio unitario'] || r['preciounitario'] || r['precio'] || r['unit price'] || r['valor'] || '0')
    const chapter = r['capitulo'] || r['chapter'] || r['cap'] || r['grupo'] || 'General'

    if (!description) continue

    activities.push({ code, chapter, description, unit, unitPrice })
  }

  return activities
}

export async function parseAPUFile(file: File): Promise<{ apus: APU[]; auxApus: AuxAPU[] }> {
  const raw = await readRaw(file)
  const apus: APU[] = []
  const auxApus: AuxAPU[] = []

  // Simple flat APU format: code | description | type(M/L/E) | unit | qty | unitCost
  const data = await readFile(file)
  const grouped: Record<string, { materials: APUItem[]; labor: APUItem[]; equipment: APUItem[] }> = {}

  let currentCode = ''
  for (const row of data) {
    const r = normalizeRow(row)
    const code = r['codigo actividad'] || r['codigo'] || r['code'] || ''
    const type = (r['tipo'] || r['type'] || r['categoria'] || '').toLowerCase()
    const desc = r['descripcion'] || r['description'] || ''
    const unit = r['unidad'] || r['unit'] || r['und'] || ''
    const qty = parseNumber(r['cantidad'] || r['qty'] || r['quantity'] || '0')
    const unitCost = parseNumber(r['costo unitario'] || r['costunitario'] || r['precio'] || r['unit cost'] || '0')

    if (code) currentCode = code
    if (!currentCode || !desc) continue

    if (!grouped[currentCode]) {
      grouped[currentCode] = { materials: [], labor: [], equipment: [] }
    }

    const item: APUItem = { description: desc, unit, quantity: qty, unitCost, total: qty * unitCost }

    if (type.startsWith('m')) grouped[currentCode].materials.push(item)
    else if (type.startsWith('m') || type === 'mano de obra' || type === 'l' || type === 'labor') grouped[currentCode].labor.push(item)
    else if (type.startsWith('e') || type === 'equipo' || type === 'equipment') grouped[currentCode].equipment.push(item)
    else grouped[currentCode].materials.push(item)
  }

  for (const [activityCode, g] of Object.entries(grouped)) {
    const totalMaterials = g.materials.reduce((s, i) => s + i.total, 0)
    const totalLabor = g.labor.reduce((s, i) => s + i.total, 0)
    const totalEquipment = g.equipment.reduce((s, i) => s + i.total, 0)
    apus.push({
      activityCode,
      materials: g.materials,
      labor: g.labor,
      equipment: g.equipment,
      totalMaterials,
      totalLabor,
      totalEquipment,
      totalDirect: totalMaterials + totalLabor + totalEquipment,
    })
  }

  void raw
  return { apus, auxApus }
}

async function readFile(file: File): Promise<Record<string, unknown>[]> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'csv') {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data as Record<string, unknown>[]),
        error: reject,
      })
    })
  }

  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { defval: '' })
}

async function readRaw(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer()
}
