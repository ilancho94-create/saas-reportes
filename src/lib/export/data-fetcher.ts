import { supabase } from '@/lib/supabase'

export type CostoUsoSalesBase =
  /** Ventas netas: mismo comportamiento que la UI con toggle "+Desc. Op." OFF. */
  | 'net'
  /**
   * Ventas brutas: net + descuentos completos. NO aísla descuentos
   * operativos (esa corrección comercial está pendiente); es el mismo
   * comportamiento que el toggle "+Desc. Op." de la UI en ON.
   */
  | 'gross'

export interface ExportConfig {
  restaurantIds: string[]
  weeks: string[]          // e.g. ['2026-W09', '2026-W10']
  sections: string[]       // ordered list of section keys
  notes: Record<string, string>  // section key -> note
  template: ExportTemplate
  format: 'pptx' | 'xlsx' | 'pdf'
  language: 'es' | 'en'
  /**
   * Base de ventas para la sección Costo de Uso del PPTX.
   * Default 'net' (mantiene comportamiento actual y coincide con el
   * toggle "+Desc. Op." OFF de la UI).
   */
  costoUsoSalesBase?: CostoUsoSalesBase
}

export interface ExportTemplate {
  id: string
  name: string
  colorPrimary: string    // hex without #
  colorSecondary: string
  colorAccent: string
  logoUrl?: string
  filePath?: string       // Supabase storage path for custom PPTX base
}

export interface ExportData {
  restaurant: any
  weeks: WeekData[]
  summary: SummaryData
  /**
   * Contexto de Costo de Uso — mismos inputs que la vista productiva.
   * Se usa solo por la sección Costo de Uso del PPTX (vía
   * prepareCostoUsoResult). Si alguno viene con `null`, el consumidor
   * debe decidir explícitamente qué hacer; no hay valores por defecto
   * silenciosos que cambien el cálculo.
   */
  costoUsoContext: {
    /** category_mappings del restaurante. */
    mappings: any[]
    /** costo_uso_adjustments del restaurante. */
    adjustments: any[]
    /** skipped_inventory_weeks del restaurante. */
    skippedWeeks: any[]
    /** discount_mappings donde is_operational=true — SOLO los nombres. */
    opDiscountMappings: string[]
    /** cost_targets por categoría. */
    costTargets: Record<string, number>
    /** restaurants.operating_days — null si el registro no lo trae. */
    operatingDays: number | null
    /** restaurants.fiscal_year_start (fecha ISO o null). */
    fiscalYearStart: string | null
    /**
     * Semanas explícitamente solicitadas por el usuario (config.weeks).
     * Se guarda tal cual — sin convertirla en rango continuo. Sirve
     * para detectar selecciones no consecutivas.
     */
    requestedWeeks: string[]
    /**
     * Errores encontrados al cargar el contexto de Costo de Uso. Si
     * cualquiera de las consultas de mappings/adjustments/skipped/
     * discounts/costTargets falla, aquí se registra. El consumidor
     * puede decidir bloquear o mostrar aviso, pero NO se debe
     * silenciar como "colección vacía".
     */
    loadErrors: string[]
    /**
     * Semanas del restaurante ya normalizadas al shape que consume el
     * engine (hasta 52). Contiene TODAS las semanas del restaurante
     * — el motor las usa como universo para encontrar anchor externo e
     * intermedias. Las ventas y compras de las semanas fuera del
     * período efectivo NO se incluyen en el cálculo (el propio motor
     * las excluye del cierre).
     */
    engineWeeks: Array<{
      report: { id: string; week: string; week_start: string; week_end: string; restaurant_id: string }
      sales: any | null
      cogs: any | null
      inventory: any | null
      productMix: any | null
      discounts: any | null
      waste: any | null
      voids: any | null
    }>
  }
}

export interface WeekData {
  week: string
  weekStart: string
  weekEnd: string
  sales: any
  labor: any
  cogs: any
  waste: any
  inventory: any
  productMix: any
  avt: any
  employee: any
  kitchen: any
  receiving: any
  discounts: any | null
  voids: any | null
}

export interface SummaryData {
  totalSales: number
  totalLabor: number
  totalCOGS: number
  totalWaste: number
  laborPct: number | null
  cogsPct: number | null
  profit: number
  profitPct: number | null
  avgGuest: number | null
  totalOrders: number
  totalGuests: number
}

export async function fetchExportData(restaurantId: string, weekIds: string[]): Promise<ExportData | null> {
  // Contexto de Costo de Uso — mismos inputs que /dashboard/costo-uso.
  // RLS garantiza aislamiento por restaurante: cada select se filtra
  // por restaurant_id.
  //
  // reportsCtxRes: trae hasta 52 semanas del restaurante (mismo criterio
  // que la página productiva). Necesario para que el motor pueda
  // absorber el anchor externo y las semanas intermedias que están
  // fuera del rango explícitamente solicitado. Sus compras/ventas NO
  // se incluirán en el período efectivo — solo dan el punto de
  // referencia.
  const [
    restRes,
    reportsRes,      // subset del rango solicitado (para KPIs por semana del resto de secciones)
    reportsCtxRes,   // contexto temporal para el motor de Costo de Uso
    mapsRes,
    adjsRes,
    skippedRes,
    discMapsRes,
    tgtsRes,
  ] = await Promise.all([
    supabase.from('restaurants').select('*, organizations(name)').eq('id', restaurantId).single(),
    supabase.from('reports').select('*').eq('restaurant_id', restaurantId).in('week', weekIds).order('week'),
    supabase.from('reports').select('*').eq('restaurant_id', restaurantId).order('week', { ascending: true }).limit(52),
    supabase.from('category_mappings').select('*').eq('restaurant_id', restaurantId),
    supabase.from('costo_uso_adjustments').select('*').eq('restaurant_id', restaurantId),
    supabase.from('skipped_inventory_weeks').select('*').eq('restaurant_id', restaurantId),
    supabase.from('discount_mappings').select('discount_name').eq('restaurant_id', restaurantId).eq('is_operational', true),
    supabase.from('cost_targets').select('category, target_pct').eq('restaurant_id', restaurantId),
  ])

  if (restRes.error || !restRes.data) return null
  if (reportsRes.error || !reportsRes.data?.length) return null

  const weeksData: WeekData[] = await Promise.all(
    reportsRes.data.map(async (r: any) => {
      const [s, l, c, w, inv, pm, avt, ep, kp, rec, v, d] = await Promise.all([
        supabase.from('sales_data').select('*').eq('report_id', r.id).single(),
        supabase.from('labor_data').select('*').eq('report_id', r.id).single(),
        supabase.from('cogs_data').select('*').eq('report_id', r.id).single(),
        supabase.from('waste_data').select('*').eq('report_id', r.id).single(),
        supabase.from('inventory_data').select('*').eq('report_id', r.id).single(),
        supabase.from('product_mix_data').select('*').eq('report_id', r.id).single(),
        supabase.from('avt_data').select('*').eq('report_id', r.id).single(),
        supabase.from('employee_performance_data').select('*').eq('report_id', r.id).single(),
        supabase.from('kitchen_performance_data').select('*').eq('report_id', r.id).single(),
        supabase.from('receiving_data').select('*').eq('report_id', r.id).single(),
        supabase.from('voids_data').select('*').eq('report_id', r.id).single(),
        supabase.from('discounts_data').select('*').eq('report_id', r.id).single(),
      ])
      return {
        week: r.week,
        weekStart: r.week_start,
        weekEnd: r.week_end,
        sales: s.data,
        labor: l.data,
        cogs: c.data,
        waste: w.data,
        inventory: inv.data,
        productMix: pm.data,
        avt: avt.data,
        employee: ep.data,
        kitchen: kp.data,
        receiving: rec.data,
        voids: v.data,
        discounts: d.data,
      }
    })
  )

  const n = (v: any) => Number(v) || 0
  const totalSales = weeksData.reduce((s, w) => s + n(w.sales?.net_sales), 0)
  const totalLabor = weeksData.reduce((s, w) => s + n(w.labor?.total_pay), 0)
  const totalCOGS = weeksData.reduce((s, w) => s + n(w.cogs?.total), 0)
  const totalWaste = weeksData.reduce((s, w) => s + n(w.waste?.total_cost), 0)
  const totalOrders = weeksData.reduce((s, w) => s + n(w.sales?.orders), 0)
  const totalGuests = weeksData.reduce((s, w) => s + n(w.sales?.guests), 0)

  // costTargets: category → target_pct (número). Sin defaults silenciosos.
  const costTargets: Record<string, number> = {}
  if (tgtsRes.data?.length) {
    tgtsRes.data.forEach((t: any) => { costTargets[t.category] = Number(t.target_pct) })
  }

  // Distinguir error de carga vs respuesta vacía válida. Un error de
  // consulta NO se debe interpretar como "no hay mappings"; el PPTX
  // decide si mostrar aviso o bloquear la sección.
  const loadErrors: string[] = []
  if (reportsCtxRes.error) loadErrors.push('reports_context: ' + (reportsCtxRes.error.message || 'error'))
  if (mapsRes.error)       loadErrors.push('category_mappings: ' + (mapsRes.error.message || 'error'))
  if (adjsRes.error)       loadErrors.push('costo_uso_adjustments: ' + (adjsRes.error.message || 'error'))
  if (skippedRes.error)    loadErrors.push('skipped_inventory_weeks: ' + (skippedRes.error.message || 'error'))
  if (discMapsRes.error)   loadErrors.push('discount_mappings: ' + (discMapsRes.error.message || 'error'))
  if (tgtsRes.error)       loadErrors.push('cost_targets: ' + (tgtsRes.error.message || 'error'))

  // Contexto temporal: semanas del restaurante (hasta 52) — solo para
  // que el motor pueda encontrar el anchor externo y las semanas
  // intermedias del período efectivo. Cargamos las mismas piezas por
  // semana que la UI consume; si alguna sale con error, se registra
  // en loadErrors pero no se completa con placeholders.
  //
  // NOTA: para no multiplicar queries (52 × 8), traemos todo con
  // relaciones embebidas usando la misma técnica del select embed
  // que ya usa /dashboard/costo-uso/page.tsx.
  let ctxWeeks: any[] = []
  if (reportsCtxRes.data?.length) {
    const embedRes = await supabase.from('reports').select(`
      id, week, week_start, week_end, restaurant_id,
      sales_data(net_sales, categories),
      cogs_data(by_category),
      inventory_data(by_account, grand_total_current, grand_total_previous),
      product_mix_data(theo_cost_by_category, raw_data),
      discounts_data(total, items),
      waste_data(total_cost, items),
      voids_data(total, items)
    `).eq('restaurant_id', restaurantId).order('week', { ascending: true }).limit(52)
    if (embedRes.error) {
      loadErrors.push('reports_context_embed: ' + (embedRes.error.message || 'error'))
    } else {
      const pickOne = (v: any) => (Array.isArray(v) ? v[0] || null : v || null)
      ctxWeeks = (embedRes.data as any[]).map(r => {
        const { sales_data, cogs_data, inventory_data, product_mix_data, discounts_data, waste_data, voids_data, ...report } = r
        return {
          report,
          sales: pickOne(sales_data),
          cogs: pickOne(cogs_data),
          inventory: pickOne(inventory_data),
          productMix: pickOne(product_mix_data),
          discounts: pickOne(discounts_data),
          waste: pickOne(waste_data),
          voids: pickOne(voids_data),
        }
      })
    }
  }

  return {
    restaurant: restRes.data,
    weeks: weeksData,
    summary: {
      totalSales, totalLabor, totalCOGS, totalWaste, totalOrders, totalGuests,
      laborPct: totalSales > 0 ? totalLabor / totalSales * 100 : null,
      cogsPct: totalSales > 0 ? totalCOGS / totalSales * 100 : null,
      profit: totalSales - totalLabor - totalCOGS,
      profitPct: totalSales > 0 ? (totalSales - totalLabor - totalCOGS) / totalSales * 100 : null,
      avgGuest: totalGuests > 0 ? totalSales / totalGuests : null,
    },
    costoUsoContext: {
      mappings: mapsRes.data || [],
      adjustments: adjsRes.data || [],
      skippedWeeks: skippedRes.data || [],
      opDiscountMappings: (discMapsRes.data || []).map((d: any) => d.discount_name),
      costTargets,
      operatingDays: restRes.data?.operating_days ?? null,
      fiscalYearStart: restRes.data?.fiscal_year_start ?? null,
      requestedWeeks: [...weekIds],
      loadErrors,
      engineWeeks: ctxWeeks,
    },
  }
}

export function fmt$(n: number) { return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }) }
export function fmtPct(n: number | null) { return n !== null ? n.toFixed(1) + '%' : '—' }
export function safeN(v: any) { const n = Number(v); return isNaN(n) ? 0 : n }