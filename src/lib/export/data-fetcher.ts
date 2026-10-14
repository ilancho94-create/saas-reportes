import { supabase } from '@/lib/supabase'
import { loadCostoUsoContext, type ContextStatus } from './costo-uso-context-loader'

export type CostoUsoSalesBase =
  /** Ventas netas: mismo comportamiento que la UI con toggle "+Desc. Op." OFF. */
  | 'net'
  /**
   * Ventas brutas: net + descuentos completos. NO aísla descuentos
   * operativos (esa corrección comercial está pendiente); es el mismo
   * comportamiento que el toggle "+Desc. Op." de la UI en ON.
   */
  | 'gross'

/**
 * Shape que consume el engine de Costo de Uso.
 * Interfaz mínima con solo los campos realmente leídos por el motor;
 * evita difundir `any` por el flujo. Cada campo es opcional/null
 * porque en la práctica algunas semanas no traen todos los datasets.
 */
export interface EngineWeekShape {
  report: {
    id: string
    week: string
    week_start: string
    week_end: string
    restaurant_id: string
  }
  sales: { net_sales?: number | null; categories?: Array<{ name: string; net: number; gross?: number }> | null } | null
  cogs: { by_category?: Record<string, number> | null } | null
  inventory: {
    by_account?: Array<{ account: string; current_value: number; previous_value: number }> | null
    grand_total_current?: number | null
    grand_total_previous?: number | null
  } | null
  productMix: {
    theo_cost_by_category?: Record<string, number> | null
    raw_data?: { unmatched_items?: Array<{ theo_cost?: number }> | null } | null
  } | null
  discounts: { total?: number | null; items?: Array<{ name: string; amount: number }> | null } | null
  waste: { total_cost?: number | null; items?: any[] | null } | null
  voids: { total?: number | null; items?: any[] | null } | null
}

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
     * Semanas ya normalizadas al shape del engine: las seleccionadas
     * MÁS una ventana previa acotada (para encontrar anchor externo
     * e intermedias). No representa el historial completo.
     */
    engineWeeks: EngineWeekShape[]
    /**
     * true si la carga de semanas previas al mínimo seleccionado
     * agotó la ventana configurada. Útil para decidir si el motor
     * pudo reconstruir el anchor real o si podría estar apoyándose
     * en un borde artificial de la ventana.
     */
    anchorLookbackExhausted: boolean
    /** Semanas usadas como ventana previa (para trazabilidad). */
    anchorLookbackWeeks: number
    /**
     * Estado explícito de la recuperación del contexto temporal:
     *   'complete'    → se encontró el anchor real dentro del límite.
     *   'no_prior'    → el historial del restaurante termina antes
     *                   de la selección; no hay anchor por diseño.
     *   'insufficient'→ se alcanzó el límite absoluto sin encontrar
     *                   anchor; el consumidor NO debe publicar totales.
     *   'error'       → falló al menos una página de la búsqueda.
     */
    contextStatus: ContextStatus
    /** Razón compacta (interna) del estado — no se muestra al usuario. */
    contextStatusReason: string
    /** Número de páginas de lookback consultadas. */
    contextPagesUsed: number
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
    mapsRes,
    adjsRes,
    skippedRes,
    discMapsRes,
    tgtsRes,
  ] = await Promise.all([
    supabase.from('restaurants').select('*, organizations(name)').eq('id', restaurantId).single(),
    supabase.from('reports').select('*').eq('restaurant_id', restaurantId).in('week', weekIds).order('week'),
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
  if (mapsRes.error)       loadErrors.push('category_mappings: ' + (mapsRes.error.message || 'error'))
  if (adjsRes.error)       loadErrors.push('costo_uso_adjustments: ' + (adjsRes.error.message || 'error'))
  if (skippedRes.error)    loadErrors.push('skipped_inventory_weeks: ' + (skippedRes.error.message || 'error'))
  if (discMapsRes.error)   loadErrors.push('discount_mappings: ' + (discMapsRes.error.message || 'error'))
  if (tgtsRes.error)       loadErrors.push('cost_targets: ' + (tgtsRes.error.message || 'error'))

  // Contexto temporal: recuperación paginada iterativa hasta encontrar
  // el anchor real (semana anterior con inventario) O agotar un límite
  // absoluto configurable. Ver src/lib/export/costo-uso-context-loader.ts.
  const sortedSelected = [...weekIds].sort()
  const minSelected = sortedSelected[0]

  const EMBED_SELECT = `
      id, week, week_start, week_end, restaurant_id,
      sales_data(net_sales, categories),
      cogs_data(by_category),
      inventory_data(by_account, grand_total_current, grand_total_previous),
      product_mix_data(theo_cost_by_category, raw_data),
      discounts_data(total, items),
      waste_data(total_cost, items),
      voids_data(total, items)
    `

  // El loader debe saltar las semanas marcadas al buscar anchor;
  // sin esto, el anchor cae en la semana saltada (que tiene
  // inventory_data pero el engine la ignora) y el período queda con
  // invPrevious = 0 silencioso.
  const skippedWeeksSet = new Set<string>(
    ((skippedRes.data as any[] | null) ?? []).map((s: any) => s.week)
  )
  const ctxResult = await loadCostoUsoContext({
    fetchSelectionEmbed: async () => {
      const r = await supabase.from('reports').select(EMBED_SELECT)
        .eq('restaurant_id', restaurantId)
        .in('week', weekIds)
        .order('week', { ascending: true })
      return { data: (r.data as any[] | null) ?? null, error: r.error ?? null }
    },
    fetchLookbackPage: async (offset: number, limit: number) => {
      const r = await supabase.from('reports').select(EMBED_SELECT)
        .eq('restaurant_id', restaurantId)
        .lt('week', minSelected)
        .order('week', { ascending: false })
        .range(offset, offset + limit - 1)
      return { data: (r.data as any[] | null) ?? null, error: r.error ?? null }
    },
  }, { skippedWeeks: skippedWeeksSet })
  const ctxWeeks = ctxResult.weeks
  if (ctxResult.status === 'error') {
    // 'reports_selection_embed' / 'reports_anchor_lookback' — nombres
    // reconocidos por hasCriticalLoadError.
    if (ctxResult.reason === 'selection_embed_error') {
      loadErrors.push('reports_selection_embed: page failed')
    } else {
      loadErrors.push('reports_anchor_lookback: ' + ctxResult.reason)
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
      anchorLookbackExhausted: ctxResult.status === 'insufficient',
      anchorLookbackWeeks: ctxResult.pagesUsed,
      contextStatus: ctxResult.status,
      contextStatusReason: ctxResult.reason,
      contextPagesUsed: ctxResult.pagesUsed,
    },
  }
}

export function fmt$(n: number) { return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }) }
export function fmtPct(n: number | null) { return n !== null ? n.toFixed(1) + '%' : '—' }
export function safeN(v: any) { const n = Number(v); return isNaN(n) ? 0 : n }