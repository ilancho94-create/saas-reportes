import { supabase } from '@/lib/supabase'

export interface ExportConfig {
  restaurantIds: string[]
  weeks: string[]          // e.g. ['2026-W09', '2026-W10']
  sections: string[]       // ordered list of section keys
  notes: Record<string, string>  // section key -> note
  template: ExportTemplate
  format: 'pptx' | 'xlsx' | 'pdf'
  language: 'es' | 'en'
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
  // Traemos también el contexto que Costo de Uso necesita
  // (mismos inputs que /dashboard/costo-uso). RLS garantiza aislamiento
  // por restaurante: cada select se filtra por restaurant_id.
  const [restRes, reportsRes, mapsRes, adjsRes, skippedRes, discMapsRes, tgtsRes] = await Promise.all([
    supabase.from('restaurants').select('*, organizations(name)').eq('id', restaurantId).single(),
    supabase.from('reports').select('*').eq('restaurant_id', restaurantId).in('week', weekIds).order('week'),
    supabase.from('category_mappings').select('*').eq('restaurant_id', restaurantId),
    supabase.from('costo_uso_adjustments').select('*').eq('restaurant_id', restaurantId),
    supabase.from('skipped_inventory_weeks').select('*').eq('restaurant_id', restaurantId),
    supabase.from('discount_mappings').select('discount_name').eq('restaurant_id', restaurantId).eq('is_operational', true),
    supabase.from('cost_targets').select('category, target_pct').eq('restaurant_id', restaurantId),
  ])

  if (!restRes.data || !reportsRes.data?.length) return null

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
    },
  }
}

export function fmt$(n: number) { return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }) }
export function fmtPct(n: number | null) { return n !== null ? n.toFixed(1) + '%' : '—' }
export function safeN(v: any) { const n = Number(v); return isNaN(n) ? 0 : n }