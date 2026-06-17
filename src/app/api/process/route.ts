// src/app/api/process/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { parseProductMixExcel, parseMenuAnalysisExcel, matchAndCombine, parseAvtExcel, parseAvtCsv, parseReceivingCsv } from '@/lib/product-mix-processor'
import { parseSalesExcel, buildSalesDateWarning } from '@/lib/parsers/parse-sales'
import { parseLaborCsv } from '@/lib/parsers/parse-labor'
import { parseVoidsCsv } from '@/lib/parsers/parse-voids'
import { parseDiscountsCsv, upsertDiscountMappings } from '@/lib/parsers/parse-discounts'
import { parseCOGSExcel, buildCOGSDateWarning } from '@/lib/parsers/parse-cogs'
import { parseWasteExcel, buildWasteDateWarning } from '@/lib/parsers/parse-waste'
import { parseInventoryExcel } from '@/lib/parsers/parse-inventory'
import { parseEmployeePerformanceExcel } from '@/lib/parsers/parse-employee-performance'
import { parseKitchenDetailsCsv } from '@/lib/parsers/parse-kitchen-details'
import { requireRestaurantAccess } from '@/lib/api-auth'
import { validateUpload } from '@/lib/upload-guards'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const week = formData.get('week') as string
    const restaurant_id = formData.get('restaurant_id') as string

    if (!week) return NextResponse.json({ success: false, error: 'Semana requerida' }, { status: 400 })
    if (!restaurant_id) return NextResponse.json({ success: false, error: 'restaurant_id requerido' }, { status: 400 })

    // Validar tamaño y extensión de TODOS los archivos antes de procesar.
    // Fail-fast evita parsear un Excel si otro file viene con extension
    // inválida o excede el límite (defensa contra DoS / zip-bomb).
    const validationErrors: Record<string, string> = {}
    for (const [key, value] of formData.entries()) {
      if (value instanceof File && value.size > 0) {
        const v = validateUpload(key, value)
        if (v) validationErrors[key] = v.reason
      }
    }
    if (Object.keys(validationErrors).length > 0) {
      return NextResponse.json({ success: false, error: 'Archivos inválidos', validationErrors }, { status: 400 })
    }

    // Auth + verificación de membresía activa en este restaurante.
    const auth = await requireRestaurantAccess(request, restaurant_id)
    if (auth instanceof NextResponse) return auth
    const supabase = auth.supabase  // cliente con JWT del user → RLS aplica

    const weekStart = await getWeekStartFromFiscal(supabase, week, restaurant_id)
    const weekEnd = getWeekEndFromStart(weekStart)

    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({ restaurant_id, week, week_start: weekStart, week_end: weekEnd })
      .select().single()

    if (reportError) {
      console.error('reports.insert error:', reportError)
      return NextResponse.json({ success: false, error: 'No se pudo crear el reporte' }, { status: 400 })
    }

    const results: Record<string, any> = {}
    const warnings: Record<string, string> = {}

    // ── SALES (.xlsx) ──────────────────────────────────────────────────────
    const salesFile = formData.get('sales') as File | null
    if (salesFile && salesFile.size > 0) {
      try {
        const buffer = Buffer.from(await salesFile.arrayBuffer())
        const data = parseSalesExcel(buffer)
        const warning = buildSalesDateWarning(data, weekStart, weekEnd)
        if (warning) warnings['sales'] = warning
        delete data._report_start; delete data._report_end
        data.date_warning = warning
        await saveToDatabase(supabase, report.id, 'sales', data)
        results['sales'] = { net_sales: data.net_sales, orders: data.orders }
      } catch (err: any) {
        console.error('Error processing sales:', err)
        results['sales'] = { error: 'No se pudo procesar el archivo de sales' }
      }
    }

    // ── LABOR (.csv) ───────────────────────────────────────────────────────
    const laborFile = formData.get('labor') as File | null
    if (laborFile && laborFile.size > 0) {
      try {
        const buffer = Buffer.from(await laborFile.arrayBuffer())
        const data = parseLaborCsv(buffer.toString('utf-8'))
        await saveToDatabase(supabase, report.id, 'labor', data)
        results['labor'] = { total_pay: data.total_pay, employees: data.by_employee?.length }
      } catch (err: any) {
        console.error('Error processing labor:', err)
        results['labor'] = { error: 'No se pudo procesar el archivo de labor' }
      }
    }

    // ── COGS (.xlsx) ───────────────────────────────────────────────────────
    const cogsFile = formData.get('cogs') as File | null
    if (cogsFile && cogsFile.size > 0) {
      try {
        const buffer = Buffer.from(await cogsFile.arrayBuffer())
        const data = parseCOGSExcel(buffer)
        const warning = buildCOGSDateWarning(data, weekStart, weekEnd)
        if (warning) warnings['cogs'] = warning
        delete data._report_start; delete data._report_end
        data.date_warning = warning
        await saveToDatabase(supabase, report.id, 'cogs', data)
        results['cogs'] = { total: data.total }
      } catch (err: any) {
        console.error('Error processing cogs:', err)
        results['cogs'] = { error: 'No se pudo procesar el archivo de cogs' }
      }
    }

    // ── VOIDS (.csv latin-1) ───────────────────────────────────────────────
    const voidsFile = formData.get('voids') as File | null
    if (voidsFile && voidsFile.size > 0) {
      try {
        const buffer = Buffer.from(await voidsFile.arrayBuffer())
        const data = parseVoidsCsv(buffer.toString('latin1'))
        await saveToDatabase(supabase, report.id, 'voids', data)
        results['voids'] = { total: data.total, items: data.items?.length }
      } catch (err: any) {
        console.error('Error processing voids:', err)
        results['voids'] = { error: 'No se pudo procesar el archivo de voids' }
      }
    }

    // ── DISCOUNTS (.csv latin-1) ───────────────────────────────────────────
    const discountsFile = formData.get('discounts') as File | null
    if (discountsFile && discountsFile.size > 0) {
      try {
        const buffer = Buffer.from(await discountsFile.arrayBuffer())
        const data = parseDiscountsCsv(buffer.toString('latin1'))
        await saveToDatabase(supabase, report.id, 'discounts', data)
        if (data._discount_names?.length) {
          await upsertDiscountMappings(supabase, restaurant_id, data._discount_names)
        }
        results['discounts'] = { total: data.total, items: data.items?.length }
      } catch (err: any) {
        console.error('Error processing discounts:', err)
        results['discounts'] = { error: 'No se pudo procesar el archivo de discounts' }
      }
    }

    // ── WASTE (.xlsx) ──────────────────────────────────────────────────────
    const wasteFile = formData.get('waste') as File | null
    if (wasteFile && wasteFile.size > 0) {
      try {
        const buffer = Buffer.from(await wasteFile.arrayBuffer())
        const data = parseWasteExcel(buffer)
        const warning = buildWasteDateWarning(data, weekStart, weekEnd)
        if (warning) warnings['waste'] = warning
        delete data._report_start; delete data._report_end
        data.date_warning = warning
        await saveToDatabase(supabase, report.id, 'waste', data)
        results['waste'] = { total_cost: data.total_cost, items: data.items?.length }
      } catch (err: any) {
        console.error('Error processing waste:', err)
        results['waste'] = { error: 'No se pudo procesar el archivo de waste' }
      }
    }

    // ── INVENTORY (.xlsx) ──────────────────────────────────────────────────
    const inventoryFile = formData.get('inventory') as File | null
    if (inventoryFile && inventoryFile.size > 0) {
      try {
        const buffer = Buffer.from(await inventoryFile.arrayBuffer())
        const data = parseInventoryExcel(buffer)
        await saveToDatabase(supabase, report.id, 'inventory', data)
        results['inventory'] = { grand_total_current: data.grand_total_current }
      } catch (err: any) {
        console.error('Error processing inventory:', err)
        results['inventory'] = { error: 'No se pudo procesar el archivo de inventory' }
      }
    }

    // ── AVT (.csv o .xlsx) ─────────────────────────────────────────────────
    const avtFile = formData.get('avt') as File | null
    if (avtFile && avtFile.size > 0) {
      try {
        const buffer = Buffer.from(await avtFile.arrayBuffer())
        const isCsv = avtFile.name.endsWith('.csv')
        const avtData = isCsv ? parseAvtCsv(buffer.toString('utf-8')) : parseAvtExcel(buffer)
        results['avt'] = { shortages: avtData.shortages.length, overages: avtData.overages.length }
        await saveToDatabase(supabase, report.id, 'avt', avtData)
        const detectedCats = avtData.by_category.map((c: any) => c.category).filter(Boolean)
        for (const cat of detectedCats) {
          await supabase.from('avt_categories').upsert({
            restaurant_id, category: cat, active: true,
          }, { onConflict: 'restaurant_id,category', ignoreDuplicates: true })
        }
      } catch (err: any) {
        console.error('Error processing avt:', err)
        results['avt'] = { error: 'No se pudo procesar el archivo de avt' }
      }
    }

    // ── PRODUCT MIX + MENU ANALYSIS (.xlsx) ───────────────────────────────
    const productMixFile   = formData.get('product_mix') as File | null
    const menuAnalysisFile = formData.get('menu_analysis') as File | null
    if (productMixFile || menuAnalysisFile) {
      try {
        await processProductMixDirect(supabase, report.id, restaurant_id, productMixFile, menuAnalysisFile, results, warnings)
      } catch (err: any) {
        console.error('Error processing product mix:', err)
        results['product_mix'] = { error: 'No se pudo procesar el archivo de product_mix' }
      }
    }

    // ── RECEIVING (.csv) ───────────────────────────────────────────────────
    const receivingFile = formData.get('receiving') as File | null
    if (receivingFile && receivingFile.size > 0) {
      try {
        const buffer = Buffer.from(await receivingFile.arrayBuffer())
        const items = parseReceivingCsv(buffer.toString('utf-8'))
        await supabase.from('receiving_data').delete().eq('report_id', report.id)
        if (items.length > 0) {
          const rows = items.map((item: any) => ({ report_id: report.id, restaurant_id, week, ...item }))
          await supabase.from('receiving_data').insert(rows)
        }
        results['receiving'] = { items: items.length }
      } catch (err: any) {
        console.error('Error processing receiving:', err)
        results['receiving'] = { error: 'No se pudo procesar el archivo de receiving' }
      }
    }

    // ── EMPLOYEE PERFORMANCE (.xlsx) ───────────────────────────────────────
    const employeeFile = formData.get('employee_performance') as File | null
    if (employeeFile && employeeFile.size > 0) {
      try {
        const buffer = Buffer.from(await employeeFile.arrayBuffer())
        const data = parseEmployeePerformanceExcel(buffer)
        await supabase.from('employee_performance_data').insert({
          report_id: report.id, restaurant_id, week, employees: data.employees,
        })
        results['employee_performance'] = { employees: data.employees.length }
      } catch (err: any) {
        console.error('Error processing employee performance:', err)
        results['employee_performance'] = { error: 'No se pudo procesar el archivo de employee_performance' }
      }
    }

    // ── KITCHEN DETAILS (.csv) ─────────────────────────────────────────────
    const kitchenFile = formData.get('kitchen_details') as File | null
    if (kitchenFile && kitchenFile.size > 0) {
      try {
        const buffer = Buffer.from(await kitchenFile.arrayBuffer())
        const data = parseKitchenDetailsCsv(buffer.toString('utf-8'))
        await supabase.from('kitchen_performance_data').insert({
          report_id: report.id, restaurant_id, week,
          tickets: data.tickets,
          detected_stations: data.detected_stations,
        })
        results['kitchen_details'] = { tickets: data.tickets.length, stations: data.detected_stations.length }
      } catch (err: any) {
        console.error('Error processing kitchen details:', err)
        results['kitchen_details'] = { error: 'No se pudo procesar el archivo de kitchen_details' }
      }
    }

    return NextResponse.json({ success: true, report_id: report.id, week, processed: Object.keys(results), warnings })

  } catch (error: any) {
    console.error('process route error:', error)
    return NextResponse.json({ success: false, error: 'Error interno procesando reporte' }, { status: 500 })
  }
}

async function processProductMixDirect(
  supabase: SupabaseClient,
  reportId: string, restaurantId: string,
  productMixFile: File | null, menuAnalysisFile: File | null,
  results: Record<string, any>, warnings: Record<string, string>
) {
  let productMix: any = null
  let menuAnalysis: any = null
  if (productMixFile && productMixFile.size > 0) {
    const buffer = Buffer.from(await productMixFile.arrayBuffer())
    productMix = parseProductMixExcel(buffer)
    results['product_mix'] = { items: productMix.by_item?.length, menus: productMix.by_menu?.length }
  }
  if (menuAnalysisFile && menuAnalysisFile.size > 0) {
    const buffer = Buffer.from(await menuAnalysisFile.arrayBuffer())
    menuAnalysis = parseMenuAnalysisExcel(buffer)
    results['menu_analysis'] = { items: menuAnalysis.by_item?.length, total_theo_cost: menuAnalysis.total_theo_cost }
  }
  if (!productMix && !menuAnalysis) return
  const { data: savedMappings } = await supabase.from('category_mappings').select('source_category, mapped_to').eq('restaurant_id', restaurantId).eq('source_system', 'r365_item')
  const combined = matchAndCombine(
    productMix || { by_item: [], by_menu: [], by_category: {}, total_net_sales: 0, total_qty: 0, date_warning: null },
    menuAnalysis || { by_item: [], total_theo_cost: 0, total_sales: 0, date_warning: null },
    savedMappings || []
  )
  if (combined.unmatched_items.length > 0) {
    warnings['product_mix'] = `${combined.unmatched_items.length} items sin categoría — ve a Settings → Mapeo de Items para asignarlos`
  }
  const { error } = await supabase.from('product_mix_data').insert({
    report_id: reportId,
    raw_data: { ...combined.raw_data, unmatched_items: combined.unmatched_items },
    by_menu: combined.by_menu, by_category: combined.by_category,
    theo_cost_by_category: combined.theo_cost_by_category, total_theo_cost: combined.total_theo_cost,
  })
  if (error) {
    results['product_mix'] = { ...(results['product_mix'] || {}), error: 'No se pudo guardar product_mix' }
    console.error('Error saving product_mix_data:', error)
  }
}

async function saveToDatabase(supabase: SupabaseClient, reportId: string, fileType: string, data: any): Promise<{ error?: string }> {
  const tableMap: Record<string, string> = {
    sales: 'sales_data', labor: 'labor_data', cogs: 'cogs_data',
    voids: 'voids_data', discounts: 'discounts_data', waste: 'waste_data',
    inventory: 'inventory_data', avt: 'avt_data',
  }
  const table = tableMap[fileType]
  if (!table) return {}
  // raw_data se guarda solo para tablas donde el cliente lee campos no
  // promovidos a columnas (sales: tips/tax/gratuity/refunds · voids:
  // by_reason · product_mix: unmatched_items/by_item — pero product_mix
  // se persiste con su propio insert directo, no por aquí).
  // Tablas omitidas ahorran ~50% storage por upload sin romper UI.
  const KEEP_RAW = new Set(['sales', 'voids'])
  const insertData: Record<string, any> = { report_id: reportId }
  if (KEEP_RAW.has(fileType)) insertData.raw_data = data
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
    insertData.shortages = data.shortages; insertData.overages = data.overages
    insertData.all_items = data.all_items || []
    insertData.net_variance = data.net_variance_dollar
    insertData.total_shortage_dollar = data.total_shortage_dollar
    insertData.total_overage_dollar = data.total_overage_dollar
    insertData.by_category = data.by_category
  }
  const { error } = await supabase.from(table).insert(insertData)
  if (error) {
    console.error(`Error saving ${fileType}:`, error)
    return { error: `No se pudo guardar ${fileType}` }
  }
  return {}
}

async function getWeekStartFromFiscal(supabase: SupabaseClient, week: string, restaurantId: string): Promise<string> {
  const [, weekNum] = week.split('-W').map(Number)
  const { data: restaurant } = await supabase.from('restaurants').select('fiscal_year_start').eq('id', restaurantId).single()
  if (restaurant?.fiscal_year_start) {
    const fiscalStart = new Date(restaurant.fiscal_year_start + 'T00:00:00')
    const weekStart = new Date(fiscalStart)
    weekStart.setDate(fiscalStart.getDate() + (weekNum - 1) * 7)
    return weekStart.toISOString().split('T')[0]
  }
  return getWeekStartISO(week)
}

function getWeekEndFromStart(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00')
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return end.toISOString().split('T')[0]
}

function getWeekStartISO(week: string): string {
  const [year, weekNum] = week.split('-W').map(Number)
  const jan4 = new Date(year, 0, 4)
  const startOfWeek1 = new Date(jan4)
  startOfWeek1.setDate(jan4.getDate() - jan4.getDay() + 1)
  const weekStart = new Date(startOfWeek1)
  weekStart.setDate(startOfWeek1.getDate() + (weekNum - 1) * 7)
  return weekStart.toISOString().split('T')[0]
}