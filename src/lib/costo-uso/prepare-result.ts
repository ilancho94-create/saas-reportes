// src/lib/costo-uso/prepare-result.ts
//
// Preparación ÚNICA de resultados de Costo de Uso, para que UI y PPTX
// consuman EXACTAMENTE los mismos números. Este módulo NO copia
// fórmulas: sólo construye el engine con el mismo contexto que la
// página productiva y expone el mismo `filtered / periodSeries /
// detailData / rangeDiagnostics` que la UI ya lee.
//
// Requisitos que el consumidor debe garantizar antes de llamar aquí:
//   * mismo restaurante (weeks + mappings + adjustments provienen del
//     mismo restaurant_id)
//   * mismo rango solicitado (requestedRange en YYYY-Wnn)
//   * mismos mappings, ajustes manuales y descuentos operativos
//   * mismo fiscalYearStart y operatingDays del restaurante
//   * mismo criterio includeOpDiscounts (toggle "+Desc. Op." de la UI)
//
// Si algún dato no está disponible en el flujo de export, se debe
// conectar su fuente existente antes de llamar aquí. No hay valores
// por defecto silenciosos que cambien el cálculo.

import { createCostoUsoEngine } from './engine'
import type { Diagnostics } from './diagnostics'

export interface PrepareCostoUsoInput {
  /** Todas las semanas del restaurante ya normalizadas al shape que consume el engine. */
  weeks: any[]
  /** Filas de category_mappings del restaurante. */
  mappings: any[]
  /** Filas de costo_uso_adjustments del restaurante. */
  adjustments: any[]
  /** Set de semanas marcadas como skipped_inventory_weeks. */
  skippedWeekSet: Set<string>
  /** discount_mappings.discount_name con is_operational = true. */
  opDiscountMappings: string[]
  /** Toggle "+Desc. Op." — debe reflejar la selección del consumidor. */
  includeOpDiscounts: boolean
  /** restaurants.operating_days (6 por defecto en la ingesta). */
  operatingDays: number
  /** cost_targets por categoría (override de defaultMeta). */
  costTargets: Record<string, number>
  /** Rango solicitado — obligatorio para exportación (from/to en YYYY-Wnn). */
  requestedRange: { from: string; to: string }
  /** restaurants.fiscal_year_start (null si el restaurante no lo definió). */
  fiscalYearStart: string | null
}

export interface PreparedCostoUsoResult {
  /** Subset de weeks dentro del requestedRange. */
  filtered: any[]
  /** Serie de períodos emitidos (vacía si no hay cierre). */
  periodSeries: any[]
  /** Resultado agregado listo para consumo (null si no hay cierre). */
  detailData: any | null
  /** Diagnósticos a nivel rango, siempre presente. */
  rangeDiagnostics: Diagnostics
  /** Etiquetas ya calculadas — evita duplicar la lógica en cada consumidor. */
  labels: {
    requestedRange: string
    effectiveRange: string | null      // "actFirst → actLast", null si serie vacía
    externalAnchorWeek: string | null  // != null si serie[0].anchorWeek < requestedRange.from
  }
}

/**
 * Preparación compartida.
 * NUNCA modifica los inputs. NUNCA introduce defaults que cambien
 * el cálculo (operatingDays, fiscalYearStart, etc. son parámetros
 * explícitos aportados por el consumidor).
 */
export function prepareCostoUsoResult(input: PrepareCostoUsoInput): PreparedCostoUsoResult {
  const engine = createCostoUsoEngine({
    weeks: input.weeks,
    mappings: input.mappings,
    adjustments: input.adjustments,
    skippedWeekSet: input.skippedWeekSet,
    opDiscountMappings: input.opDiscountMappings,
    includeOpDiscounts: input.includeOpDiscounts,
    operatingDays: input.operatingDays,
    costTargets: input.costTargets,
    requestedRange: input.requestedRange,
    fiscalYearStart: input.fiscalYearStart,
  })

  const { from, to } = input.requestedRange
  const filtered = input.weeks.filter(w => w.report.week >= from && w.report.week <= to)
  const periodSeries = engine.buildPeriodSeries(filtered)
  const detailData = engine.aggregateSeries(periodSeries)
  const rangeDiagnostics = engine.diagnoseRange(filtered, periodSeries)

  const first = periodSeries[0]
  const last  = periodSeries[periodSeries.length - 1]
  const effectiveRange = first
    ? (first.activityFirstLabel || first.fullWeek) + ' → ' + (last.activityLastLabel || last.fullWeek)
    : null
  const externalAnchorWeek = first?.anchorWeek && first.anchorWeek < from
    ? first.anchorWeek
    : null

  return {
    filtered,
    periodSeries,
    detailData,
    rangeDiagnostics,
    labels: {
      requestedRange: from + ' → ' + to,
      effectiveRange,
      externalAnchorWeek,
    },
  }
}
