// src/lib/parsers/parse-inventory.ts
// Parser directo para R365 Inventory Count Review (.xlsx) — sin Claude
// Sheet: "Inventory Count Review"
// Row 0 = "Mula Cantina - Monday, March 23, 2026" (contiene fecha)
// Row 4 = "Total by Inventory Account"
// Row 6 = headers: [blank, blank, blank, Current Value, blank, blank, Previous Value, blank, Adjustment]
// Rows 7-12 = account rows
// Row 13 = Grand Total (col1 = "Grand Total")

export function parseInventoryExcel(buffer: Buffer): any {
  const XLSX = require('xlsx')
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets['Inventory Count Review']
  if (!ws) throw new Error('Sheet "Inventory Count Review" not found')

  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  function num(v: any): number {
    if (v === null || v === undefined) return 0
    return parseFloat(String(v).replace(/[$,]/g, '')) || 0
  }

  // ── Extract count date from row 0 ─────────────────────────────────────────
  // Format: "Mula Cantina - Monday, March 23, 2026"
  let count_date: string | null = null
  const titleRow = String(rows[0]?.[0] || '')
  const months: Record<string, string> = {
    January:'01', February:'02', March:'03', April:'04', May:'05', June:'06',
    July:'07', August:'08', September:'09', October:'10', November:'11', December:'12'
  }
  const dateMatch = titleRow.match(/(\w+)\s+(\d+),\s+(\d{4})/)
  if (dateMatch) {
    const [, month, day, year] = dateMatch
    const mm = months[month]
    if (mm) count_date = `${year}-${mm}-${day.padStart(2, '0')}`
  }

  // ── Find "Total by Inventory Account" section ─────────────────────────────
  // Headers row has "Current Value" at col 3, "Previous Value" at col 6, "Adjustment" at col 8
  // Account rows: col0 = account name, col3 = current, col6 = previous, col8 = adjustment
  // Grand Total: col1 = "Grand Total"

  let inSection = false
  const by_account: any[] = []
  let grand_total_current = 0
  let grand_total_previous = 0

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (String(r[0] || '').trim() === 'Total by Inventory Account') {
      inSection = true
      continue
    }
    if (!inSection) continue

    // Grand Total row
    if (String(r[1] || '').trim() === 'Grand Total') {
      grand_total_current  = num(r[3])
      grand_total_previous = num(r[6])
      break
    }

    // Account row: col0 has account name, col3 has current value
    const account = String(r[0] || '').trim()
    if (account && account !== 'nan' && r[3] != null) {
      const current_value  = num(r[3])
      const previous_value = num(r[6])
      const adjustment     = num(r[8])
      by_account.push({ account, current_value, previous_value, adjustment })
    }
  }

  return {
    count_date,
    by_account,
    grand_total_current,
    grand_total_previous,
    _report_date: count_date,
    date_warning: null,
  }
}