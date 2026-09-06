// Fixtures sintéticos para pruebas del engine de Costo de Uso.
// NO usan datos reales de ningún cliente. Los números están elegidos
// para que las verificaciones sean fáciles de hacer a mano.

export const DEFAULT_MAPPINGS = [
  { source_category: 'FOOD',       mapped_to: 'food' },
  { source_category: 'LIQUOR',     mapped_to: 'liquor' },
  { source_category: 'BEER',       mapped_to: 'beer' },
  { source_category: 'WINE',       mapped_to: 'wine' },
  { source_category: 'NA BEV',     mapped_to: 'na_beverage' },
]

// Ayuda: construye una fila `weeks` con la forma exacta que produce loadData().
export interface WeekBuildArgs {
  week: string                              // 'YYYY-Wnn'
  weekStart?: string
  weekEnd?: string
  reportId?: string
  netSales?: number
  salesCats?: Array<{ name: string; net: number; gross?: number }>
  cogs?: Partial<Record<string, number>>
  inventory?: Array<{ account: string; current_value: number; previous_value: number }> | null
  theoCostByCat?: Partial<Record<string, number>>
  productMixRaw?: Record<string, unknown>
  discountsItems?: Array<{ name: string; amount: number }>
  discountsTotal?: number
}

export function makeWeek(a: WeekBuildArgs) {
  const inv = a.inventory
  return {
    report: {
      id: a.reportId || `rpt-${a.week}`,
      week: a.week,
      week_start: a.weekStart || null,
      week_end: a.weekEnd || null,
      restaurant_id: 'test-restaurant',
    },
    sales: a.salesCats || a.netSales !== undefined ? {
      net_sales: a.netSales ?? 0,
      categories: a.salesCats || [],
    } : null,
    cogs: a.cogs ? { by_category: a.cogs } : null,
    inventory: inv === null ? null : (inv !== undefined ? {
      by_account: inv,
      grand_total_current: inv.reduce((s, x) => s + x.current_value, 0),
      grand_total_previous: inv.reduce((s, x) => s + x.previous_value, 0),
    } : null),
    productMix: (a.theoCostByCat || a.productMixRaw) ? {
      theo_cost_by_category: a.theoCostByCat || {},
      raw_data: a.productMixRaw || undefined,
    } : null,
    discounts: (a.discountsItems || a.discountsTotal) ? {
      total: a.discountsTotal || 0,
      items: a.discountsItems || [],
    } : null,
    waste: null,
    voids: null,
  }
}

// Reduce un array a Set-like para tener acceso rápido a valores.
export function skippedSet(weeks: string[]): Set<string> {
  return new Set(weeks)
}
