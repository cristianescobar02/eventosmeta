import * as XLSX from 'xlsx'
import type { Budget, Project } from '../types'
import { formatCOP, formatNumber } from './format'

export function exportBudgetExcel(budget: Budget, project: Project) {
  const wb = XLSX.utils.book_new()

  // ---- Hoja: Presupuesto ----
  const rows: (string | number)[][] = []

  rows.push(['PRESUPUESTO DE OBRA', '', '', '', '', '', ''])
  rows.push([`Proyecto: ${project.name}`, '', '', '', '', '', ''])
  rows.push([`Cliente: ${project.client}`, '', '', `Ubicación: ${project.location}, ${project.department}`, '', '', ''])
  rows.push([`Fecha: ${project.date}`, '', '', `Elaboró: ${budget.name}`, '', '', ''])
  rows.push([])
  rows.push(['ÍTEM', 'CÓDIGO', 'DESCRIPCIÓN', 'UND', 'CANTIDAD', 'VR. UNITARIO (COP)', 'VR. TOTAL (COP)'])

  const chapters = groupByChapter(budget.items)
  let item = 1

  for (const [chapter, items] of Object.entries(chapters)) {
    rows.push([`CAPÍTULO: ${chapter.toUpperCase()}`, '', '', '', '', '', ''])
    for (const i of items) {
      rows.push([
        item++,
        i.activityCode,
        i.description,
        i.unit,
        i.quantity,
        i.adjustedUnitPrice,
        i.total,
      ])
    }
    const chTotal = items.reduce((s, i) => s + i.total, 0)
    rows.push(['', '', '', '', '', `SUBTOTAL ${chapter.toUpperCase()}`, chTotal])
    rows.push([])
  }

  const aiuPct = budget.aiu.admin + budget.aiu.unforeseen + budget.aiu.utility
  rows.push([])
  rows.push(['', '', '', '', '', 'COSTO DIRECTO', budget.subtotal])
  rows.push(['', '', '', '', '', `AIU (${aiuPct}%)`, budget.aiuAmount])
  rows.push(['', '', '', '', '', 'VALOR TOTAL PRESUPUESTO', budget.total])

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Column widths
  ws['!cols'] = [
    { wch: 6 }, { wch: 14 }, { wch: 55 }, { wch: 8 }, { wch: 12 }, { wch: 22 }, { wch: 22 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Presupuesto')

  // ---- Hoja: Resumen ----
  const summaryRows: (string | number)[][] = [
    ['RESUMEN POR CAPÍTULOS'],
    [],
    ['CAPÍTULO', 'VALOR (COP)', '% PARTICIPACIÓN'],
  ]

  for (const [chapter, items] of Object.entries(chapters)) {
    const chTotal = items.reduce((s, i) => s + i.total, 0)
    const pct = budget.subtotal > 0 ? (chTotal / budget.subtotal) * 100 : 0
    summaryRows.push([chapter, chTotal, `${formatNumber(pct, 1)}%`])
  }

  summaryRows.push([])
  summaryRows.push(['COSTO DIRECTO', budget.subtotal, '100%'])
  summaryRows.push([`AIU (Admin ${budget.aiu.admin}% / Imprevistos ${budget.aiu.unforeseen}% / Utilidad ${budget.aiu.utility}%)`, budget.aiuAmount, ''])
  summaryRows.push(['VALOR TOTAL PRESUPUESTO', budget.total, ''])

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
  wsSummary['!cols'] = [{ wch: 50 }, { wch: 22 }, { wch: 16 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen')

  XLSX.writeFile(wb, `Presupuesto_${project.name.replace(/\s+/g, '_')}.xlsx`)
}

function groupByChapter(items: Budget['items']) {
  const chapters: Record<string, Budget['items']> = {}
  for (const item of items) {
    const ch = item.chapter || 'General'
    if (!chapters[ch]) chapters[ch] = []
    chapters[ch].push(item)
  }
  return chapters
}

void formatCOP
void formatNumber
