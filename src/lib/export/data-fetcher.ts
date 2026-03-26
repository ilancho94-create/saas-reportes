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
  const [restRes, reportsRes] = await Promise.all([
    supabase.from('restaurants').select('*, organizations(name)').eq('id', restaurantId).single(),
    supabase.from('reports').select('*').eq('restaurant_id', restaurantId).in('week', weekIds).order('week'),
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
    }
  }
}

export function fmt$(n: number) { return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }) }
export function fmtPct(n: number | null) { return n !== null ? n.toFixed(1) + '%' : '—' }
export function safeN(v: any) { const n = Number(v); return isNaN(n) ? 0 : n }