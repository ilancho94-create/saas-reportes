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

  it('gap por fechas: W20 (04-27 al 05-03) → W22 (05-11 al 05-17), falta 1 semana', () => {
    const w20 = makeWeek({
      week: '2026-W20', reportId: 'r20',
      weekStart: '2026-04-27', weekEnd: '2026-05-03',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const w22 = makeWeek({
      week: '2026-W22', reportId: 'r22',
      weekStart: '2026-05-11', weekEnd: '2026-05-17',
      salesCats: [{ name: 'FOOD', net: 1200 }], cogs: { food: 150 },
      inventory: [{ account: 'Food Inventory', current_value: 550, previous_value: 500 }],
      theoCostByCat: { food: 110 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w20, w22] })
    const p = engine.buildPeriodData(w20, [], w22)
    const missing = (p.diagnostics.items as any[]).filter(i => i.type === 'missing_week')
    expect(missing).toHaveLength(1)
    expect(missing[0].weekRange).toEqual(['2026-W20', '2026-W22'])
    expect(missing[0].evidence.previousWeekEnd).toBe('2026-05-03')
    expect(missing[0].evidence.nextWeekStart).toBe('2026-05-11')
    expect(missing[0].evidence.uncoveredDays).toBe(7)
    expect(missing[0].evidence.estimatedMissingWeeks).toBe(1)
    expect(p.diagnostics.checks.calendarCoverage).toBe('present')
  })

  it('gap de 3 días → coverage_gap_days (no una semana entera)', () => {
    const wa = makeWeek({
      week: '2026-W40',
      weekStart: '2026-09-28', weekEnd: '2026-10-04',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const wb = makeWeek({
      week: '2026-W41',
      weekStart: '2026-10-08', weekEnd: '2026-10-14',  // 3 días sin cobertura
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [wa, wb] })
    const p = engine.buildPeriodData(wa, [], wb)
    expect((p.diagnostics.items as any[]).filter(i => i.type === 'missing_week')).toHaveLength(0)
    const gap = (p.diagnostics.items as any[]).find(i => i.type === 'coverage_gap_days')
    expect(gap).toBeTruthy()
    expect(gap.evidence.uncoveredDays).toBe(3)
    expect(p.diagnostics.checks.calendarCoverage).toBe('present')
  })

  it('cruce de horario de verano EE.UU. (spring forward 2026-03-08) NO altera el conteo', () => {
    // Fechas civiles: 2026-03-01 (dom) al 2026-03-07 (sáb) y 2026-03-15 al 2026-03-21.
    // Entre 03-07 y 03-15 hay 8 días civiles → 7 días sin cobertura → 1 semana faltante.
    // Con parse local podría producir 6.958 días por DST — con UTC es exactamente 8.
    const wa = makeWeek({
      week: '2026-W09',
      weekStart: '2026-03-01', weekEnd: '2026-03-07',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const wb = makeWeek({
      week: '2026-W11',
      weekStart: '2026-03-15', weekEnd: '2026-03-21',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [wa, wb] })
    const p = engine.buildPeriodData(wa, [], wb)
    const missing = (p.diagnostics.items as any[]).filter(i => i.type === 'missing_week')
    expect(missing).toHaveLength(1)
    expect(missing[0].evidence.uncoveredDays).toBe(7)
    expect(missing[0].evidence.estimatedMissingWeeks).toBe(1)
  })

  it('cruce de horario de verano con gap parcial (8 días atravesando DST) es 1 semana + 1 día → missing_week', () => {
    const wa = makeWeek({
      week: '2026-W09',
      weekStart: '2026-03-01', weekEnd: '2026-03-07',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const wb = makeWeek({
      week: '2026-W11b',
      weekStart: '2026-03-16', weekEnd: '2026-03-22',   // 8 días sin cobertura, cruza DST
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [wa, wb] })
    const p = engine.buildPeriodData(wa, [], wb)
    const missing = (p.diagnostics.items as any[]).filter(i => i.type === 'missing_week')
    expect(missing).toHaveLength(1)
    expect(missing[0].evidence.uncoveredDays).toBe(8)
    expect(missing[0].evidence.estimatedMissingWeeks).toBe(1)
  })

  it('cambio de año fiscal con W53 (semanas fiscales consecutivas) → sin hueco', () => {
    const w53 = makeWeek({
      week: '2025-W53',
      weekStart: '2025-12-22', weekEnd: '2025-12-28',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const w01 = makeWeek({
      week: '2026-W01',
      weekStart: '2025-12-29', weekEnd: '2026-01-04',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const engine = createCostoUsoEngine({
      ...BASE_CTX, weeks: [w53, w01],
      fiscalYearStart: '2025-01-06',
    })
    const p = engine.buildPeriodData(w53, [], w01)
    expect((p.diagnostics.items as any[]).filter(i => i.type === 'missing_week')).toHaveLength(0)
    expect(p.diagnostics.checks.calendarCoverage).toBe('ok')
  })

  it('cambio de año ISO REAL con W53: 2026-W52 (12-21..12-27), 2026-W53 (12-28..2027-01-03), 2027-W01 (01-04..01-10)', () => {
    // 2026 tiene W53 ISO porque 2026-12-31 cae en jueves.
    // Verifica que el detector, sin conocer el calendario ISO, respete
    // simplemente la continuidad por fechas.
    const w52 = makeWeek({
      week: '2026-W52',
      weekStart: '2026-12-21', weekEnd: '2026-12-27',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const w53 = makeWeek({
      week: '2026-W53',
      weekStart: '2026-12-28', weekEnd: '2027-01-03',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const w01 = makeWeek({
      week: '2027-W01',
      weekStart: '2027-01-04', weekEnd: '2027-01-10',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    // Fiscal_year_start ausente → fallback ISO en la ingesta (para etiqueta).
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w52, w53, w01] })
    const p1 = engine.buildPeriodData(w52, [], w53)
    const p2 = engine.buildPeriodData(w53, [], w01)
    expect(p1.diagnostics.checks.calendarCoverage).toBe('ok')
    expect(p2.diagnostics.checks.calendarCoverage).toBe('ok')
  })

  it('sin week_start/week_end → calendarCoverage = not_determinable', () => {
    const w1 = makeWeek({
      week: '2026-W10', reportId: 'r10',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const w2 = makeWeek({
      week: '2026-W11', reportId: 'r11',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w1, w2] })
    const p = engine.buildPeriodData(w1, [], w2)
    expect((p.diagnostics.items as any[]).filter(i => i.type === 'missing_week')).toHaveLength(0)
    expect(p.diagnostics.checks.calendarCoverage).toBe('not_determinable')
  })

  it('fechas invertidas (solapamiento) → inverted_dates', () => {
    const wa = makeWeek({
      week: '2026-W20',
      weekStart: '2026-05-04', weekEnd: '2026-05-10',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const wb = makeWeek({
      week: '2026-W20b',
      weekStart: '2026-05-08', weekEnd: '2026-05-14',  // empieza ANTES de que termine wa
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [wa, wb] })
    const p = engine.buildPeriodData(wa, [], wb)
    const inv = (p.diagnostics.items as any[]).find(i => i.type === 'inverted_dates')
    expect(inv).toBeTruthy()
    expect(inv.evidence.civilDaysBetween).toBeLessThanOrEqual(0)
    expect(p.diagnostics.checks.calendarCoverage).toBe('present')
  })

  it('fecha inválida en un reporte → not_determinable, sin emitir hallazgos inventados', () => {
    const wa = makeWeek({
      week: '2026-W20',
      weekStart: '2026-05-04', weekEnd: '2026-05-10',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const wb = makeWeek({
      week: '2026-W21',
      weekStart: 'no-es-fecha' as any, weekEnd: '2026-05-17',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [wa, wb] })
    const p = engine.buildPeriodData(wa, [], wb)
    expect(p.diagnostics.checks.calendarCoverage).toBe('not_determinable')
    expect((p.diagnostics.items as any[]).filter(i => i.type === 'missing_week')).toHaveLength(0)
    expect((p.diagnostics.items as any[]).filter(i => i.type === 'coverage_gap_days')).toHaveLength(0)
  })
})

describe('[EXACT] civilDaysBetween — helper', () => {
  it('días consecutivos = 1', async () => {
    const { civilDaysBetween } = await import('../diagnostics')
    expect(civilDaysBetween('2026-05-03', '2026-05-04')).toBe(1)
  })
  it('mismo día = 0', async () => {
    const { civilDaysBetween } = await import('../diagnostics')
    expect(civilDaysBetween('2026-05-03', '2026-05-03')).toBe(0)
  })
  it('spring forward (2026-03-07 → 2026-03-08) = 1 (no 0.958)', async () => {
    const { civilDaysBetween } = await import('../diagnostics')
    expect(civilDaysBetween('2026-03-07', '2026-03-08')).toBe(1)
  })
  it('fall back (2026-11-01 → 2026-11-02) = 1 (no 1.042)', async () => {
    const { civilDaysBetween } = await import('../diagnostics')
    expect(civilDaysBetween('2026-11-01', '2026-11-02')).toBe(1)
  })
  it('cruce de año W53 ISO real: 2026-12-27 → 2027-01-04 = 8', async () => {
    const { civilDaysBetween } = await import('../diagnostics')
    expect(civilDaysBetween('2026-12-27', '2027-01-04')).toBe(8)
  })
  it('fecha inválida → null', async () => {
    const { civilDaysBetween } = await import('../diagnostics')
    expect(civilDaysBetween('2026-02-30', '2026-03-01')).toBe(null)
    expect(civilDaysBetween('' as any, '2026-03-01')).toBe(null)
    expect(civilDaysBetween('2026/05/03' as any, '2026-05-04')).toBe(null)
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
    const restrictedMappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]
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

  it('inventario/compras/pmix presentes para categoría SIN mapping de ventas → unmapped_activity_category', () => {
    // Solo food está mapeado; pero R365 nos manda datos de liquor
    // (inventario, compras y teórico). Esas ventas no llegan porque
    // el mapping de ventas no existe. Debe alertarse.
    const restrictedMappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]
    const w = makeWeek({
      week: '2026-W17', reportId: 'r17',
      salesCats: [{ name: 'FOOD', net: 5000 }],
      cogs: { food: 800, liquor: 300 },   // liquor SIN mapping de ventas
      inventory: [
        { account: 'Food Inventory',      current_value: 500, previous_value: 500 },
        { account: 'Alcoholic Inventory', current_value: 200, previous_value: 200 },   // → liquor
      ],
      theoCostByCat: { food: 700, liquor: 250 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, mappings: restrictedMappings, weeks: [w] })
    const d = engine.buildWeekData(w)
    const unmapped = (d.diagnostics.items as any[])
      .filter(i => i.type === 'unmapped_activity_category')
    expect(unmapped.map(i => i.category)).toContain('liquor')
    const evLiquor = unmapped.find(i => i.category === 'liquor').evidence
    expect(evLiquor.seenIn).toEqual(expect.arrayContaining(['cogs', 'productMix', 'inventory']))
    expect(d.diagnostics.checks.unmappedActivity).toBe('present')
  })
})

describe('[EXACT] E — unmatched_pmix_items: lista ausente ≠ cero', () => {
  it('productMix presente sin raw_data → unmatchedPmixItems = not_determinable', () => {
    const w = makeWeek({
      week: '2026-W30',
      salesCats: [{ name: 'FOOD', net: 5000 }], cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 450 },
      // sin productMixRaw
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    const d = engine.buildWeekData(w)
    expect(d.diagnostics.checks.unmatchedPmixItems).toBe('not_determinable')
    // Y no debe existir un item unmatched (no inventamos count=0)
    expect((d.diagnostics.items as any[]).some(i => i.type === 'unmatched_pmix_items')).toBe(false)
  })

  it('raw_data.unmatched_items = [] → not_determinable resuelto a ok', () => {
    const w = makeWeek({
      week: '2026-W31',
      salesCats: [{ name: 'FOOD', net: 5000 }], cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 450 },
      productMixRaw: { unmatched_items: [] },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    const d = engine.buildWeekData(w)
    expect(d.diagnostics.checks.unmatchedPmixItems).toBe('ok')
  })

  it('unmatched_items con datos → present + item con conteo y totalTheo', () => {
    const w = makeWeek({
      week: '2026-W32',
      salesCats: [{ name: 'FOOD', net: 5000 }], cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 450 },
      productMixRaw: { unmatched_items: [
        { name: 'Item A', theo_cost: 12.5 },
        { name: 'Item B', theo_cost: 7.25 },
      ] },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    const d = engine.buildWeekData(w)
    expect(d.diagnostics.checks.unmatchedPmixItems).toBe('present')
    const it = (d.diagnostics.items as any[]).find(i => i.type === 'unmatched_pmix_items')
    expect(it.evidence.count).toBe(2)
    expect(it.evidence.totalTheoCost).toBe(19.75)
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

  it('detecta ambos valores sin sobrescribir ni elegir fuente, con ajustes explícitos', () => {
    const mm = (p.diagnostics.items as any[]).filter(i => i.type === 'inventory_carry_mismatch')
    expect(mm).toHaveLength(1)
    expect(mm[0].evidence.anchor.rawValue).toBe(1000)
    expect(mm[0].evidence.anchor.adjustment).toBe(0)
    expect(mm[0].evidence.anchor.adjustedValue).toBe(1000)
    expect(mm[0].evidence.closing.rawValue).toBe(950)
    expect(mm[0].evidence.closing.adjustment).toBe(0)
    expect(mm[0].evidence.closing.adjustedValue).toBe(950)
    expect(mm[0].evidence.diff).toBe(-50)
  })

  it('con ajustes manuales, la evidencia registra bruto y ajustado por separado', () => {
    const engine2 = createCostoUsoEngine({
      ...BASE_CTX, weeks: [w1, w2],
      adjustments: [
        { week: '2026-W10', category: 'food', field: 'inv_current',  adjustment_value:  20 },
        { week: '2026-W11', category: 'food', field: 'inv_previous', adjustment_value: -30 },
      ],
    })
    const p2 = engine2.buildPeriodData(w1, [], w2)
    const mm = (p2.diagnostics.items as any[]).filter(i => i.type === 'inventory_carry_mismatch')
    expect(mm).toHaveLength(1)
    expect(mm[0].evidence.anchor.rawValue).toBe(1000)
    expect(mm[0].evidence.anchor.adjustment).toBe(20)
    expect(mm[0].evidence.anchor.adjustedValue).toBe(1020)
    expect(mm[0].evidence.closing.rawValue).toBe(950)
    expect(mm[0].evidence.closing.adjustment).toBe(-30)
    expect(mm[0].evidence.closing.adjustedValue).toBe(920)
    expect(mm[0].evidence.diff).toBe(-100)   // 920 − 1020
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
  it('registra I0, P, I1, bruto; publica el uso negativo SIN clampear', () => {
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
    expect(p.food_uso).toBe(-400)  // uso bruto negativo publicado tal cual
    const neg = (p.diagnostics.items as any[])
      .find(i => i.type === 'negative_gross_consumption')
    expect(neg.evidence.I0).toBe(1000)
    expect(neg.evidence.purchases).toBe(100)
    expect(neg.evidence.I1).toBe(1500)
    expect(neg.evidence.bruto).toBe(-400)
    expect(neg.evidence.clampedTo).toBeNull()
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
      weekStart: '2026-04-27', weekEnd: '2026-05-03',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    // Falta W21 (2026-05-04 al 2026-05-10)
    const w22 = makeWeek({
      week: '2026-W22', reportId: 'r22',
      weekStart: '2026-05-11', weekEnd: '2026-05-17',
      salesCats: [{ name: 'FOOD', net: 1200 }], cogs: { food: 150 },
      inventory: [{ account: 'Food Inventory', current_value: 550, previous_value: 500 }],
      theoCostByCat: { food: 110 },
    })
    const w23 = makeWeek({
      week: '2026-W23', reportId: 'r23',
      weekStart: '2026-05-18', weekEnd: '2026-05-24',
      salesCats: [{ name: 'FOOD', net: 1300 }], cogs: { food: 160 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 550 }],
      theoCostByCat: { food: 120 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w20, w22, w23] })
    const series = engine.buildPeriodSeries([w20, w22, w23])
    const agg = engine.aggregateSeries(series)
    const missings = (agg.diagnostics.items as any[])
      .filter((i: any) => i.type === 'missing_week')
    expect(missings).toHaveLength(1)
    expect(missings[0].weekRange).toEqual(['2026-W20', '2026-W22'])
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
