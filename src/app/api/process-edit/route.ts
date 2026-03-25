import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const TABLE_MAP: Record<string, string> = {
  sales: 'sales_data', labor: 'labor_data', cogs: 'cogs_data',
  voids: 'voids_data', discounts: 'discounts_data', waste: 'waste_data',
  inventory: 'inventory_data', avt: 'avt_data',
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const week = formData.get('week') as string
    const reportId = formData.get('report_id') as string

    // DEBUG: log all keys received
    const allKeys = [...formData.keys()]
    console.log('=== PROCESS-EDIT DEBUG ===')
    console.log('Keys recibidos:', allKeys)
    console.log('week:', week)
    console.log('report_id:', reportId)

    if (!week || !reportId) {
      return NextResponse.json({ success: false, error: 'Faltan parámetros' })
    }

    const results: Record<string, any> = {}
    const warnings: Record<string, string> = {}
    const fileTypes = ['sales', 'labor', 'cogs', 'voids', 'discounts', 'waste', 'inventory', 'product_mix', 'menu_analysis', 'avt']

    let productMixData: any = null
    let menuAnalysisData: any = null

    for (const fileType of fileTypes) {
      const file = formData.get(fileType) as File | null
      if (!file || file.size === 0) {
        console.log(`Skipping ${fileType}: no file or empty`)
        continue
      }
      console.log(`Processing ${fileType}: ${file.name} (${file.size} bytes)`)
      try {
        const extracted = await extractWithClaude(file, fileType, week)
        console.log(`Extracted ${fileType}:`, JSON.stringify(extracted).substring(0, 200))
        results[fileType] = extracted
        if (extracted.date_warning) warnings[fileType] = extracted.date_warning

        if (fileType === 'product_mix') {
          productMixData = extracted
        } else if (fileType === 'menu_analysis') {
          menuAnalysisData = extracted
          console.log('menu_analysis by_item count:', extracted?.by_item?.length)
          console.log('menu_analysis total_theo_cost:', extracted?.total_theo_cost)
        } else {
          const table = TABLE_MAP[fileType]
          if (table) {
            await supabase.from(table).delete().eq('report_id', reportId)
            await saveToDatabase(reportId, fileType, extracted)
          }
        }
      } catch (err) {
        console.error(`Error processing ${fileType}:`, err)
        results[fileType] = { error: 'No se pudo procesar' }
      }
    }

    console.log('productMixData present:', !!productMixData)
    console.log('menuAnalysisData present:', !!menuAnalysisData)

    if (productMixData || menuAnalysisData) {
      // Borrar registro anterior y guardar nuevo
      const { error: deleteError } = await supabase
        .from('product_mix_data')
        .delete()
        .eq('report_id', reportId)
      if (deleteError) console.error('Error deleting product_mix_data:', deleteError)

      // Si solo viene uno de los dos, recuperar el otro de Supabase
      if (!productMixData || !menuAnalysisData) {
        console.log('Solo un archivo recibido, recuperando el otro de Supabase...')
        const { data: existing } = await supabase
          .from('product_mix_data')
          .select('raw_data')
          .eq('report_id', reportId)
          .single()

        if (existing?.raw_data) {
          if (!productMixData && existing.raw_data.product_mix) {
            productMixData = existing.raw_data.product_mix
            console.log('product_mix recuperado de Supabase')
          }
          if (!menuAnalysisData && existing.raw_data.menu_analysis) {
            menuAnalysisData = existing.raw_data.menu_analysis
            console.log('menu_analysis recuperado de Supabase')
          }
        }
      }

      await saveProductMixCombined(reportId, productMixData, menuAnalysisData)
    }

    return NextResponse.json({
      success: true, report_id: reportId, week,
      processed: Object.keys(results), warnings,
    })

  } catch (error: any) {
    console.error('API Error:', error)
    return NextResponse.json({ success: false, error: error.message })
  }
}

async function extractWithClaude(file: File, fileType: string, week: string): Promise<any> {
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const isCSV = file.name.endsWith('.csv')
  const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')

  let fileContent = ''
  if (isCSV) {
    fileContent = buffer.toString('utf-8')
  } else if (isExcel) {
    const XLSX = require('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheets: string[] = []
    if (fileType === 'product_mix') {
      const targetSheets = ['All levels', 'Menus']
      workbook.SheetNames.forEach((name: string) => {
        if (targetSheets.includes(name)) {
          const sheet = workbook.Sheets[name]
          sheets.push(`=== Sheet: ${name} ===\n${XLSX.utils.sheet_to_csv(sheet)}`)
        }
      })
      if (sheets.length === 0) {
        // fallback: usar todas las hojas si no encuentra las esperadas
        console.log('product_mix: sheets disponibles:', workbook.SheetNames)
        workbook.SheetNames.forEach((name: string) => {
          const sheet = workbook.Sheets[name]
          sheets.push(`=== Sheet: ${name} ===\n${XLSX.utils.sheet_to_csv(sheet)}`)
        })
      }
    } else {
      workbook.SheetNames.forEach((name: string) => {
        const sheet = workbook.Sheets[name]
        sheets.push(`=== Sheet: ${name} ===\n${XLSX.utils.sheet_to_csv(sheet)}`)
      })
    }
    fileContent = sheets.join('\n\n')
  } else {
    // Intentar leer como texto si no es CSV ni Excel conocido
    fileContent = buffer.toString('utf-8')
  }

  if (!fileContent || fileContent.trim().length === 0) {
    throw new Error(`Archivo vacío o formato no reconocido para ${fileType}`)
  }

  console.log(`fileContent length for ${fileType}:`, fileContent.length)

  const weekStart = getWeekStart(week)
  const weekEnd = getWeekEnd(week)
  const dateInstruction = `Semana: ${week} (${weekStart} al ${weekEnd}). Si fechas no coinciden agrega "date_warning" con mensaje. Si coinciden pon "date_warning": null.`

  const prompts: Record<string, string> = {
    sales: `Analiza este reporte de ventas de Toast POS y extrae los datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
${dateInstruction}
{"net_sales":número,"gross_sales":número,"discounts":número,"refunds":número,"orders":número,"guests":número,"avg_per_guest":número,"avg_per_order":número,"gratuity":número,"tax":número,"tips":número,"categories":[{"name":string,"items":número,"gross":número,"discount":número,"net":número,"pct":número}],"revenue_centers":[{"name":string,"net":número,"pct":número}],"lunch":{"orders":número,"net":número,"discounts":número},"dinner":{"orders":número,"net":número,"discounts":número},"date_warning":string|null}`,

    labor: `Analiza este reporte de labor/payroll de Toast POS y extrae los datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
Solo incluye empleados con Hourly Rate > 0.
${dateInstruction}
{"total_regular_hours":número,"total_ot_hours":número,"total_pay":número,"by_position":[{"position":string,"regular_hours":número,"ot_hours":número,"total_pay":número}],"by_employee":[{"name":string,"position":string,"hourly_rate":número,"regular_hours":número,"ot_hours":número,"total_pay":número}],"date_warning":string|null}`,

    cogs: `Analiza este reporte COGS Analysis by Vendor de Restaurant365 y extrae los datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
${dateInstruction}
{"total":número,"by_category":{"food":número,"na_beverage":número,"liquor":número,"beer":número,"wine":número,"general":número},"by_vendor":[{"name":string,"food":número,"na_beverage":número,"liquor":número,"beer":número,"general":número,"total":número}],"date_warning":string|null}`,

    voids: `Analiza este reporte de voids de Toast POS y extrae los datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
${dateInstruction}
{"total":número,"total_items":número,"by_reason":[{"reason":string,"count":número,"total":número}],"items":[{"item_name":string,"server":string,"reason":string,"quantity":número,"price":número}],"date_warning":string|null}`,

    discounts: `Analiza este reporte de descuentos de Toast POS y extrae los datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
${dateInstruction}
{"total":número,"total_applications":número,"total_orders":número,"items":[{"name":string,"applications":número,"orders":número,"amount":número,"pct":número}],"date_warning":string|null}`,

    waste: `Analiza este reporte de Waste History de Restaurant365 y extrae los datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
${dateInstruction}
{"total_cost":número,"total_qty":número,"items":[{"name":string,"uom":string,"qty":número,"unit_cost":número,"total":número,"category":string,"comment":string}],"date_warning":string|null}`,

    inventory: `Analiza este reporte Inventory Count Review de Restaurant365 y extrae los datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
Busca la sección "Total by Inventory Account" con columnas Current Value y Previous Value.
${dateInstruction}
{"count_date":"YYYY-MM-DD","by_account":[{"account":string,"current_value":número,"previous_value":número,"adjustment":número}],"grand_total_current":número,"grand_total_previous":número,"date_warning":string|null}`,

    product_mix: `Analiza este reporte Product Mix de Toast POS.
Usa pestaña "Menus" para ventas por menú y pestaña "All levels" para detalle por item.
Solo incluye filas donde Type = "menuItem" (no modifiers ni specialRequests).

CATEGORIZACIÓN:
- FOOD MENU, FOOD MENU TOGO, KID'S MENU, AYCE TACOS, AYCE TACOS W → "food"
- NON/ALC BEVERAGES → "na_beverage"
- BEER → "beer"
- LIQUOR → "liquor"
- WINE → "wine"
- Cualquier otro → "general"

Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
${dateInstruction}
{"by_menu":[{"menu":string,"qty":número,"net_sales":número,"gross_sales":número}],"by_category":{"food":número,"na_beverage":número,"liquor":número,"beer":número,"wine":número,"general":número},"by_item":[{"item":string,"menu":string,"menu_category":string,"qty":número,"net_sales":número}],"total_net_sales":número,"total_qty":número,"date_warning":string|null}`,

    menu_analysis: `Analiza este reporte Menu Item Analysis de Restaurant365.
Columnas: Item, Price, Cost, Margin, Cost%, Qty, Sales, Sls%, Theo Cost, Profit, Category.

IMPORTANTE:
- El campo "Category" (Star/Dog/Plow Horse/Puzzle) es clasificación de rentabilidad, NO es categoría de menú.
- "Theo Cost" = costo teórico total del item (unit_cost × qty vendida). Si está vacío o es 0, calcula: Cost × Qty.
- Extrae TODOS los items con Theo Cost > 0.
- NO intentes categorizar por menú, solo extrae item, qty, sales y theo_cost.

Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
${dateInstruction}
{"by_item":[{"item":string,"qty":número,"sales":número,"unit_cost":número,"theo_cost":número}],"total_theo_cost":número,"total_sales":número,"date_warning":string|null}`,

    avt: `Analiza este reporte Actual vs Theoretical Analysis de Restaurant365 y extrae datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
FALTANTE = varianza POSITIVA. SOBRANTE = varianza NEGATIVA.
${dateInstruction}
{"total_shortages":número,"total_overages":número,"net_variance":número,"shortages":[{"name":string,"uom":string,"unit_cost":número,"variance_qty":número,"variance_dollar":número}],"overages":[{"name":string,"uom":string,"unit_cost":número,"variance_qty":número,"variance_dollar":número}],"date_warning":string|null}`,
  }

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `${prompts[fileType]}\n\nContenido del archivo:\n${fileContent.substring(0, 15000)}`
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

  console.log(`Claude raw response for ${fileType} (first 300 chars):`, clean.substring(0, 300))

  try {
    return JSON.parse(clean)
  } catch {
    console.error(`Parse error for ${fileType}. Raw text:`, clean.substring(0, 500))
    throw new Error(`No se pudo parsear la respuesta de Claude para ${fileType}`)
  }
}

async function saveProductMixCombined(reportId: string, productMix: any, menuAnalysis: any) {
  console.log('saveProductMixCombined - productMix present:', !!productMix)
  console.log('saveProductMixCombined - menuAnalysis present:', !!menuAnalysis)
  console.log('saveProductMixCombined - menuAnalysis by_item count:', menuAnalysis?.by_item?.length)

  const insertData: Record<string, any> = {
    report_id: reportId,
    raw_data: { product_mix: productMix, menu_analysis: menuAnalysis },
  }

  if (productMix) {
    insertData.by_menu = productMix.by_menu
    insertData.by_category = productMix.by_category || buildCategoryFromMenus(productMix.by_menu)
    insertData.by_item = productMix.by_item
    insertData.total_net_sales = productMix.total_net_sales
    insertData.total_qty = productMix.total_qty
  }

  if (productMix?.by_item && menuAnalysis?.by_item && menuAnalysis.by_item.length > 0) {
    // Caso completo: hacer match por nombre de item
    const theoCostByCategory: Record<string, number> = {
      food: 0, na_beverage: 0, liquor: 0, beer: 0, wine: 0, general: 0
    }
    let matchCount = 0
    productMix.by_item.forEach((toastItem: any) => {
      const r365Item = menuAnalysis.by_item.find((r: any) =>
        r.item?.toLowerCase().trim() === toastItem.item?.toLowerCase().trim()
      )
      if (r365Item && Number(r365Item.theo_cost) > 0) {
        const cat = toastItem.menu_category || 'general'
        theoCostByCategory[cat] = (theoCostByCategory[cat] || 0) + Number(r365Item.theo_cost)
        matchCount++
      }
    })
    console.log(`Match count: ${matchCount} de ${productMix.by_item.length} items`)
    insertData.theo_cost_by_category = theoCostByCategory
    insertData.total_theo_cost = Object.values(theoCostByCategory)
      .reduce((a: number, b: number) => a + b, 0)
    console.log('total_theo_cost calculado:', insertData.total_theo_cost)

  } else if (menuAnalysis?.total_theo_cost && Number(menuAnalysis.total_theo_cost) > 0) {
    // Caso parcial: usar total directo de R365 sin match por categoría
    insertData.total_theo_cost = menuAnalysis.total_theo_cost
    console.log('Usando total_theo_cost directo de R365:', insertData.total_theo_cost)
  }

  const { error } = await supabase.from('product_mix_data').insert(insertData)
  if (error) {
    console.error('Error saving product_mix_data:', error)
  } else {
    console.log('product_mix_data guardado correctamente')
  }
}

function buildCategoryFromMenus(byMenu: any[]) {
  if (!byMenu) return {}
  const map: Record<string, number> = {}
  const menuToCat: Record<string, string> = {
    'FOOD MENU': 'food', 'FOOD MENU TOGO': 'food',
    "KID'S MENU": 'food', 'AYCE TACOS': 'food', 'AYCE TACOS W': 'food',
    'NON/ALC BEVERAGES': 'na_beverage', 'BEER': 'beer',
    'LIQUOR': 'liquor', 'WINE': 'wine',
  }
  byMenu.forEach((m: any) => {
    const cat = menuToCat[m.menu?.toUpperCase()] || 'general'
    map[cat] = (map[cat] || 0) + (m.net_sales || 0)
  })
  return map
}

async function saveToDatabase(reportId: string, fileType: string, data: any) {
  const table = TABLE_MAP[fileType]
  if (!table) return
  const insertData: Record<string, any> = { report_id: reportId, raw_data: data }

  if (fileType === 'sales') {
    insertData.net_sales = data.net_sales
    insertData.gross_sales = data.gross_sales
    insertData.discounts = data.discounts
    insertData.orders = data.orders
    insertData.guests = data.guests
    insertData.avg_per_guest = data.avg_per_guest
    insertData.avg_per_order = data.avg_per_order
    insertData.categories = data.categories
    insertData.revenue_centers = data.revenue_centers
    insertData.lunch_dinner = { lunch: data.lunch, dinner: data.dinner }
  } else if (fileType === 'labor') {
    insertData.total_hours = data.total_regular_hours
    insertData.total_ot_hours = data.total_ot_hours
    insertData.total_pay = data.total_pay
    insertData.by_position = data.by_position
    insertData.by_employee = data.by_employee
  } else if (fileType === 'cogs') {
    insertData.total = data.total
    insertData.by_vendor = data.by_vendor
    insertData.by_category = data.by_category
  } else if (fileType === 'waste') {
    insertData.total_cost = data.total_cost
    insertData.items = data.items
  } else if (fileType === 'voids') {
    insertData.total = data.total
    insertData.items = data.items
  } else if (fileType === 'discounts') {
    insertData.total = data.total
    insertData.items = data.items
  } else if (fileType === 'inventory') {
    insertData.count_date = data.count_date
    insertData.by_account = data.by_account
    insertData.grand_total_current = data.grand_total_current
    insertData.grand_total_previous = data.grand_total_previous
  } else if (fileType === 'avt') {
    insertData.net_variance = data.net_variance
    insertData.shortages = data.shortages
    insertData.overages = data.overages
  }

  const { error } = await supabase.from(table).insert(insertData)
  if (error) console.error(`Error saving ${fileType}:`, error)
}

function getWeekStart(week: string): string {
  const [year, weekNum] = week.split('-W').map(Number)
  const jan4 = new Date(year, 0, 4)
  const startOfWeek1 = new Date(jan4)
  startOfWeek1.setDate(jan4.getDate() - jan4.getDay() + 1)
  const weekStart = new Date(startOfWeek1)
  weekStart.setDate(startOfWeek1.getDate() + (weekNum - 1) * 7)
  return weekStart.toISOString().split('T')[0]
}

function getWeekEnd(week: string): string {
  const start = new Date(getWeekStart(week))
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return end.toISOString().split('T')[0]
}