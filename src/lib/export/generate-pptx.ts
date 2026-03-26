// generate-pptx.ts
// Uses pptxgenjs (browser-compatible) — install: npm install pptxgenjs
import type { ExportConfig, ExportData } from './data-fetcher'
import { fmt$, fmtPct, safeN } from './data-fetcher'

const SECTION_LABELS: Record<string, string> = {
  executive: 'Resumen Ejecutivo',
  ventas: 'Ventas',
  labor: 'Labor',
  food_cost: 'Food Cost / Costo de Uso',
  waste: 'Waste / Merma',
  employee: 'Employee Performance',
  avt: 'Actual vs Teórico',
  kitchen: 'Kitchen Performance',
  compras: 'Compras',
}

export async function generatePPTX(config: ExportConfig, dataByRestaurant: ExportData[]) {
  // Dynamic import to avoid SSR issues
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()

  const primary = '#' + config.template.colorPrimary
  const secondary = '#' + config.template.colorSecondary
  const accent = '#' + config.template.colorAccent

  pptx.layout = 'LAYOUT_WIDE' // 13.33 x 7.5 inches
  pptx.author = 'Restaurant X-Ray'
  pptx.company = dataByRestaurant[0]?.restaurant?.organizations?.name || 'Restaurant X-Ray'

  // ── SLIDE 1: Portada ──────────────────────────────────────────────────────
  const cover = pptx.addSlide()
  cover.background = { color: config.template.colorPrimary }

  // Logo placeholder or restaurant name
  if (config.template.logoUrl) {
    cover.addImage({ path: config.template.logoUrl, x: 0.5, y: 0.4, w: 2.5, h: 1.2, sizing: { type: 'contain', w: 2.5, h: 1.2 } })
  }

  const restNames = dataByRestaurant.map(d => d.restaurant.name).join(' · ')
  const weekRange = config.weeks.length === 1
    ? config.weeks[0]
    : `${config.weeks[0]} → ${config.weeks[config.weeks.length - 1]}`

  cover.addText('REPORTE SEMANAL', { x: 0.5, y: 2.0, w: 12.3, h: 0.6, fontSize: 14, color: secondary.replace('#', ''), bold: false, charSpacing: 3 })
  cover.addText(restNames, { x: 0.5, y: 2.6, w: 12.3, h: 1.4, fontSize: 44, color: 'FFFFFF', bold: true })
  cover.addText(weekRange, { x: 0.5, y: 4.2, w: 8, h: 0.6, fontSize: 20, color: secondary.replace('#', '') })
  cover.addText('Generado por Restaurant X-Ray', { x: 0.5, y: 6.8, w: 12.3, h: 0.4, fontSize: 10, color: 'AAAAAA' })

  // ── For each restaurant ──────────────────────────────────────────────────
  for (const data of dataByRestaurant) {
    const restName = data.restaurant.name
    const s = data.summary

    // ── Slide: Divider de restaurante (si hay más de uno) ──
    if (dataByRestaurant.length > 1) {
      const divSlide = pptx.addSlide()
      divSlide.background = { color: config.template.colorSecondary.replace('#', '') === 'FFFFFF' ? 'F5F5F5' : config.template.colorSecondary.replace('#','') }
      divSlide.addText(restName, { x: 1, y: 2.5, w: 11.3, h: 1.5, fontSize: 48, color: config.template.colorPrimary, bold: true })
      divSlide.addText(weekRange, { x: 1, y: 4.2, w: 8, h: 0.5, fontSize: 18, color: '666666' })
    }

    // Process sections in order
    for (const section of config.sections) {
      const note = config.notes[section] || ''

      if (section === 'executive') addExecutiveSlide(pptx, data, config, weekRange, restName, note)
      if (section === 'ventas') addVentasSlide(pptx, data, config, restName, note)
      if (section === 'labor') addLaborSlide(pptx, data, config, restName, note)
      if (section === 'food_cost') addFoodCostSlide(pptx, data, config, restName, note)
      if (section === 'waste') addWasteSlide(pptx, data, config, restName, note)
      if (section === 'employee') addEmployeeSlide(pptx, data, config, restName, note)
      if (section === 'avt') addAvtSlide(pptx, data, config, restName, note)
      if (section === 'kitchen') addKitchenSlide(pptx, data, config, restName, note)
      if (section === 'compras') addComprasSlide(pptx, data, config, restName, note)
    }
  }

  // Generate and download
  await pptx.writeFile({ fileName: `reporte-${dataByRestaurant[0]?.restaurant?.name?.replace(/\s/g, '-')}-${config.weeks[0]}.pptx` })
}

// ── Helper: slide header ──────────────────────────────────────────────────
function addHeader(slide: any, title: string, subtitle: string, config: ExportConfig) {
  slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: config.template.colorPrimary } })
  slide.addText(title, { x: 0.4, y: 0.1, w: 9, h: 0.7, fontSize: 22, color: 'FFFFFF', bold: true })
  slide.addText(subtitle, { x: 9.5, y: 0.2, w: 3.5, h: 0.5, fontSize: 11, color: config.template.colorSecondary, align: 'right' })
}

// ── Helper: KPI box ───────────────────────────────────────────────────────
function addKPI(slide: any, x: number, y: number, w: number, h: number, label: string, value: string, sub: string, color: string, bg: string) {
  slide.addShape('rect', { x, y, w, h, fill: { color: bg }, line: { color: 'E5E7EB', width: 0.5 } })
  slide.addText(label, { x: x + 0.15, y: y + 0.12, w: w - 0.3, h: 0.3, fontSize: 9, color: '6B7280' })
  slide.addText(value, { x: x + 0.15, y: y + 0.42, w: w - 0.3, h: 0.55, fontSize: 26, color, bold: true })
  if (sub) slide.addText(sub, { x: x + 0.15, y: y + 0.98, w: w - 0.3, h: 0.25, fontSize: 9, color: '9CA3AF' })
}

// ── Helper: note footer ───────────────────────────────────────────────────
function addNote(slide: any, note: string) {
  if (!note) return
  slide.addShape('rect', { x: 0, y: 6.8, w: 13.33, h: 0.6, fill: { color: 'FEF3C7' } })
  slide.addText('📝 ' + note, { x: 0.3, y: 6.85, w: 12.7, h: 0.5, fontSize: 10, color: '92400E' })
}

// ── EXECUTIVE SLIDE ───────────────────────────────────────────────────────
function addExecutiveSlide(pptx: any, data: ExportData, config: ExportConfig, weekRange: string, restName: string, note: string) {
  const slide = pptx.addSlide()
  addHeader(slide, 'Resumen Ejecutivo', `${restName} · ${weekRange}`, config)
  const s = data.summary
  const kpiY = 1.1
  const kpiH = 1.4
  const kpiW = 2.9

  addKPI(slide, 0.2, kpiY, kpiW, kpiH, 'Ventas Netas', fmt$(s.totalSales), `${s.totalOrders} órdenes`, '2563EB', 'F0F9FF')
  addKPI(slide, 3.3, kpiY, kpiW, kpiH, 'Profit', fmt$(s.profit), fmtPct(s.profitPct) + ' margen', s.profit >= 0 ? '16A34A' : 'DC2626', 'F0FDF4')
  addKPI(slide, 6.4, kpiY, kpiW, kpiH, '% Labor', fmtPct(s.laborPct), fmt$(s.totalLabor), '9333EA', 'FAF5FF')
  addKPI(slide, 9.5, kpiY, kpiW, kpiH, '% COGS', fmtPct(s.cogsPct), fmt$(s.totalCOGS), 'EA580C', 'FFF7ED')

  // Trend table
  if (data.weeks.length > 1) {
    slide.addText('Tendencia semanal', { x: 0.2, y: 2.8, w: 8, h: 0.4, fontSize: 13, color: '111827', bold: true })
    const tableData: any[][] = [[
      { text: 'Semana', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: 'Ventas', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: '% Labor', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: '% COGS', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: 'Profit', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
    ]]
    data.weeks.forEach((w, i) => {
      const sales = safeN(w.sales?.net_sales)
      const labor = safeN(w.labor?.total_pay)
      const cogs = safeN(w.cogs?.total)
      const profit = sales - labor - cogs
      const laborPct = sales > 0 ? labor / sales * 100 : null
      const cogsPct = sales > 0 ? cogs / sales * 100 : null
      const rowFill = i % 2 === 0 ? 'F9FAFB' : 'FFFFFF'
      tableData.push([
        { text: w.week, options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: fmt$(sales), options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: fmtPct(laborPct), options: { fill: { color: rowFill }, fontSize: 10, color: laborPct && laborPct > 33 ? 'DC2626' : '16A34A' } },
        { text: fmtPct(cogsPct), options: { fill: { color: rowFill }, fontSize: 10, color: cogsPct && cogsPct > 33 ? 'DC2626' : '16A34A' } },
        { text: fmt$(profit), options: { fill: { color: rowFill }, fontSize: 10, color: profit >= 0 ? '16A34A' : 'DC2626' } },
      ])
    })
    slide.addTable(tableData, { x: 0.2, y: 3.2, w: 12.9, colW: [2.2, 2.5, 2.5, 2.5, 3.2], border: { color: 'E5E7EB' }, rowH: 0.4 })
  }
  addNote(slide, note)
}

// ── VENTAS SLIDE ──────────────────────────────────────────────────────────
function addVentasSlide(pptx: any, data: ExportData, config: ExportConfig, restName: string, note: string) {
  const slide = pptx.addSlide()
  const weekRange = data.weeks.length === 1 ? data.weeks[0].week : `${data.weeks[0].week} → ${data.weeks[data.weeks.length-1].week}`
  addHeader(slide, 'Ventas', `${restName} · ${weekRange}`, config)
  const s = data.summary

  addKPI(slide, 0.2, 1.1, 3.0, 1.3, 'Ventas Netas', fmt$(s.totalSales), `${s.totalOrders} órdenes`, '2563EB', 'F0F9FF')
  addKPI(slide, 3.4, 1.1, 3.0, 1.3, 'Avg / Guest', s.avgGuest ? '$' + s.avgGuest.toFixed(2) : '—', `${s.totalGuests} comensales`, 'D97706', 'FFFBEB')

  // Categorías de ventas
  const latestWeek = data.weeks[data.weeks.length - 1]
  if (latestWeek?.sales?.categories?.length) {
    slide.addText('Ventas por categoría', { x: 0.2, y: 2.6, w: 8, h: 0.4, fontSize: 13, color: '111827', bold: true })
    const cats = latestWeek.sales.categories.slice(0, 8)
    const tableData: any[][] = [[
      { text: 'Categoría', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: 'Ventas Netas', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: '% del Total', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
    ]]
    cats.forEach((cat: any, i: number) => {
      const rowFill = i % 2 === 0 ? 'F9FAFB' : 'FFFFFF'
      tableData.push([
        { text: cat.name, options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: fmt$(safeN(cat.net)), options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: safeN(cat.pct).toFixed(1) + '%', options: { fill: { color: rowFill }, fontSize: 10 } },
      ])
    })
    slide.addTable(tableData, { x: 0.2, y: 3.0, w: 8, colW: [4, 2, 2], border: { color: 'E5E7EB' }, rowH: 0.38 })
  }
  addNote(slide, note)
}

// ── LABOR SLIDE ───────────────────────────────────────────────────────────
function addLaborSlide(pptx: any, data: ExportData, config: ExportConfig, restName: string, note: string) {
  const slide = pptx.addSlide()
  const weekRange = data.weeks.length === 1 ? data.weeks[0].week : `${data.weeks[0].week} → ${data.weeks[data.weeks.length-1].week}`
  addHeader(slide, 'Labor', `${restName} · ${weekRange}`, config)
  const s = data.summary

  addKPI(slide, 0.2, 1.1, 3.0, 1.3, '% Labor', fmtPct(s.laborPct), fmt$(s.totalLabor), '9333EA', 'FAF5FF')

  const latestWeek = data.weeks[data.weeks.length - 1]
  const totalHours = safeN(latestWeek?.labor?.total_hours)
  const otHours = safeN(latestWeek?.labor?.total_ot_hours)
  addKPI(slide, 3.4, 1.1, 3.0, 1.3, 'Horas Reg.', totalHours.toFixed(0) + 'h', 'Semana más reciente', '2563EB', 'F0F9FF')
  addKPI(slide, 6.6, 1.1, 3.0, 1.3, 'Horas OT', otHours.toFixed(1) + 'h', 'overtime', 'D97706', 'FFFBEB')

  if (latestWeek?.labor?.by_position?.length) {
    slide.addText('Labor por puesto — ' + latestWeek.week, { x: 0.2, y: 2.6, w: 12, h: 0.4, fontSize: 13, color: '111827', bold: true })
    const tableData: any[][] = [[
      { text: 'Puesto', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: 'Horas Reg.', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: 'Horas OT', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: 'Costo Total', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: '% del Labor', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
    ]]
    const totalPay = safeN(latestWeek.labor.total_pay)
    latestWeek.labor.by_position.slice(0, 10).forEach((pos: any, i: number) => {
      const rowFill = i % 2 === 0 ? 'F9FAFB' : 'FFFFFF'
      const pct = totalPay > 0 ? (safeN(pos.total_pay) / totalPay * 100).toFixed(1) + '%' : '—'
      tableData.push([
        { text: pos.position, options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: safeN(pos.regular_hours).toFixed(0) + 'h', options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: safeN(pos.ot_hours) > 0 ? safeN(pos.ot_hours).toFixed(1) + 'h' : '—', options: { fill: { color: rowFill }, fontSize: 10, color: safeN(pos.ot_hours) > 0 ? 'D97706' : '111827' } },
        { text: fmt$(safeN(pos.total_pay)), options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: pct, options: { fill: { color: rowFill }, fontSize: 10 } },
      ])
    })
    slide.addTable(tableData, { x: 0.2, y: 3.0, w: 12.9, colW: [4, 2, 2, 2.5, 2.4], border: { color: 'E5E7EB' }, rowH: 0.38 })
  }
  addNote(slide, note)
}

// ── FOOD COST SLIDE ───────────────────────────────────────────────────────
function addFoodCostSlide(pptx: any, data: ExportData, config: ExportConfig, restName: string, note: string) {
  const slide = pptx.addSlide()
  const weekRange = data.weeks.length === 1 ? data.weeks[0].week : `${data.weeks[0].week} → ${data.weeks[data.weeks.length-1].week}`
  addHeader(slide, 'Food Cost / Costo de Uso', `${restName} · ${weekRange}`, config)

  const latestWeek = data.weeks[data.weeks.length - 1]
  const sales = safeN(latestWeek?.sales?.net_sales)
  const cogs = safeN(latestWeek?.cogs?.total)
  const cogsPct = sales > 0 ? cogs / sales * 100 : null

  addKPI(slide, 0.2, 1.1, 3.0, 1.3, '% COGS', fmtPct(cogsPct), fmt$(cogs), 'EA580C', 'FFF7ED')

  if (latestWeek?.cogs?.by_category) {
    const cats = Object.entries(latestWeek.cogs.by_category as Record<string, unknown>)
    slide.addText('COGS por categoría — ' + latestWeek.week, { x: 0.2, y: 2.6, w: 12, h: 0.4, fontSize: 13, color: '111827', bold: true })
    const tableData: any[][] = [[
      { text: 'Categoría', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: 'Monto', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: '% Ventas', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
    ]]
    cats.forEach(([cat, val], i) => {
      const amount = safeN(val)
      const pct = sales > 0 ? (amount / sales * 100).toFixed(1) + '%' : '—'
      const rowFill = i % 2 === 0 ? 'F9FAFB' : 'FFFFFF'
      tableData.push([
        { text: cat, options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: fmt$(amount), options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: pct, options: { fill: { color: rowFill }, fontSize: 10 } },
      ])
    })
    slide.addTable(tableData, { x: 0.2, y: 3.0, w: 8, colW: [4, 2, 2], border: { color: 'E5E7EB' }, rowH: 0.38 })
  }
  addNote(slide, note)
}

// ── WASTE SLIDE ───────────────────────────────────────────────────────────
function addWasteSlide(pptx: any, data: ExportData, config: ExportConfig, restName: string, note: string) {
  const slide = pptx.addSlide()
  const weekRange = data.weeks.length === 1 ? data.weeks[0].week : `${data.weeks[0].week} → ${data.weeks[data.weeks.length-1].week}`
  addHeader(slide, 'Waste / Merma', `${restName} · ${weekRange}`, config)

  const totalWaste = data.weeks.reduce((s, w) => s + safeN(w.waste?.total_cost), 0)
  addKPI(slide, 0.2, 1.1, 3.0, 1.3, 'Waste Total', fmt$(totalWaste), 'período seleccionado', 'DC2626', 'FEF2F2')

  const latestWeek = data.weeks[data.weeks.length - 1]
  if (latestWeek?.waste?.items?.length) {
    slide.addText('Top items de merma — ' + latestWeek.week, { x: 0.2, y: 2.6, w: 12, h: 0.4, fontSize: 13, color: '111827', bold: true })
    const tableData: any[][] = [[
      { text: 'Item', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: 'Cantidad', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: 'Costo', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: 'Razón', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
    ]]
    latestWeek.waste.items.slice(0, 10).forEach((item: any, i: number) => {
      const rowFill = i % 2 === 0 ? 'F9FAFB' : 'FFFFFF'
      tableData.push([
        { text: item.item_name || '—', options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: safeN(item.quantity).toFixed(1) + ' ' + (item.unit || ''), options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: fmt$(safeN(item.cost)), options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: item.reason || '—', options: { fill: { color: rowFill }, fontSize: 10 } },
      ])
    })
    slide.addTable(tableData, { x: 0.2, y: 3.0, w: 12.9, colW: [4, 2.5, 2.2, 4.2], border: { color: 'E5E7EB' }, rowH: 0.38 })
  }
  addNote(slide, note)
}

// ── EMPLOYEE SLIDE ────────────────────────────────────────────────────────
function addEmployeeSlide(pptx: any, data: ExportData, config: ExportConfig, restName: string, note: string) {
  const slide = pptx.addSlide()
  const latestWeek = data.weeks[data.weeks.length - 1]
  addHeader(slide, 'Employee Performance', `${restName} · ${latestWeek?.week}`, config)

  const employees = latestWeek?.employee?.employees || []
  if (employees.length) {
    slide.addText('Top performers por ventas/hora', { x: 0.2, y: 1.1, w: 12, h: 0.4, fontSize: 13, color: '111827', bold: true })
    const sorted = [...employees].filter((e: any) => safeN(e.net_sales) > 0).sort((a: any, b: any) => safeN(b.net_sales_per_hour) - safeN(a.net_sales_per_hour)).slice(0, 12)
    const tableData: any[][] = [[
      { text: 'Empleado', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: 'Ventas', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: '$/Hora', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: '$/Comensal', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: 'Ticket Prom.', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: 'Horas', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
    ]]
    sorted.forEach((e: any, i: number) => {
      const rowFill = i % 2 === 0 ? 'F9FAFB' : 'FFFFFF'
      const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''
      tableData.push([
        { text: medal + e.name, options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: fmt$(safeN(e.net_sales)), options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: '$' + safeN(e.net_sales_per_hour).toFixed(2), options: { fill: { color: rowFill }, fontSize: 10, color: '2563EB' } },
        { text: '$' + safeN(e.avg_net_sales_per_guest).toFixed(2), options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: '$' + safeN(e.avg_order_value).toFixed(2), options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: safeN(e.total_labor_hours).toFixed(1) + 'h', options: { fill: { color: rowFill }, fontSize: 10 } },
      ])
    })
    slide.addTable(tableData, { x: 0.2, y: 1.6, w: 12.9, colW: [4, 2, 1.8, 1.8, 1.8, 1.5], border: { color: 'E5E7EB' }, rowH: 0.38 })
  } else {
    slide.addText('Sin datos de employee performance para este período', { x: 0.2, y: 3, w: 12.9, h: 0.6, fontSize: 14, color: '9CA3AF', align: 'center' })
  }
  addNote(slide, note)
}

// ── AVT SLIDE ─────────────────────────────────────────────────────────────
function addAvtSlide(pptx: any, data: ExportData, config: ExportConfig, restName: string, note: string) {
  const slide = pptx.addSlide()
  const latestWeek = data.weeks[data.weeks.length - 1]
  addHeader(slide, 'Actual vs Teórico', `${restName} · ${latestWeek?.week}`, config)

  const avt = latestWeek?.avt
  if (avt) {
    const shortage = safeN(avt.total_shortage_dollar)
    const overage = safeN(avt.total_overage_dollar)
    const net = safeN(avt.net_variance)
    addKPI(slide, 0.2, 1.1, 3.0, 1.3, 'Faltantes $', fmt$(shortage), 'vs teórico', 'DC2626', 'FEF2F2')
    addKPI(slide, 3.4, 1.1, 3.0, 1.3, 'Sobrantes $', fmt$(overage), 'vs teórico', '16A34A', 'F0FDF4')
    addKPI(slide, 6.6, 1.1, 3.0, 1.3, 'Neto', fmt$(net), net > 0 ? 'sobre teórico' : 'bajo teórico', net > 0 ? 'DC2626' : '16A34A', net > 0 ? 'FEF2F2' : 'F0FDF4')

    if (avt.all_items?.length) {
      slide.addText('Items con mayor variación', { x: 0.2, y: 2.6, w: 12, h: 0.4, fontSize: 13, color: '111827', bold: true })
      const items = [...avt.all_items].sort((a: any, b: any) => Math.abs(safeN(b.variance_dollar)) - Math.abs(safeN(a.variance_dollar))).slice(0, 10)
      const tableData: any[][] = [[
        { text: 'Item', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
        { text: 'Teórico $', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
        { text: 'Actual $', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
        { text: 'Variación $', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      ]]
      items.forEach((item: any, i: number) => {
        const v = safeN(item.variance_dollar)
        const rowFill = i % 2 === 0 ? 'F9FAFB' : 'FFFFFF'
        tableData.push([
          { text: item.item_name || '—', options: { fill: { color: rowFill }, fontSize: 10 } },
          { text: fmt$(safeN(item.theo_dollar)), options: { fill: { color: rowFill }, fontSize: 10 } },
          { text: fmt$(safeN(item.actual_dollar)), options: { fill: { color: rowFill }, fontSize: 10 } },
          { text: (v > 0 ? '+' : '') + fmt$(v), options: { fill: { color: rowFill }, fontSize: 10, color: v > 0 ? 'DC2626' : '16A34A' } },
        ])
      })
      slide.addTable(tableData, { x: 0.2, y: 3.0, w: 10, colW: [4.5, 2, 2, 1.5], border: { color: 'E5E7EB' }, rowH: 0.38 })
    }
  } else {
    slide.addText('Sin datos de AvT para este período', { x: 0.2, y: 3, w: 12.9, h: 0.6, fontSize: 14, color: '9CA3AF', align: 'center' })
  }
  addNote(slide, note)
}

// ── KITCHEN SLIDE ─────────────────────────────────────────────────────────
function addKitchenSlide(pptx: any, data: ExportData, config: ExportConfig, restName: string, note: string) {
  const slide = pptx.addSlide()
  const latestWeek = data.weeks[data.weeks.length - 1]
  addHeader(slide, 'Kitchen Performance', `${restName} · ${latestWeek?.week}`, config)

  const kitchen = latestWeek?.kitchen
  if (kitchen?.tickets?.length) {
    const tickets = kitchen.tickets
    const avgTime = tickets.reduce((s: number, t: any) => s + safeN(t.total_time_seconds), 0) / tickets.length
    addKPI(slide, 0.2, 1.1, 3.0, 1.3, 'Tickets', tickets.length.toString(), 'total período', '2563EB', 'F0F9FF')
    addKPI(slide, 3.4, 1.1, 3.0, 1.3, 'Tiempo Prom.', (avgTime / 60).toFixed(1) + ' min', 'por ticket', avgTime > 900 ? 'DC2626' : '16A34A', avgTime > 900 ? 'FEF2F2' : 'F0FDF4')
  } else {
    slide.addText('Sin datos de kitchen performance para este período', { x: 0.2, y: 3, w: 12.9, h: 0.6, fontSize: 14, color: '9CA3AF', align: 'center' })
  }
  addNote(slide, note)
}

// ── COMPRAS SLIDE ─────────────────────────────────────────────────────────
function addComprasSlide(pptx: any, data: ExportData, config: ExportConfig, restName: string, note: string) {
  const slide = pptx.addSlide()
  const weekRange = data.weeks.length === 1 ? data.weeks[0].week : `${data.weeks[0].week} → ${data.weeks[data.weeks.length-1].week}`
  addHeader(slide, 'Compras / Receiving', `${restName} · ${weekRange}`, config)

  const latestWeek = data.weeks[data.weeks.length - 1]
  const receiving = latestWeek?.receiving
  if (receiving?.vendors?.length) {
    slide.addText('Compras por proveedor — ' + latestWeek.week, { x: 0.2, y: 1.1, w: 12, h: 0.4, fontSize: 13, color: '111827', bold: true })
    const tableData: any[][] = [[
      { text: 'Proveedor', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: 'Monto', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
      { text: 'Órdenes', options: { bold: true, fill: { color: config.template.colorPrimary }, color: 'FFFFFF', fontSize: 10 } },
    ]]
    receiving.vendors.slice(0, 12).forEach((v: any, i: number) => {
      const rowFill = i % 2 === 0 ? 'F9FAFB' : 'FFFFFF'
      tableData.push([
        { text: v.vendor_name || '—', options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: fmt$(safeN(v.total_amount)), options: { fill: { color: rowFill }, fontSize: 10 } },
        { text: String(v.order_count || 1), options: { fill: { color: rowFill }, fontSize: 10 } },
      ])
    })
    slide.addTable(tableData, { x: 0.2, y: 1.6, w: 8, colW: [4.5, 2, 1.5], border: { color: 'E5E7EB' }, rowH: 0.38 })
  } else {
    slide.addText('Sin datos de compras para este período', { x: 0.2, y: 3, w: 12.9, h: 0.6, fontSize: 14, color: '9CA3AF', align: 'center' })
  }
  addNote(slide, note)
}