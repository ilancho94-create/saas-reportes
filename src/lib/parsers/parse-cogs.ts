// src/lib/parsers/parse-cogs.ts
// Parser directo para R365 COGS Analysis by Vendor (.xlsx) — sin Claude
// Sheet: "COGS Analysis by Vendor"
// Columna layout (row 6 = headers):
//   col 0 = Vendor name | col 26 = Total
//   col 5  = Food E (envelope total food)
//   col 14 = N/A Beverage E
//   col 16 = Liquor E
//   col 19 = Beer E
//   col 21 = General E

export function parseCOGSExcel(buffer: Buffer): any {
  const XLSX = require('xlsx')
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets['COGS Analysis by Vendor']
  if (!ws) throw new Error('Sheet "COGS Analysis by Vendor" not found')

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

  // ── Find Total row (col0 === 'Total') ─────────────────────────────────────
  const totalRow = rows.find((r: any[]) => String(r[0]).trim() === 'Total')
  if (!totalRow) throw new Error('Total row not found in COGS')

  const by_category = {
    food:         num(totalRow[5]),   // Food E
    na_beverage:  num(totalRow[14]),  // N/A Beverage E
    liquor:       num(totalRow[16]),  // Liquor E
    beer:         num(totalRow[19]),  // Beer E
    wine:         0,                  // R365 no separa wine en COGS — se incluye en liquor
    general:      num(totalRow[21]),  // General E
  }
  const total = num(totalRow[26])

  // ── Per vendor rows: col0 non-null, col1 null = vendor header ─────────────
  const by_vendor = rows
    .filter((r: any[], i: number) => {
      if (i < 7) return false
      return r[0] != null && String(r[0]).trim() !== '' &&
             String(r[0]).trim() !== 'Total' &&
             r[1] == null
    })
    .map((r: any[]) => ({
      name:        String(r[0]).trim(),
      food:        num(r[5]),
      na_beverage: num(r[14]),
      liquor:      num(r[16]),
      beer:        num(r[19]),
      general:     num(r[21]),
      total:       num(r[26]),
    }))

  return {
    total,
    by_category,
    by_vendor,
    _report_start,
    _report_end,
    date_warning: null,
  }
}

export function buildCOGSDateWarning(data: any, weekStart: string, weekEnd: string): string | null {
  if (!data._report_start || !data._report_end) return null
  if (data._report_start !== weekStart || data._report_end !== weekEnd) {
    return `Report period is ${data._report_start} - ${data._report_end} but requested week is (${weekStart} to ${weekEnd}). Dates do not match.`
  }
  return null
}