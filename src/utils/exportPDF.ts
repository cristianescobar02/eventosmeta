import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Budget, Project } from '../types'
import { formatCOP, formatNumber } from './format'

export function exportBudgetPDF(budget: Budget, project: Project) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' })

  // Header
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('PRESUPUESTO DE OBRA', 148.5, 15, { align: 'center' })

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(`Proyecto: ${project.name}`, 15, 25)
  doc.text(`Cliente: ${project.client}`, 15, 30)
  doc.text(`Ubicación: ${project.location}, ${project.department}`, 15, 35)
  doc.text(`Fecha: ${project.date ? new Date(project.date).toLocaleDateString('es-CO') : ''}`, 15, 40)
  doc.text(`Elaboró: ${budget.name}`, 150, 25)

  const chapters = groupByChapter(budget.items)

  let startY = 48
  let chapterNum = 1

  for (const [chapter, items] of Object.entries(chapters)) {
    const chapterTotal = items.reduce((s, i) => s + i.total, 0)

    autoTable(doc, {
      startY,
      head: [[
        { content: `CAPÍTULO ${chapterNum}: ${chapter.toUpperCase()}`, colSpan: 7, styles: { fillColor: [30, 64, 120], textColor: 255, fontStyle: 'bold', fontSize: 8 } }
      ]],
      body: [],
      theme: 'plain',
      margin: { left: 15, right: 15 },
    })

    startY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

    autoTable(doc, {
      startY,
      head: [[
        { content: 'Ítem', styles: { halign: 'center', fillColor: [220, 230, 242] } },
        { content: 'Código', styles: { halign: 'center', fillColor: [220, 230, 242] } },
        { content: 'Descripción', styles: { halign: 'left', fillColor: [220, 230, 242] } },
        { content: 'Und', styles: { halign: 'center', fillColor: [220, 230, 242] } },
        { content: 'Cantidad', styles: { halign: 'right', fillColor: [220, 230, 242] } },
        { content: 'Vr. Unitario', styles: { halign: 'right', fillColor: [220, 230, 242] } },
        { content: 'Vr. Total', styles: { halign: 'right', fillColor: [220, 230, 242] } },
      ]],
      body: [
        ...items.map((item, idx) => [
          String(idx + 1),
          item.activityCode,
          item.description,
          item.unit,
          formatNumber(item.quantity),
          formatCOP(item.adjustedUnitPrice),
          formatCOP(item.total),
        ]),
        [
          { content: `SUBTOTAL CAPÍTULO ${chapterNum}`, colSpan: 6, styles: { fontStyle: 'bold', halign: 'right', fillColor: [240, 245, 255] } },
          { content: formatCOP(chapterTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: [240, 245, 255] } },
        ],
      ],
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 22, halign: 'center' },
        2: { cellWidth: 'auto', halign: 'left' },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 30, halign: 'right' },
        6: { cellWidth: 32, halign: 'right' },
      },
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fontStyle: 'bold', fontSize: 7.5, textColor: [30, 40, 80] },
      theme: 'grid',
      margin: { left: 15, right: 15 },
    })

    startY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 2
    chapterNum++
  }

  // Resumen AIU
  const { subtotal, aiu, aiuAmount, total } = budget
  const aiuPct = aiu.admin + aiu.unforeseen + aiu.utility

  autoTable(doc, {
    startY: startY + 4,
    body: [
      [{ content: 'COSTO DIRECTO', colSpan: 2, styles: { fontStyle: 'bold' } }, formatCOP(subtotal)],
      [`AIU (${aiuPct}%)`, `A: ${aiu.admin}% / I: ${aiu.unforeseen}% / U: ${aiu.utility}%`, formatCOP(aiuAmount)],
      [{ content: 'VALOR TOTAL PRESUPUESTO', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [30, 64, 120], textColor: 255 } }, { content: formatCOP(total), styles: { fontStyle: 'bold', fillColor: [30, 64, 120], textColor: 255 } }],
    ],
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 80 },
      2: { cellWidth: 40, halign: 'right' },
    },
    styles: { fontSize: 8 },
    theme: 'grid',
    margin: { left: 15, right: 15 },
  })

  addPageNumbers(doc)
  doc.save(`Presupuesto_${project.name.replace(/\s+/g, '_')}.pdf`)
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

function addPageNumbers(doc: jsPDF) {
  const total = (doc as jsPDF & { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(`Página ${i} de ${total}`, 270, 205, { align: 'right' })
  }
}
