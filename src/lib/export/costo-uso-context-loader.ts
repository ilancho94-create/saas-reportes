// Recuperación paginada del contexto temporal necesario para el motor
// de Costo de Uso. Aislada aquí para poder mockearla en tests sin
// tocar Supabase.
//
// Diseño:
//   1) Se piden las semanas SELECCIONADAS por el usuario (embed).
//   2) Se pagina hacia atrás en el tiempo hasta encontrar la primera
//      semana con inventario (anchor) o hasta alcanzar un límite
//      absoluto configurable (MAX_LOOKBACK_REPORTS).
//   3) Se devuelve un status EXPLÍCITO:
//        - 'complete'          : anchor encontrado y sus intermedias
//                                están incluidas en el contexto.
//        - 'no_prior'          : llegamos al fin real del historial
//                                sin encontrar anchor (restaurante
//                                empieza en o después del período
//                                seleccionado).
//        - 'insufficient'      : el límite absoluto se agotó sin
//                                encontrar anchor — el consumidor NO
//                                debe publicar totales de Costo de Uso.
//        - 'error'             : al menos una página falló; el
//                                mensaje interno viene por separado.
//   4) La sección Costo de Uso solo debe publicar cifras cuando
//      status === 'complete' o 'no_prior'; con 'insufficient' o
//      'error', el consumidor bloquea.

import type { EngineWeekShape } from './data-fetcher'

export type ContextStatus = 'complete' | 'no_prior' | 'insufficient' | 'error'

export interface ContextLoadResult {
  status: ContextStatus
  weeks: EngineWeekShape[]
  reason: string
  pagesUsed: number
  reachedHistoryEnd: boolean
}

/**
 * Adaptador que el consumidor debe implementar para consultar Supabase
 * (o mock en tests). Solo dos operaciones:
 *   - fetchSelectionEmbed(): trae las semanas seleccionadas.
 *   - fetchLookbackPage(offset, limit): trae una página del historial
 *     estrictamente anterior al mínimo seleccionado, ordenada por
 *     week DESC.
 * El adaptador NO decide política; solo hace la consulta y devuelve
 * los datos o el error.
 */
export interface ContextQueryProvider {
  fetchSelectionEmbed(): Promise<{ data: any[] | null; error: unknown | null }>
  fetchLookbackPage(offset: number, limit: number): Promise<{ data: any[] | null; error: unknown | null }>
}

// Límite absoluto conservador: 156 semanas ≈ 3 años. Si el anchor
// real está aún más atrás, la sección se bloquea antes que publicar
// cifras parciales sin aviso. NO se amplía por cuenta propia.
export const MAX_LOOKBACK_REPORTS = 156
export const LOOKBACK_PAGE_SIZE = 12

function pickOne(v: unknown): any {
  return Array.isArray(v) ? (v[0] as any) || null : (v as any) || null
}

function toEngineWeek(r: any): EngineWeekShape {
  const { sales_data, cogs_data, inventory_data, product_mix_data,
    discounts_data, waste_data, voids_data, ...report } = r
  return {
    report: {
      id: report.id,
      week: report.week,
      week_start: report.week_start,
      week_end: report.week_end,
      restaurant_id: report.restaurant_id,
    },
    sales: pickOne(sales_data),
    cogs: pickOne(cogs_data),
    inventory: pickOne(inventory_data),
    productMix: pickOne(product_mix_data),
    discounts: pickOne(discounts_data),
    waste: pickOne(waste_data),
    voids: pickOne(voids_data),
  }
}

function hasInventoryData(r: any): boolean {
  const inv = r?.inventory_data
  const arr = Array.isArray(inv) ? inv[0] : inv
  if (!arr) return false
  const byAccount: any[] | undefined = (arr as any)?.by_account
  return Array.isArray(byAccount) && byAccount.length > 0
}

/**
 * Carga el contexto para el motor de Costo de Uso con paginación
 * iterativa. Detiene la búsqueda en cuanto encuentra el anchor
 * (primer reporte con inventario anterior a la selección) O al llegar
 * al fin real del historial O al alcanzar MAX_LOOKBACK_REPORTS.
 */
export async function loadCostoUsoContext(
  provider: ContextQueryProvider,
  opts?: { maxLookbackReports?: number; pageSize?: number },
): Promise<ContextLoadResult> {
  const maxLookback = opts?.maxLookbackReports ?? MAX_LOOKBACK_REPORTS
  const pageSize    = opts?.pageSize          ?? LOOKBACK_PAGE_SIZE

  // 1) Selección.
  const sel = await provider.fetchSelectionEmbed()
  if (sel.error) {
    return { status: 'error', weeks: [], reason: 'selection_embed_error', pagesUsed: 0, reachedHistoryEnd: false }
  }
  const selRows = sel.data || []
  const selWeeks = selRows.map(toEngineWeek)

  // 2) Paginar hacia atrás hasta encontrar el anchor o agotar límite.
  const priorRows: any[] = []
  let anchorFound = false
  let reachedHistoryEnd = false
  let pagesUsed = 0

  while (!anchorFound && !reachedHistoryEnd && priorRows.length < maxLookback) {
    const offset = pagesUsed * pageSize
    const remaining = maxLookback - priorRows.length
    const limit = Math.min(pageSize, remaining)
    const page = await provider.fetchLookbackPage(offset, limit)
    if (page.error) {
      return {
        status: 'error',
        weeks: [...priorRows.map(toEngineWeek), ...selWeeks],
        reason: 'lookback_page_error_' + pagesUsed,
        pagesUsed,
        reachedHistoryEnd: false,
      }
    }
    pagesUsed++
    const rows = page.data || []
    priorRows.push(...rows)
    if (rows.length < limit) reachedHistoryEnd = true
    if (rows.some(hasInventoryData)) anchorFound = true
  }

  // 3) Determinar status. anchorFound siempre gana; sino, distinguir
  // "fin real de historial" vs "límite alcanzado sin comprobar más".
  let status: ContextStatus
  let reason: string
  if (anchorFound) {
    status = 'complete'
    reason = 'anchor_found'
  } else if (reachedHistoryEnd) {
    status = 'no_prior'
    reason = 'history_ends_before_selection'
  } else {
    status = 'insufficient'
    reason = 'max_lookback_reached'
  }

  const priorWeeks = priorRows.map(toEngineWeek)
  // Unir prior + selección y dedup por report.id, ordenados asc.
  const seen = new Set<string>()
  const merged: EngineWeekShape[] = []
  for (const w of [...priorWeeks, ...selWeeks]) {
    if (seen.has(w.report.id)) continue
    seen.add(w.report.id)
    merged.push(w)
  }
  merged.sort((a, b) => a.report.week < b.report.week ? -1 : a.report.week > b.report.week ? 1 : 0)

  return { status, weeks: merged, reason, pagesUsed, reachedHistoryEnd }
}
