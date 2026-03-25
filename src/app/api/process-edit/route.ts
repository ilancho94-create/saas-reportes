// src/app/api/process-edit/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { parseProductMixExcel, parseMenuAnalysisExcel, matchAndCombine } from '@/lib/product-mix-processor'

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

    console.log('=== PROCESS-EDIT ===')
    console.log('Keys recibidos:', [...formData.keys()])
    console.log('week:', week, '| report_id:', reportId)

    if (!week || !reportId) {
      return NextResponse.json({ success: false, error: 'Faltan parámetros' })
    }

    const results: Record<string, any> = {}
    const warnings: Record<string, string> = {}
    const fileTypes = ['sales', 'labor', 'cogs', 'voids', 'discounts', 'waste', 'inventory', 'avt']

    // Procesar archivos estándar con Claude
    for (const fileType of fileTypes) {
      const file = formData.get(fileType) as File | null
      if (!file || file.size === 0) continue
      console.log(`Processing ${fileType}: ${file.name} (${file.size} bytes)`)
      try {
        const extracted = await extractWithClaude(file, fileType, week)
        results[fileType] = extracted
        if (extracted.date_warning) warnings[fileType] = extracted.date_warning
        await supabase.from(TABLE_MAP[fileType]).delete().eq('report_id', reportId)
        await saveToDatabase(reportId, fileType, extracted)
      } catch (err) {
        console.error(`Error processing ${fileType}:`, err)
        results[fileType] = { error: 'No se pudo procesar' }
      }
    }

    // Procesar Product Mix + Menu Analysis directamente del Excel
    const productMixFile = formData.get('product_mix') as File | null
    const menuAnalysisFile = formData.get('menu_analysis') as File | null

    if (productMixFile || menuAnalysisFile) {
      try {
        // Obtener restaurant_id del reporte
        const { data: report } = await supabase
          .from('reports').select('restaurant_id').eq('id', reportId).single()
        const restaurantId = report?.restaurant_id || '00000000-0000-0000-0000-000000000001'

        let productMix: any = null
        let menuAnalysis: any = null

        if (productMixFile && productMixFile.size > 0) {
          const buffer = Buffer.from(await productMixFile.arrayBuffer())
          productMix = parseProductMixExcel(buffer)
          results['product_mix'] = { items: productMix.by_item?.length }
          console.log(`Product Mix: ${productMix.by_item?.length} items`)
        }

        if (menuAnalysisFile && menuAnalysisFile.size > 0) {
          const buffer = Buffer.from(await menuAnalysisFile.arrayBuffer())
          menuAnalysis = parseMenuAnalysisExcel(buffer)
          results['menu_analysis'] = { items: menuAnalysis.by_item?.length, total_theo_cost: menuAnalysis.total_theo_cost }
          console.log(`Menu Analysis: ${menuAnalysis.by_item?.length} items, theo_cost: ${menuAnalysis.total_theo_cost}`)
        }

        // Si solo viene uno, recuperar el otro del raw_data existente en Supabase
        if (!productMix || !menuAnalysis) {
          const { data: existing } = await supabase
            .from('product_mix_data').select('raw_data').eq('report_id', reportId).single()
          if (existing?.raw_data) {
            if (!productMix && existing.raw_data.product_mix) {
              productMix = existing.raw_data.product_mix
              console.log('product_mix recuperado de Supabase')
            }
            if (!menuAnalysis && existing.raw_data.menu_analysis) {
              menuAnalysis = existing.raw_data.menu_analysis
              console.log('menu_analysis recuperado de Supabase')
            }
          }
        }

        // Cargar category_mappings
        const { data: savedMappings } = await supabase
          .from('category_mappings')
          .select('source_category, mapped_to')
          .eq('restaurant_id', restaurantId)
          .eq('source_system', 'r365_item')

        const combined = matchAndCombine(
          productMix || { by_item: [], by_menu: [], by_category: {}, total_net_sales: 0, total_qty: 0, date_warning: null },
          menuAnalysis || { by_item: [], total_theo_cost: 0, total_sales: 0, date_warning: null },
          savedMappings || []
        )

        console.log(`Match: total_theo_cost=${combined.total_theo_cost}, unmatched=${combined.unmatched_items.length}`)

        if (combined.unmatched_items.length > 0) {
          warnings['product_mix'] = `${combined.unmatched_items.length} items sin categoría — ve a Settings → Mapeo de Items`
        }

        // Borrar y reinserta
        await supabase.from('product_mix_data').delete().eq('report_id', reportId)
        const { error } = await supabase.from('product_mix_data').insert({
          report_id: reportId,
          raw_data: { ...combined.raw_data, unmatched_items: combined.unmatched_items },
          by_menu: combined.by_menu,
          by_category: combined.by_category,
          theo_cost_by_category: combined.theo_cost_by_category,
          total_theo_cost: combined.total_theo_cost,
        })
        if (error) console.error('Error saving product_mix_data:', error)
        else console.log('product_mix_data saved OK. total_theo_cost:', combined.total_theo_cost)

      } catch (err) {
        console.error('Error processing product mix:', err)
        results['product_mix'] = { error: 'No se pudo procesar' }
      }
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
    workbook.SheetNames.forEach((name: string) => {
      const sheet = workbook.Sheets[name]
      sheets.push(`=== Sheet: ${name} ===\n${XLSX.utils.sheet_to_csv(sheet)}`)
    })
    fileContent = sheets.join('\n\n')
  }

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
Columnas del reporte: Number, Date, Location, Item, U of M, Qty, Each Amount, Total, Account Name.
MAPEO EXACTO de columnas:
- "name" = columna Item
- "uom" = columna U of M
- "qty" = columna Qty (cantidad física, ej: 16.80)
- "unit_cost" = columna Each Amount (costo por unidad, ej: $1.84)
- "total" = columna Total (costo total = qty × unit_cost, ej: $30.92)
- "category" = columna Account Name
NO incluyas el campo "comment".
${dateInstruction}
{"total_cost":número,"total_qty":número,"items":[{"name":string,"uom":string,"qty":número,"unit_cost":número,"total":número,"category":string}],"date_warning":string|null}`,
    inventory: `Analiza este reporte Inventory Count Review de Restaurant365 y extrae los datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
Busca la sección "Total by Inventory Account" con columnas Current Value y Previous Value.
${dateInstruction}
{"count_date":"YYYY-MM-DD","by_account":[{"account":string,"current_value":número,"previous_value":número,"adjustment":número}],"grand_total_current":número,"grand_total_previous":número,"date_warning":string|null}`,
    avt: `Analiza este reporte Actual vs Theoretical Analysis de Restaurant365.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.

ESTRUCTURA DEL REPORTE:
- Tiene categorías principales: BAR, FOOD, BEVERAGE, CHEMICALS, SUPPLIES
- Columnas (de izquierda a derecha): Item, UofM, Unit Cost, [Quantity section: Begin/Purch/Xfer/End/Actl/Theo/Var/Waste/Donation/UnExp Var/Effcy], [Dollar section: mismas columnas]
- LA COLUMNA QUE IMPORTA ES "UnExp Var" (Unexpected Variance) — es la varianza DESPUÉS de descontar waste
- En la sección Quantity: UnExp Var es la columna 19 (contando desde 0)
- En la sección Dollar: UnExp Var es la columna 31

CLASIFICACIÓN:
- UnExp Var POSITIVO ($) = FALTANTE (aparece en rojo en el reporte) = más consumo del teórico
- UnExp Var NEGATIVO ($) = SOBRANTE (aparece entre paréntesis en el reporte) = menos consumo del teórico
- Ignora items donde UnExp Var $ = 0

EXTRAE todos los items con UnExp Var ≠ 0, con su categoría principal (BAR/FOOD/BEVERAGE/CHEMICALS/SUPPLIES).

${dateInstruction}
{"by_category":[{"category":string,"total_shortage_dollar":número,"total_overage_dollar":número,"net_dollar":número}],"shortages":[{"name":string,"category":string,"uom":string,"unit_cost":número,"unexp_var_qty":número,"unexp_var_dollar":número}],"overages":[{"name":string,"category":string,"uom":string,"unit_cost":número,"unexp_var_qty":número,"unexp_var_dollar":número}],"total_shortage_dollar":número,"total_overage_dollar":número,"net_variance_dollar":número,"date_warning":string|null}`,
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
  try {
    return JSON.parse(clean)
  } catch {
    throw new Error(`No se pudo parsear la respuesta de Claude para ${fileType}`)
  }
}

async function saveToDatabase(reportId: string, fileType: string, data: any) {
  const table = TABLE_MAP[fileType]
  if (!table) return
  const insertData: Record<string, any> = { report_id: reportId, raw_data: data }
  if (fileType === 'sales') {
    insertData.net_sales = data.net_sales; insertData.gross_sales = data.gross_sales
    insertData.discounts = data.discounts; insertData.orders = data.orders
    insertData.guests = data.guests; insertData.avg_per_guest = data.avg_per_guest
    insertData.avg_per_order = data.avg_per_order; insertData.categories = data.categories
    insertData.revenue_centers = data.revenue_centers
    insertData.lunch_dinner = { lunch: data.lunch, dinner: data.dinner }
  } else if (fileType === 'labor') {
    insertData.total_hours = data.total_regular_hours; insertData.total_ot_hours = data.total_ot_hours
    insertData.total_pay = data.total_pay; insertData.by_position = data.by_position
    insertData.by_employee = data.by_employee
  } else if (fileType === 'cogs') {
    insertData.total = data.total; insertData.by_vendor = data.by_vendor
    insertData.by_category = data.by_category
  } else if (fileType === 'waste') {
    insertData.total_cost = data.total_cost; insertData.items = data.items
  } else if (fileType === 'voids') {
    insertData.total = data.total; insertData.items = data.items
  } else if (fileType === 'discounts') {
    insertData.total = data.total; insertData.items = data.items
  } else if (fileType === 'inventory') {
    insertData.count_date = data.count_date; insertData.by_account = data.by_account
    insertData.grand_total_current = data.grand_total_current
    insertData.grand_total_previous = data.grand_total_previous
  } else if (fileType === 'avt') {
    insertData.net_variance = data.net_variance; insertData.shortages = data.shortages
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