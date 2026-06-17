// src/app/dashboard/ceo/page.tsx
//
// Server Component que fetcha los datos del CEO Dashboard en el servidor
// (más cercano al DB que el browser) y los pasa al client component como
// fallbackData de SWR. Resultado: HTML llega con data baked-in → no hay
// spinner ni waterfall fetch en la primera visita.
//
// El boundary 'use client' de CeoDashboardClient ya hace code-split
// automático: el JS de recharts + lógica interactiva entra en su propio
// chunk. El HTML llega instantáneo con los datos iniciales.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CeoDashboardClient, { type CeoInitialData } from './CeoDashboardClient'

async function fetchInitialCeoData(): Promise<CeoInitialData> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: userRests } = await supabase
    .from('user_restaurants')
    .select('restaurant_id, role')
    .eq('user_id', user.id)

  if (!userRests?.length) return { allRestData: [], sortedWeeks: [] }
  const restIds = userRests.map((r: any) => r.restaurant_id)

  const reportsSelect = `
    id, week, week_start, week_end, restaurant_id,
    sales_data(net_sales, gross_sales, orders, guests, categories, lunch_dinner),
    labor_data(total_pay, total_hours, total_ot_hours, by_position),
    waste_data(total_cost),
    cogs_data(total, by_category),
    voids_data(total, items),
    discounts_data(total, items),
    employee_performance_data(employees),
    avt_data(net_variance, total_shortage_dollar, total_overage_dollar)
  `

  const [restsRes, ...reportsByRest] = await Promise.all([
    supabase.from('restaurants').select('*').in('id', restIds),
    ...restIds.map((rid: string) =>
      supabase.from('reports').select(reportsSelect)
        .eq('restaurant_id', rid).order('week', { ascending: false }).limit(13)
    ),
  ])

  if (!restsRes.data?.length) return { allRestData: [], sortedWeeks: [] }

  const pickOne = (v: any) => (Array.isArray(v) ? v[0] || null : v || null)
  const mapReport = (r: any) => {
    const { sales_data, labor_data, waste_data, cogs_data, voids_data, discounts_data, employee_performance_data, avt_data, ...report } = r
    return {
      report,
      sales: pickOne(sales_data),
      labor: pickOne(labor_data),
      waste: pickOne(waste_data),
      cogs: pickOne(cogs_data),
      voids: pickOne(voids_data),
      discounts: pickOne(discounts_data),
      employee: pickOne(employee_performance_data),
      avt: pickOne(avt_data),
    }
  }

  const byRest: Record<string, any[]> = {}
  reportsByRest.forEach((res: any, idx: number) => {
    const rid = restIds[idx]
    byRest[rid] = ((res?.data as any[]) || []).map(mapReport)
  })

  const allRestData = restsRes.data.map((rest: any) => ({
    restaurant: rest,
    weeks: (byRest[rest.id] || []).slice().reverse(),
  }))

  const weekSet = new Set<string>()
  allRestData.forEach((r: any) => r.weeks.forEach((w: any) => weekSet.add(w.report.week)))
  const sortedWeeks = Array.from(weekSet).sort().reverse()

  return { allRestData, sortedWeeks }
}

export default async function CeoPage() {
  const initialData = await fetchInitialCeoData()
  return <CeoDashboardClient initialData={initialData} />
}
