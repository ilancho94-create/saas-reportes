import { describe, it, expect } from 'vitest'
import { prepareCostoUsoResult } from '../prepare-result'
import { makeWeek, DEFAULT_MAPPINGS } from './fixtures'

// Pruebas del contrato entre UI y PPTX. Ejecutan la implementación real
// (prepareCostoUsoResult → createCostoUsoEngine), no una copia. Ningún
// test toca Supabase, red, DOM ni PPTX.
//
// Los valores esperados se calculan de forma INDEPENDIENTE en cada test,
// no se toman del PPTX viejo (comparar viejo vs nuevo no probaría
// exactitud). Sirven para el commit siguiente cuando se autorice
// ejecutar `npx vitest run`.

const BASE = {
  adjustments: [] as any[],
  skippedWeekSet: new Set<string>(),
  opDiscountMappings: [] as string[],
  includeOpDiscounts: false,
  operatingDays: 6,
  costTargets: {},
  fiscalYearStart: null as string | null,
}

// ─────────────────────────────────────────────────────────────────────
// Caso: ventas desiguales entre categorías
// El PPTX viejo repartía catSales = net_sales / CATS.length. El nuevo
// debe usar las ventas REALES por categoría.
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Ventas desiguales entre categorías', () => {
  it('food_sales != liquor_sales; net_sales/5 no debe aparecer en ningún total', () => {
    const w = makeWeek({
      week: '2026-W20',
      weekStart: '2026-05-04', weekEnd: '2026-05-10',
      salesCats: [
        { name: 'FOOD',   net: 9000 },
        { name: 'LIQUOR', net: 1000 },
      ],
      cogs: { food: 800, liquor: 100 },
      inventory: [
        { account: 'Food Inventory',      current_value: 500, previous_value: 500 },
        { account: 'Alcoholic Inventory', current_value: 200, previous_value: 200 },
      ],
      theoByCat: { food: 700, liquor: 90 },
    } as any)
    // makeWeek fixture usa theoCostByCat como key
    const w2 = makeWeek({
      week: '2026-W20',
      weekStart: '2026-05-04', weekEnd: '2026-05-10',
      salesCats: [
        { name: 'FOOD',   net: 9000 },
        { name: 'LIQUOR', net: 1000 },
      ],
      cogs: { food: 800, liquor: 100 },
      inventory: [
        { account: 'Food Inventory',      current_value: 500, previous_value: 500 },
        { account: 'Alcoholic Inventory', current_value: 200, previous_value: 200 },
      ],
      theoCostByCat: { food: 700, liquor: 90 },
    })
    const mappings = [
      { source_category: 'FOOD',   mapped_to: 'food' },
      { source_category: 'LIQUOR', mapped_to: 'liquor' },
    ]
    const prep = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w2],
      requestedRange: { from: '2026-W20', to: '2026-W20' },
    })
    const d = prep.detailData
    // ventas exactas por categoría (no derivadas)
    expect(d.food_sales).toBe(9000)
    expect(d.liquor_sales).toBe(1000)
    expect(d.totalABSales).toBe(10000)
    // total = suma de ventas reales, NO net_sales/5
    // net_sales/5 = 10000/5 = 2000 → no debe salir en ningún total
    expect(d.totalABSales).not.toBe(2000)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: período consolidado (2 semanas de actividad)
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Período consolidado', () => {
  it('detailData del rango absorbe intermedios y expone activityFirstLabel/Last', () => {
    const w1 = makeWeek({
      week: '2026-W10',
      weekStart: '2026-03-01', weekEnd: '2026-03-07',
      salesCats: [{ name: 'FOOD', net: 5000 }],
      cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 800, previous_value: 900 }],
      theoCostByCat: { food: 400 },
    })
    const w2 = makeWeek({
      week: '2026-W11',
      weekStart: '2026-03-08', weekEnd: '2026-03-14',
      salesCats: [{ name: 'FOOD', net: 5200 }],
      cogs: { food: 550 },
      inventory: [{ account: 'Food Inventory', current_value: 780, previous_value: 800 }],
      theoCostByCat: { food: 420 },
    })
    const mappings = [{ source_category: 'FOOD', mapped_to: 'food' }]
    const prep = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w1, w2],
      requestedRange: { from: '2026-W10', to: '2026-W11' },
    })
    const d = prep.detailData
    expect(d.activityFirstLabel).toBe('2026-W10')
    expect(d.activityLastLabel).toBe('2026-W11')
    // ventas totales = suma real
    expect(d.food_sales).toBe(10200)
    // no hay incidencias de teórico ausente en food
    expect(d.food_theo_present).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: ajustes manuales
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Ajustes manuales', () => {
  it('un ajuste en food.inv_current baja el uso reportado', () => {
    const w = makeWeek({
      week: '2026-W30',
      weekStart: '2026-07-20', weekEnd: '2026-07-26',
      salesCats: [{ name: 'FOOD', net: 5000 }],
      cogs: { food: 200 },
      inventory: [{ account: 'Food Inventory', current_value: 400, previous_value: 500 }],
      theoCostByCat: { food: 200 },
    })
    const mappings = [{ source_category: 'FOOD', mapped_to: 'food' }]
    const adjustments = [
      { week: '2026-W30', category: 'food', field: 'inv_current', adjustment_value: 50 },
    ]
    const prep = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w], adjustments,
      requestedRange: { from: '2026-W30', to: '2026-W30' },
    })
    const d = prep.detailData
    // uso = max(500 + 200 − (400+50), 0) = 250
    expect(d.food_uso).toBe(250)
    expect(d.food_inv_current).toBe(450)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: teórico cero explícito
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Teórico cero explícito', () => {
  it('food_theo_present=true y variacion = uso', () => {
    const w = makeWeek({
      week: '2026-W40',
      weekStart: '2026-09-28', weekEnd: '2026-10-04',
      salesCats: [{ name: 'FOOD', net: 5000 }],
      cogs: { food: 400 },
      inventory: [{ account: 'Food Inventory', current_value: 300, previous_value: 400 }],
      theoCostByCat: { food: 0 },
    })
    const mappings = [{ source_category: 'FOOD', mapped_to: 'food' }]
    const prep = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w],
      requestedRange: { from: '2026-W40', to: '2026-W40' },
    })
    const d = prep.detailData
    expect(d.food_theo_present).toBe(true)
    // uso = 400 + 400 − 300 = 500; variacion = 500 − 0 = 500
    expect(d.food_uso).toBe(500)
    expect(d.food_variacion).toBe(500)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: teórico ausente
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Teórico ausente', () => {
  it('detailData.totalVariacion=null; totalVariacionReason señala la causa', () => {
    const w = makeWeek({
      week: '2026-W41',
      weekStart: '2026-10-05', weekEnd: '2026-10-11',
      salesCats: [{ name: 'FOOD', net: 5000 }],
      cogs: { food: 400 },
      inventory: [{ account: 'Food Inventory', current_value: 300, previous_value: 400 }],
      // sin theoCostByCat → productMix null
    })
    const mappings = [{ source_category: 'FOOD', mapped_to: 'food' }]
    const prep = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w],
      requestedRange: { from: '2026-W41', to: '2026-W41' },
    })
    const d = prep.detailData
    expect(d.food_variacion).toBeNull()
    expect(d.totalVariacion).toBeNull()
    expect(d.totalVariacionReason).toBe('partial_total_theo')
    expect(d.totalVariacionMissingCategories).toContain('food')
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: ventas cero
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Ventas cero', () => {
  it('totalVariacion=null; totalVariacionReason=zero_sales', () => {
    const w = makeWeek({
      week: '2026-W42',
      weekStart: '2026-10-12', weekEnd: '2026-10-18',
      salesCats: [{ name: 'FOOD', net: 0 }],
      cogs: { food: 100 },
      inventory: [{ account: 'Food Inventory', current_value: 400, previous_value: 500 }],
      theoCostByCat: { food: 90 },
    })
    const mappings = [{ source_category: 'FOOD', mapped_to: 'food' }]
    const prep = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w],
      requestedRange: { from: '2026-W42', to: '2026-W42' },
    })
    const d = prep.detailData
    expect(d.totalVariacion).toBeNull()
    expect(d.totalVariacionReason).toBe('zero_sales')
    expect(d.food_variacion).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: rango sin cierre
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Rango sin cierre — detailData es null', () => {
  it('no inventa totales, rangeDiagnostics reporta unclosed_tail', () => {
    const w = makeWeek({
      week: '2026-W50',
      weekStart: '2026-12-14', weekEnd: '2026-12-20',
      salesCats: [{ name: 'FOOD', net: 4000 }],
      cogs: { food: 500 },
      inventory: null,
    })
    const mappings = [{ source_category: 'FOOD', mapped_to: 'food' }]
    const prep = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w],
      requestedRange: { from: '2026-W50', to: '2026-W50' },
    })
    expect(prep.detailData).toBeNull()
    expect(prep.periodSeries).toHaveLength(0)
    expect((prep.rangeDiagnostics.items as any[]).some(i => i.type === 'unclosed_tail')).toBe(true)
    // etiqueta efectiva ausente (sin cierre)
    expect(prep.labels.effectiveRange).toBeNull()
    // etiqueta solicitada sí presente (para mostrar el rango pedido)
    expect(prep.labels.requestedRange).toBe('2026-W50 → 2026-W50')
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: diagnósticos de datos incompletos
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Diagnósticos de datos incompletos', () => {
  it('missing_week entre reportes reportados en rangeDiagnostics', () => {
    const w20 = makeWeek({
      week: '2026-W20', weekStart: '2026-04-27', weekEnd: '2026-05-03',
      salesCats: [{ name: 'FOOD', net: 4000 }],
      cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 400, previous_value: 500 }],
      theoCostByCat: { food: 400 },
    })
    const w22 = makeWeek({
      week: '2026-W22', weekStart: '2026-05-11', weekEnd: '2026-05-17',
      salesCats: [{ name: 'FOOD', net: 4200 }],
      cogs: { food: 520 },
      inventory: [{ account: 'Food Inventory', current_value: 410, previous_value: 400 }],
      theoCostByCat: { food: 420 },
    })
    const mappings = [{ source_category: 'FOOD', mapped_to: 'food' }]
    const prep = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w20, w22],
      requestedRange: { from: '2026-W20', to: '2026-W22' },
    })
    const items = prep.rangeDiagnostics.items as any[]
    expect(items.some(i => i.type === 'missing_week')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: intervalo efectivo distinto del solicitado (anchor externo)
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Anchor externo → externalAnchorWeek en labels', () => {
  it('labels.externalAnchorWeek marca la semana previa', () => {
    const w14 = makeWeek({
      week: '2026-W14', weekStart: '2026-03-29', weekEnd: '2026-04-04',
      salesCats: [{ name: 'FOOD', net: 4000 }], cogs: { food: 400 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 380 },
    })
    const w15 = makeWeek({
      week: '2026-W15', weekStart: '2026-04-05', weekEnd: '2026-04-11',
      salesCats: [{ name: 'FOOD', net: 4200 }], cogs: { food: 420 },
      inventory: [{ account: 'Food Inventory', current_value: 520, previous_value: 500 }],
      theoCostByCat: { food: 400 },
    })
    const mappings = [{ source_category: 'FOOD', mapped_to: 'food' }]
    const prep = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w14, w15],
      requestedRange: { from: '2026-W15', to: '2026-W15' },
    })
    expect(prep.labels.externalAnchorWeek).toBe('2026-W14')
    // filtered contiene solo w15
    expect(prep.filtered).toHaveLength(1)
    expect(prep.filtered[0].report.week).toBe('2026-W15')
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso PPTX: la sección Costo de Uso debe recibir el mismo detailData
// (verificación de contrato — no se genera archivo aquí).
// ─────────────────────────────────────────────────────────────────────
describe('[PENDIENTE VERIFICACIÓN DE ARCHIVO PPTX]', () => {
  it.skip('generar un PPTX y comprobar cifras/signos/etiquetas/advertencias, sin desbordamientos', () => {
    // Comprobación reservada para turno pesado:
    //   1. Ejecutar generatePPTX(config, [data]) sobre un fixture
    //      de escenario ya validado por los tests anteriores.
    //   2. Abrir el archivo con pptxgenjs Parser o descomprimirlo
    //      y leer el XML de la slide "COSTO DE USO".
    //   3. Verificar:
    //        - Total Variación $ = detailData.totalVariacion (o
    //          '—' cuando es null).
    //        - Totales A&B, Uso, Teórico = exactamente los de detailData.
    //        - Serie por período tiene tantos puntos como periodSeries.
    //        - Cuando hay unclosed_tail / missing_week / negative_gross /
    //          theo_missing / carry_mismatch / duplicates /
    //          unmapped_activity, la nota inferior contiene el texto
    //          esperado.
    //        - No hay reparto por CATS.length en ningún importe.
    //        - Fuentes/tamaños de las notas caben en el ancho del slide.
    //   4. Repetir con al menos dos escenarios de fixture (por ejemplo,
    //      "complete" y "missing-week") y un tercero con teórico
    //      parcial para forzar totalVariacion=null.
  })
})
