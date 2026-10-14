// Adapter Supabase → ContextQueryProvider para el loader iterativo
// de contexto de Costo de Uso. Compartido entre el fetcher del PPTX
// y la página productiva /dashboard/costo-uso.
//
// No duplica la lógica de paginación (esa vive en
// src/lib/export/costo-uso-context-loader.ts). Aquí solo se traduce
// del cliente Supabase a las dos operaciones que el loader necesita.
//
// Aislamiento por restaurante: ambos métodos incluyen
// .eq('restaurant_id', restaurantId).

import type { ContextQueryProvider } from '@/lib/export/costo-uso-context-loader'

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

/**
 * Cliente mínimo que ambos consumidores usan. El browser client
 * (page.tsx) y el server-friendly client (data-fetcher) exponen la
 * misma superficie de método .from().select()… — este tipo lo
 * refleja de manera acotada para tipar el adapter sin ampliar `any`.
 */
export interface SupabaseLikeClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        in(col: string, vals: string[]): {
          order(col: string, opts: { ascending: boolean }): Promise<{ data: any[] | null; error: unknown | null }>
        }
        lt(col: string, val: string): {
          order(col: string, opts: { ascending: boolean }): {
            range(from: number, to: number): Promise<{ data: any[] | null; error: unknown | null }>
          }
        }
      }
    }
  }
}

export function createSupabaseContextProvider(
  supabase: SupabaseLikeClient,
  restaurantId: string,
  weekIds: string[],
): ContextQueryProvider {
  const sorted = [...weekIds].sort()
  const minSelected = sorted[0] ?? ''
  return {
    async fetchSelectionEmbed() {
      if (!weekIds.length) return { data: [], error: null }
      const r = await supabase.from('reports').select(EMBED_SELECT)
        .eq('restaurant_id', restaurantId)
        .in('week', weekIds)
        .order('week', { ascending: true })
      return { data: (r.data as any[] | null) ?? null, error: r.error ?? null }
    },
    async fetchLookbackPage(offset: number, limit: number) {
      if (!minSelected) return { data: [], error: null }
      const r = await supabase.from('reports').select(EMBED_SELECT)
        .eq('restaurant_id', restaurantId)
        .lt('week', minSelected)
        .order('week', { ascending: false })
        .range(offset, offset + limit - 1)
      return { data: (r.data as any[] | null) ?? null, error: r.error ?? null }
    },
  }
}
