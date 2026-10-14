// Guards puros que decide qué mostrar en la sección Costo de Uso del
// PPTX. Aislados aquí para poderlos probar sin generar el archivo.

import { civilDaysBetween } from '@/lib/costo-uso/diagnostics'

/**
 * Fuentes indispensables para calcular Costo de Uso con integridad.
 * Si cualquiera de estas devolvió error de consulta, la sección no
 * debe publicar cifras. El resto de fuentes (cost_targets,
 * discount_mappings, skipped_inventory_weeks) puede estar vacío
 * legítimamente y no bloquea.
 */
export const CRITICAL_LOAD_PREFIXES = [
  'category_mappings:',
  'costo_uso_adjustments:',
  'reports_selection_embed:',
  'reports_anchor_lookback:',
] as const

export function hasCriticalLoadError(loadErrors: readonly string[] | undefined): boolean {
  const errs = loadErrors || []
  return errs.some(e => CRITICAL_LOAD_PREFIXES.some(p => e.startsWith(p)))
}

interface ReportWeekDates {
  report: {
    week: string
    week_start?: string | null
    week_end?: string | null
  }
}

/**
 * Clasifica la continuidad de las semanas seleccionadas por FECHAS
 * civiles reales (week_start / week_end de los reportes cargados), no
 * por la numeración YYYY-Wnn. Robusto ante W53 y calendarios fiscales.
 */
export function classifyConsecutive(
  requestedWeeks: readonly string[],
  engineWeeks: readonly ReportWeekDates[],
): 'consecutive' | 'gap' | 'not_determinable' {
  if (requestedWeeks.length <= 1) return 'consecutive'
  const byWeek = new Map<string, { start: string | null | undefined; end: string | null | undefined }>()
  for (const w of engineWeeks) byWeek.set(w.report.week, {
    start: w.report.week_start,
    end: w.report.week_end,
  })
  const rows: { start: string; end: string }[] = []
  for (const week of requestedWeeks) {
    const r = byWeek.get(week)
    if (!r?.start || !r?.end) return 'not_determinable'
    rows.push({ start: r.start, end: r.end })
  }
  rows.sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0)
  for (let i = 1; i < rows.length; i++) {
    const gap = civilDaysBetween(rows[i - 1].end, rows[i].start)
    if (gap === null) return 'not_determinable'
    if (gap !== 1) return 'gap'
  }
  return 'consecutive'
}
