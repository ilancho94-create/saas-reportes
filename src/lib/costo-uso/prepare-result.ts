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
  /**
   * "Ventas brutas" del engine — cuando es true, catSales cambia de
   * `net` a `gross` (net + descuentos completos). En el Export Center
   * corresponde a "Base de ventas: Ventas brutas"; en la UI al toggle
   * "+Desc. Op." (mismo comportamiento).
   */
  includeOpDiscounts: boolean
  /**
   * restaurants.operating_days.
   * Debe ser null cuando el registro del restaurante no lo trae:
   * "días de inventario" no se calculará, el resto de métricas sí.
   * No pasar un valor de compromiso silencioso.
   */
  operatingDays: number | null
  /** cost_targets por categoría (override de defaultMeta). */
  costTargets: Record<string, number>
  /**
   * Modo de selección del alcance. Exactamente uno de:
   *   { requestedRange: {from, to} }  — el helper filtra weeks por
   *                                    ese rango cronológico.
   *   { weekList: any[] }             — el consumidor pasa la lista
   *                                    ya filtrada (útil cuando la UI
   *                                    aplica filtros no expresables
   *                                    como {from,to}, p.ej. "last4"
   *                                    o "mes actual" o "una única
   *                                    semana seleccionada").
   * En ambos casos, buildPeriodSeries podrá absorber el anchor
   * externo desde `weeks` cuando exista.
   */
  requestedRange?: { from: string; to: string } | null
  weekList?: any[]
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
  if (!input.requestedRange && !input.weekList) {
    throw new Error('prepareCostoUsoResult: se debe pasar requestedRange o weekList')
  }
  if (input.requestedRange && input.weekList) {
    throw new Error('prepareCostoUsoResult: no se puede pasar requestedRange y weekList a la vez')
  }

  const engine = createCostoUsoEngine({
    weeks: input.weeks,
    mappings: input.mappings,
    adjustments: input.adjustments,
    skippedWeekSet: input.skippedWeekSet,
    opDiscountMappings: input.opDiscountMappings,
    includeOpDiscounts: input.includeOpDiscounts,
    operatingDays: input.operatingDays,
    costTargets: input.costTargets,
    requestedRange: input.requestedRange ?? null,
    fiscalYearStart: input.fiscalYearStart,
  })

  const filtered = input.weekList
    ? input.weekList
    : input.weeks.filter(w =>
        w.report.week >= input.requestedRange!.from && w.report.week <= input.requestedRange!.to)
  const periodSeries = engine.buildPeriodSeries(filtered)
  const detailData = engine.aggregateSeries(periodSeries)
  const rangeDiagnostics = engine.diagnoseRange(filtered, periodSeries)

  const first = periodSeries[0]
  const last  = periodSeries[periodSeries.length - 1]
  const effectiveRange = first
    ? (first.activityFirstLabel || first.fullWeek) + ' → ' + (last.activityLastLabel || last.fullWeek)
    : null

  // externalAnchorWeek requiere un rango solicitado explícito; con
  // weekList, la comparación no es cronológica pura.
  const externalAnchorWeek = input.requestedRange && first?.anchorWeek && first.anchorWeek < input.requestedRange.from
    ? first.anchorWeek
    : null

  const requestedLabel = input.requestedRange
    ? input.requestedRange.from + ' → ' + input.requestedRange.to
    : (filtered.length > 0
        ? filtered[0].report.week + ' → ' + filtered[filtered.length - 1].report.week
        : '—')

  return {
    filtered,
    periodSeries,
    detailData,
    rangeDiagnostics,
    labels: {
      requestedRange: requestedLabel,
      effectiveRange,
      externalAnchorWeek,
    },
  }
}
