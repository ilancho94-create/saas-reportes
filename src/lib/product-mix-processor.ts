const MENU_TO_CAT: Record<string, string> = {
  'FOOD MENU': 'food',
  'FOOD MENU TOGO': 'food',
  "KID'S MENU": 'food',
  'AYCE TACOS': 'food',
  'AYCE TACOS W': 'food',
  'NON/ALC BEVERAGES': 'na_beverage',
  'BEER': 'beer',
  'LIQUOR': 'liquor',
  'WINE': 'wine',
}

const SKIP_ITEMS = ['totals & averages', 'total', 'grand total']

export interface ToastItem {
  item: string
  menu: string
  menu_category: string
  qty: number
  net_sales: number
}

export interface R365Item {
  item: string
  qty: number
  sales: number
  unit_cost: number
  theo_cost: number
}

export interface ProductMixResult {
  by_menu: { menu: string; qty: number; net_sales: number; gross_sales: number }[]
  by_category: Record<string, number>
  by_item: ToastItem[]
  total_net_sales: number
  total_qty: number
  date_warning: string | null
}

export interface MenuAnalysisResult {
  by_item: R365Item[]
  total_theo_cost: number
  total_sales: number
  date_warning: string | null
}

export interface CombinedResult {
  by_menu: any[]
  by_category: Record<string, number>
  theo_cost_by_category: Record<string, number>
  total_theo_cost: number
  unmatched_items: { item: string; theo_cost: number }[]
  raw_data: { product_mix: any; menu_analysis: any }
}

export function parseProductMixExcel(buffer: Buffer): ProductMixResult {
  const XLSX = require('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  const by_menu: any[] = []
  if (workbook.Sheets['Menus']) {
    const rows: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets['Menus'], { header: 1 })
    for (const row of rows.slice(1)) {
      const menu = row[0]
      if (!menu || menu === '') continue
      by_menu.push({
        menu: String(menu).trim(),
        qty: Number(row[1]) || 0,
        gross_sales: Number(row[3]) || 0,
        net_sales: Number(row[7]) || 0,
      })
    }
  }

  const by_item: ToastItem[] = []
  let total_net_sales = 0
  let total_qty = 0

  if (workbook.Sheets['All levels']) {
    const rows: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets['All levels'], { header: 1 })
    for (const row of rows.slice(1)) {
      if (row[0] !== 'menuItem') continue
      const item = row[4]
      if (!item) continue
      const menu = String(row[1] || '').trim()
      const cat = MENU_TO_CAT[menu.toUpperCase()] || 'general'
      const qty = Number(row[8]) || 0
      const net_sales = Number(row[15]) || 0
      by_item.push({ item: String(item).trim(), menu, menu_category: cat, qty, net_sales })
      total_net_sales += net_sales
      total_qty += qty
    }
  }

  const by_category: Record<string, number> = {
    food: 0, na_beverage: 0, liquor: 0, beer: 0, wine: 0, general: 0
  }
  by_menu.forEach(m => {
    const cat = MENU_TO_CAT[m.menu.toUpperCase()] || 'general'
    by_category[cat] = (by_category[cat] || 0) + m.net_sales
  })

  return { by_menu, by_category, by_item, total_net_sales, total_qty, date_warning: null }
}

export function parseMenuAnalysisExcel(buffer: Buffer): MenuAnalysisResult {
  const XLSX = require('xlsx')
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  const sheetName = workbook.SheetNames[0]
  const rows: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 })

  let headerRow = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][2] === 'Item' && rows[i][13] === 'Theo Cost') {
      headerRow = i
      break
    }
  }

  if (headerRow === -1) throw new Error('No se encontró el header en Menu Item Analysis')

  const by_item: R365Item[] = []
  let total_theo_cost = 0
  let total_sales = 0

  for (const row of rows.slice(headerRow + 1)) {
    if (row[0] !== '' && row[0] !== null && row[0] !== undefined) continue
    const item = row[2]
    if (!item || typeof item !== 'string') continue
    const itemClean = item.trim()
    if (SKIP_ITEMS.includes(itemClean.toLowerCase())) continue

    const theo_cost = Number(row[13]) || 0
    const unit_cost = Number(row[7]) || 0
    const qty = Number(row[10]) || 0
    const sales = Number(row[11]) || 0
    const effective_theo = theo_cost > 0 ? theo_cost : (unit_cost * qty)
    if (effective_theo <= 0) continue

    by_item.push({ item: itemClean, qty, sales, unit_cost, theo_cost: effective_theo })
    total_theo_cost += effective_theo
    total_sales += sales
  }

  return { by_item, total_theo_cost, total_sales, date_warning: null }
}

export function matchAndCombine(
  productMix: ProductMixResult,
  menuAnalysis: MenuAnalysisResult,
  savedMappings: { source_category: string; mapped_to: string }[]
): CombinedResult {
  const mappingLookup: Record<string, string> = {}
  for (const m of savedMappings) {
    mappingLookup[m.source_category.toLowerCase().trim()] = m.mapped_to
  }

  const toastLookup: Record<string, string> = {}
  for (const t of productMix.by_item) {
    toastLookup[t.item.toLowerCase().trim()] = t.menu_category
  }

  const theo_cost_by_category: Record<string, number> = {
    food: 0, na_beverage: 0, liquor: 0, beer: 0, wine: 0, general: 0
  }
  const unmatched_items: { item: string; theo_cost: number }[] = []

  for (const r365 of menuAnalysis.by_item) {
    const key = r365.item.toLowerCase().trim()

    if (toastLookup[key]) {
      theo_cost_by_category[toastLookup[key]] = (theo_cost_by_category[toastLookup[key]] || 0) + r365.theo_cost
      continue
    }

    if (mappingLookup[key]) {
      theo_cost_by_category[mappingLookup[key]] = (theo_cost_by_category[mappingLookup[key]] || 0) + r365.theo_cost
      continue
    }

    unmatched_items.push({ item: r365.item, theo_cost: r365.theo_cost })
  }

  const total_theo_cost = Object.values(theo_cost_by_category).reduce((a, b) => a + b, 0)

  return {
    by_menu: productMix.by_menu,
    by_category: productMix.by_category,
    theo_cost_by_category,
    total_theo_cost,
    unmatched_items,
    raw_data: { product_mix: productMix, menu_analysis: menuAnalysis },
  }
}