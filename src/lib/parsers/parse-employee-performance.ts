import * as XLSX from 'xlsx'

export interface EmployeePerformance {
  name: string
  net_sales: number
  gross_sales: number
  guest_count: number
  order_count: number
  total_labor_hours: number
  avg_net_sales_per_guest: number
  avg_order_value: number
  avg_turn_time: number
  non_cash_tips_pct: number
  voided_item_qty: number
  void_amount: number
  discount_amount: number
  // Per hour (from PerHour sheet)
  net_sales_per_hour: number
  guests_per_hour: number
  orders_per_hour: number
}

export interface EmployeePerformanceResult {
  employees: EmployeePerformance[]
  date_warning: string | null
}

function cleanNum(val: any): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  const s = String(val).replace(/[$,]/g, '').trim()
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

export function parseEmployeePerformanceExcel(buffer: Buffer): EmployeePerformanceResult {
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  // Overall sheet
  const overallSheet = workbook.Sheets['Overall_employeePerformance']
  if (!overallSheet) throw new Error('No se encontró la hoja Overall_employeePerformance')
  const overallRows: any[][] = XLSX.utils.sheet_to_json(overallSheet, { header: 1 })

  // PerHour sheet
  const perHourSheet = workbook.Sheets['PerHour_employeePerformance']
  const perHourRows: any[][] = perHourSheet
    ? XLSX.utils.sheet_to_json(perHourSheet, { header: 1 })
    : []

  // Find header row in overall
  let headerRow = -1
  for (let i = 0; i < overallRows.length; i++) {
    if (overallRows[i].some((c: any) => String(c || '').includes('EMPLOYEE_NAME'))) {
      headerRow = i; break
    }
  }
  if (headerRow === -1) throw new Error('No se encontró el header en Employee Performance')

  const headers = overallRows[headerRow].map((h: any) => String(h || '').trim())
  const idx = (name: string) => headers.findIndex(h => h === name)

  const nameIdx = idx('EMPLOYEE_NAME')
  const netSalesIdx = idx('NET_SALES')
  const grossSalesIdx = idx('GROSS_SALES')
  const guestIdx = idx('GUEST_COUNT')
  const orderIdx = idx('ORDER_COUNT')
  const hoursIdx = idx('TOTAL_LABOR_HOURS')
  const avgPerGuestIdx = idx('AVERAGE_NET_SALES_PER_GUEST')
  const avgOrderIdx = idx('AVERAGE_ORDER_VALUE')
  const turnTimeIdx = idx('AVERAGE_TURN_TIME')
  const tipsIdx = idx('NON_CASH_TIPS_PERCENTAGE')
  const voidQtyIdx = idx('VOIDED_ITEM_QUANTITY')
  const voidAmtIdx = idx('VOID_AMOUNT')
  const discountIdx = idx('DISCOUNT_AMOUNT')

  // Build per-hour lookup by name
  const perHourMap: Record<string, any> = {}
  if (perHourRows.length > 0) {
    let phHeaderRow = -1
    for (let i = 0; i < perHourRows.length; i++) {
      if (perHourRows[i].some((c: any) => String(c || '').includes('EMPLOYEE_NAME'))) {
        phHeaderRow = i; break
      }
    }
    if (phHeaderRow >= 0) {
      const phHeaders = perHourRows[phHeaderRow].map((h: any) => String(h || '').trim())
      const phNameIdx = phHeaders.findIndex(h => h === 'EMPLOYEE_NAME')
      const phNetSalesIdx = phHeaders.findIndex(h => h === 'NET_SALES')
      const phGuestIdx = phHeaders.findIndex(h => h === 'GUEST_COUNT')
      const phOrderIdx = phHeaders.findIndex(h => h === 'ORDER_COUNT')
      for (const row of perHourRows.slice(phHeaderRow + 1)) {
        if (!row[phNameIdx]) continue
        const name = String(row[phNameIdx]).trim()
        perHourMap[name] = {
          net_sales_per_hour: cleanNum(row[phNetSalesIdx]),
          guests_per_hour: cleanNum(row[phGuestIdx]),
          orders_per_hour: cleanNum(row[phOrderIdx]),
        }
      }
    }
  }

  const employees: EmployeePerformance[] = []

  for (const row of overallRows.slice(headerRow + 1)) {
    const name = String(row[nameIdx] || '').trim()
    if (!name) continue

    const ph = perHourMap[name] || { net_sales_per_hour: 0, guests_per_hour: 0, orders_per_hour: 0 }

    employees.push({
      name,
      net_sales: cleanNum(row[netSalesIdx]),
      gross_sales: cleanNum(row[grossSalesIdx]),
      guest_count: cleanNum(row[guestIdx]),
      order_count: cleanNum(row[orderIdx]),
      total_labor_hours: cleanNum(row[hoursIdx]),
      avg_net_sales_per_guest: cleanNum(row[avgPerGuestIdx]),
      avg_order_value: cleanNum(row[avgOrderIdx]),
      avg_turn_time: cleanNum(row[turnTimeIdx]),
      non_cash_tips_pct: cleanNum(row[tipsIdx]),
      voided_item_qty: cleanNum(row[voidQtyIdx]),
      void_amount: cleanNum(row[voidAmtIdx]),
      discount_amount: cleanNum(row[discountIdx]),
      net_sales_per_hour: ph.net_sales_per_hour,
      guests_per_hour: ph.guests_per_hour,
      orders_per_hour: ph.orders_per_hour,
    })
  }

  return { employees, date_warning: null }
}