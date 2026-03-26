// src/lib/parsers/parse-sales.ts
// Parser directo para Toast Sales Summary (.xlsx) — sin Claude
// Sheets usadas: Revenue summary, Net sales summary, Service mode summary,
//   Sales category summary, Revenue center summary, Service Daypart summary,
//   Check Discounts, Sales by day

export function parseSalesExcel(buffer: Buffer): any {
  const XLSX = require('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  function sheet(name: string): any[][] {
    const ws = workbook.Sheets[name]
    if (!ws) return []
    return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as any[][]
  }

  function num(v: any): number {
    if (v === null || v === undefined || v === '') return 0
    return parseFloat(String(v).replace(/[$,]/g, '')) || 0
  }

  function headerMap(rows: any[][]): Record<string, number> {
    const map: Record<string, number> = {}
    ;(rows[0] || []).forEach((h: any, i: number) => { if (h != null) map[String(h)] = i })
    return map
  }

  // ── Revenue summary ────────────────────────────────────────────────────────
  const revRows = sheet('Revenue summary')
  const revMap = headerMap(revRows)
  const revData = revRows[1] || []
  const net_sales = num(revData[revMap['Net sales']])
  const gratuity  = num(revData[revMap['Gratuity']])
  const tax       = num(revData[revMap['Tax amount']])
  const tips      = num(revData[revMap['Tips']])

  // ── Net sales summary ──────────────────────────────────────────────────────
  const netRows = sheet('Net sales summary')
  const netMap  = headerMap(netRows)
  const netData = netRows[1] || []
  const gross_sales = num(netData[netMap['Gross sales']])
  const discounts   = Math.abs(num(netData[netMap['Sales discounts']]))
  const refunds     = Math.abs(num(netData[netMap['Sales refunds']]))

  // ── Service mode summary ───────────────────────────────────────────────────
  const svcRows  = sheet('Service mode summary')
  const svcMap   = headerMap(svcRows)
  const totalRow = svcRows.find((r: any[]) => String(r[0]) === 'Total') || []
  const orders        = num(totalRow[svcMap['Total orders']])
  const guests        = num(totalRow[svcMap['Total guests']])
  const avg_per_guest = num(totalRow[svcMap['Avg/Guest']])
  const avg_per_order = num(totalRow[svcMap['Avg/Order']])

  // ── Sales category summary ─────────────────────────────────────────────────
  const catRows = sheet('Sales category summary')
  const catMap  = headerMap(catRows)
  const categories = catRows.slice(1)
    .filter((r: any[]) => r[catMap['Sales category']] && String(r[catMap['Sales category']]) !== 'Total')
    .map((r: any[]) => ({
      name:     String(r[catMap['Sales category']]),
      items:    num(r[catMap['Items']]),
      gross:    num(r[catMap['Gross sales']]),
      discount: Math.abs(num(r[catMap['Discount amount']])),
      net:      num(r[catMap['Net sales']]),
      pct:      net_sales > 0 ? parseFloat((num(r[catMap['Net sales']]) / net_sales * 100).toFixed(1)) : 0,
    }))

  // ── Revenue center summary ─────────────────────────────────────────────────
  const rcRows = sheet('Revenue center summary')
  const rcMap  = headerMap(rcRows)
  const revenue_centers = rcRows.slice(1)
    .filter((r: any[]) => r[rcMap['Revenue center']] && String(r[rcMap['Revenue center']]) !== 'Total')
    .map((r: any[]) => ({
      name: String(r[rcMap['Revenue center']]),
      net:  num(r[rcMap['Net sales']]),
      pct:  net_sales > 0 ? parseFloat((num(r[rcMap['Net sales']]) / net_sales * 100).toFixed(1)) : 0,
    }))

  // ── Service Daypart summary → lunch / dinner ───────────────────────────────
  const dpRows = sheet('Service Daypart summary')
  const dpMap  = headerMap(dpRows)
  let lunch  = { orders: 0, net: 0, discounts: 0 }
  let dinner = { orders: 0, net: 0, discounts: 0 }
  dpRows.slice(1).forEach((r: any[]) => {
    const p = String(r[dpMap['Service / day part']] || '').toLowerCase()
    const obj = {
      orders:    num(r[dpMap['Orders']]),
      net:       num(r[dpMap['Net sales']]),
      discounts: Math.abs(num(r[dpMap['Discount amount']])),
    }
    if (p === 'lunch')  lunch  = obj
    if (p === 'dinner') dinner = obj
  })

  // ── Check Discounts (detalle por tipo) ────────────────────────────────────
  const discRows = sheet('Check Discounts')
  const discMap  = headerMap(discRows)
  const discounts_items = discRows.slice(1)
    .filter((r: any[]) => r[discMap['Discount']] && String(r[discMap['Discount']]) !== 'Total')
    .map((r: any[]) => ({
      name:         String(r[discMap['Discount']]),
      applications: num(r[discMap['Count']]),
      orders:       num(r[discMap['Orders']]),
      amount:       Math.abs(num(r[discMap['Amount']])),
      pct:          discounts > 0
        ? parseFloat((Math.abs(num(r[discMap['Amount']])) / discounts * 100).toFixed(1))
        : 0,
    }))

  // ── Sales by day → fechas reales del reporte ───────────────────────────────
  const dayRows = sheet('Sales by day')
  let _report_start: string | null = null
  let _report_end:   string | null = null
  const dates = dayRows.slice(1)
    .map((r: any[]) => String(r[0] || ''))
    .filter(d => /^\d{8}$/.test(d))
    .map(d => `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`)
    .sort()
  if (dates.length > 0) {
    _report_start = dates[0]
    _report_end   = dates[dates.length - 1]
  }

  return {
    net_sales,
    gross_sales,
    discounts,
    refunds,
    orders,
    guests,
    avg_per_guest,
    avg_per_order,
    gratuity,
    tax,
    tips,
    categories,
    revenue_centers,
    lunch,
    dinner,
    discounts_items,
    _report_start,
    _report_end,
    date_warning: null, // se asigna en route.ts
  }
}

export function buildSalesDateWarning(
  data: any,
  weekStart: string,
  weekEnd: string
): string | null {
  if (!data._report_start || !data._report_end) return null
  if (data._report_start !== weekStart || data._report_end !== weekEnd) {
    return `Dates in report are ${data._report_start} to ${data._report_end}, but requested week is (${weekStart} to ${weekEnd}). Data does not match requested week.`
  }
  return null
}