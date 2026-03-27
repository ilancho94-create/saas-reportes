// src/lib/parsers/parse-cogs.ts
// Busca columnas por NOMBRE de header — funciona aunque R365 cambie el layout

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

  // ── Date range from row 2 ─────────────────────────────────────────────────
  let _report_start: string | null = null
  let _report_end: string | null = null
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

  // ── Build column index from header row (índice 6) ─────────────────────────
  const headerRow: any[] = rows[6] || []
  const colIndex: Record<string, number> = {}
  headerRow.forEach((h: any, i: number) => {
    if (h) colIndex[String(h).trim()] = i
  })

  function col(row: any[], name: string): number {
    const idx = colIndex[name]
    return idx !== undefined ? num(row[idx]) : 0
  }

  // ── Total row ─────────────────────────────────────────────────────────────
  const totalRow = rows.find((r: any[]) => r[0] != null && String(r[0]).trim() === 'Total')
  if (!totalRow) throw new Error('Total row not found in COGS')

  // ── by_category usando Envelope columns (nombre termina en ' E') ──────────
  // Estos son los subtotales que R365 calcula por categoría
  const by_category = {
    food:        col(totalRow, 'Food E'),
    na_beverage: col(totalRow, 'N/A Beverage E'),
    liquor:      col(totalRow, 'Liquor E'),
    beer:        col(totalRow, 'Beer E'),
    wine:        col(totalRow, 'Wine E'),
    general:     col(totalRow, 'General E'),
  }

  const totalIdx = colIndex['Total']
  const total = totalIdx !== undefined ? num(totalRow[totalIdx]) : 0

  // ── by_account: todos los envelopes detectados (para Settings → Mapeo COGS)
  // Solo guarda los ' E' que tengan valor > 0
  const by_account: Record<string, number> = {}
  headerRow.forEach((h: any, i: number) => {
    if (!h) return
    const name = String(h).trim()
    if (name.endsWith(' E') && totalRow[i] != null && num(totalRow[i]) !== 0) {
      by_account[name] = num(totalRow[i])
    }
  })

  // ── by_vendor ─────────────────────────────────────────────────────────────
  const by_vendor = rows
    .filter((r: any[], i: number) => {
      if (i < 7) return false
      return r[0] != null && String(r[0]).trim() !== '' &&
             String(r[0]).trim() !== 'Total' &&
             r[1] == null
    })
    .map((r: any[]) => ({
      name:        String(r[0]).trim(),
      food:        col(r, 'Food E'),
      na_beverage: col(r, 'N/A Beverage E'),
      liquor:      col(r, 'Liquor E'),
      beer:        col(r, 'Beer E'),
      wine:        col(r, 'Wine E'),
      general:     col(r, 'General E'),
      total:       totalIdx !== undefined ? num(r[totalIdx]) : 0,
    }))

  return {
    total,
    by_category,
    by_account,
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
