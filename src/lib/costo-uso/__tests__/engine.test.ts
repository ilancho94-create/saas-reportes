import { describe, it, expect } from 'vitest'
import { createCostoUsoEngine } from '../engine'
import { makeWeek, DEFAULT_MAPPINGS } from './fixtures'

// Estas pruebas importan y ejecutan createCostoUsoEngine —
// la MISMA implementación que consume src/app/dashboard/costo-uso/page.tsx
// (vía `const engine = useMemo(() => createCostoUsoEngine({...}))`).
// No hay copia de fórmulas escrita para las pruebas.
// Ninguna prueba se conecta a Supabase u otros servicios reales.
//
// Cada describe está etiquetado por tipo:
//   [CARACT]  Caracterización — documenta lo que hoy hace el código,
//             sin afirmar que sea correcto.
//   [EXACT]   Exactitud — contrasta con un cálculo independiente y
//             el resultado ESPERADO es incuestionable.
//   [PEND]    Regla pendiente — requiere decisión del propietario;
//             el test queda documentado y (cuando aplica) marcado .skip.

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
// CASO 1 — [EXACT] Semana normal con inventarios y datos completos
// ═════════════════════════════════════════════════════════════════════════
describe('[EXACT] Caso 1 — semana normal Food-only', () => {
  const w = makeWeek({
    week: '2026-W20', reportId: 'r20',
    netSales: 10000,
    salesCats: [{ name: 'FOOD', net: 8000, gross: 8500 }],
    cogs: { food: 2200 },
    inventory: [{ account: 'Food Inventory', current_value: 1500, previous_value: 1400 }],
    theoCostByCat: { food: 2100 },
  })
  const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
  const d = engine.buildWeekData(w)

  it('uso = 1400 + 2200 − 1500 = 2100 (fórmula fundamental)', () => {
    expect(d.food_uso).toBe(2100)
  })
  it('food_sales usa net del mapping', () => { expect(d.food_sales).toBe(8000) })
  it('food_theo_cost sale de theo_cost_by_category', () => { expect(d.food_theo_cost).toBe(2100) })
  it('%s se redondean a 1 decimal', () => {
    expect(d.food_uso_pct).toBe(26.3)   // 2100/8000 = 26.25 → 26.3
    expect(d.food_theo_pct).toBe(26.3)
  })
})

// ═════════════════════════════════════════════════════════════════════════
// CASO 2 — [EXACT] Una y varias semanas intermedias sin inventario
// ═════════════════════════════════════════════════════════════════════════
describe('[EXACT] Caso 2 — consolidación con 1 y con 2 intermedias', () => {
  const wA = makeWeek({
    week: '2026-W01', reportId: 'rA',
    salesCats: [{ name: 'FOOD', net: 2000 }], cogs: { food: 100 },
    inventory: [{ account: 'Food Inventory', current_value: 1000, previous_value: 900 }],
  })
  const wI1 = makeWeek({
    week: '2026-W02', reportId: 'rI1',
    salesCats: [{ name: 'FOOD', net: 3000 }], cogs: { food: 500 }, inventory: null,
  })
  const wI2 = makeWeek({
    week: '2026-W03', reportId: 'rI2',
    salesCats: [{ name: 'FOOD', net: 3500 }], cogs: { food: 600 }, inventory: null,
  })
  const wC = makeWeek({
    week: '2026-W04', reportId: 'rC',
    salesCats: [{ name: 'FOOD', net: 2500 }], cogs: { food: 400 },
    inventory: [{ account: 'Food Inventory', current_value: 1200, previous_value: 1000 }],
  })

  it('anchor + 1 intermedia + closing → uso = anchor.inv_current + Σpurchases − closing.inv_current', () => {
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [wA, wI1, wC] })
    const p = engine.buildPeriodData(wA, [wI1], wC)
    // 1000 + (500+400) − 1200 = 700
    expect(p.food_uso).toBe(700)
    expect(p.food_purchases).toBe(900)
    expect(p.food_sales).toBe(3000 + 2500)  // anchor NO cuenta
    expect(p.periodWeekCount).toBe(2)
  })

  it('anchor + 2 intermedias + closing suma las tres compras/ventas post-anchor', () => {
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [wA, wI1, wI2, wC] })
    const p = engine.buildPeriodData(wA, [wI1, wI2], wC)
    // uso = 1000 + (500+600+400) − 1200 = 1300
    expect(p.food_uso).toBe(1300)
    expect(p.food_sales).toBe(3000 + 3500 + 2500)
    expect(p.periodWeekCount).toBe(3)
  })
})

// ═════════════════════════════════════════════════════════════════════════
// CASO 3 — [CARACT] Semana intermedia totalmente ausente de `reports`
// ═════════════════════════════════════════════════════════════════════════
describe('[CARACT] Caso 3 — semana intermedia AUSENTE del array', () => {
  const w20 = makeWeek({
    week: '2026-W20', reportId: 'r20',
    salesCats: [{ name: 'FOOD', net: 5000 }], cogs: { food: 800 },
    inventory: [{ account: 'Food Inventory', current_value: 2000, previous_value: 1900 }],
  })
  // W21 no está en el array (nadie subió el archivo)
  const w22 = makeWeek({
    week: '2026-W22', reportId: 'r22',
    salesCats: [{ name: 'FOOD', net: 6000 }], cogs: { food: 700 },
    inventory: [{ account: 'Food Inventory', current_value: 2100, previous_value: 2000 }],
  })
  const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w20, w22] })

  it('el engine trata W22 como cierre directo de W20 — no distingue "no existe" de "no tiene inventario"', () => {
    const series = engine.buildPeriodSeries([w20, w22])
    expect(series).toHaveLength(2)
    expect(series[1].anchorWeek).toBe('2026-W20')
    expect(series[1].periodWeekCount).toBe(1)
    // La app NO detecta que falta W21.
  })
})

// ═════════════════════════════════════════════════════════════════════════
// CASO 4 — [CARACT] Compras/ventas ausentes vs cero real
// ═════════════════════════════════════════════════════════════════════════
describe('[CARACT] Caso 4 — ausencia vs cero', () => {
  const wSalesNull = makeWeek({
    week: '2026-W10', reportId: 'r10n',
    salesCats: [],  // sin categorías
    cogs: undefined,
    inventory: null,
  })
  const wSalesZero = makeWeek({
    week: '2026-W10z', reportId: 'r10z',
    salesCats: [{ name: 'FOOD', net: 0, gross: 0 }],
    cogs: { food: 0 },
    inventory: [{ account: 'Food Inventory', current_value: 0, previous_value: 0 }],
  })

  it('sin categories → food_sales = 0 (indistinguible de venta real 0)', () => {
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [wSalesNull] })
    const d = engine.buildWeekData(wSalesNull)
    expect(d.food_sales).toBe(0)
  })

  it('categoría con net=0 → food_sales = 0 (mismo output que la ausencia)', () => {
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [wSalesZero] })
    const d = engine.buildWeekData(wSalesZero)
    expect(d.food_sales).toBe(0)
  })

  it('inventory:null → hasInventory=false, uso=0', () => {
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [wSalesNull] })
    const d = engine.buildWeekData(wSalesNull)
    expect(d.hasInventory).toBe(false)
    expect(d.food_uso).toBe(0)
  })

  it('inventory:[$0,$0] → hasInventory=true, uso=0 pero por fórmula', () => {
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [wSalesZero] })
    const d = engine.buildWeekData(wSalesZero)
    expect(d.hasInventory).toBe(true)
    expect(d.food_uso).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════
// CASO 5 — [CARACT] Inventario parcial: falta una categoría del by_account
// ═════════════════════════════════════════════════════════════════════════
describe('[CARACT] Caso 5 — by_account existe pero falta la cuenta de una categoría', () => {
  const w = makeWeek({
    week: '2026-W15', reportId: 'r15',
    salesCats: [
      { name: 'FOOD',   net: 5000 },
      { name: 'LIQUOR', net: 1000 },
    ],
    cogs: { food: 800, liquor: 300 },
    inventory: [
      { account: 'Food Inventory', current_value: 1100, previous_value: 1000 },
      // ❌ Sin ninguna Alcoholic/Food bar/Wine Inventory
    ],
    theoCostByCat: { food: 700, liquor: 200 },
  })
  const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
  const d = engine.buildWeekData(w)

  it('food (con cuenta) usa fórmula normal', () => {
    expect(d.food_uso).toBe(1000 + 800 - 1100) // 700
  })

  it('liquor (sin cuenta) → inv=0/0, uso = max(0 + 300 − 0, 0) = 300', () => {
    // El engine NO distingue "cuenta ausente" de "cuenta = 0".
    // Regla pendiente: ¿cuenta ausente debería tratarse como "sin inventario"
    // para esa categoría y silenciar el cálculo?
    expect(d.liquor_uso).toBe(300)
    expect(d.liquor_inv_previous).toBe(0)
    expect(d.liquor_inv_current).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════
// CASO 6 — [EXACT] Inventario realmente igual a cero
// ═════════════════════════════════════════════════════════════════════════
describe('[EXACT] Caso 6 — inventario todo en $0', () => {
  const w = makeWeek({
    week: '2026-W16', reportId: 'r16',
    salesCats: [{ name: 'FOOD', net: 3000 }], cogs: { food: 500 },
    inventory: [
      { account: 'Food Inventory',      current_value: 0, previous_value: 0 },
      { account: 'Alcoholic Inventory', current_value: 0, previous_value: 0 },
    ],
  })
  const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
  it('inv=0 y purchases>0 → uso = purchases', () => {
    expect(engine.buildWeekData(w).food_uso).toBe(500)
  })
})

// ═════════════════════════════════════════════════════════════════════════
// CASO 7 — [CARACT] Ausencia de inventario inicial (sin anchor previo)
// ═════════════════════════════════════════════════════════════════════════
describe('[CARACT] Caso 7 — primera semana del rango sin anchor previo', () => {
  const w1 = makeWeek({
    week: '2026-W01', reportId: 'r1',
    salesCats: [{ name: 'FOOD', net: 5000 }], cogs: { food: 900 },
    inventory: [{ account: 'Food Inventory', current_value: 1200, previous_value: 800 }],
  })
  const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w1] })
  it('sin anchor → usa closing.inv_previous del R365 como inv_start', () => {
    const p = engine.buildPeriodData(null, [], w1)
    expect(p.food_uso).toBe(800 + 900 - 1200)   // 500
    expect(p.anchorWeek).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════
// CASO 8 — [CARACT] Semanas finales sin cierre
// ═════════════════════════════════════════════════════════════════════════
describe('[CARACT] Caso 8 — intermediates sin cierre al final del rango', () => {
  const w1 = makeWeek({
    week: '2026-W10', reportId: 'r10',
    salesCats: [{ name: 'FOOD', net: 2000 }], cogs: { food: 300 },
    inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 400 }],
  })
  const w2 = makeWeek({
    week: '2026-W11', reportId: 'r11',
    salesCats: [{ name: 'FOOD', net: 2500 }], cogs: { food: 400 }, inventory: null,
  })
  const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w1, w2] })
  const series = engine.buildPeriodSeries([w1, w2])

  it('la última semana sin inventario NO se renderiza como período', () => {
    expect(series).toHaveLength(1)
    expect(series[0].fullWeek).toBe('2026-W10')
  })
  it('sus ventas y compras se pierden hasta el próximo cierre', () => {
    expect(series[0].food_sales).toBe(2000)   // no incluye w2
    expect(series[0].food_purchases).toBe(300)
    // Regla pendiente: ¿avisar al usuario que w2 quedó fuera del análisis?
  })
})

// ═════════════════════════════════════════════════════════════════════════
// CASO 9 — [CARACT] Dos registros de la misma semana
// ═════════════════════════════════════════════════════════════════════════
describe('[CARACT] Caso 9 — duplicados de semana en el array', () => {
  const w20a = makeWeek({
    week: '2026-W20', reportId: 'r20a',
    inventory: [{ account: 'Food Inventory', current_value: 100, previous_value: 90 }],
    salesCats: [{ name: 'FOOD', net: 500 }], cogs: { food: 50 },
  })
  const w20b = makeWeek({
    week: '2026-W20', reportId: 'r20b',
    inventory: [{ account: 'Food Inventory', current_value: 999, previous_value: 999 }],
    salesCats: [{ name: 'FOOD', net: 500 }], cogs: { food: 50 },
  })
  const w21 = makeWeek({
    week: '2026-W21', reportId: 'r21',
    inventory: [{ account: 'Food Inventory', current_value: 200, previous_value: 100 }],
    salesCats: [{ name: 'FOOD', net: 600 }], cogs: { food: 60 },
  })
  const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w20a, w20b, w21] })

  it('findAnchorBefore(w21) devuelve la INMEDIATA anterior en el array (w20b)', () => {
    expect(engine.findAnchorBefore(w21)?.report.id).toBe('r20b')
  })
  it('la carga duplicada contamina silenciosamente el anchor (sin UNIQUE constraint)', () => {
    const p = engine.buildPeriodData(engine.findAnchorBefore(w21), [], w21)
    expect(p.food_inv_previous).toBe(999)   // no 100 del w20a
  })
})

// ═════════════════════════════════════════════════════════════════════════
// CASO 10 — [EXACT] Cambio de año y orden cronológico
// ═════════════════════════════════════════════════════════════════════════
describe('[EXACT] Caso 10 — cambio de año (W52 → W01)', () => {
  const w52 = makeWeek({
    week: '2025-W52', reportId: 'r52',
    salesCats: [{ name: 'FOOD', net: 3000 }], cogs: { food: 500 },
    inventory: [{ account: 'Food Inventory', current_value: 900, previous_value: 800 }],
  })
  const w01 = makeWeek({
    week: '2026-W01', reportId: 'r01',
    salesCats: [{ name: 'FOOD', net: 3500 }], cogs: { food: 600 },
    inventory: [{ account: 'Food Inventory', current_value: 950, previous_value: 900 }],
  })
  const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w52, w01] })
  it('el orden YYYY-Wnn del array se respeta cross-año', () => {
    const p = engine.buildPeriodData(engine.findAnchorBefore(w01), [], w01)
    expect(p.anchorWeek).toBe('2025-W52')
    expect(p.food_uso).toBe(900 + 600 - 950)   // 550
  })
})

// ═════════════════════════════════════════════════════════════════════════
// CASO 11 — [CARACT] Filtro efectivo se extiende fuera de las fechas
// ═════════════════════════════════════════════════════════════════════════
describe('[CARACT] Caso 11 — filtro cuyo período efectivo incluye semanas fuera del rango', () => {
  // El usuario elige W02..W03. La primera semana del filtro (W02) NO tiene inventario;
  // su anchor natural es W01 (fuera del filtro). El engine lo absorbe:
  const w1 = makeWeek({
    week: '2026-W01', reportId: 'r1',
    inventory: [{ account: 'Food Inventory', current_value: 1000, previous_value: 900 }],
    salesCats: [{ name: 'FOOD', net: 2000 }], cogs: { food: 100 },
  })
  const w2 = makeWeek({
    week: '2026-W02', reportId: 'r2',
    inventory: null,
    salesCats: [{ name: 'FOOD', net: 3000 }], cogs: { food: 500 },
  })
  const w3 = makeWeek({
    week: '2026-W03', reportId: 'r3',
    inventory: [{ account: 'Food Inventory', current_value: 1200, previous_value: 1000 }],
    salesCats: [{ name: 'FOOD', net: 2500 }], cogs: { food: 400 },
  })
  const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w1, w2, w3] })

  it('buildPeriodSeries([w2, w3]) usa w1 como anchor externo al filtro', () => {
    const series = engine.buildPeriodSeries([w2, w3])
    expect(series).toHaveLength(1)
    expect(series[0].anchorWeek).toBe('2026-W01')
    expect(series[0].food_uso).toBe(1000 + (500 + 400) - 1200)   // 700
    // Consecuencia: el período efectivo (2 semanas) puede aparecer bajo un rango
    // solicitado que solo cubre W03 en la UI si el usuario no revisa el detalle.
  })
})

// ═════════════════════════════════════════════════════════════════════════
// CASO 12 — [EXACT] Ajustes aplicados una vez, en el límite correcto
// ═════════════════════════════════════════════════════════════════════════
describe('[EXACT] Caso 12 — ajustes de inventario/compras/theo', () => {
  const w = makeWeek({
    week: '2026-W30', reportId: 'r30',
    salesCats: [{ name: 'FOOD', net: 5000 }], cogs: { food: 100 },
    inventory: [{ account: 'Food Inventory', current_value: 2000, previous_value: 1000 }],
    theoCostByCat: { food: 800 },
  })
  it('ajuste +5000 a inv_current → uso = max(1000+100−7000, 0) = 0 (clampeo)', () => {
    const engine = createCostoUsoEngine({
      ...BASE_CTX, weeks: [w],
      adjustments: [{ week: '2026-W30', category: 'food', field: 'inv_current', adjustment_value: 5000 }],
    })
    const d = engine.buildWeekData(w)
    expect(d.food_uso).toBe(0)
    expect(d.food_inv_current).toBe(7000)
  })
  it('ajustes de misma semana/categoría/campo se SUMAN (dos filas de $50 = +$100)', () => {
    const engine = createCostoUsoEngine({
      ...BASE_CTX, weeks: [w],
      adjustments: [
        { week: '2026-W30', category: 'food', field: 'inv_previous', adjustment_value: 50 },
        { week: '2026-W30', category: 'food', field: 'inv_previous', adjustment_value: 50 },
      ],
    })
    expect(engine.buildWeekData(w).food_inv_previous).toBe(1100)
  })
  it('ajuste en otra categoría NO se filtra a food', () => {
    const engine = createCostoUsoEngine({
      ...BASE_CTX, weeks: [w],
      adjustments: [{ week: '2026-W30', category: 'liquor', field: 'inv_previous', adjustment_value: 999 }],
    })
    expect(engine.buildWeekData(w).food_inv_previous).toBe(1000)
  })
})

// ═════════════════════════════════════════════════════════════════════════
// CASO 13 — [EXACT] Exclusión del anchor
// ═════════════════════════════════════════════════════════════════════════
describe('[EXACT] Caso 13 — el anchor NO aporta sus ventas/compras al período', () => {
  const wA = makeWeek({
    week: '2026-W05', reportId: 'rA',
    salesCats: [{ name: 'FOOD', net: 999 }], cogs: { food: 999 },
    inventory: [{ account: 'Food Inventory', current_value: 100, previous_value: 100 }],
  })
  const wB = makeWeek({
    week: '2026-W06', reportId: 'rB',
    salesCats: [{ name: 'FOOD', net: 100 }], cogs: { food: 50 },
    inventory: [{ account: 'Food Inventory', current_value: 100, previous_value: 100 }],
  })
  const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [wA, wB] })
  const p = engine.buildPeriodData(wA, [], wB)
  it('período B usa SOLO ventas/compras de wB (regresión histórica cerrada)', () => {
    expect(p.food_sales).toBe(100)
    expect(p.food_purchases).toBe(50)
  })
})

// ═════════════════════════════════════════════════════════════════════════
// CASO 14 — [PEND] Ventas cero, devoluciones, negativos
// ═════════════════════════════════════════════════════════════════════════
describe('[PEND] Caso 14 — ventas negativas (devoluciones)', () => {
  const w = makeWeek({
    week: '2026-W40', reportId: 'r40',
    salesCats: [{ name: 'FOOD', net: -200 }], cogs: { food: 100 },
    inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 400 }],
  })
  const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
  const d = engine.buildWeekData(w)

  it('CARACT: catSales < 0 → variacion=null (chequeo `catSales > 0`)', () => {
    expect(d.food_sales).toBe(-200)
    expect(d.food_variacion).toBeNull()
  })
  it.skip('PEND: ¿el negocio quiere ver la semana con etiqueta especial o excluirla del promedio?', () => {})
})

// ═════════════════════════════════════════════════════════════════════════
// CASO 15 — [CARACT] Costo teórico sin categoría matcheada
// ═════════════════════════════════════════════════════════════════════════
describe('[CARACT] Caso 15 — theo_cost ausente', () => {
  const w = makeWeek({
    week: '2026-W41', reportId: 'r41',
    salesCats: [{ name: 'FOOD', net: 5000 }], cogs: { food: 800 },
    inventory: [{ account: 'Food Inventory', current_value: 1100, previous_value: 1000 }],
    theoCostByCat: {},   // sin theo para food
  })
  const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
  const d = engine.buildWeekData(w)
  it('theo_cost ausente → mixPct=null; variacion = uso − 0 = uso', () => {
    expect(d.food_theo_cost).toBe(0)
    expect(d.food_theo_pct).toBe(0)     // UI lo muestra "0.0%"
    // Post-corrección de variación: uso − theoCost sí se computa con catSales>0.
    // uso = 1000 + 800 − 1100 = 700
    expect(d.food_uso).toBe(700)
    expect(d.food_variacion).toBe(700)
    // Regla pendiente: ¿cómo distinguir en la UI theo=0 real vs ausente?
  })
})

// ═════════════════════════════════════════════════════════════════════════
// AFIRMACIONES DEL INFORME
// ═════════════════════════════════════════════════════════════════════════

// ─── (A) Agregación y consumos negativos ────────────────────────────────
// El prompt pide tres cálculos independientes SOBRE EL MISMO INTERVALO:
//   (a) Σ uso_i  sin recortar
//   (b) Σ max(uso_i, 0)   ← lo que hace aggregateSeries
//   (c) uso directo entre inv_inicial y inv_final del rango
//
// El intervalo del cálculo directo (c) va de w1 → w3 (w1 aporta I0,
// w3 aporta I_final). Para comparar con la serie por-período con el
// mismo intervalo hay que sumar SOLO los períodos posteriores al anchor:
// [w1→w2] y [w2→w3]. El "período sombrero" [∅→w1] queda fuera.
//
// Diferencias con el reporte anterior:
//   – El fixture original comparaba 3 períodos (incluyendo el sombrero)
//     contra un directo que abarca 2. Los intervalos NO eran iguales;
//     el 200 vs 100 se explica por ese período extra, no por la fórmula.
describe('[EXACT] Afirmación A — comparación con intervalos iguales', () => {
  const w1 = makeWeek({
    week: '2026-W01', reportId: 'r1',
    salesCats: [{ name: 'FOOD', net: 5000 }], cogs: { food: 100 },
    inventory: [{ account: 'Food Inventory', current_value: 1000, previous_value: 1000 }],
  })
  const w2 = makeWeek({
    week: '2026-W02', reportId: 'r2',
    salesCats: [{ name: 'FOOD', net: 5000 }], cogs: { food: 100 },
    inventory: [{ account: 'Food Inventory', current_value: 1500, previous_value: 1000 }],
  })
  const w3 = makeWeek({
    week: '2026-W03', reportId: 'r3',
    salesCats: [{ name: 'FOOD', net: 5000 }], cogs: { food: 200 },
    inventory: [{ account: 'Food Inventory', current_value: 1200, previous_value: 1500 }],
  })
  const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w1, w2, w3] })

  it('con MISMO INTERVALO [w1..w3]: Σ sin recortar = directo; Σ recortado difiere solo por el clampeo', () => {
    // Series individuales dentro del intervalo (excluye el sombrero):
    const p_w1_w2 = engine.buildPeriodData(w1, [], w2)      // uso bruto = −400 → clamp 0
    const p_w2_w3 = engine.buildPeriodData(w2, [], w3)      // uso bruto = 500

    // Recuperamos el bruto SIN pasar por buildPeriodData (que ya clampea):
    // Fórmula pura I0 + P − I1
    const bruto_p1 = p_w1_w2.food_inv_previous + p_w1_w2.food_purchases - p_w1_w2.food_inv_current
    const bruto_p2 = p_w2_w3.food_inv_previous + p_w2_w3.food_purchases - p_w2_w3.food_inv_current
    expect(bruto_p1).toBe(-400)
    expect(bruto_p2).toBe(500)

    // (a) Σ sin recortar
    const sumSinRecortar = bruto_p1 + bruto_p2
    expect(sumSinRecortar).toBe(100)

    // (b) Σ recortado — lo que devuelve el motor por-período
    const sumRecortado = p_w1_w2.food_uso + p_w2_w3.food_uso
    expect(sumRecortado).toBe(500)

    // (c) Directo del mismo intervalo [w1 → w3] con w2 como intermedio
    const directo = engine.buildPeriodData(w1, [w2], w3)
    expect(directo.food_uso).toBe(100)

    // Conclusiones con intervalos iguales:
    //   (a) = (c) = 100  → la telescopía SÍ se cumple sin clampeo.
    //   (b) = 500 ≠ 100  → +400 de sobrestimación por Math.max(uso, 0).
    expect(sumSinRecortar).toBe(directo.food_uso)
    expect(sumRecortado).not.toBe(directo.food_uso)
    expect(sumRecortado - directo.food_uso).toBe(400)   // exactamente el consumo negativo clampeado
  })

  it('la suma que reporté como 200 correspondía a 3 períodos, no a 2 (intervalos distintos)', () => {
    // Documenta la corrección: buildPeriodSeries emite [∅→w1], [w1→w2], [w2→w3].
    // El "período sombrero" [∅→w1] usa closing.inv_previous como I0 y no está
    // cubierto por el directo [w1..w3].
    const series = engine.buildPeriodSeries([w1, w2, w3])
    expect(series).toHaveLength(3)
    expect(series[0].anchorWeek).toBeNull()
    expect(series[0].food_uso).toBe(100)   // el sombrero

    // Con el sombrero incluido, el agregado (b*) da 100 + 0 + 500 = 600
    const agg = engine.aggregateSeries(series)
    expect(agg.food_uso).toBe(600)

    // Y la suma sin recortar de los TRES períodos (que era mi "200") viene de:
    const brutoTotal =
      series[0].food_uso +                                              // 100 (no negativo)
      (series[1].food_inv_previous + series[1].food_purchases - series[1].food_inv_current) +   // −400
      (series[2].food_inv_previous + series[2].food_purchases - series[2].food_inv_current)     // 500
    expect(brutoTotal).toBe(200)
    // 200 (3 períodos sin recortar) − 100 (2 períodos sin recortar) = 100 = consumo del sombrero.
  })
})

// ─── (B) Completitud temporal ───────────────────────────────────────────
// Comparación explícita entre semanas presentes vs semanas esperadas por rango.
function expectedISOWeeksBetween(from: string, to: string): string[] {
  // Comparación por orden lexicográfico YYYY-Wnn — misma convención del engine.
  // Requiere que las semanas sigan el patrón /^\d{4}-W\d{2}$/.
  const [fy, fw] = from.split('-W').map(Number)
  const [ty, tw] = to.split('-W').map(Number)
  const out: string[] = []
  for (let y = fy; y <= ty; y++) {
    const start = y === fy ? fw : 1
    const end   = y === ty ? tw : 52
    for (let w = start; w <= end; w++) out.push(`${y}-W${String(w).padStart(2, '0')}`)
  }
  return out
}
describe('[EXACT] Afirmación B — semanas calendario faltantes NO son detectadas por el engine', () => {
  const w20 = makeWeek({
    week: '2026-W20',
    salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
    inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
  })
  const w22 = makeWeek({
    week: '2026-W22',
    salesCats: [{ name: 'FOOD', net: 1200 }], cogs: { food: 150 },
    inventory: [{ account: 'Food Inventory', current_value: 550, previous_value: 500 }],
  })
  const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w20, w22] })

  it('un cálculo INDEPENDIENTE detecta W21 faltante, el engine no', () => {
    const expected = expectedISOWeeksBetween('2026-W20', '2026-W22')
    expect(expected).toEqual(['2026-W20', '2026-W21', '2026-W22'])
    const presentes = [w20, w22].map(w => w.report.week)
    const faltantes = expected.filter(w => !presentes.includes(w))
    expect(faltantes).toEqual(['2026-W21'])

    // El engine, sin embargo, no reporta el gap:
    const series = engine.buildPeriodSeries([w20, w22])
    expect(series[1].spannedSkippedWeeks).toEqual([])
    expect(series[1]).not.toHaveProperty('missingCalendarWeeks')
  })
})

// ─── (C) Discrepancias entre inventarios ────────────────────────────────
describe('[CARACT] Afirmación C — inv_current(w) ≠ inv_previous(w+1) no se detecta', () => {
  const w1 = makeWeek({
    week: '2026-W10', reportId: 'r10',
    salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
    inventory: [{ account: 'Food Inventory', current_value: 1000, previous_value: 900 }],
  })
  const w2 = makeWeek({
    week: '2026-W11', reportId: 'r11',
    salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 100 },
    inventory: [{ account: 'Food Inventory', current_value: 1050, previous_value: 950 }],
    //                                                            ↑ debería ser 1000
  })
  const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w1, w2] })

  it('con anchor, el motor toma anchor.inv_current e IGNORA closing.inv_previous', () => {
    const p = engine.buildPeriodData(w1, [], w2)
    expect(p.food_inv_previous).toBe(1000)   // no 950
    expect(p).not.toHaveProperty('arrastreMismatch')
    // Regla pendiente: ¿cuál es la fuente correcta ante mismatch?
    // Hoy: silenciosamente se elige anchor.inv_current. No hay alerta.
  })
})

// ─── (D) Descuentos operativos ──────────────────────────────────────────
// Traza documentada:
//   Origen: src/lib/parsers/parse-sales.ts:57-66
//     categories[].gross = row['Gross sales'] (sheet 'Sales category summary')
//     categories[].net   = row['Net sales']
//   Toast agrupa TODOS los descuentos en la resta gross−net (staff meal,
//   promos, comps, etc.). No separa "operativos" en el archivo.
//   La clasificación is_operational vive SOLO en discount_mappings (BD),
//   y solo alimenta el campo `opDiscTotal` — no filtra `catSales`.
describe('[EXACT] Afirmación D — "+Desc. Op." sustituye net→gross (todos los descuentos)', () => {
  const w = makeWeek({
    week: '2026-W12', reportId: 'r12',
    salesCats: [{ name: 'FOOD', net: 8000, gross: 8500 }],  // 500 total en descuentos
    cogs: { food: 900 },
    inventory: [{ account: 'Food Inventory', current_value: 1200, previous_value: 1100 }],
    discountsItems: [
      { name: 'Staff Meal', amount: 100 },   // supuestamente operativo
      { name: 'Promo',      amount: 400 },   // no-operativo
    ],
  })

  it('sin toggle → catSales = net = 8000', () => {
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    expect(engine.buildWeekData(w).food_sales).toBe(8000)
  })

  it('con toggle + solo "Staff Meal" mapeado como operativo → catSales = 8500 (gross), NO 8100 (net+op)', () => {
    const engine = createCostoUsoEngine({
      ...BASE_CTX, weeks: [w],
      opDiscountMappings: ['Staff Meal'],
      includeOpDiscounts: true,
    })
    const d = engine.buildWeekData(w)
    expect(d.food_sales).toBe(8500)   // gross entero, incluye "Promo"
    expect(d.food_sales).not.toBe(8100)
    // opDiscTotal sí filtra por operativo, pero solo se usa como métrica en la UI:
    expect(d.opDiscTotal).toBe(100)
  })
})

// ─── (E) Variación monetaria — POST-CORRECCIÓN ──────────────────────────
// Nueva regla: variacion_$ = uso − costo_teorico (importes sin redondear).
// Redondeo a 2 decimales solo para presentación monetaria.
// Guardia catSales > 0 preservada: sin ventas → variacion = null.
describe('[EXACT] Afirmación E — variacion_$ = uso − theo_cost (post-corrección)', () => {
  it('ejemplo del prompt: uso=50, theo=1975, ventas=10000 → −1925 (no −1930)', () => {
    const w = makeWeek({
      week: '2026-W13', reportId: 'r13',
      salesCats: [{ name: 'FOOD', net: 10000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 1950, previous_value: 1900 }],
      theoCostByCat: { food: 1975 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    const d = engine.buildWeekData(w)
    expect(d.food_uso).toBe(50)
    expect(d.food_theo_cost).toBe(1975)
    expect(d.food_variacion).toBe(-1925)
  })

  it('caso positivo: uso > theo → variación positiva', () => {
    const w = makeWeek({
      week: '2026-W44', reportId: 'r44',
      salesCats: [{ name: 'FOOD', net: 8000 }], cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 1200, previous_value: 1000 }],
      theoCostByCat: { food: 600 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    const d = engine.buildWeekData(w)
    // uso = 1000 + 500 − 1200 = 300 ; variacion = 300 − 600 = −300
    // Reajusto para que sea POSITIVO: inv_current = 800 → uso = 700
    const w2 = makeWeek({
      week: '2026-W44b', reportId: 'r44b',
      salesCats: [{ name: 'FOOD', net: 8000 }], cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 800, previous_value: 1000 }],
      theoCostByCat: { food: 600 },
    })
    const engine2 = createCostoUsoEngine({ ...BASE_CTX, weeks: [w2] })
    const d2 = engine2.buildWeekData(w2)
    expect(d2.food_uso).toBe(700)
    expect(d2.food_variacion).toBe(100)  // 700 − 600
    void d
  })

  it('caso cero: uso == theo → variación 0 (no null)', () => {
    const w = makeWeek({
      week: '2026-W45', reportId: 'r45',
      salesCats: [{ name: 'FOOD', net: 5000 }], cogs: { food: 200 },
      inventory: [{ account: 'Food Inventory', current_value: 900, previous_value: 1000 }],
      theoCostByCat: { food: 300 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    const d = engine.buildWeekData(w)
    // uso = 1000 + 200 − 900 = 300 = theo → variacion = 0
    expect(d.food_uso).toBe(300)
    expect(d.food_variacion).toBe(0)
    expect(d.food_variacion).not.toBeNull()
  })

  it('caso centavos: verifica redondeo a 2 decimales', () => {
    const w = makeWeek({
      week: '2026-W46', reportId: 'r46',
      salesCats: [{ name: 'FOOD', net: 1000 }], cogs: { food: 12.345 },
      inventory: [{ account: 'Food Inventory', current_value: 100.11, previous_value: 100.00 }],
      theoCostByCat: { food: 8.678 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    const d = engine.buildWeekData(w)
    // uso  = 100.00 + 12.345 − 100.11 = 12.235
    // vari = 12.235 − 8.678 = 3.557 → toFixed(2) → 3.56
    expect(d.food_variacion).toBe(3.56)
  })

  it('sin ventas (catSales=0) → variacion = null (guardia preservada)', () => {
    const w = makeWeek({
      week: '2026-W47', reportId: 'r47',
      salesCats: [{ name: 'FOOD', net: 0 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 900, previous_value: 1000 }],
      theoCostByCat: { food: 50 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    const d = engine.buildWeekData(w)
    expect(d.food_sales).toBe(0)
    expect(d.food_variacion).toBeNull()
  })

  it('totales A&B suman variacion desde importes sin redondear (no desde %s)', () => {
    // Dos categorías con distintos redondeos internos. Total debe coincidir
    // con Σ(uso_i − theo_i) exacto, no con Σ((real%_i − mix%_i)/100 × sales_i).
    const w = makeWeek({
      week: '2026-W48', reportId: 'r48',
      salesCats: [
        { name: 'FOOD',   net: 10000 },
        { name: 'LIQUOR', net: 3000 },
      ],
      cogs: { food: 100, liquor: 30 },
      inventory: [
        { account: 'Food Inventory',      current_value: 1950, previous_value: 1900 },
        { account: 'Alcoholic Inventory', current_value: 400,  previous_value: 380 },
      ],
      theoCostByCat: { food: 1975, liquor: 45 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w] })
    const d = engine.buildWeekData(w)
    // food:   uso=50,  var=50−1975 = −1925
    // liquor: uso=10,  var=10−45   = −35
    expect(d.food_variacion).toBe(-1925)
    expect(d.liquor_variacion).toBe(-35)
    expect(d.totalUsoCost).toBe(60)
    expect(d.totalTheoCost).toBe(2020)
    expect(d.totalVariacion).toBe(-1960)   // 60 − 2020, no derivado de %s
  })

  it('aggregateSeries totaliza variacion desde importes sin redondear', () => {
    const w1 = makeWeek({
      week: '2026-W49', reportId: 'r49',
      salesCats: [{ name: 'FOOD', net: 10000 }], cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 1950, previous_value: 1900 }],
      theoCostByCat: { food: 1975 },
    })
    const w2 = makeWeek({
      week: '2026-W50', reportId: 'r50',
      salesCats: [{ name: 'FOOD', net: 8000 }], cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 800, previous_value: 1950 }],
      theoCostByCat: { food: 600 },
    })
    const engine = createCostoUsoEngine({ ...BASE_CTX, weeks: [w1, w2] })
    const series = engine.buildPeriodSeries([w1, w2])
    const agg = engine.aggregateSeries(series)
    // p1 (∅→w1): uso=50, theo=1975, var=−1925
    // p2 (w1→w2): uso = 1950+500−800 = 1650, theo=600, var=1050
    // agg.food_uso = 50 + 1650 = 1700
    // agg.food_theo = 1975 + 600 = 2575
    // agg.food_variacion = 1700 − 2575 = −875
    expect(agg.food_uso).toBe(1700)
    expect(agg.food_theo_cost).toBe(2575)
    expect(agg.food_variacion).toBe(-875)
  })
})
