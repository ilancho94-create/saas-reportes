import { describe, it, expect } from 'vitest'
import { hasCriticalLoadError, classifyConsecutive, CRITICAL_LOAD_PREFIXES } from '../costo-uso-guards'

// Guards puros que decide qué muestra la sección Costo de Uso del PPTX.
// Sin generación de archivo, sin fetch, sin datos reales.

// ═════════════════════════════════════════════════════════════════════
// (1) Consulta fallida indispensable → bloquea la sección.
// ═════════════════════════════════════════════════════════════════════
describe('[EXACT] hasCriticalLoadError — bloqueo por fuente indispensable', () => {
  it('vacío → no bloquea', () => {
    expect(hasCriticalLoadError([])).toBe(false)
    expect(hasCriticalLoadError(undefined)).toBe(false)
  })
  it('error de fuentes indispensables → bloquea', () => {
    for (const prefix of CRITICAL_LOAD_PREFIXES) {
      expect(hasCriticalLoadError([prefix + ' timeout'])).toBe(true)
    }
  })
  it('error de fuentes NO indispensables → NO bloquea', () => {
    // cost_targets, discount_mappings y skipped_inventory_weeks pueden
    // estar vacías legítimamente; su error no bloquea la sección.
    expect(hasCriticalLoadError(['cost_targets: timeout'])).toBe(false)
    expect(hasCriticalLoadError(['discount_mappings: rls'])).toBe(false)
    expect(hasCriticalLoadError(['skipped_inventory_weeks: net'])).toBe(false)
  })
  it('combinación de errores: cualquiera indispensable domina', () => {
    expect(hasCriticalLoadError([
      'cost_targets: timeout',
      'category_mappings: 500',
    ])).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════
// (2) Respuesta vacía válida vs error de consulta.
// ═════════════════════════════════════════════════════════════════════
describe('[EXACT] Respuesta vacía válida NO se confunde con error', () => {
  it('array vacío en loadErrors → no bloquea (fuentes vinieron sin filas, pero sin error)', () => {
    expect(hasCriticalLoadError([])).toBe(false)
  })
  // El fetcher pone strings solo cuando hay error real; una fila
  // devuelta como [] entra al motor tal cual sin agregarse a loadErrors.
  // Este contrato se preserva en data-fetcher.ts (mapsRes.error → push;
  // mapsRes.data || [] → sigue).
})

// ═════════════════════════════════════════════════════════════════════
// (4) Selección no consecutiva → sección sin totales.
//     El clasificador usa fechas civiles reales, no numeración YYYY-Wnn.
// ═════════════════════════════════════════════════════════════════════
describe('[EXACT] classifyConsecutive — por fechas civiles', () => {
  const wk = (week: string, start: string, end: string) =>
    ({ report: { week, week_start: start, week_end: end } })

  it('una sola semana → consecutive', () => {
    expect(classifyConsecutive(['2026-W10'], [wk('2026-W10', '2026-03-01', '2026-03-07')]))
      .toBe('consecutive')
  })
  it('semanas consecutivas por fecha (end+1 = next.start)', () => {
    const engineWeeks = [
      wk('2026-W10', '2026-03-01', '2026-03-07'),
      wk('2026-W11', '2026-03-08', '2026-03-14'),
    ]
    expect(classifyConsecutive(['2026-W10', '2026-W11'], engineWeeks)).toBe('consecutive')
  })
  it('cruce ISO W53 real (2026-W52 → 2026-W53 → 2027-W01) → consecutive', () => {
    const engineWeeks = [
      wk('2026-W52', '2026-12-21', '2026-12-27'),
      wk('2026-W53', '2026-12-28', '2027-01-03'),
      wk('2027-W01', '2027-01-04', '2027-01-10'),
    ]
    expect(classifyConsecutive(['2026-W52', '2026-W53', '2027-W01'], engineWeeks))
      .toBe('consecutive')
  })
  it('cruce DST spring forward EE.UU. no rompe la continuidad', () => {
    const engineWeeks = [
      wk('2026-W10', '2026-03-01', '2026-03-07'),
      wk('2026-W11', '2026-03-08', '2026-03-14'),
    ]
    expect(classifyConsecutive(['2026-W10', '2026-W11'], engineWeeks))
      .toBe('consecutive')
  })
  it('gap real (falta 2026-W11 entre W10 y W12)', () => {
    const engineWeeks = [
      wk('2026-W10', '2026-03-01', '2026-03-07'),
      wk('2026-W12', '2026-03-15', '2026-03-21'),
    ]
    expect(classifyConsecutive(['2026-W10', '2026-W12'], engineWeeks)).toBe('gap')
  })
  it('reporte no cargado en engineWeeks → not_determinable', () => {
    expect(classifyConsecutive(['2026-W10', '2026-W11'], [
      // solo W10 disponible, W11 falta
      wk('2026-W10', '2026-03-01', '2026-03-07'),
    ])).toBe('not_determinable')
  })
  it('fechas ausentes en un reporte → not_determinable', () => {
    expect(classifyConsecutive(['2026-W10', '2026-W11'], [
      wk('2026-W10', '2026-03-01', '2026-03-07'),
      { report: { week: '2026-W11', week_start: null, week_end: null } },
    ])).toBe('not_determinable')
  })
})
