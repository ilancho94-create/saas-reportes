// src/lib/parsers/parse-waste.ts
// Parser directo para R365 Waste History (.xlsx) — sin Claude
// Sheet: "Waste History"
// Row 4 = headers: Number, Date, Location, Item, U of M, Qty, Each Amount, Total, Account Name
// Data starts row 5, last data row has GRAND TOTAL in col 3

export function parseWasteExcel(buffer: Buffer): any {
  const XLSX = require('xlsx')
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets['Waste History']
  if (!ws) throw new Error('Sheet "Waste History" not found')

  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  function num(v: any): number {
    if (v === null || v === undefined) return 0
    return parseFloat(String(v).replace(/[$,]/g, '')) || 0
  }

  // ── Detect date range from row 2 ──────────────────────────────────────────
  let _report_start: string | null = null
  let _report_end:   string | null = null
  const dateRow = String(rows[2]?.[0] || '')
  const dateMatch = dateRow.match(/(\d+\/\d+\/\d+)\s*-\s*(\d+\/\d+\/\d+)/)
  if (dateMatch) {
    const parseDate = (d: string) => {
      const [m, day, y] = d.split('/')
      return `${y.length === 2 ? '20' + y : y}-${m.padStart(2,'0')}-${day.padStart(2,'0')}`
    }
    _report_start = parseDate(dateMatch[1])
    _report_end   = parseDate(dateMatch[2])
  }

  // ── Data rows (row 5+, skip GRAND TOTAL) ─────────────────────────────────
  // Columns: 0=empty, 1=Number, 2=Date, 3=Location, 4=Item, 5=UofM, 6=Qty, 7=EachAmount, 8=Total, 9=AccountName
  const items = rows.slice(5).filter((r: any[]) => {
    const loc = String(r[3] || '').trim()
    return r[1] != null && loc !== 'GRAND TOTAL' && loc !== ''
  }).map((r: any[]) => ({
    name:      String(r[4] || '').trim(),
    uom:       String(r[5] || '').trim(),
    qty:       num(r[6]),
    unit_cost: num(r[7]),
    total:     num(r[8]),
    category:  String(r[9] || '').trim(),
  })).filter(i => i.name)

  const total_cost = parseFloat(items.reduce((s, i) => s + i.total, 0).toFixed(2))
  const total_qty  = parseFloat(items.reduce((s, i) => s + i.qty, 0).toFixed(2))

  return {
    total_cost,
    total_qty,
    items,
    _report_start,
    _report_end,
    date_warning: null,
  }
}

export function buildWasteDateWarning(data: any, weekStart: string, weekEnd: string): string | null {
  if (!data._report_start || !data._report_end) return null
  if (data._report_start !== weekStart) {
    return `Las fechas del reporte (${data._report_start}) no coinciden con la semana especificada ${weekStart} al ${weekEnd}`
  }
  return null
}