// generate-xlsx.ts
// Uses SheetJS (xlsx) — already available in the project
import type { ExportConfig, ExportData } from './data-fetcher'
import { fmt$, fmtPct, safeN } from './data-fetcher'

export async function generateXLSX(config: ExportConfig, dataByRestaurant: ExportData[]) {
  const XLSX = await import('xlsx')

  const wb = XLSX.utils.book_new()

  for (const data of dataByRestaurant) {
    const restSlug = data.restaurant.name.replace(/\s/g, '_').substring(0, 20)

    // ── Resumen ejecutivo ──────────────────────────────────────────────
    if (config.sections.includes('executive')) {
      const rows: any[][] = [
        ['REPORTE SEMANAL — ' + data.restaurant.name],
        ['Período:', config.weeks[0] + (config.weeks.length > 1 ? ' → ' + config.weeks[config.weeks.length - 1] : '')],
        [],
        ['RESUMEN EJECUTIVO'],
        ['Métrica', 'Valor'],
        ['Ventas Netas', data.summary.totalSales],
        ['Órdenes', data.summary.totalOrders],
        ['Comensales', data.summary.totalGuests],
        ['Avg / Guest', data.summary.avgGuest ? data.summary.avgGuest : 0],
        ['Labor $', data.summary.totalLabor],
        ['% Labor', data.summary.laborPct ? data.summary.laborPct / 100 : 0],
        ['COGS $', data.summary.totalCOGS],
        ['% COGS', data.summary.cogsPct ? data.summary.cogsPct / 100 : 0],
        ['Profit $', data.summary.profit],
        ['% Profit', data.summary.profitPct ? data.summary.profitPct / 100 : 0],
        ['Waste $', data.summary.totalWaste],
      ]

      if (config.notes.executive) rows.push([], ['Nota:', config.notes.executive])

      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ wch: 20 }, { wch: 18 }]

      // Format numbers
      const fmtCurrency = '"$"#,##0'
      const fmtPctFmt = '0.0%'
      const currencyRows = [6, 7, 8, 9, 10, 12, 14, 16]
      currencyRows.forEach(r => {
        const cell = ws[XLSX.utils.encode_cell({ r, c: 1 })]
        if (cell) cell.z = fmtCurrency
      })
      ;[11, 13, 15].forEach(r => {
        const cell = ws[XLSX.utils.encode_cell({ r, c: 1 })]
        if (cell) cell.z = fmtPctFmt
      })

      XLSX.utils.book_append_sheet(wb, ws, restSlug + '_Resumen')
    }

    // ── Tendencia semanal ──────────────────────────────────────────────
    if (config.sections.includes('ventas') || config.sections.includes('labor') || config.sections.includes('food_cost')) {
      const headers = ['Semana', 'Semana Inicio', 'Semana Fin', 'Ventas Netas', 'Órdenes', 'Comensales', 'Avg/Guest',
        'Labor $', '% Labor', 'COGS $', '% COGS', 'Profit $', '% Profit', 'Waste $']
      const rows: any[][] = [headers]

      data.weeks.forEach(w => {
        const sales = safeN(w.sales?.net_sales)
        const labor = safeN(w.labor?.total_pay)
        const cogs = safeN(w.cogs?.total)
        const waste = safeN(w.waste?.total_cost)
        const orders = safeN(w.sales?.orders)
        const guests = safeN(w.sales?.guests)
        const profit = sales - labor - cogs
        rows.push([
          w.week, w.weekStart, w.weekEnd,
          sales, orders, guests,
          guests > 0 ? sales / guests : 0,
          labor, sales > 0 ? labor / sales : 0,
          cogs, sales > 0 ? cogs / sales : 0,
          profit, sales > 0 ? profit / sales : 0,
          waste,
        ])
      })

      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }]

      // Format currency and pct columns
      for (let r = 1; r < rows.length; r++) {
        const currencyCols = [3, 7, 9, 11, 13]
        const pctCols = [8, 10, 12]
        const decCols = [6]
        currencyCols.forEach(c => {
          const cell = ws[XLSX.utils.encode_cell({ r, c })]
          if (cell) cell.z = '"$"#,##0'
        })
        pctCols.forEach(c => {
          const cell = ws[XLSX.utils.encode_cell({ r, c })]
          if (cell) cell.z = '0.0%'
        })
        decCols.forEach(c => {
          const cell = ws[XLSX.utils.encode_cell({ r, c })]
          if (cell) cell.z = '"$"#,##0.00'
        })
      }

      XLSX.utils.book_append_sheet(wb, ws, restSlug + '_Semanas')
    }

    // ── Employee performance ──────────────────────────────────────────
    if (config.sections.includes('employee')) {
      const empRows: any[][] = [['Semana', 'Empleado', 'Ventas $', '$/Hora', '$/Comensal', 'Ticket Prom.', 'Horas', 'Órdenes', 'Comensales']]
      data.weeks.forEach(w => {
        const employees = w.employee?.employees || []
        employees.forEach((e: any) => {
          empRows.push([
            w.week, e.name,
            safeN(e.net_sales),
            safeN(e.net_sales_per_hour),
            safeN(e.avg_net_sales_per_guest),
            safeN(e.avg_order_value),
            safeN(e.total_labor_hours),
            safeN(e.total_orders),
            safeN(e.total_guests),
          ])
        })
      })
      if (empRows.length > 1) {
        const ws = XLSX.utils.aoa_to_sheet(empRows)
        ws['!cols'] = Array(9).fill({ wch: 14 })
        for (let r = 1; r < empRows.length; r++) {
          ;[2, 3, 4, 5].forEach(c => {
            const cell = ws[XLSX.utils.encode_cell({ r, c })]
            if (cell) cell.z = '"$"#,##0.00'
          })
        }
        XLSX.utils.book_append_sheet(wb, ws, restSlug + '_Employee')
      }
    }

    // ── Waste ────────────────────────────────────────────────────────
    if (config.sections.includes('waste')) {
      const wasteRows: any[][] = [['Semana', 'Item', 'Categoría', 'Cantidad', 'Unidad', 'Costo $', 'Razón', 'Empleado']]
      data.weeks.forEach(w => {
        const items = w.waste?.items || []
        items.forEach((item: any) => {
          wasteRows.push([
            w.week, item.item_name, item.category,
            safeN(item.quantity), item.unit,
            safeN(item.cost), item.reason, item.employee_name,
          ])
        })
      })
      if (wasteRows.length > 1) {
        const ws = XLSX.utils.aoa_to_sheet(wasteRows)
        ws['!cols'] = Array(8).fill({ wch: 16 })
        XLSX.utils.book_append_sheet(wb, ws, restSlug + '_Waste')
      }
    }

    // ── AvT ──────────────────────────────────────────────────────────
    if (config.sections.includes('avt')) {
      const avtRows: any[][] = [['Semana', 'Item', 'Categoría', 'Teórico $', 'Actual $', 'Variación $', 'Variación %']]
      data.weeks.forEach(w => {
        const items = w.avt?.all_items || []
        items.forEach((item: any) => {
          const theo = safeN(item.theo_dollar)
          const actual = safeN(item.actual_dollar)
          const variance = actual - theo
          avtRows.push([
            w.week, item.item_name, item.category,
            theo, actual, variance,
            theo > 0 ? variance / theo : 0,
          ])
        })
      })
      if (avtRows.length > 1) {
        const ws = XLSX.utils.aoa_to_sheet(avtRows)
        ws['!cols'] = Array(7).fill({ wch: 16 })
        for (let r = 1; r < avtRows.length; r++) {
          ;[3, 4, 5].forEach(c => {
            const cell = ws[XLSX.utils.encode_cell({ r, c })]
            if (cell) cell.z = '"$"#,##0.00'
          })
          const cell6 = ws[XLSX.utils.encode_cell({ r, c: 6 })]
          if (cell6) cell6.z = '0.0%'
        }
        XLSX.utils.book_append_sheet(wb, ws, restSlug + '_AvT')
      }
    }
  }

  // Write and download
  const restName = dataByRestaurant[0]?.restaurant?.name?.replace(/\s/g, '-') || 'reporte'
  const week = config.weeks[0]
  XLSX.writeFile(wb, `reporte-${restName}-${week}.xlsx`)
}