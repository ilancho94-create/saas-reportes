// src/lib/parsers/parse-discounts.ts
// Parser directo para Toast Discount Details (.csv)
// Auto-popula discount_mappings en Supabase al procesar

export function parseDiscountsCsv(csvContent: string): any {
  const lines = csvContent.split('\n').filter(l => l.trim())
  if (lines.length < 2) return { total: 0, total_applications: 0, total_orders: 0, items: [], date_warning: null }

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

  const iOrder    = idx('Order #')
  const iDiscount = idx('Discount Name')
  const iAmount   = idx('Discount Amount')

  const rows = lines.slice(1).map(parseRow)

  const discMap: Record<string, { orders: Set<number>; applications: number; amount: number }> = {}
  rows.forEach(r => {
    const name = (r[iDiscount] || '').trim()
    if (!name) return
    const orderNum = parseInt(r[iOrder]) || 0
    const amount   = num(r[iAmount])
    if (!discMap[name]) discMap[name] = { orders: new Set(), applications: 0, amount: 0 }
    discMap[name].orders.add(orderNum)
    discMap[name].applications += 1
    discMap[name].amount += amount
  })

  const total = parseFloat(rows.reduce((s, r) => s + num(r[iAmount]), 0).toFixed(2))
  const total_applications = rows.filter(r => (r[iDiscount] || '').trim()).length
  const allOrders = new Set(rows.map(r => parseInt(r[iOrder])).filter(Boolean))
  const total_orders = allOrders.size

  const items = Object.entries(discMap)
    .map(([name, d]) => ({
      name,
      applications: d.applications,
      orders:       d.orders.size,
      amount:       parseFloat(d.amount.toFixed(2)),
      pct:          total > 0 ? parseFloat((d.amount / total * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.amount - a.amount)

  return {
    total,
    total_applications,
    total_orders,
    items,
    date_warning: null,
    _discount_names: Object.keys(discMap), // para auto-poblar discount_mappings
  }
}

// Upsert de discount_mappings — solo inserta nombres nuevos, no toca clasificaciones existentes
export async function upsertDiscountMappings(
  supabase: any,
  restaurantId: string,
  discountNames: string[]
): Promise<void> {
  if (!discountNames.length) return
  const { data: existing } = await supabase
    .from('discount_mappings')
    .select('discount_name')
    .eq('restaurant_id', restaurantId)
  const existingNames = new Set((existing || []).map((e: any) => e.discount_name))
  const newNames = discountNames.filter(name => !existingNames.has(name))
  if (!newNames.length) return
  await supabase.from('discount_mappings').insert(
    newNames.map(name => ({
      restaurant_id: restaurantId,
      discount_name: name,
      is_operational: false,
    }))
  )
}