// src/lib/parsers/parse-voids.ts
// Parser directo para Toast Void Details (.csv) — sin Claude
// Columnas: Order #, Opened Date, Void Date, Server, Approver,
//   Item Name, Reason, Item Quantity, Total Price
// Nota: encoding latin-1 (puede tener caracteres especiales en nombres)

export function parseVoidsCsv(csvContent: string): any {
  const lines = csvContent.split('\n').filter(l => l.trim())
  if (lines.length < 2) return { total: 0, total_items: 0, by_reason: [], items: [], date_warning: null }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))

  function idx(name: string): number {
    return headers.findIndex(h => h === name)
  }

  function num(v: string | undefined): number {
    if (!v || v.trim() === '') return 0
    return parseFloat(v.replace(/[$,"]/g, '').trim()) || 0
  }

  function parseRow(line: string): string[] {
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
  }

  const iServer   = idx('Server')
  const iItem     = idx('Item Name')
  const iReason   = idx('Reason')
  const iQty      = idx('Item Quantity')
  const iPrice    = idx('Total Price')

  const rows = lines.slice(1).map(parseRow)

  const items = rows.map(r => ({
    item_name: (r[iItem] || '').trim(),
    server:    (r[iServer] || '').trim(),
    reason:    (r[iReason] || '').trim(),
    quantity:  num(r[iQty]),
    price:     num(r[iPrice]),
  })).filter(i => i.item_name)

  // Por razón
  const reasonMap: Record<string, { count: number; total: number }> = {}
  items.forEach(i => {
    const r = i.reason || 'Sin razón'
    if (!reasonMap[r]) reasonMap[r] = { count: 0, total: 0 }
    reasonMap[r].count += 1
    reasonMap[r].total += i.price
  })
  const by_reason = Object.entries(reasonMap)
    .map(([reason, d]) => ({ reason, count: d.count, total: parseFloat(d.total.toFixed(2)) }))
    .sort((a, b) => b.total - a.total)

  const total       = parseFloat(items.reduce((s, i) => s + i.price, 0).toFixed(2))
  const total_items = items.reduce((s, i) => s + i.quantity, 0)

  return {
    total,
    total_items,
    by_reason,
    items,
    date_warning: null,
  }
}