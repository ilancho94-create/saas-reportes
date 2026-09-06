// src/lib/costo-uso/diagnostics.ts
//
// Diagnósticos de calidad de datos que acompañan los resultados del engine.
// NO modifican datos ni fórmulas — solo describen lo que falta o llama la
// atención, para que la interfaz decida cómo comunicarlo al usuario.
//
// Cada diagnóstico incluye la evidencia mínima suficiente para explicar el
// hallazgo. No se inventan ceros ni conteos. No se decide qué fuente
// "prevalece" ante una discrepancia — se muestran ambos valores.

export type DiagnosticType =
  | 'missing_week'                  // A: hueco en la secuencia de semanas presentes
  | 'week_present_no_inventory'     // A: la semana existe pero no trajo conteo
  | 'source_missing'                // B: fuente entera (sales/cogs/inventory/pmix) ausente
  | 'field_undetermined'            // B: no se puede decidir ausencia vs cero explícito
  | 'inventory_account_missing'     // C: mapping esperado no encontró cuentas
  | 'inventory_carry_mismatch'      // D: anchor.inv_current ≠ closing.inv_previous
  | 'theo_cost_source_missing'      // E: la semana no tiene productMix
  | 'theo_cost_partial'             // E: productMix existe pero categoría con ventas no aparece
  | 'unmatched_pmix_items'          // E: raw_data.unmatched_items presentes
  | 'unclosed_tail'                 // F: semanas finales sin cierre
  | 'negative_gross_consumption'    // G: uso bruto negativo antes del clampeo
  | 'duplicate_week'                // H: >1 registro con el mismo `week` en el array
  | 'interval_extended'             // H: el rango efectivo excede el solicitado

export interface Diagnostic {
  type: DiagnosticType
  week?: string
  weekRange?: [string, string]
  category?: string
  evidence: Record<string, unknown>
}

export type CheckState =
  | 'ok'              // se realizó la comprobación y no hay hallazgos
  | 'present'         // se realizó y sí hay hallazgos (ver items)
  | 'not_checked'     // no aplicable a este scope
  | 'not_determinable' // el input no permitió concluir

export interface Diagnostics {
  items: Diagnostic[]
  checks: {
    calendarCoverage: CheckState
    salesPresence: CheckState
    purchasesPresence: CheckState
    inventoryCategoryCoverage: CheckState
    carryMismatch: CheckState
    theoCostPresence: CheckState
    unclosedTail: CheckState
    negativeGross: CheckState
    duplicates: CheckState
    intervalExtension: CheckState
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Semanas ISO consecutivas entre from y to (formato YYYY-Wnn). */
function isoWeeksBetween(from: string, to: string): string[] {
  const [fy, fw] = from.split('-W').map(Number)
  const [ty, tw] = to.split('-W').map(Number)
  if (!fy || !fw || !ty || !tw) return []
  const out: string[] = []
  for (let y = fy; y <= ty; y++) {
    const start = y === fy ? fw : 1
    const end   = y === ty ? tw : 52
    for (let w = start; w <= end; w++) out.push(`${y}-W${String(w).padStart(2, '0')}`)
  }
  return out
}

/** Nombres de cuentas de inventario R365 esperadas para una categoría. */
function expectedAccountsForCategory(
  accountMap: Record<string, string>,
  category: string,
): string[] {
  return Object.entries(accountMap)
    .filter(([, cat]) => cat === category)
    .map(([acc]) => acc)
}

// ── API principal ──────────────────────────────────────────────────────

export interface DiagnosticsContext {
  /** Categorías activas del restaurante (según mappings del ctx). */
  activeCategories: string[]
  /** Cuenta R365 → categoría interna. */
  accountMap: Record<string, string>
  /**
   * Alcance del análisis. Sirve para detectar interval_extended.
   * Si el requester marcó un rango explícito (custom from/to) y el motor
   * absorbió semanas fuera del rango como anchor externo o intermediates
   * previos, esa expansión queda registrada.
   */
  requestedRange?: { from: string; to: string } | null
}

/** Diagnósticos a nivel de una semana individual. */
export function diagnoseWeek(
  w: any,
  ctx: DiagnosticsContext,
): Diagnostics {
  const items: Diagnostic[] = []
  const week = w.report.week

  // B — fuentes ausentes por reporte (distinguir null / undefined / {}).
  //     El parser Toast omite la sección entera cuando no viene en el archivo,
  //     así que null se interpreta como "fuente ausente".
  //     Un objeto vacío o net_sales === 0 sin categorías es "no determinable"
  //     (no podemos decidir si fue cero real o campo faltante).
  const salesMissing   = w.sales      == null
  const cogsMissing    = w.cogs       == null
  const pmixMissing    = w.productMix == null

  if (salesMissing) items.push({
    type: 'source_missing', week,
    evidence: { source: 'sales_data', field: 'sales' },
  })
  if (cogsMissing) items.push({
    type: 'source_missing', week,
    evidence: { source: 'cogs_data', field: 'cogs' },
  })
  if (pmixMissing) items.push({
    type: 'source_missing', week,
    evidence: { source: 'product_mix_data', field: 'productMix' },
  })

  const salesEmpty = !salesMissing
    && (w.sales.categories == null || w.sales.categories.length === 0)
    && !w.sales.net_sales
  if (salesEmpty) items.push({
    type: 'field_undetermined', week,
    evidence: {
      source: 'sales_data',
      note: 'net_sales=0 y categories vacío; no se puede decidir "cero real" vs "campo faltante"',
    },
  })

  // C — cuentas de inventario esperadas por categoría.
  //     Si la semana trae `by_account` con al menos una cuenta, revisamos
  //     cuáles categorías activas NO tienen ninguna cuenta esperada presente.
  //     Si la semana no trae inventory, no marcamos "missing" por categoría
  //     (eso es un source_missing de inventory a nivel semana).
  const invAccounts: any[] = w.inventory?.by_account || []
  if (w.inventory) {
    const accountsInWeek = new Set(invAccounts.map((a: any) => a.account))
    ctx.activeCategories.forEach(cat => {
      const expected = expectedAccountsForCategory(ctx.accountMap, cat)
      if (expected.length === 0) return   // categoría sin mapping — nada que revisar
      const anyPresent = expected.some(acc => accountsInWeek.has(acc))
      if (!anyPresent) items.push({
        type: 'inventory_account_missing', week, category: cat,
        evidence: { expectedAccounts: expected, presentAccounts: [...accountsInWeek] },
      })
    })
  } else {
    items.push({
      type: 'source_missing', week,
      evidence: { source: 'inventory_data', field: 'inventory' },
    })
  }

  // E — teórico
  if (pmixMissing) items.push({
    type: 'theo_cost_source_missing', week,
    evidence: { note: 'productMix null' },
  })
  if (w.productMix) {
    const theoByCat = w.productMix.theo_cost_by_category || {}
    ctx.activeCategories.forEach(cat => {
      if (!Object.prototype.hasOwnProperty.call(theoByCat, cat)) items.push({
        type: 'theo_cost_partial', week, category: cat,
        evidence: { theoByCatKeys: Object.keys(theoByCat) },
      })
    })
    const unmatched = w.productMix.raw_data?.unmatched_items
    if (Array.isArray(unmatched) && unmatched.length > 0) {
      const totalTheo = unmatched.reduce(
        (s, it) => s + (Number(it.theo_cost) || 0), 0)
      items.push({
        type: 'unmatched_pmix_items', week,
        evidence: { count: unmatched.length, totalTheoCost: totalTheo },
      })
    }
  }

  return {
    items,
    checks: {
      calendarCoverage:          'not_checked',
      salesPresence:             salesMissing ? 'present' : (salesEmpty ? 'not_determinable' : 'ok'),
      purchasesPresence:         cogsMissing ? 'present' : 'ok',
      inventoryCategoryCoverage: !w.inventory ? 'present'
                                : items.some(i => i.type === 'inventory_account_missing') ? 'present' : 'ok',
      carryMismatch:             'not_checked',   // requiere par (w, w+1)
      theoCostPresence:          pmixMissing ? 'present'
                                : items.some(i => i.type === 'theo_cost_partial') ? 'present' : 'ok',
      unclosedTail:              'not_checked',   // solo tiene sentido a nivel serie
      negativeGross:             'not_checked',   // solo tiene sentido a nivel período
      duplicates:                'not_checked',
      intervalExtension:         'not_checked',
    },
  }
}

/** Diagnósticos a nivel de un período consolidado. */
export function diagnosePeriod(
  anchor: any | null,
  intermediates: any[],
  closing: any,
  ctx: DiagnosticsContext,
): Diagnostics {
  const items: Diagnostic[] = []
  const periodWeeks = [...intermediates, closing]

  // A — semanas intermedias presentes sin inventario (skipped o "no llegaron")
  //     También detectamos huecos calendario dentro del intervalo cubierto,
  //     usando los `report.week` PRESENTES en la entrada, no un calendario
  //     fiscal externo. Un hueco significa que la semana no está en el array.
  intermediates.forEach(w => {
    if (!w.inventory) items.push({
      type: 'week_present_no_inventory', week: w.report.week,
      evidence: {
        withinPeriod: [anchor?.report.week || null, closing.report.week],
        hadSales: w.sales != null,
        hadCogs: w.cogs != null,
      },
    })
  })

  // A — huecos calendario ISO dentro del período.
  //     Nota: usa numeración ISO (YYYY-Wnn) que es lo que la app maneja hoy
  //     para etiquetar reportes. Si el restaurante define un calendario
  //     fiscal distinto, este detector debe adaptarse — se documenta la
  //     limitación como pendiente y se mantiene el detector como aproximación.
  if (anchor && closing) {
    const expected = isoWeeksBetween(anchor.report.week, closing.report.week)
    const present  = new Set([anchor, ...periodWeeks].map(w => w.report.week))
    const missing  = expected.filter(w => !present.has(w))
    missing.forEach(mw => items.push({
      type: 'missing_week', week: mw,
      evidence: {
        withinPeriod: [anchor.report.week, closing.report.week],
        note: 'Numeración ISO YYYY-Wnn deducida de las semanas presentes',
      },
    }))
  }

  // D — discrepancia de arrastre por categoría entre anchor y closing.
  //     Se compara SIN aplicar tolerancia de negocio. Se distingue precisión
  //     monetaria técnica (< 0.005 = diferencia por redondeo a centavos) del
  //     resto. La app NO decide cuál fuente prevalece.
  if (anchor && closing) {
    const anchorAccs: any[] = anchor.inventory?.by_account || []
    const closingAccs: any[] = closing.inventory?.by_account || []
    ctx.activeCategories.forEach(cat => {
      const expected = expectedAccountsForCategory(ctx.accountMap, cat)
      if (!expected.length) return
      const anchorSum = anchorAccs
        .filter(a => expected.includes(a.account))
        .reduce((s, a) => s + Number(a.current_value || 0), 0)
      const closingSum = closingAccs
        .filter(a => expected.includes(a.account))
        .reduce((s, a) => s + Number(a.previous_value || 0), 0)
      const diff = closingSum - anchorSum
      if (Math.abs(diff) >= 0.005) items.push({
        type: 'inventory_carry_mismatch',
        week: closing.report.week, category: cat,
        weekRange: [anchor.report.week, closing.report.week],
        evidence: {
          anchorInvCurrent: anchorSum,
          closingInvPrevious: closingSum,
          diff,
          note: 'Sin tolerancia de negocio aplicada. Precisión monetaria técnica: 0.005.',
        },
      })
    })
  }

  // G — consumo bruto negativo por categoría (antes del clampeo Math.max)
  ctx.activeCategories.forEach(cat => {
    const expected = expectedAccountsForCategory(ctx.accountMap, cat)
    if (!expected.length) return
    const I0 = anchor
      ? (anchor.inventory?.by_account || [])
          .filter((a: any) => expected.includes(a.account))
          .reduce((s: number, a: any) => s + Number(a.current_value || 0), 0)
      : (closing.inventory?.by_account || [])
          .filter((a: any) => expected.includes(a.account))
          .reduce((s: number, a: any) => s + Number(a.previous_value || 0), 0)
    const I1 = (closing.inventory?.by_account || [])
      .filter((a: any) => expected.includes(a.account))
      .reduce((s: number, a: any) => s + Number(a.current_value || 0), 0)
    const P = periodWeeks.reduce((s, w) => {
      const bc = w.cogs?.by_category || {}
      return s + Number(bc[cat] || 0)
    }, 0)
    const bruto = I0 + P - I1
    if (bruto < 0) items.push({
      type: 'negative_gross_consumption',
      week: closing.report.week, category: cat,
      weekRange: [anchor?.report.week || closing.report.week, closing.report.week],
      evidence: {
        I0, purchases: P, I1, bruto,
        clampedTo: 0,
        note: 'Anomalía a investigar (posibles: conteo, factura tardía, transferencia).',
      },
    })
  })

  // Compón diagnósticos de cada semana del período y dedup por firma.
  const perWeek = periodWeeks.map(w => diagnoseWeek(w, ctx))
  const merged = dedupItems([...items, ...perWeek.flatMap(d => d.items)])

  return {
    items: merged,
    checks: {
      calendarCoverage:          anchor ? (merged.some(i => i.type === 'missing_week') ? 'present' : 'ok') : 'not_checked',
      salesPresence:             collapseCheck(perWeek, 'salesPresence'),
      purchasesPresence:         collapseCheck(perWeek, 'purchasesPresence'),
      inventoryCategoryCoverage: collapseCheck(perWeek, 'inventoryCategoryCoverage'),
      carryMismatch:             anchor ? (merged.some(i => i.type === 'inventory_carry_mismatch') ? 'present' : 'ok') : 'not_checked',
      theoCostPresence:          collapseCheck(perWeek, 'theoCostPresence'),
      unclosedTail:              'not_checked',
      negativeGross:             merged.some(i => i.type === 'negative_gross_consumption') ? 'present' : 'ok',
      duplicates:                'not_checked',
      intervalExtension:         'not_checked',
    },
  }
}

/**
 * Diagnósticos a nivel serie / rango.
 * `weekList` es el subset filtrado por el usuario (lo que llega a
 * buildPeriodSeries). `allWeeks` es el array total del engine (para detectar
 * duplicados globales y extensión del intervalo).
 */
export function diagnoseSeries(
  weekList: any[],
  allWeeks: any[],
  periodDiags: Diagnostics[],
  emittedSeries: any[],
  ctx: DiagnosticsContext,
): Diagnostics {
  const items: Diagnostic[] = []

  // F — semanas al final del rango sin cerrar (existe fila pero no generó período)
  const emittedClosingSet = new Set(emittedSeries.map(s => s.fullWeek))
  const tailUnclosed: string[] = []
  for (let i = weekList.length - 1; i >= 0; i--) {
    const w = weekList[i]
    if (emittedClosingSet.has(w.report.week)) break
    if (!w.inventory) tailUnclosed.push(w.report.week)
  }
  if (tailUnclosed.length > 0) items.push({
    type: 'unclosed_tail',
    weekRange: [tailUnclosed[tailUnclosed.length - 1], tailUnclosed[0]],
    evidence: {
      weeks: tailUnclosed.slice().reverse(),
      note: 'Ventas y compras de estas semanas quedan fuera del análisis hasta el próximo cierre.',
    },
  })

  // H — duplicados de `week` en el array recibido por el motor.
  //     No inferimos nada sobre restricciones de la base — solo describimos
  //     lo que llegó al engine.
  const counts = new Map<string, number>()
  const reportIdsByWeek = new Map<string, string[]>()
  allWeeks.forEach(w => {
    counts.set(w.report.week, (counts.get(w.report.week) || 0) + 1)
    const arr = reportIdsByWeek.get(w.report.week) || []
    arr.push(w.report.id)
    reportIdsByWeek.set(w.report.week, arr)
  })
  for (const [wk, n] of counts) {
    if (n > 1) items.push({
      type: 'duplicate_week', week: wk,
      evidence: {
        occurrences: n,
        reportIds: reportIdsByWeek.get(wk) || [],
        note: 'No inferimos nada sobre constraints de la base; solo el input al motor.',
      },
    })
  }

  // H — extensión del intervalo: si el rango solicitado empieza en Wx pero
  //     el motor absorbió intermediates o anchor externo, la primera semana
  //     que participa en el cálculo es anterior a Wx.
  if (ctx.requestedRange && emittedSeries.length > 0) {
    const first = emittedSeries[0]
    const firstIntervalStart: string | null =
      first.anchorWeek || first.fullWeek
    if (firstIntervalStart && firstIntervalStart < ctx.requestedRange.from) {
      items.push({
        type: 'interval_extended',
        weekRange: [firstIntervalStart, ctx.requestedRange.to],
        evidence: {
          requested: ctx.requestedRange,
          effectiveStart: firstIntervalStart,
          reason: first.anchorWeek
            ? 'primera semana del período efectivo es el anchor externo'
            : 'primer período usó closing.inv_previous del R365 (sin anchor previo)',
        },
      })
    }
  }

  // Consolida diagnósticos de cada período (ya deduplicados internamente).
  const allPeriodItems = periodDiags.flatMap(d => d.items)
  const merged = dedupItems([...items, ...allPeriodItems])

  return {
    items: merged,
    checks: {
      calendarCoverage:          collapseCheck(periodDiags, 'calendarCoverage'),
      salesPresence:             collapseCheck(periodDiags, 'salesPresence'),
      purchasesPresence:         collapseCheck(periodDiags, 'purchasesPresence'),
      inventoryCategoryCoverage: collapseCheck(periodDiags, 'inventoryCategoryCoverage'),
      carryMismatch:             collapseCheck(periodDiags, 'carryMismatch'),
      theoCostPresence:          collapseCheck(periodDiags, 'theoCostPresence'),
      unclosedTail:              tailUnclosed.length > 0 ? 'present' : 'ok',
      negativeGross:             collapseCheck(periodDiags, 'negativeGross'),
      duplicates:                merged.some(i => i.type === 'duplicate_week') ? 'present' : 'ok',
      intervalExtension:         merged.some(i => i.type === 'interval_extended') ? 'present'
                                : ctx.requestedRange ? 'ok' : 'not_checked',
    },
  }
}

// ── Utilidades internas ────────────────────────────────────────────────

function dedupItems(items: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>()
  const out: Diagnostic[] = []
  for (const it of items) {
    const key = [it.type, it.week || '', it.category || '', it.weekRange?.join('..') || ''].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

function collapseCheck(diags: Diagnostics[], k: keyof Diagnostics['checks']): CheckState {
  const values = diags.map(d => d.checks[k])
  if (values.some(v => v === 'not_determinable')) return 'not_determinable'
  if (values.some(v => v === 'present')) return 'present'
  if (values.every(v => v === 'not_checked')) return 'not_checked'
  return 'ok'
}
