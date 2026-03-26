// generate-pdf.ts
// Uses jsPDF + autoTable — install: npm install jspdf jspdf-autotable
import type { ExportConfig, ExportData } from './data-fetcher'
import { fmt$, fmtPct, safeN } from './data-fetcher'

export async function generatePDF(config: ExportConfig, dataByRestaurant: ExportData[]) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const primary = '#' + config.template.colorPrimary
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '')
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }

  const [pr, pg, pb] = hexToRgb(primary)

  function addPageHeader(title: string, subtitle: string) {
    doc.setFillColor(pr, pg, pb)
    doc.rect(0, 0, pageW, 16, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(title, 8, 11)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(subtitle, pageW - 8, 11, { align: 'right' })
  }

  function addKPIRow(items: { label: string; value: string; color?: string }[], y: number) {
    const w = (pageW - 16) / items.length
    items.forEach((item, i) => {
      const x = 8 + i * w
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(x, y, w - 2, 18, 2, 2, 'F')
      doc.setTextColor(107, 114, 128)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text(item.label, x + 3, y + 6)
      if (item.color) {
        const [cr, cg, cb] = hexToRgb(item.color)
        doc.setTextColor(cr, cg, cb)
      } else {
        doc.setTextColor(17, 24, 39)
      }
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text(item.value, x + 3, y + 14)
      doc.setTextColor(17, 24, 39)
    })
  }

  function addNote(note: string) {
    if (!note) return
    doc.setFillColor(254, 243, 199)
    doc.rect(0, pageH - 12, pageW, 12, 'F')
    doc.setTextColor(146, 64, 14)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('📝 ' + note, 8, pageH - 4)
  }

  const weekRange = config.weeks.length === 1
    ? config.weeks[0]
    : `${config.weeks[0]} → ${config.weeks[config.weeks.length - 1]}`

  let isFirstPage = true

  for (const data of dataByRestaurant) {
    const restName = data.restaurant.name
    const s = data.summary

    if (!isFirstPage) doc.addPage()
    isFirstPage = false

    // ── Cover page ────────────────────────────────────────────────────
    doc.setFillColor(pr, pg, pb)
    doc.rect(0, 0, pageW, pageH, 'F')

    if (config.template.logoUrl) {
      try {
        doc.addImage(config.template.logoUrl, 'PNG', 10, 10, 40, 20, undefined, 'FAST')
      } catch {}
    }

    doc.setTextColor(200, 210, 230)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('REPORTE SEMANAL', 10, 60)

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(28)
    doc.setFont('helvetica', 'bold')
    doc.text(restName, 10, 80)

    doc.setFontSize(14)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(200, 210, 230)
    doc.text(weekRange, 10, 95)

    doc.setFontSize(8)
    doc.setTextColor(150, 160, 180)
    doc.text('Generado por Restaurant X-Ray', 10, pageH - 8)

    for (const section of config.sections) {
      const note = config.notes[section] || ''

      if (section === 'executive') {
        doc.addPage()
        addPageHeader('Resumen Ejecutivo', `${restName} · ${weekRange}`)
        addKPIRow([
          { label: 'Ventas Netas', value: fmt$(s.totalSales), color: '2563EB' },
          { label: 'Profit', value: fmt$(s.profit), color: s.profit >= 0 ? '16A34A' : 'DC2626' },
          { label: '% Labor', value: fmtPct(s.laborPct), color: '9333EA' },
          { label: '% COGS', value: fmtPct(s.cogsPct), color: 'EA580C' },
          { label: 'Avg/Guest', value: s.avgGuest ? '$' + s.avgGuest.toFixed(2) : '—', color: 'D97706' },
        ], 20)

        if (data.weeks.length > 1) {
          const tableRows = data.weeks.map(w => {
            const sales = safeN(w.sales?.net_sales)
            const labor = safeN(w.labor?.total_pay)
            const cogs = safeN(w.cogs?.total)
            const profit = sales - labor - cogs
            const lp = sales > 0 ? labor / sales * 100 : null
            const cp = sales > 0 ? cogs / sales * 100 : null
            return [w.week, fmt$(sales), fmtPct(lp), fmtPct(cp), fmt$(profit)]
          })
          autoTable(doc, {
            head: [['Semana', 'Ventas', '% Labor', '% COGS', 'Profit']],
            body: tableRows,
            startY: 44,
            headStyles: { fillColor: [pr, pg, pb], textColor: [255, 255, 255], fontSize: 9 },
            bodyStyles: { fontSize: 9 },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            margin: { left: 8, right: 8 },
          })
        }
        addNote(note)
      }

      if (section === 'ventas') {
        doc.addPage()
        addPageHeader('Ventas', `${restName} · ${weekRange}`)
        addKPIRow([
          { label: 'Ventas Netas', value: fmt$(s.totalSales), color: '2563EB' },
          { label: 'Órdenes', value: s.totalOrders.toString() },
          { label: 'Comensales', value: s.totalGuests.toString() },
          { label: 'Avg / Guest', value: s.avgGuest ? '$' + s.avgGuest.toFixed(2) : '—', color: 'D97706' },
        ], 20)

        const latestWeek = data.weeks[data.weeks.length - 1]
        if (latestWeek?.sales?.categories?.length) {
          autoTable(doc, {
            head: [['Categoría', 'Ventas Netas', '% Total']],
            body: latestWeek.sales.categories.map((cat: any) => [cat.name, fmt$(safeN(cat.net)), safeN(cat.pct).toFixed(1) + '%']),
            startY: 44,
            headStyles: { fillColor: [pr, pg, pb], textColor: [255, 255, 255], fontSize: 9 },
            bodyStyles: { fontSize: 9 },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            margin: { left: 8, right: 8 },
          })
        }
        addNote(note)
      }

      if (section === 'labor') {
        doc.addPage()
        addPageHeader('Labor', `${restName} · ${weekRange}`)
        addKPIRow([
          { label: '% Labor', value: fmtPct(s.laborPct), color: '9333EA' },
          { label: 'Costo Labor', value: fmt$(s.totalLabor) },
          { label: 'Horas Reg.', value: safeN(data.weeks[data.weeks.length-1]?.labor?.total_hours).toFixed(0) + 'h' },
          { label: 'Horas OT', value: safeN(data.weeks[data.weeks.length-1]?.labor?.total_ot_hours).toFixed(1) + 'h', color: 'D97706' },
        ], 20)

        const latestWeek = data.weeks[data.weeks.length - 1]
        if (latestWeek?.labor?.by_position?.length) {
          const totalPay = safeN(latestWeek.labor.total_pay)
          autoTable(doc, {
            head: [['Puesto', 'Horas Reg.', 'Horas OT', 'Costo $', '% Labor']],
            body: latestWeek.labor.by_position.map((p: any) => [
              p.position,
              safeN(p.regular_hours).toFixed(0) + 'h',
              safeN(p.ot_hours) > 0 ? safeN(p.ot_hours).toFixed(1) + 'h' : '—',
              fmt$(safeN(p.total_pay)),
              totalPay > 0 ? (safeN(p.total_pay) / totalPay * 100).toFixed(1) + '%' : '—',
            ]),
            startY: 44,
            headStyles: { fillColor: [pr, pg, pb], textColor: [255, 255, 255], fontSize: 9 },
            bodyStyles: { fontSize: 9 },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            margin: { left: 8, right: 8 },
          })
        }
        addNote(note)
      }

      if (section === 'employee') {
        doc.addPage()
        addPageHeader('Employee Performance', `${restName} · ${data.weeks[data.weeks.length-1]?.week}`)
        const employees = data.weeks[data.weeks.length-1]?.employee?.employees || []
        const sorted = [...employees].filter((e: any) => safeN(e.net_sales) > 0)
          .sort((a: any, b: any) => safeN(b.net_sales_per_hour) - safeN(a.net_sales_per_hour))
        if (sorted.length) {
          autoTable(doc, {
            head: [['Empleado', 'Ventas $', '$/Hora', '$/Comensal', 'Ticket Prom.', 'Horas']],
            body: sorted.slice(0, 15).map((e: any, i: number) => [
              (i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '') + e.name,
              fmt$(safeN(e.net_sales)),
              '$' + safeN(e.net_sales_per_hour).toFixed(2),
              '$' + safeN(e.avg_net_sales_per_guest).toFixed(2),
              '$' + safeN(e.avg_order_value).toFixed(2),
              safeN(e.total_labor_hours).toFixed(1) + 'h',
            ]),
            startY: 20,
            headStyles: { fillColor: [pr, pg, pb], textColor: [255, 255, 255], fontSize: 9 },
            bodyStyles: { fontSize: 9 },
            alternateRowStyles: { fillColor: [249, 250, 251] },
            margin: { left: 8, right: 8 },
          })
        }
        addNote(note)
      }
    }
  }

  doc.save(`reporte-${dataByRestaurant[0]?.restaurant?.name?.replace(/\s/g, '-')}-${config.weeks[0]}.pdf`)
}