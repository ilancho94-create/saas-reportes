import { describe, it, expect } from 'vitest'
import { createCostoUsoEngine } from '../engine'
import { makeWeek, DEFAULT_MAPPINGS } from './fixtures'

// Todas estas pruebas ejecutan createCostoUsoEngine — el mismo módulo que
// consume la página. No hay copia paralela de la lógica. Ningún test se
// conecta a Supabase u otros servicios reales.

const BASE_CTX = {
  mappings: DEFAULT_MAPPINGS,
  adjustments: [],
  skippedWeekSet: new Set<string>(),
  opDiscountMappings: [],
  includeOpDiscounts: false,
  operatingDays: 6,
  costTargets: {},
}

// ═════════════════════════════════════════════════════════════════════════
// A. SEMANAS FALTANTES / SIN INVENTARIO
// ═════════════════════════════════════════════════════════════════════════
describe('[EXACT] A — semanas ausentes y presentes sin conteo', () => {
  it('período consolidado con intermedia SIN inventario → week_present_no_inventory', () => {
    const w1 = makeWeek({
      week: '2026-W20', reportId: 'r20',
      salesCats: [{ name: 'FOOD', net: 3000 }], cogs: { food: 200 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 150 },
    })
    const w2 = makeWeek({
      week: '2026-W21', reportId: 'r21',
      salesCats: [{ name: 'FOOD', net: 3200 }], cogs: { food: 220 },
      inventory: null,
      theoCostByCat: { food: 160 },
    })
    const w3 = makeWeek({
      week: '2026-W22', reportId: 'r22',
      salesCats: [{ name: 'FOOD', net: 2800 }], cogs: { food: 180 },
      inventory: [{ account: 'Food Inventory', current_value: 520, previous_value: 500 }],
      theoCostByCat: { food: 140 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w1, w2, w3] })
    const p = engine.buildPeriodData(w1, [w2], w3)
    const missing = (p.diagnostics.items as any[]).filter(i => i.type === 'week_present_no_inventory')
    expect(missing).toHaveLength(1)
    expect(missing[0].week).toBe('2026-W21')
  })

  it('secuencia calendario con hueco → missing_week', () => {
    const w20 = makeWeek({
      week: '2026-W20', reportId: 'r20',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    // Falta W21 (no está en el array)
    const w22 = makeWeek({
      week: '2026-W22', reportId: 'r22',
      salesCats: [{ name: 'FOOD', net: 1200 }], cogs: { food: 150 },
      inventory: [{ account: 'Food Inventory', current_value: 550, previous_value: 500 }],
      theoCostByCat: { food: 110 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w20, w22] })
    const p = engine.buildPeriodData(w20, [], w22)
    const missing = (p.diagnostics.items as any[]).filter(i => i.type === 'missing_week')
    expect(missing).toHaveLength(1)
    expect(missing[0].week).toBe('2026-W21')
    expect(p.diagnostics.checks.calendarCoverage).toBe('present')
  })

  it('cambio de año: W52 → W02 detecta W53? NO (limita a 52) y W01 sí', () => {
    // Documenta que el detector usa isoWeeksBetween con corte en W52.
    // Los años con W53 fiscal caerían fuera; queda como limitación conocida.
    const w52 = makeWeek({
      week: '2025-W52',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const w02 = makeWeek({
      week: '2026-W02',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w52, w02] })
    const p = engine.buildPeriodData(w52, [], w02)
    const missing = (p.diagnostics.items as any[])
      .filter(i => i.type === 'missing_week').map(i => i.week)
    expect(missing).toContain('2026-W01')
    // Nota / limitación: el detector no distingue W53 fiscal por año.
  })
})

// ═════════════════════════════════════════════════════════════════════════
// B. COMPRAS Y VENTAS AUSENTES vs CERO EXPLÍCITO
// ═════════════════════════════════════════════════════════════════════════
describe('[EXACT] B — presencia de sales/cogs/pmix', () => {
  it('sales, cogs, productMix ausentes por completo → source_missing por cada uno', () => {
    const w = makeWeek({
      week: '2026-W10', reportId: 'r10',
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      // sin salesCats/netSales → sales null; sin cogs → cogs null; sin theoCostByCat → productMix null
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    const d = engine.buildWeekData(w)
    const types = (d.diagnostics.items as any[]).map(i => i.type)
    expect(types).toContain('source_missing')
    const sources = (d.diagnostics.items as any[])
      .filter(i => i.type === 'source_missing')
      .map(i => i.evidence.source)
    expect(sources).toEqual(expect.arrayContaining(['sales_data', 'cogs_data', 'product_mix_data']))
  })

  it('sales presente con net=0 y categories vacío → field_undetermined', () => {
    const w = makeWeek({
      week: '2026-W11', reportId: 'r11',
      salesCats: [], netSales: 0,
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 0 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    const d = engine.buildWeekData(w)
    const undet = (d.diagnostics.items as any[])
      .filter(i => i.type === 'field_undetermined')
    expect(undet).toHaveLength(1)
    expect(d.diagnostics.checks.salesPresence).toBe('not_determinable')
  })

  it('sales con net > 0 y categoría con net=0 explícito → NO se marca undetermined', () => {
    const w = makeWeek({
      week: '2026-W12', reportId: 'r12',
      salesCats: [{ name: 'FOOD', net: 100 }, { name: 'LIQUOR', net: 0 }],
      netSales: 100,
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90, liquor: 0 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    const d = engine.buildWeekData(w)
    expect(d.diagnostics.checks.salesPresence).toBe('ok')
    expect((d.diagnostics.items as any[]).filter(i => i.type === 'field_undetermined')).toHaveLength(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════
// C. INVENTARIO POR CATEGORÍA
// ═════════════════════════════════════════════════════════════════════════
describe('[EXACT] C — cuentas esperadas por categoría', () => {
  it('by_account trae Food pero falta cualquier cuenta de LIQUOR → inventory_account_missing', () => {
    const w = makeWeek({
      week: '2026-W15', reportId: 'r15',
      salesCats: [
        { name: 'FOOD',   net: 5000 },
        { name: 'LIQUOR', net: 1000 },
      ],
      cogs: { food: 800, liquor: 200 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 700, liquor: 150 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    const d = engine.buildWeekData(w)
    const invMissing = (d.diagnostics.items as any[])
      .filter(i => i.type === 'inventory_account_missing')
    expect(invMissing.map(i => i.category)).toContain('liquor')
    expect(invMissing.map(i => i.category)).not.toContain('food')
  })

  it('no presupone las 5 categorías canónicas — solo revisa las de mappings del restaurante', () => {
    // Mappings restringidos: solo food (sin liquor, beer, wine, na_beverage)
    const restrictedMappings = [{ source_category: 'FOOD', mapped_to: 'food' }]
    const w = makeWeek({
      week: '2026-W16', reportId: 'r16',
      salesCats: [{ name: 'FOOD', net: 5000 }],
      cogs: { food: 800 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 700 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, mappings: restrictedMappings, weeks: [w] })
    const d = engine.buildWeekData(w)
    const missing = (d.diagnostics.items as any[])
      .filter(i => i.type === 'inventory_account_missing')
    expect(missing).toHaveLength(0)   // no marca liquor porque no está mapeado
  })
})

// ═════════════════════════════════════════════════════════════════════════
// D. DISCREPANCIAS DE INVENTARIO
// ═════════════════════════════════════════════════════════════════════════
describe('[EXACT] D — inventory_carry_mismatch', () => {
  const w1 = makeWeek({
    week: '2026-W10', reportId: 'r10',
    salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
    inventory: [{ account: 'Food Inventory', current_value: 1000, previous_value: 900 }],
    theoCostByCat: { food: 90 },
  })
  const w2 = makeWeek({
    week: '2026-W11', reportId: 'r11',
    salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
    inventory: [{ account: 'Food Inventory', current_value: 1050, previous_value: 950 }],   // 950, debería ser 1000
    theoCostByCat: { food: 90 },
  })
  const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w1, w2] })
  const p = engine.buildPeriodData(w1, [], w2)

  it('detecta ambos valores sin sobrescribir ni elegir fuente', () => {
    const mm = (p.diagnostics.items as any[]).filter(i => i.type === 'inventory_carry_mismatch')
    expect(mm).toHaveLength(1)
    expect(mm[0].evidence.anchorInvCurrent).toBe(1000)
    expect(mm[0].evidence.closingInvPrevious).toBe(950)
    expect(mm[0].evidence.diff).toBe(-50)
  })

  it('diferencia < 0.005 no se marca (precisión monetaria técnica)', () => {
    const wA = makeWeek({
      week: '2026-W30', reportId: 'r30',
      salesCats: [{ name: 'FOOD', net: 100 }], cogs: { food: 10 },
      inventory: [{ account: 'Food Inventory', current_value: 100.001, previous_value: 90 }],
      theoCostByCat: { food: 9 },
    })
    const wB = makeWeek({
      week: '2026-W31', reportId: 'r31',
      salesCats: [{ name: 'FOOD', net: 100 }], cogs: { food: 10 },
      inventory: [{ account: 'Food Inventory', current_value: 105, previous_value: 100.003 }],
      theoCostByCat: { food: 9 },
    })
    const engine2 = createCostoUsoEngine({ ...BASE_CTX, weeks: [wA, wB] })
    const pp = engine2.buildPeriodData(wA, [], wB)
    const mm = (pp.diagnostics.items as any[]).filter(i => i.type === 'inventory_carry_mismatch')
    expect(mm).toHaveLength(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════
// E. COSTO TEÓRICO
// ═════════════════════════════════════════════════════════════════════════
describe('[EXACT] E — presencia y unmatched pmix', () => {
  it('productMix ausente → theo_cost_source_missing', () => {
    const w = makeWeek({
      week: '2026-W20', reportId: 'r20',
      salesCats: [{ name: 'FOOD', net: 5000 }], cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    const d = engine.buildWeekData(w)
    const types = (d.diagnostics.items as any[]).map(i => i.type)
    expect(types).toContain('theo_cost_source_missing')
  })

  it('categoría con ventas sin theo asignado → theo_cost_partial', () => {
    const w = makeWeek({
      week: '2026-W21', reportId: 'r21',
      salesCats: [
        { name: 'FOOD', net: 5000 },
        { name: 'LIQUOR', net: 1000 },
      ],
      cogs: { food: 500, liquor: 100 },
      inventory: [
        { account: 'Food Inventory',      current_value: 500, previous_value: 500 },
        { account: 'Alcoholic Inventory', current_value: 200, previous_value: 200 },
      ],
      theoCostByCat: { food: 450 },  // liquor no aparece
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    const d = engine.buildWeekData(w)
    const partial = (d.diagnostics.items as any[])
      .filter(i => i.type === 'theo_cost_partial')
    expect(partial.map(i => i.category)).toContain('liquor')
    expect(partial.map(i => i.category)).not.toContain('food')
  })

  it('food con theo=0 explícito NO se marca partial para food (aunque otras categorías activas sí)', () => {
    const w = makeWeek({
      week: '2026-W22', reportId: 'r22',
      salesCats: [{ name: 'FOOD', net: 5000 }], cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 0 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    const d = engine.buildWeekData(w)
    const partialCats = (d.diagnostics.items as any[])
      .filter(i => i.type === 'theo_cost_partial').map(i => i.category)
    expect(partialCats).not.toContain('food')   // key presente con 0 → OK
    // Las otras categorías activas del restaurante SÍ están sin asignación:
    expect(partialCats).toContain('liquor')
    // Ninguno source_missing porque productMix no es null:
    expect((d.diagnostics.items as any[]).some(i => i.type === 'theo_cost_source_missing'))
      .toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════
// F. PERÍODOS SIN CIERRE (a nivel serie)
// ═════════════════════════════════════════════════════════════════════════
describe('[EXACT] F — unclosed_tail a nivel serie', () => {
  it('semanas finales sin inventario → unclosed_tail con evidencia', () => {
    const w1 = makeWeek({
      week: '2026-W10', reportId: 'r10',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const w2 = makeWeek({
      week: '2026-W11', reportId: 'r11',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: null,
    })
    const w3 = makeWeek({
      week: '2026-W12', reportId: 'r12',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: null,
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w1, w2, w3] })
    const series = engine.buildPeriodSeries([w1, w2, w3])
    const range = engine.diagnoseRange([w1, w2, w3], series)
    expect(range.checks.unclosedTail).toBe('present')
    const tail = (range.items as any[]).find(i => i.type === 'unclosed_tail')
    expect(tail.evidence.weeks).toEqual(['2026-W11', '2026-W12'])
  })

  it('rango sin NINGÚN cierre → unclosed_tail sigue existiendo a nivel serie', () => {
    const w1 = makeWeek({
      week: '2026-W10', reportId: 'r10',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: null,
    })
    const w2 = makeWeek({
      week: '2026-W11', reportId: 'r11',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: null,
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w1, w2] })
    const series = engine.buildPeriodSeries([w1, w2])
    expect(series).toHaveLength(0)  // no se emite ningún período
    const range = engine.diagnoseRange([w1, w2], series)
    expect(range.checks.unclosedTail).toBe('present')
    const tail = (range.items as any[]).find(i => i.type === 'unclosed_tail')
    expect(tail.evidence.weeks).toEqual(['2026-W10', '2026-W11'])
  })
})

// ═════════════════════════════════════════════════════════════════════════
// G. CONSUMO BRUTO NEGATIVO
// ═════════════════════════════════════════════════════════════════════════
describe('[EXACT] G — negative_gross_consumption con evidencia', () => {
  it('registra I0, P, I1, bruto y clampedTo=0 sin cambiar el uso', () => {
    const w1 = makeWeek({
      week: '2026-W40', reportId: 'r40',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 1000, previous_value: 1000 }],
      theoCostByCat: { food: 90 },
    })
    const w2 = makeWeek({
      week: '2026-W41', reportId: 'r41',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 1500, previous_value: 1000 }],
      theoCostByCat: { food: 90 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w1, w2] })
    const p = engine.buildPeriodData(w1, [], w2)
    expect(p.food_uso).toBe(0)  // clampeado — NO cambia
    const neg = (p.diagnostics.items as any[])
      .find(i => i.type === 'negative_gross_consumption')
    expect(neg.evidence.I0).toBe(1000)
    expect(neg.evidence.purchases).toBe(100)
    expect(neg.evidence.I1).toBe(1500)
    expect(neg.evidence.bruto).toBe(-400)
    expect(neg.evidence.clampedTo).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════
// H. DUPLICADOS Y ALCANCE DEL FILTRO
// ═════════════════════════════════════════════════════════════════════════
describe('[EXACT] H — duplicate_week y interval_extended', () => {
  it('duplicados en el array recibido → duplicate_week con reportIds', () => {
    const w20a = makeWeek({
      week: '2026-W20', reportId: 'r20a',
      salesCats: [{ name: 'FOOD', net: 500 }], cogs: { food: 50 },
      inventory: [{ account: 'Food Inventory', current_value: 100, previous_value: 100 }],
      theoCostByCat: { food: 45 },
    })
    const w20b = makeWeek({
      week: '2026-W20', reportId: 'r20b',
      salesCats: [{ name: 'FOOD', net: 500 }], cogs: { food: 50 },
      inventory: [{ account: 'Food Inventory', current_value: 999, previous_value: 999 }],
      theoCostByCat: { food: 45 },
    })
    const w21 = makeWeek({
      week: '2026-W21', reportId: 'r21',
      salesCats: [{ name: 'FOOD', net: 600 }], cogs: { food: 60 },
      inventory: [{ account: 'Food Inventory', current_value: 100, previous_value: 100 }],
      theoCostByCat: { food: 55 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w20a, w20b, w21] })
    const series = engine.buildPeriodSeries([w20a, w20b, w21])
    const range = engine.diagnoseRange([w20a, w20b, w21], series)
    const dup = (range.items as any[]).find(i => i.type === 'duplicate_week')
    expect(dup.week).toBe('2026-W20')
    expect(dup.evidence.reportIds).toEqual(['r20a', 'r20b'])
    expect(dup.evidence.occurrences).toBe(2)
    // El detector NO afirma nada sobre restricciones de la base.
    expect(dup.evidence.note).toMatch(/constraints/)
  })

  it('requestedRange arranca en W15 pero motor absorbe W14 como anchor → interval_extended', () => {
    const w14 = makeWeek({
      week: '2026-W14', reportId: 'r14',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const w15 = makeWeek({
      week: '2026-W15', reportId: 'r15',
      salesCats: [{ name: 'FOOD', net: 1200 }], cogs: { food: 150 },
      inventory: [{ account: 'Food Inventory', current_value: 550, previous_value: 500 }],
      theoCostByCat: { food: 110 },
    })
    const engine = createCostoUsoEngine({
      ...BASE_CTX,
      weeks: [w14, w15],
      requestedRange: { from: '2026-W15', to: '2026-W15' },
    })
    const series = engine.buildPeriodSeries([w15])
    const range = engine.diagnoseRange([w15], series)
    const ext = (range.items as any[]).find(i => i.type === 'interval_extended')
    expect(ext.evidence.effectiveStart).toBe('2026-W14')
    expect(ext.evidence.requested).toEqual({ from: '2026-W15', to: '2026-W15' })
  })
})

// ═════════════════════════════════════════════════════════════════════════
// AGREGACIÓN SIN DUPLICAR
// ═════════════════════════════════════════════════════════════════════════
describe('[EXACT] Agregación conserva y no duplica diagnósticos', () => {
  it('mismo missing_week presente en dos períodos aparece una sola vez agregado', () => {
    const w20 = makeWeek({
      week: '2026-W20', reportId: 'r20',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    // Falta W21
    const w22 = makeWeek({
      week: '2026-W22', reportId: 'r22',
      salesCats: [{ name: 'FOOD', net: 1200 }], cogs: { food: 150 },
      inventory: [{ account: 'Food Inventory', current_value: 550, previous_value: 500 }],
      theoCostByCat: { food: 110 },
    })
    const w23 = makeWeek({
      week: '2026-W23', reportId: 'r23',
      salesCats: [{ name: 'FOOD', net: 1300 }], cogs: { food: 160 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 550 }],
      theoCostByCat: { food: 120 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w20, w22, w23] })
    const series = engine.buildPeriodSeries([w20, w22, w23])
    const agg = engine.aggregateSeries(series)
    const missingCount = (agg.diagnostics.items as any[])
      .filter((i: any) => i.type === 'missing_week' && i.week === '2026-W21').length
    expect(missingCount).toBe(1)
  })

  it('rango sin cierre: el agregado devuelve null pero diagnoseRange sí reporta el tail', () => {
    const w1 = makeWeek({
      week: '2026-W10',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: null,
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w1] })
    const series = engine.buildPeriodSeries([w1])
    expect(series).toHaveLength(0)
    expect(engine.aggregateSeries(series)).toBeNull()
    const range = engine.diagnoseRange([w1], series)
    expect(range.checks.unclosedTail).toBe('present')
    expect((range.items as any[]).find(i => i.type === 'unclosed_tail')).toBeTruthy()
  })
})
