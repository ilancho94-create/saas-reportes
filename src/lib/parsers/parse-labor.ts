// src/lib/parsers/parse-labor.ts
// Parser directo para Toast Payroll Export (.csv) — sin Claude
// Columnas: Employee, Job Title, Regular Hours, Overtime Hours, Hourly Rate,
//   Regular Pay, Overtime Pay, Total Pay, Net Sales, Non-Cash Tips, ...

export function parseLaborCsv(csvContent: string): any {
  const lines = csvContent.split('\n').filter(l => l.trim())
  if (lines.length < 2) return { error: 'Archivo vacío' }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))

  function idx(name: string): number {
    return headers.findIndex(h => h === name)
  }

  function num(v: string | undefined): number {
    if (!v || v.trim() === '') return 0
    return parseFloat(v.replace(/[$,"]/g, '').trim()) || 0
  }

  const rows = lines.slice(1).map(line => {
    // CSV parse básico que maneja comillas
    const cols: string[] = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes }
      else if (ch === ',' && !inQuotes) { cols.push(current); current = '' }
      else { current += ch }
    }
    cols.push(current)
    return cols
  })

  const iEmployee   = idx('Employee')
  const iJobTitle   = idx('Job Title')
  const iHourlyRate = idx('Hourly Rate')
  const iRegHours   = idx('Regular Hours')
  const iOtHours    = idx('Overtime Hours')
  const iRegPay     = idx('Regular Pay')
  const iOtPay      = idx('Overtime Pay')
  const iTotalPay   = idx('Total Pay')

  // Solo empleados con Hourly Rate > 0
  const employees = rows
    .filter(r => r[iHourlyRate] && num(r[iHourlyRate]) > 0)
    .map(r => ({
      name:          (r[iEmployee] || '').trim(),
      position:      (r[iJobTitle] || '').trim(),
      hourly_rate:   num(r[iHourlyRate]),
      regular_hours: num(r[iRegHours]),
      ot_hours:      num(r[iOtHours]),
      regular_pay:   num(r[iRegPay]),
      ot_pay:        num(r[iOtPay]),
      total_pay:     num(r[iTotalPay]),
    }))

  // Totales
  const total_regular_hours = parseFloat(employees.reduce((s, e) => s + e.regular_hours, 0).toFixed(2))
  const total_ot_hours      = parseFloat(employees.reduce((s, e) => s + e.ot_hours, 0).toFixed(2))
  const total_pay           = parseFloat(employees.reduce((s, e) => s + e.total_pay, 0).toFixed(2))

  // Por puesto
  const posMap: Record<string, { regular_hours: number; ot_hours: number; total_pay: number }> = {}
  employees.forEach(e => {
    if (!posMap[e.position]) posMap[e.position] = { regular_hours: 0, ot_hours: 0, total_pay: 0 }
    posMap[e.position].regular_hours += e.regular_hours
    posMap[e.position].ot_hours      += e.ot_hours
    posMap[e.position].total_pay     += e.total_pay
  })
  const by_position = Object.entries(posMap).map(([position, d]) => ({
    position,
    regular_hours: parseFloat(d.regular_hours.toFixed(2)),
    ot_hours:      parseFloat(d.ot_hours.toFixed(2)),
    total_pay:     parseFloat(d.total_pay.toFixed(2)),
  }))

  return {
    total_regular_hours,
    total_ot_hours,
    total_pay,
    by_position,
    by_employee: employees,
    date_warning: null,
  }
}