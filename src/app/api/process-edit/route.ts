// src/app/api/process-edit/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseProductMixExcel, parseMenuAnalysisExcel, matchAndCombine, parseAvtExcel, parseAvtCsv, parseReceivingCsv } from '@/lib/product-mix-processor'
import { parseSalesExcel, buildSalesDateWarning } from '@/lib/parsers/parse-sales'
import { parseLaborCsv } from '@/lib/parsers/parse-labor'
import { parseVoidsCsv } from '@/lib/parsers/parse-voids'
import { parseDiscountsCsv } from '@/lib/parsers/parse-discounts'
import { parseCOGSExcel, buildCOGSDateWarning } from '@/lib/parsers/parse-cogs'
import { parseWasteExcel, buildWasteDateWarning } from '@/lib/parsers/parse-waste'
import { parseInventoryExcel } from '@/lib/parsers/parse-inventory'

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

    if (!week || !reportId) {
      return NextResponse.json({ success: false, error: 'Faltan parámetros' })
    }

    // Obtener weekStart/weekEnd del reporte existente
    const { data: existingReport } = await supabase
      .from('reports').select('week_start, week_end, restaurant_id').eq('id', reportId).single()
    const weekStart = existingReport?.week_start || ''
    const weekEnd   = existingReport?.week_end   || ''

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
        await supabase.from('sales_data').delete().eq('report_id', reportId)
        await saveToDatabase(reportId, 'sales', data)
        results['sales'] = { net_sales: data.net_sales, orders: data.orders }
      } catch (err: any) {
        console.error('Error processing sales:', err)
        results['sales'] = { error: err.message }
      }
    }

    // ── LABOR (.csv) ───────────────────────────────────────────────────────
    const laborFile = formData.get('labor') as File | null
    if (laborFile && laborFile.size > 0) {
      try {
        const buffer = Buffer.from(await laborFile.arrayBuffer())
        const data = parseLaborCsv(buffer.toString('utf-8'))
        await supabase.from('labor_data').delete().eq('report_id', reportId)
        await saveToDatabase(reportId, 'labor', data)
        results['labor'] = { total_pay: data.total_pay, employees: data.by_employee?.length }
      } catch (err: any) {
        console.error('Error processing labor:', err)
        results['labor'] = { error: err.message }
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
        await supabase.from('cogs_data').delete().eq('report_id', reportId)
        await saveToDatabase(reportId, 'cogs', data)
        results['cogs'] = { total: data.total }
      } catch (err: any) {
        console.error('Error processing cogs:', err)
        results['cogs'] = { error: err.message }
      }
    }

    // ── VOIDS (.csv latin-1) ───────────────────────────────────────────────
    const voidsFile = formData.get('voids') as File | null
    if (voidsFile && voidsFile.size > 0) {
      try {
        const buffer = Buffer.from(await voidsFile.arrayBuffer())
        const data = parseVoidsCsv(buffer.toString('latin1'))
        await supabase.from('voids_data').delete().eq('report_id', reportId)
        await saveToDatabase(reportId, 'voids', data)
        results['voids'] = { total: data.total, items: data.items?.length }
      } catch (err: any) {
        console.error('Error processing voids:', err)
        results['voids'] = { error: err.message }
      }
    }

    // ── DISCOUNTS (.csv latin-1) ───────────────────────────────────────────
    const discountsFile = formData.get('discounts') as File | null
    if (discountsFile && discountsFile.size > 0) {
      try {
        const buffer = Buffer.from(await discountsFile.arrayBuffer())
        const data = parseDiscountsCsv(buffer.toString('latin1'))
        await supabase.from('discounts_data').delete().eq('report_id', reportId)
        await saveToDatabase(reportId, 'discounts', data)
        results['discounts'] = { total: data.total, items: data.items?.length }
      } catch (err: any) {
        console.error('Error processing discounts:', err)
        results['discounts'] = { error: err.message }
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
        await supabase.from('waste_data').delete().eq('report_id', reportId)
        await saveToDatabase(reportId, 'waste', data)
        results['waste'] = { total_cost: data.total_cost, items: data.items?.length }
      } catch (err: any) {
        console.error('Error processing waste:', err)
        results['waste'] = { error: err.message }
      }
    }

    // ── INVENTORY (.xlsx) ──────────────────────────────────────────────────
    const inventoryFile = formData.get('inventory') as File | null
    if (inventoryFile && inventoryFile.size > 0) {
      try {
        const buffer = Buffer.from(await inventoryFile.arrayBuffer())
        const data = parseInventoryExcel(buffer)
        await supabase.from('inventory_data').delete().eq('report_id', reportId)
        await saveToDatabase(reportId, 'inventory', data)
        results['inventory'] = { grand_total_current: data.grand_total_current }
      } catch (err: any) {
        console.error('Error processing inventory:', err)
        results['inventory'] = { error: err.message }
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
        await supabase.from('avt_data').delete().eq('report_id', reportId)
        await saveToDatabase(reportId, 'avt', avtData)
        const restaurantId = existingReport?.restaurant_id || '00000000-0000-0000-0000-000000000001'
        const detectedCats = avtData.by_category.map((c: any) => c.category).filter(Boolean)
        for (const cat of detectedCats) {
          await supabase.from('avt_categories').upsert({
            restaurant_id: restaurantId, category: cat, active: true,
          }, { onConflict: 'restaurant_id,category', ignoreDuplicates: true })
        }
      } catch (err: any) {
        console.error('Error processing avt:', err)
        results['avt'] = { error: err.message }
      }
    }

    // ── PRODUCT MIX + MENU ANALYSIS (.xlsx) ───────────────────────────────
    const productMixFile   = formData.get('product_mix') as File | null
    const menuAnalysisFile = formData.get('menu_analysis') as File | null
    if (productMixFile || menuAnalysisFile) {
      try {
        const restaurantId = existingReport?.restaurant_id || '00000000-0000-0000-0000-000000000001'
        let productMix: any = null
        let menuAnalysis: any = null

        if (productMixFile && productMixFile.size > 0) {
          const buffer = Buffer.from(await productMixFile.arrayBuffer())
          productMix = parseProductMixExcel(buffer)
          results['product_mix'] = { items: productMix.by_item?.length }
        }
        if (menuAnalysisFile && menuAnalysisFile.size > 0) {
          const buffer = Buffer.from(await menuAnalysisFile.arrayBuffer())
          menuAnalysis = parseMenuAnalysisExcel(buffer)
          results['menu_analysis'] = { items: menuAnalysis.by_item?.length, total_theo_cost: menuAnalysis.total_theo_cost }
        }

        // Si falta uno, recuperar del existente
        if (!productMix || !menuAnalysis) {
          const { data: existing } = await supabase.from('product_mix_data').select('raw_data').eq('report_id', reportId).single()
          if (existing?.raw_data) {
            if (!productMix && existing.raw_data.product_mix) productMix = existing.raw_data.product_mix
            if (!menuAnalysis && existing.raw_data.menu_analysis) menuAnalysis = existing.raw_data.menu_analysis
          }
        }

        const { data: savedMappings } = await supabase.from('category_mappings').select('source_category, mapped_to').eq('restaurant_id', restaurantId).eq('source_system', 'r365_item')
        const combined = matchAndCombine(
          productMix || { by_item: [], by_menu: [], by_category: {}, total_net_sales: 0, total_qty: 0, date_warning: null },
          menuAnalysis || { by_item: [], total_theo_cost: 0, total_sales: 0, date_warning: null },
          savedMappings || []
        )
        if (combined.unmatched_items.length > 0) {
          warnings['product_mix'] = `${combined.unmatched_items.length} items sin categoría — ve a Settings → Mapeo de Items`
        }
        await supabase.from('product_mix_data').delete().eq('report_id', reportId)
        const { error } = await supabase.from('product_mix_data').insert({
          report_id: reportId,
          raw_data: { ...combined.raw_data, unmatched_items: combined.unmatched_items },
          by_menu: combined.by_menu, by_category: combined.by_category,
          theo_cost_by_category: combined.theo_cost_by_category, total_theo_cost: combined.total_theo_cost,
        })
        if (error) console.error('Error saving product_mix_data:', error)
      } catch (err: any) {
        console.error('Error processing product mix:', err)
        results['product_mix'] = { error: err.message }
      }
    }

    // ── RECEIVING (.csv) ───────────────────────────────────────────────────
    const receivingFile = formData.get('receiving') as File | null
    if (receivingFile && receivingFile.size > 0) {
      try {
        const buffer = Buffer.from(await receivingFile.arrayBuffer())
        const items = parseReceivingCsv(buffer.toString('utf-8'))
        await supabase.from('receiving_data').delete().eq('report_id', reportId)
        if (items.length > 0) {
          const rows = items.map((item: any) => ({
            report_id: reportId,
            restaurant_id: existingReport?.restaurant_id,
            week, ...item,
          }))
          await supabase.from('receiving_data').insert(rows)
        }
        results['receiving'] = { items: items.length }
      } catch (err: any) {
        console.error('Error processing receiving:', err)
        results['receiving'] = { error: err.message }
      }
    }

    return NextResponse.json({ success: true, report_id: reportId, week, processed: Object.keys(results), warnings })

  } catch (error: any) {
    console.error('API Error:', error)
    return NextResponse.json({ success: false, error: error.message })
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
    insertData.shortages = data.shortages; insertData.overages = data.overages
    insertData.all_items = data.all_items || []
    insertData.net_variance = data.net_variance_dollar
    insertData.total_shortage_dollar = data.total_shortage_dollar
    insertData.total_overage_dollar = data.total_overage_dollar
    insertData.by_category = data.by_category
  }
  const { error } = await supabase.from(table).insert(insertData)
  if (error) console.error(`Error saving ${fileType}:`, error)
}