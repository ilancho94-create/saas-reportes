// src/lib/costo-uso/engine.ts
//
// Extracción de las funciones puras de cálculo que originalmente vivían
// dentro del componente CostoUsoPage. La página ahora consume este módulo
// vía createCostoUsoEngine(ctx) — el comportamiento debe permanecer
// idéntico byte-por-byte respecto de la versión inline.
//
// Este módulo NO cambia fórmulas. Cualquier cambio a la semántica debe
// ir en un commit separado con pruebas antes/después.

import { diagnoseWeek, diagnosePeriod, diagnoseSeries, type Diagnostics, type DiagnosticsContext } from './diagnostics'
export type { Diagnostic, DiagnosticType, Diagnostics, CheckState } from './diagnostics'

/**
 * Motivo por el que la variación de una categoría o del total puede ser null.
 * Diseñado para que la interfaz muestre la causa correcta en cada caso, en
 * lugar de un único mensaje genérico.
 */
export type VarianceReason =
  | 'ok'                     // Variación calculada correctamente
  | 'no_theo_source'         // productMix ausente para la semana / período
  | 'partial_theo'           // productMix presente pero categoría sin asignación
  | 'zero_sales'             // catSales === 0
  | 'negative_sales'         // catSales < 0
  | 'partial_total_theo'     // (solo para totales) alguna cat. con ventas sin teórico
  | 'no_initial_inventory'   // sin anchor y closing sin cuenta con previous_value en la categoría

function reasonForCategory(
  catSales: number,
  theoPresent: boolean,
  hasProductMix: boolean,
  invPreviousPresent: boolean = true,
): VarianceReason {
  if (catSales < 0) return 'negative_sales'
  if (catSales === 0) return 'zero_sales'
  if (!invPreviousPresent) return 'no_initial_inventory'
  if (theoPresent) return 'ok'
  return hasProductMix ? 'partial_theo' : 'no_theo_source'
}

export type CategoryKey = 'food' | 'na_beverage' | 'liquor' | 'beer' | 'wine'

export const ACCOUNT_MAP: Record<string, CategoryKey> = {
  'Food Inventory': 'food',
  'Food bar Inventory': 'liquor',
  'Beer': 'beer',
  'Alcoholic Inventory': 'liquor',
  'Beverage Inventory': 'na_beverage',
  'Wine Inventory': 'wine',
}

export interface CategoryDef {
  key: CategoryKey
  label: string
  color: string
  defaultMeta: number
}

export const CATEGORIES_BASE: CategoryDef[] = [
  { key: 'food', label: 'Food', color: '#f97316', defaultMeta: 28 },
  { key: 'na_beverage', label: 'NA Beverage', color: '#06b6d4', defaultMeta: 8 },
  { key: 'liquor', label: 'Liquor', color: '#a855f7', defaultMeta: 20 },
  { key: 'beer', label: 'Beer', color: '#eab308', defaultMeta: 20 },
  { key: 'wine', label: 'Wine', color: '#ec4899', defaultMeta: 20 },
]

export interface EngineContext {
  /** Todas las semanas del restaurante en el orden en que las carga loadData. */
  weeks: any[]
  /** Filas de category_mappings (source_category, mapped_to). */
  mappings: any[]
  /** Filas de costo_uso_adjustments (week, category, field, adjustment_value). */
  adjustments: any[]
  /** Set con semanas marcadas oficialmente como skipped. */
  skippedWeekSet: Set<string>
  /** Nombres de descuentos configurados como operativos (discount_mappings). */
  opDiscountMappings: string[]
  /** Toggle "+Desc. Op." del header. */
  includeOpDiscounts: boolean
  /**
   * Días operativos por semana del restaurante.
   * Cuando es null, "días de inventario" no es calculable y se
   * devuelve null en cada categoría; el resto de métricas no se
   * ven afectadas. El consumidor NO debe pasar un fallback si el
   * dato real está ausente.
   */
  operatingDays: number | null
  /** costTargets por categoría (override de defaultMeta). */
  costTargets: Record<string, number>
  /**
   * Rango solicitado por la UI (from/to en formato YYYY-Wnn). Solo se usa
   * para diagnósticos de interval_extended — no afecta el cálculo. Opcional.
   */
  requestedRange?: { from: string; to: string } | null
  /**
   * Fecha ISO YYYY-MM-DD del inicio del año fiscal del restaurante
   * (restaurants.fiscal_year_start). Solo se usa para etiquetar la evidencia
   * de diagnósticos temporales. Opcional.
   */
  fiscalYearStart?: string | null
}

// ── Puras (sin ctx) ────────────────────────────────────────────────────
export function pct(part: any, total: any): number | null {
  if (!part || !total) return null
  return parseFloat((Number(part) / Number(total) * 100).toFixed(1))
}

export function getInventoryByCategory(
  invAccounts: any[],
  categoryKey: string,
): { current: number; previous: number } {
  if (!invAccounts) return { current: 0, previous: 0 }
  const accounts = Object.entries(ACCOUNT_MAP)
    .filter(([, cat]) => cat === categoryKey)
    .map(([acc]) => acc)
  return {
    current: invAccounts.filter(a => accounts.includes(a.account)).reduce((s, a) => s + Number(a.current_value || 0), 0),
    previous: invAccounts.filter(a => accounts.includes(a.account)).reduce((s, a) => s + Number(a.previous_value || 0), 0),
  }
}

// ── Factory ────────────────────────────────────────────────────────────
export function createCostoUsoEngine(ctx: EngineContext) {
  const CATEGORIES = CATEGORIES_BASE.map(cat => ({
    ...cat,
    meta: ctx.costTargets[cat.key] !== undefined ? ctx.costTargets[cat.key] : cat.defaultMeta,
  }))

  // Contexto para diagnósticos. `activeCategories` sale de los mappings
  // configurados del restaurante — no presupone las 5 canónicas.
  const activeCategories: string[] = Array.from(
    new Set(ctx.mappings.map(m => m.mapped_to).filter(Boolean))
  )
  const diagCtx: DiagnosticsContext = {
    activeCategories,
    accountMap: ACCOUNT_MAP,
    requestedRange: ctx.requestedRange ?? null,
    fiscalYearStart: ctx.fiscalYearStart ?? null,
  }

  function getOpDiscountTotal(w: any): number {
    if (!ctx.includeOpDiscounts || !ctx.opDiscountMappings.length) return 0
    const items: any[] = w.discounts?.items || []
    return items
      .filter((item: any) => ctx.opDiscountMappings.includes(item.name))
      .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
  }

  function getAdj(week: string, category: string, field: string): number {
    return ctx.adjustments
      .filter(a => a.week === week && a.category === category && a.field === field)
      .reduce((sum, a) => sum + Number(a.adjustment_value), 0)
  }

  function hasAdjustments(week: string): boolean {
    return ctx.adjustments.some(a => a.week === week)
  }

  function getWeekAdjustments(week: string): any[] {
    return ctx.adjustments.filter(a => a.week === week)
  }

  function getMappedSales(categories: any[], targetType: string): number {
    if (!categories || !ctx.mappings.length) return 0
    return categories
      .filter((cat: any) => {
        const mapping = ctx.mappings.find(m => m.source_category.toLowerCase() === cat.name.toLowerCase())
        return mapping?.mapped_to === targetType
      })
      .reduce((sum: number, cat: any) => sum + Number(cat.net || 0), 0)
  }

  function getMappedGross(categories: any[], targetType: string): number {
    if (!categories || !ctx.mappings.length) return 0
    return categories
      .filter((cat: any) => {
        const mapping = ctx.mappings.find(m => m.source_category.toLowerCase() === cat.name.toLowerCase())
        return mapping?.mapped_to === targetType
      })
      .reduce((sum: number, cat: any) => sum + Number(cat.gross || cat.net || 0), 0)
  }

  function findAnchorBefore(targetWeek: any): any | null {
    const idx = ctx.weeks.findIndex(w => w.report.week === targetWeek.report.week)
    if (idx <= 0) return null
    for (let i = idx - 1; i >= 0; i--) {
      if (ctx.weeks[i].inventory?.by_account?.length > 0) return ctx.weeks[i]
    }
    return null
  }

  function getWeeksBetween(anchor: any | null, closing: any): any[] {
    const closingIdx = ctx.weeks.findIndex(w => w.report.week === closing.report.week)
    if (closingIdx < 0) return []
    const anchorIdx = anchor ? ctx.weeks.findIndex(w => w.report.week === anchor.report.week) : -1
    return ctx.weeks.slice(anchorIdx + 1, closingIdx)
  }

  function buildWeekData(w: any): any {
    const netSales = w.sales?.net_sales || 0
    const cogsCat = w.cogs?.by_category || {}
    const invAccounts = w.inventory?.by_account || []
    const salesCategories = w.sales?.categories || []
    const theoCostByCat = w.productMix?.theo_cost_by_category || {}
    const hasInventory = invAccounts.length > 0
    const week = w.report.week

    const opDiscTotal = getOpDiscountTotal(w)

    const result: any = {
      week: week.replace('2026-', ''),
      fullWeek: week,
      reportId: w.report.id,
      netSales,
      hasInventory,
      hasProductMix: !!w.productMix,
      opDiscTotal,
    }
    let totalUsoCost = 0, totalTheoCost = 0, totalABSales = 0

    CATEGORIES.forEach(cat => {
      const inv = getInventoryByCategory(invAccounts, cat.key)
      const adjInvPrev = getAdj(week, cat.key, 'inv_previous')
      const adjPurchases = getAdj(week, cat.key, 'purchases')
      const adjInvCurr = getAdj(week, cat.key, 'inv_current')
      const adjTheo = getAdj(week, cat.key, 'theo_cost')
      const invPrevious = inv.previous + adjInvPrev
      const purchases = (cogsCat[cat.key] || 0) + adjPurchases
      const invCurrent = inv.current + adjInvCurr
      const uso = hasInventory ? Math.max((invPrevious + purchases - invCurrent), 0) : 0
      const catSalesBase = getMappedSales(salesCategories, cat.key) || 0
      const catSalesGross = getMappedGross(salesCategories, cat.key) || 0
      const adjSales = getAdj(week, cat.key, 'sales_adjustment')
      const catSales = ctx.includeOpDiscounts && catSalesGross > catSalesBase
        ? catSalesGross + adjSales
        : catSalesBase

      // Presencia de costo teórico — decidido DESDE LA ENTRADA, no del importe.
      // Un theoCostByCat[cat.key] === 0 significa "cero explícito" solo si la
      // clave estaba presente en el objeto; si la clave falta, es ausencia.
      // Si productMix es null, no hay fuente para esta semana.
      // Un ajuste manual de theo_cost no crea presencia por sí solo — la
      // fuente sigue siendo ausente.
      const hasProductMixForWeek = !!w.productMix
      const theoKeyPresent = hasProductMixForWeek
        && Object.prototype.hasOwnProperty.call(theoCostByCat, cat.key)
      const theoPresent = theoKeyPresent
      const theoCost = (theoCostByCat[cat.key] || 0) + adjTheo
      const realPct = catSales > 0 ? pct(uso, catSales) : null
      const mixPct = catSales > 0 ? pct(theoCost, catSales) : null
      // variacion_$ = uso − costo_teorico (importes sin redondear).
      // Requisitos DE PRESENCIA (no de valor):
      //   • catSales > 0             (mismo guard que antes)
      //   • theoPresent === true     (la categoría trae información teórica
      //                              en la entrada; cero explícito califica,
      //                              ausencia no)
      // Si no hay teórico determinable → null. No convertir null en cero.
      const variacionDolares = catSales > 0 && theoPresent
        ? parseFloat((uso - theoCost).toFixed(2))
        : null
      const diasInv = uso > 0 && ctx.operatingDays !== null
        ? parseFloat((((invCurrent + invPrevious) / 2) / uso * ctx.operatingDays).toFixed(1))
        : null
      const hasAdj = adjInvPrev !== 0 || adjPurchases !== 0 || adjInvCurr !== 0 || adjTheo !== 0

      result[cat.key + '_uso'] = uso
      result[cat.key + '_uso_pct'] = realPct || 0
      result[cat.key + '_theo_pct'] = mixPct || 0
      result[cat.key + '_variacion'] = variacionDolares
      result[cat.key + '_variacion_reason'] = reasonForCategory(catSales, theoPresent, hasProductMixForWeek)
      result[cat.key + '_dias_inv'] = diasInv
      result[cat.key + '_inv_current'] = invCurrent
      result[cat.key + '_inv_previous'] = invPrevious
      result[cat.key + '_purchases'] = purchases
      result[cat.key + '_sales'] = catSales
      result[cat.key + '_has_adj'] = hasAdj
      result[cat.key + '_theo_cost'] = theoCost
      result[cat.key + '_theo_present'] = theoPresent

      if (uso > 0) totalUsoCost += uso
      if (theoCost > 0) totalTheoCost += theoCost
      if (catSales > 0) totalABSales += catSales
    })

    // Total A&B: la variación total es solo válida si ninguna categoría con
    // ventas > 0 carece de teórico. Si alguna carece, el total omitiría
    // información necesaria de una categoría incluida → null.
    const anyIncludedCatMissingTheo = CATEGORIES.some(
      c => (result[c.key + '_sales'] || 0) > 0 && !result[c.key + '_theo_present']
    )
    const missingTheoCats = CATEGORIES
      .filter(c => (result[c.key + '_sales'] || 0) > 0 && !result[c.key + '_theo_present'])
      .map(c => c.key)
    result.totalUsoCost = totalUsoCost
    result.totalTheoCost = totalTheoCost
    result.totalABSales = totalABSales
    result.totalRealPct = totalABSales > 0 ? pct(totalUsoCost, totalABSales) : null
    result.totalMixPct = totalABSales > 0 ? pct(totalTheoCost, totalABSales) : null
    result.totalVariacion = totalABSales > 0 && !anyIncludedCatMissingTheo
      ? parseFloat((totalUsoCost - totalTheoCost).toFixed(2))
      : null
    result.totalTheoComplete = !anyIncludedCatMissingTheo
    result.totalVariacionReason = (totalABSales === 0)
      ? (CATEGORIES.some(c => (result[c.key + '_sales'] || 0) < 0) ? 'negative_sales' : 'zero_sales')
      : (anyIncludedCatMissingTheo ? 'partial_total_theo' : 'ok') as VarianceReason
    result.totalVariacionMissingCategories = missingTheoCats
    result.hasAnyAdj = hasAdjustments(week)
    result.diagnostics = diagnoseWeek(w, diagCtx)
    return result
  }

  function buildPeriodData(anchor: any | null, intermediates: any[], closing: any): any {
    const periodWeeks = [...intermediates, closing]
    const closingWeek = closing.report.week
    const isConsolidated = intermediates.length > 0
    const spannedSkippedWeeks = intermediates
      .filter(w => ctx.skippedWeekSet.has(w.report.week))
      .map(w => w.report.week)

    // "Actividad" del período = intermediates + closing (excluye el anchor,
    // que solo aporta inventario inicial de referencia). Es el rango cuyas
    // compras y ventas realmente entran al cálculo.
    const firstActivity = periodWeeks[0]
    const lastActivity  = periodWeeks[periodWeeks.length - 1]
    const result: any = {
      week: closingWeek.replace('2026-', ''),
      fullWeek: closingWeek,
      reportId: closing.report.id,
      netSales: periodWeeks.reduce((s, w) => s + (w.sales?.net_sales || 0), 0),
      hasInventory: true,
      hasProductMix: !!closing.productMix,
      opDiscTotal: periodWeeks.reduce((s, w) => s + getOpDiscountTotal(w), 0),
      isConsolidated,
      spannedSkippedWeeks,
      anchorWeek: anchor?.report.week || null,
      anchorWeekEnd: anchor?.report?.week_end || null,
      activityWeekStart: firstActivity?.report?.week_start || null,
      activityWeekEnd:   lastActivity?.report?.week_end   || null,
      activityFirstLabel: firstActivity?.report?.week || null,
      activityLastLabel:  lastActivity?.report?.week   || null,
      periodWeekCount: periodWeeks.length,
      closingReport: closing.report,
      closingRaw: closing,
      periodWeeksRaw: periodWeeks,
    }

    let totalUsoCost = 0, totalTheoCost = 0, totalABSales = 0

    CATEGORIES.forEach(cat => {
      let invPrevious: number
      if (anchor) {
        const anchorInv = getInventoryByCategory(anchor.inventory?.by_account || [], cat.key)
        const adjAnchorCurr = getAdj(anchor.report.week, cat.key, 'inv_current')
        invPrevious = anchorInv.current + adjAnchorCurr
      } else {
        const closingInv = getInventoryByCategory(closing.inventory?.by_account || [], cat.key)
        const adjClosingPrev = getAdj(closing.report.week, cat.key, 'inv_previous')
        invPrevious = closingInv.previous + adjClosingPrev
      }

      // Presencia de inventario inicial: cuando NO hay anchor, dependemos
      // del previous_value del closing por categoría. Solo se considera
      // "presente" si al menos una cuenta esperada de la categoría trae
      // el campo previous_value NO nulo/undefined en by_account (cero
      // explícito califica como presente). Sin cuentas esperadas O sin
      // registros → invPreviousPresent = false.
      let invPreviousPresent: boolean
      if (anchor) {
        invPreviousPresent = true
      } else {
        const expected = Object.entries(ACCOUNT_MAP)
          .filter(([, c]) => c === cat.key).map(([acc]) => acc)
        const accounts = closing.inventory?.by_account || []
        invPreviousPresent = expected.length > 0 && accounts.some((a: any) =>
          expected.includes(a.account) && a.previous_value !== undefined && a.previous_value !== null
        )
      }

      const closingInv = getInventoryByCategory(closing.inventory?.by_account || [], cat.key)
      const adjClosingCurr = getAdj(closing.report.week, cat.key, 'inv_current')
      const invCurrent = closingInv.current + adjClosingCurr

      const purchases = periodWeeks.reduce((sum, w) => {
        const cogsCat = w.cogs?.by_category || {}
        const adj = getAdj(w.report.week, cat.key, 'purchases')
        return sum + (cogsCat[cat.key] || 0) + adj
      }, 0)

      const uso = Math.max(invPrevious + purchases - invCurrent, 0)

      const catSales = periodWeeks.reduce((sum, w) => {
        const salesCategories = w.sales?.categories || []
        const catSalesBase = getMappedSales(salesCategories, cat.key) || 0
        const catSalesGross = getMappedGross(salesCategories, cat.key) || 0
        const adjSales = getAdj(w.report.week, cat.key, 'sales_adjustment')
        return sum + (ctx.includeOpDiscounts && catSalesGross > catSalesBase ? catSalesGross + adjSales : catSalesBase)
      }, 0)

      const theoCost = periodWeeks.reduce((sum, w) => {
        const theoByCat = w.productMix?.theo_cost_by_category || {}
        const adj = getAdj(w.report.week, cat.key, 'theo_cost')
        return sum + (theoByCat[cat.key] || 0) + adj
      }, 0)

      // Presencia teórica del período: TODAS las semanas del período deben
      // aportar información teórica de la categoría (productMix presente Y
      // la clave existe en theo_cost_by_category). Si alguna semana no la
      // trae, el período no tiene teórico determinable para esa categoría.
      const theoPresent = periodWeeks.every(w => {
        if (!w.productMix) return false
        const theoByCat = w.productMix.theo_cost_by_category || {}
        return Object.prototype.hasOwnProperty.call(theoByCat, cat.key)
      })

      const realPct = catSales > 0 ? pct(uso, catSales) : null
      const mixPct = catSales > 0 ? pct(theoCost, catSales) : null
      // variacion requiere ADEMÁS invPreviousPresent === true; sin
      // límite inicial no se publica cifra.
      const variacionDolares = catSales > 0 && theoPresent && invPreviousPresent
        ? parseFloat((uso - theoCost).toFixed(2))
        : null

      const totalOpDays = ctx.operatingDays !== null ? periodWeeks.length * ctx.operatingDays : null
      const diasInv = uso > 0 && totalOpDays !== null && invPreviousPresent
        ? parseFloat((((invCurrent + invPrevious) / 2) / uso * totalOpDays).toFixed(1))
        : null

      const hasAdj = periodWeeks.some(w =>
        getAdj(w.report.week, cat.key, 'inv_previous') !== 0 ||
        getAdj(w.report.week, cat.key, 'purchases') !== 0 ||
        getAdj(w.report.week, cat.key, 'inv_current') !== 0 ||
        getAdj(w.report.week, cat.key, 'theo_cost') !== 0
      )

      const hasPmixInPeriod = periodWeeks.some(w => !!w.productMix)

      result[cat.key + '_uso'] = uso
      result[cat.key + '_uso_pct'] = realPct || 0
      result[cat.key + '_theo_pct'] = mixPct || 0
      result[cat.key + '_variacion'] = variacionDolares
      result[cat.key + '_variacion_reason'] = reasonForCategory(catSales, theoPresent, hasPmixInPeriod, invPreviousPresent)
      result[cat.key + '_dias_inv'] = diasInv
      result[cat.key + '_inv_current'] = invCurrent
      result[cat.key + '_inv_previous'] = invPrevious
      result[cat.key + '_inv_previous_present'] = invPreviousPresent
      result[cat.key + '_purchases'] = purchases
      result[cat.key + '_sales'] = catSales
      result[cat.key + '_has_adj'] = hasAdj
      result[cat.key + '_theo_cost'] = theoCost
      result[cat.key + '_theo_present'] = theoPresent

      if (uso > 0) totalUsoCost += uso
      if (theoCost > 0) totalTheoCost += theoCost
      if (catSales > 0) totalABSales += catSales
    })

    const anyIncludedCatMissingTheo = CATEGORIES.some(
      c => (result[c.key + '_sales'] || 0) > 0 && !result[c.key + '_theo_present']
    )
    const missingTheoCats = CATEGORIES
      .filter(c => (result[c.key + '_sales'] || 0) > 0 && !result[c.key + '_theo_present'])
      .map(c => c.key)
    result.totalUsoCost = totalUsoCost
    result.totalTheoCost = totalTheoCost
    result.totalABSales = totalABSales
    result.totalRealPct = totalABSales > 0 ? pct(totalUsoCost, totalABSales) : null
    result.totalMixPct = totalABSales > 0 ? pct(totalTheoCost, totalABSales) : null
    result.totalVariacion = totalABSales > 0 && !anyIncludedCatMissingTheo
      ? parseFloat((totalUsoCost - totalTheoCost).toFixed(2))
      : null
    result.totalTheoComplete = !anyIncludedCatMissingTheo
    result.totalVariacionReason = (totalABSales === 0)
      ? (CATEGORIES.some(c => (result[c.key + '_sales'] || 0) < 0) ? 'negative_sales' : 'zero_sales')
      : (anyIncludedCatMissingTheo ? 'partial_total_theo' : 'ok') as VarianceReason
    result.totalVariacionMissingCategories = missingTheoCats
    result.hasAnyAdj = periodWeeks.some(w => hasAdjustments(w.report.week))
    result.diagnostics = diagnosePeriod(anchor, intermediates, closing, diagCtx, getAdj)
    return result
  }

  function buildPeriodSeries(weekList: any[]): any[] {
    if (!weekList.length) return []

    let priorAnchor = findAnchorBefore(weekList[0])
    const preIntermediates = priorAnchor ? getWeeksBetween(priorAnchor, weekList[0]) : []

    const series: any[] = []
    let intermediates: any[] = [...preIntermediates]

    for (const w of weekList) {
      const hasInv = w.inventory?.by_account?.length > 0
      if (!hasInv) {
        intermediates.push(w)
        continue
      }
      series.push(buildPeriodData(priorAnchor, intermediates, w))
      priorAnchor = w
      intermediates = []
    }
    return series
  }

  /**
   * Diagnósticos a nivel serie / rango.
   * Debe llamarse con el MISMO `weekList` que se pasó a buildPeriodSeries y la
   * `series` que produjo. Los períodos aportan sus diagnósticos individuales
   * y aquí se agregan los que solo tienen sentido a nivel serie (unclosed_tail,
   * duplicate_week, interval_extended).
   */
  function diagnoseRange(weekList: any[], series: any[]): Diagnostics {
    const periodDiags: Diagnostics[] = series
      .map(s => s.diagnostics as Diagnostics)
      .filter(Boolean)
    return diagnoseSeries(weekList, ctx.weeks, periodDiags, series, diagCtx)
  }

  function aggregateSeries(series: any[]): any {
    if (!series.length) return null
    if (series.length === 1) return series[0]

    const result: any = {
      isConsolidated: series.some(s => s.isConsolidated),
      spannedSkippedWeeks: series.flatMap(s => s.spannedSkippedWeeks || []),
      periodCount: series.length,
      hasAnyAdj: series.some(s => s.hasAnyAdj),
      hasInventory: true,
      hasProductMix: series[series.length - 1].hasProductMix,
      fullWeek: series[series.length - 1].fullWeek,
      reportId: series[series.length - 1].reportId,
      closingReport: series[series.length - 1].closingReport,
      closingRaw: series[series.length - 1].closingRaw,
      opDiscTotal: series.reduce((s, p) => s + (p.opDiscTotal || 0), 0),
      periodWeeksRaw: series.flatMap(s => s.periodWeeksRaw || []),
    }
    const totalOpDays = ctx.operatingDays !== null
      ? series.reduce((s, p) => s + (p.periodWeekCount || 1) * (ctx.operatingDays as number), 0)
      : null

    CATEGORIES.forEach(cat => {
      const uso = series.reduce((s, p) => s + (p[cat.key + '_uso'] || 0), 0)
      const theo = series.reduce((s, p) => s + (p[cat.key + '_theo_cost'] || 0), 0)
      const sales = series.reduce((s, p) => s + (p[cat.key + '_sales'] || 0), 0)
      const purchases = series.reduce((s, p) => s + (p[cat.key + '_purchases'] || 0), 0)
      // Presencia agregada: TODOS los períodos deben tener theo_present=true.
      const theoPresent = series.every(p => p[cat.key + '_theo_present'] === true)
      const realPct = sales > 0 ? pct(uso, sales) : null
      const mixPct = sales > 0 ? pct(theo, sales) : null
      const variacion = sales > 0 && theoPresent
        ? parseFloat((uso - theo).toFixed(2))
        : null
      const invPrev = series[0][cat.key + '_inv_previous']
      const invCurr = series[series.length - 1][cat.key + '_inv_current']
      const diasInv = uso > 0 && totalOpDays !== null
        ? parseFloat((((invCurr + invPrev) / 2) / uso * totalOpDays).toFixed(1))
        : null
      // Razón del null: si hay ventas <= 0, esa gana; si no, decide teórico.
      const hasPmixSomewhere = series.some(p => p.hasProductMix)
      const reason: VarianceReason = reasonForCategory(sales, theoPresent, hasPmixSomewhere)

      result[cat.key + '_uso'] = uso
      result[cat.key + '_uso_pct'] = realPct || 0
      result[cat.key + '_theo_pct'] = mixPct || 0
      result[cat.key + '_variacion'] = variacion
      result[cat.key + '_variacion_reason'] = reason
      result[cat.key + '_inv_current'] = invCurr
      result[cat.key + '_inv_previous'] = invPrev
      result[cat.key + '_purchases'] = purchases
      result[cat.key + '_sales'] = sales
      result[cat.key + '_has_adj'] = series.some(p => p[cat.key + '_has_adj'])
      result[cat.key + '_theo_cost'] = theo
      result[cat.key + '_theo_present'] = theoPresent
      result[cat.key + '_dias_inv'] = diasInv
    })

    let totalUso = 0, totalTheo = 0, totalSales = 0
    CATEGORIES.forEach(cat => {
      totalUso += result[cat.key + '_uso'] || 0
      totalTheo += result[cat.key + '_theo_cost'] || 0
      totalSales += result[cat.key + '_sales'] || 0
    })
    const anyIncludedCatMissingTheo = CATEGORIES.some(
      c => (result[c.key + '_sales'] || 0) > 0 && !result[c.key + '_theo_present']
    )
    const missingTheoCats = CATEGORIES
      .filter(c => (result[c.key + '_sales'] || 0) > 0 && !result[c.key + '_theo_present'])
      .map(c => c.key)
    result.totalUsoCost = totalUso
    result.totalTheoCost = totalTheo
    result.totalABSales = totalSales
    result.totalRealPct = totalSales > 0 ? pct(totalUso, totalSales) : null
    result.totalMixPct = totalSales > 0 ? pct(totalTheo, totalSales) : null
    result.totalVariacion = totalSales > 0 && !anyIncludedCatMissingTheo
      ? parseFloat((totalUso - totalTheo).toFixed(2))
      : null
    result.totalTheoComplete = !anyIncludedCatMissingTheo
    result.totalVariacionReason = (totalSales === 0)
      ? (CATEGORIES.some(c => (result[c.key + '_sales'] || 0) < 0) ? 'negative_sales' : 'zero_sales')
      : (anyIncludedCatMissingTheo ? 'partial_total_theo' : 'ok') as VarianceReason
    result.totalVariacionMissingCategories = missingTheoCats
    result.activityWeekStart = series[0].activityWeekStart
    result.activityWeekEnd   = series[series.length - 1].activityWeekEnd
    result.activityFirstLabel = series[0].activityFirstLabel
    result.activityLastLabel  = series[series.length - 1].activityLastLabel
    // Los diagnósticos del agregado consolidan los de sus períodos
    // (dedup por firma). Los de nivel serie (unclosed_tail, duplicates,
    // interval_extension) se añaden al llamar a diagnoseRange desde el
    // consumidor, no aquí, porque no sabemos cuál weekList originó la serie.
    const periodDiags: Diagnostics[] = series
      .map(s => s.diagnostics as Diagnostics)
      .filter(Boolean)
    result.diagnostics = diagnoseSeries([], ctx.weeks, periodDiags, series, diagCtx)
    return result
  }

  return {
    CATEGORIES,
    // helpers
    getOpDiscountTotal, getAdj, hasAdjustments, getWeekAdjustments,
    getMappedSales, getMappedGross,
    findAnchorBefore, getWeeksBetween,
    // fórmulas núcleo
    buildWeekData, buildPeriodData, buildPeriodSeries, aggregateSeries,
    // diagnósticos a nivel serie (invocar tras buildPeriodSeries)
    diagnoseRange,
  }
}

export type CostoUsoEngine = ReturnType<typeof createCostoUsoEngine>
