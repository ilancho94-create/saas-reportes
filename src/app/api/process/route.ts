import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const week = formData.get('week') as string

    if (!week) {
      return NextResponse.json({ success: false, error: 'Semana requerida' })
    }

    const authHeader = request.headers.get('authorization')
    const { data: { user } } = await supabase.auth.getUser(
      authHeader?.replace('Bearer ', '') || ''
    )

    let restaurant_id = '00000000-0000-0000-0000-000000000001'

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('restaurant_id')
        .eq('id', user.id)
        .single()

      if (profile?.restaurant_id) {
        restaurant_id = profile.restaurant_id
      }
    }

    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        restaurant_id,
        week,
        week_start: getWeekStart(week),
        week_end: getWeekEnd(week),
      })
      .select()
      .single()

    if (reportError) {
      console.error('Error creating report:', reportError)
      return NextResponse.json({ success: false, error: reportError.message })
    }

    const results: Record<string, any> = {}
    const warnings: Record<string, string> = {}

    const fileTypes = ['sales', 'labor', 'cogs', 'voids', 'discounts', 'waste', 'inventory', 'avt']

    for (const fileType of fileTypes) {
      const file = formData.get(fileType) as File | null
      if (!file) continue

      console.log(`Processing ${fileType}...`)

      try {
        const extracted = await extractWithClaude(file, fileType, week)
        results[fileType] = extracted

        if (extracted.date_warning) {
          warnings[fileType] = extracted.date_warning
        }

        await saveToDatabase(report.id, fileType, extracted)

      } catch (err) {
        console.error(`Error processing ${fileType}:`, err)
        results[fileType] = { error: 'No se pudo procesar' }
      }
    }

    return NextResponse.json({
      success: true,
      report_id: report.id,
      week,
      processed: Object.keys(results),
      warnings,
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
      const csv = XLSX.utils.sheet_to_csv(sheet)
      sheets.push(`=== Sheet: ${name} ===\n${csv}`)
    })
    fileContent = sheets.join('\n\n')
  }

  const weekStart = getWeekStart(week)
  const weekEnd = getWeekEnd(week)

  const dateInstruction = `
Semana seleccionada por el usuario: ${week}
Fecha inicio esperada: ${weekStart}
Fecha fin esperada: ${weekEnd}

IMPORTANTE: Además de extraer los datos, agrega un campo "date_warning" al JSON.
Si encuentras fechas en el archivo que NO coinciden con la semana ${week} (${weekStart} al ${weekEnd}), 
pon "date_warning" con un mensaje descriptivo en español explicando qué fechas encontraste.
Si las fechas coinciden o no hay fechas visibles, pon "date_warning": null.
`

  const prompts: Record<string, string> = {
    sales: `Analiza este reporte de ventas de Toast POS y extrae los datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
${dateInstruction}
{
  "net_sales": número,
  "gross_sales": número,
  "discounts": número,
  "refunds": número,
  "orders": número,
  "guests": número,
  "avg_per_guest": número,
  "avg_per_order": número,
  "gratuity": número,
  "tax": número,
  "tips": número,
  "categories": [{"name": string, "items": número, "gross": número, "discount": número, "net": número, "pct": número}],
  "revenue_centers": [{"name": string, "net": número, "pct": número}],
  "lunch": {"orders": número, "net": número, "discounts": número},
  "dinner": {"orders": número, "net": número, "discounts": número},
  "date_warning": string | null
}`,

    labor: `Analiza este reporte de labor/payroll de Toast POS y extrae los datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
REGLA IMPORTANTE: Solo incluye empleados que tengan un Hourly Rate numérico mayor a 0.
${dateInstruction}
{
  "total_regular_hours": número,
  "total_ot_hours": número,
  "total_pay": número,
  "by_position": [{"position": string, "regular_hours": número, "ot_hours": número, "total_pay": número}],
  "by_employee": [{"name": string, "position": string, "hourly_rate": número, "regular_hours": número, "ot_hours": número, "total_pay": número}],
  "date_warning": string | null
}`,

    cogs: `Analiza este reporte COGS Analysis by Vendor de Restaurant365 y extrae los datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
${dateInstruction}
{
  "total": número,
  "by_category": {"food": número, "na_beverage": número, "liquor": número, "beer": número, "general": número},
  "by_vendor": [{"name": string, "food": número, "na_beverage": número, "liquor": número, "beer": número, "general": número, "total": número}],
  "date_warning": string | null
}`,

    voids: `Analiza este reporte de voids de Toast POS y extrae los datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
${dateInstruction}
{
  "total": número,
  "total_items": número,
  "by_reason": [{"reason": string, "count": número, "total": número}],
  "items": [{"item_name": string, "server": string, "reason": string, "quantity": número, "price": número}],
  "date_warning": string | null
}`,

    discounts: `Analiza este reporte de descuentos de Toast POS y extrae los datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
${dateInstruction}
{
  "total": número,
  "total_applications": número,
  "total_orders": número,
  "items": [{"name": string, "applications": número, "orders": número, "amount": número, "pct": número}],
  "date_warning": string | null
}`,

    waste: `Analiza este reporte de Waste History de Restaurant365 y extrae los datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
${dateInstruction}
{
  "total_cost": número,
  "total_qty": número,
  "items": [{"name": string, "uom": string, "qty": número, "unit_cost": número, "total": número, "category": string, "comment": string}],
  "date_warning": string | null
}`,
inventory: `Analiza este reporte Inventory Count Review de Restaurant365 y extrae los datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
El reporte tiene una sección "Total by Inventory Account" con Current Value y Previous Value.
${dateInstruction}
{
  "count_date": "YYYY-MM-DD",
  "by_account": [
    {"account": string, "current_value": número, "previous_value": número, "adjustment": número}
  ],
  "grand_total_current": número,
  "grand_total_previous": número,
  "date_warning": string | null
}`,
    avt: `Analiza este reporte Actual vs Theoretical Analysis de Restaurant365 y extrae datos en JSON.
Responde SOLO con JSON válido, sin texto adicional, sin markdown, sin backticks.
FALTANTE = varianza POSITIVA. SOBRANTE = varianza NEGATIVA.
${dateInstruction}
{
  "total_shortages": número,
  "total_overages": número,
  "net_variance": número,
  "shortages": [{"name": string, "uom": string, "unit_cost": número, "variance_qty": número, "variance_dollar": número}],
  "overages": [{"name": string, "uom": string, "unit_cost": número, "variance_qty": número, "variance_dollar": número}],
  "date_warning": string | null
}`,
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
    console.error('JSON parse error for', fileType, ':', clean.substring(0, 200))
    throw new Error(`No se pudo parsear la respuesta de Claude para ${fileType}`)
  }
}

async function saveToDatabase(reportId: string, fileType: string, data: any) {
  const tableMap: Record<string, string> = {
    sales: 'sales_data',
    labor: 'labor_data',
    cogs: 'cogs_data',
    voids: 'voids_data',
    discounts: 'discounts_data',
    waste: 'waste_data',
    inventory: 'inventory_data',
    avt: 'avt_data',
  }

  const table = tableMap[fileType]
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
  } else if (fileType === 'inventory') {
    insertData.count_date = data.count_date
    insertData.by_account = data.by_account
    insertData.grand_total_current = data.grand_total_current
    insertData.grand_total_previous = data.grand_total_previous
  } else if (fileType === 'voids') {
    insertData.total = data.total
    insertData.items = data.items
  } else if (fileType === 'discounts') {
    insertData.total = data.total
    insertData.items = data.items
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