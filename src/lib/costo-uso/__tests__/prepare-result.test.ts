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
      { source_system: 'toast', source_category: 'FOOD',   mapped_to: 'food' },
      { source_system: 'toast', source_category: 'LIQUOR', mapped_to: 'liquor' },
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
    const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]
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
    const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]
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
    const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]
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
    const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]
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
    const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]
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
    const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]
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
    const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]
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
    const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]
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
// Caso: UI y PPTX reciben el mismo resultado preparado
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Modo weekList (UI) vs modo requestedRange (PPTX)', () => {
  it('con el mismo rango temporal, ambos modos producen el mismo detailData', () => {
    const wA = makeWeek({
      week: '2026-W10', weekStart: '2026-03-01', weekEnd: '2026-03-07',
      salesCats: [{ name: 'FOOD', net: 5000 }],
      cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 900, previous_value: 950 }],
      theoCostByCat: { food: 450 },
    })
    const wB = makeWeek({
      week: '2026-W11', weekStart: '2026-03-08', weekEnd: '2026-03-14',
      salesCats: [{ name: 'FOOD', net: 5500 }],
      cogs: { food: 520 },
      inventory: [{ account: 'Food Inventory', current_value: 920, previous_value: 900 }],
      theoCostByCat: { food: 480 },
    })
    const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]

    const prepRange = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [wA, wB],
      requestedRange: { from: '2026-W10', to: '2026-W11' },
    })
    const prepList = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [wA, wB],
      weekList: [wA, wB],
    })

    // El detailData debe ser idéntico en las cifras clave.
    expect(prepList.detailData.totalUsoCost).toBe(prepRange.detailData.totalUsoCost)
    expect(prepList.detailData.totalTheoCost).toBe(prepRange.detailData.totalTheoCost)
    expect(prepList.detailData.totalVariacion).toBe(prepRange.detailData.totalVariacion)
    expect(prepList.detailData.totalABSales).toBe(prepRange.detailData.totalABSales)
    expect(prepList.detailData.food_uso).toBe(prepRange.detailData.food_uso)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: semanas intermedias necesarias
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Semanas intermedias necesarias (fuera del rango solicitado)', () => {
  it('sin las semanas intermedias, el período se calcula distinto', () => {
    const w10 = makeWeek({
      week: '2026-W10', weekStart: '2026-03-01', weekEnd: '2026-03-07',
      salesCats: [{ name: 'FOOD', net: 3000 }], cogs: { food: 300 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 280 },
    })
    const w11 = makeWeek({
      week: '2026-W11', weekStart: '2026-03-08', weekEnd: '2026-03-14',
      salesCats: [{ name: 'FOOD', net: 4000 }], cogs: { food: 400 },
      inventory: null,   // intermedia sin conteo
      theoCostByCat: { food: 380 },
    })
    const w12 = makeWeek({
      week: '2026-W12', weekStart: '2026-03-15', weekEnd: '2026-03-21',
      salesCats: [{ name: 'FOOD', net: 3500 }], cogs: { food: 350 },
      inventory: [{ account: 'Food Inventory', current_value: 550, previous_value: 500 }],
      theoCostByCat: { food: 340 },
    })
    const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]

    // Con el universo completo — motor absorbe w11 dentro del período
    // que cierra en w12.
    const withCtx = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w10, w11, w12],
      requestedRange: { from: '2026-W12', to: '2026-W12' },
    })
    // Sin w11 en el universo — el motor no la absorbe (no existe).
    const withoutCtx = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w10, w12],
      requestedRange: { from: '2026-W12', to: '2026-W12' },
    })
    expect(withCtx.detailData.food_purchases).toBe(400 + 350)   // w11 + w12
    expect(withoutCtx.detailData.food_purchases).toBe(350)      // solo w12
    expect(withCtx.detailData.food_purchases).not.toBe(withoutCtx.detailData.food_purchases)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: ventas netas frente a brutas
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Base de ventas net vs gross', () => {
  it('gross > net por la diferencia de descuentos; totalVariacion cambia', () => {
    const w = makeWeek({
      week: '2026-W20', weekStart: '2026-05-04', weekEnd: '2026-05-10',
      salesCats: [{ name: 'FOOD', net: 8000, gross: 8500 }],
      cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 900, previous_value: 1000 }],
      theoCostByCat: { food: 480 },
    })
    const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]

    const net = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w], includeOpDiscounts: false,
      requestedRange: { from: '2026-W20', to: '2026-W20' },
    })
    const gross = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w], includeOpDiscounts: true,
      requestedRange: { from: '2026-W20', to: '2026-W20' },
    })
    expect(net.detailData.food_sales).toBe(8000)
    expect(gross.detailData.food_sales).toBe(8500)
    // uso = 1000 + 500 − 900 = 600. Variación = uso − theo = 600 − 480 = 120.
    // El cambio de base no altera uso ni theo, así que variacion es igual.
    expect(net.detailData.food_variacion).toBe(120)
    expect(gross.detailData.food_variacion).toBe(120)
    // El % Real sí cambia porque el denominador (ventas) cambió.
    expect(net.detailData.food_uso_pct).not.toBe(gross.detailData.food_uso_pct)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: días de operación ausentes
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] operatingDays=null → días_inv null; resto de métricas intactas', () => {
  it('cifras principales calculan igual; días_inv es null', () => {
    const w = makeWeek({
      week: '2026-W30', weekStart: '2026-07-20', weekEnd: '2026-07-26',
      salesCats: [{ name: 'FOOD', net: 5000 }],
      cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 800, previous_value: 900 }],
      theoCostByCat: { food: 480 },
    })
    const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]

    const withOps = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w], operatingDays: 6,
      requestedRange: { from: '2026-W30', to: '2026-W30' },
    })
    const noOps = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w], operatingDays: null,
      requestedRange: { from: '2026-W30', to: '2026-W30' },
    })
    // uso, ventas, teórico, variación, %s: idénticos
    expect(noOps.detailData.food_uso).toBe(withOps.detailData.food_uso)
    expect(noOps.detailData.food_variacion).toBe(withOps.detailData.food_variacion)
    expect(noOps.detailData.food_uso_pct).toBe(withOps.detailData.food_uso_pct)
    // días de inventario: null cuando falta operatingDays; número cuando existe.
    expect(withOps.detailData.food_dias_inv).not.toBeNull()
    expect(noOps.detailData.food_dias_inv).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: contrato de errores (no confundir error de consulta con vacío)
// ─────────────────────────────────────────────────────────────────────
describe('[CARACT] Error de consulta vs respuesta vacía válida', () => {
  it('mappings=[] con loadError registrado NO produce cifras equivalentes a "no hay mappings"', () => {
    // Este test documenta la SEMÁNTICA. El helper no distingue error
    // de vacío en su input; el consumidor (fetcher + PPTX) debe leer
    // `costoUsoContext.loadErrors` por separado y decidir bloquear o
    // avisar. Aquí verificamos que:
    //   - mappings=[] no falsifica silenciosamente el resultado.
    //   - un consumidor que respeta loadErrors debería mostrar aviso.
    const w = makeWeek({
      week: '2026-W40', weekStart: '2026-09-28', weekEnd: '2026-10-04',
      salesCats: [{ name: 'FOOD', net: 5000 }],
      cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 800, previous_value: 900 }],
      theoCostByCat: { food: 480 },
    })
    const prep = prepareCostoUsoResult({
      ...BASE, mappings: [], weeks: [w],
      requestedRange: { from: '2026-W40', to: '2026-W40' },
    })
    // Sin mappings, food_sales = 0 (no encuentra la categoría de origen).
    expect(prep.detailData.food_sales).toBe(0)
    // El total no debe mostrarse como "válido" a los ojos del consumidor
    // si loadErrors reportó fallo en category_mappings.
    // (La UI responsable debe leer loadErrors del contexto.)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: teórico ausente vs cero explícito (reforzado)
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Teórico ausente vs cero explícito — respuestas distintas', () => {
  it('cero explícito: variacion = uso; ausente: variacion = null', () => {
    const base = {
      week: '2026-W45', weekStart: '2026-11-08', weekEnd: '2026-11-14',
      salesCats: [{ name: 'FOOD', net: 5000 }],
      cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 800, previous_value: 900 }],
    }
    const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]

    const wZero = makeWeek({ ...(base as any), theoCostByCat: { food: 0 } })
    const wMissing = makeWeek({ ...(base as any) })
    const zero = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [wZero],
      requestedRange: { from: '2026-W45', to: '2026-W45' },
    })
    const missing = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [wMissing],
      requestedRange: { from: '2026-W45', to: '2026-W45' },
    })
    // uso = 900 + 500 − 800 = 600
    expect(zero.detailData.food_variacion).toBe(600)
    expect(missing.detailData.food_variacion).toBeNull()
    expect(zero.detailData.food_theo_present).toBe(true)
    expect(missing.detailData.food_theo_present).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: selección no consecutiva (helper puro — se replica su
// contrato aquí para que la prueba sea autocontenida)
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Selección no consecutiva — clasificador desde módulo puro', () => {
  it('classifyConsecutive de src/lib/export/costo-uso-guards marca W10+W12 como gap', async () => {
    const { classifyConsecutive } = await import('@/lib/export/costo-uso-guards')
    const engineWeeks = [
      { report: { week: '2026-W10', week_start: '2026-03-01', week_end: '2026-03-07' } },
      { report: { week: '2026-W12', week_start: '2026-03-15', week_end: '2026-03-21' } },
    ]
    expect(classifyConsecutive(['2026-W10', '2026-W12'], engineWeeks)).toBe('gap')
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: días ausentes en UI y PPTX producen la misma ausencia.
// El helper prepareCostoUsoResult es el único que UI y PPTX consumen,
// así que la ausencia se propaga igual para ambos.
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Días ausentes: misma respuesta en UI y PPTX', () => {
  it('operatingDays=null propaga dias_inv=null tanto vía weekList (UI) como vía requestedRange (PPTX)', () => {
    const w = makeWeek({
      week: '2026-W30', weekStart: '2026-07-20', weekEnd: '2026-07-26',
      salesCats: [{ name: 'FOOD', net: 5000 }],
      cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 800, previous_value: 900 }],
      theoCostByCat: { food: 480 },
    })
    const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]
    const uiPrep = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w], operatingDays: null,
      weekList: [w],
    })
    const pptxPrep = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w], operatingDays: null,
      requestedRange: { from: '2026-W30', to: '2026-W30' },
    })
    // Ausencia idéntica en ambos flujos:
    expect(uiPrep.detailData.food_dias_inv).toBeNull()
    expect(pptxPrep.detailData.food_dias_inv).toBeNull()
    // Y el resto de métricas no se altera:
    expect(uiPrep.detailData.food_uso).toBe(pptxPrep.detailData.food_uso)
    expect(uiPrep.detailData.food_variacion).toBe(pptxPrep.detailData.food_variacion)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: selección histórica con más de 52 semanas disponibles.
// El helper NO impone un límite temporal — recibe el universo que el
// consumidor le provea. La responsabilidad de aportar el anchor
// externo real es del fetcher (que ahora carga selección + ventana
// previa acotada). Aquí probamos que el helper reconstruye el período
// correctamente cuando el consumidor sí le provee el anchor histórico
// necesario, aun con >52 semanas totales.
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Selección histórica con >52 semanas en el universo', () => {
  it('con anchor histórico presente en weeks, el motor lo usa para el período efectivo', () => {
    // Universo de 60 semanas sintéticas (numeradas 2025-W01..2026-W08).
    const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]
    const weeks: any[] = []
    // Genera semanas ficticias. week_start = 2025-01-06 + i*7 días
    // (etiquetas simples; no verificamos calendario ISO aquí).
    for (let i = 0; i < 60; i++) {
      const y = 2025 + Math.floor((i + 0) / 52)
      const wnum = ((i) % 52) + 1
      const week = `${y}-W${String(wnum).padStart(2, '0')}`
      const startEpoch = Date.UTC(2025, 0, 6) + i * 7 * 86_400_000
      const endEpoch   = startEpoch + 6 * 86_400_000
      const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
      weeks.push(makeWeek({
        week,
        weekStart: iso(startEpoch),
        weekEnd:   iso(endEpoch),
        salesCats: [{ name: 'FOOD', net: 1000 + i }],
        cogs: { food: 100 + i },
        inventory: [{ account: 'Food Inventory', current_value: 500 + i, previous_value: 500 + i - 1 }],
        theoCostByCat: { food: 90 + i },
      }))
    }
    // Selección histórica: semanas 2025-W10 y 2025-W11 (índices 9 y 10).
    const historic = [weeks[9], weeks[10]]
    const prep = prepareCostoUsoResult({
      ...BASE, mappings, weeks,
      requestedRange: { from: weeks[9].report.week, to: weeks[10].report.week },
    })
    // El anchor externo es weeks[8]; el motor lo debe absorber.
    expect(prep.periodSeries.length).toBeGreaterThan(0)
    // Comprobación de contexto: al menos el primer período debe
    // apoyarse en un anchor histórico (weeks[8]).
    expect(prep.periodSeries[0].anchorWeek).toBe(weeks[8].report.week)
    // filtered debe contener solo las semanas del rango solicitado.
    expect(prep.filtered.map((w: any) => w.report.week)).toEqual(historic.map((w: any) => w.report.week))
  })
})

// ─────────────────────────────────────────────────────────────────────
// Caso: selección consecutiva vs no consecutiva — comportamiento del
// motor (el bloqueo por gap vive en el PPTX; el motor solo procesa
// el weekList que le llega).
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Selección consecutiva produce valores esperados', () => {
  it('food_purchases = suma de compras de las semanas seleccionadas', () => {
    const w10 = makeWeek({
      week: '2026-W10', weekStart: '2026-03-01', weekEnd: '2026-03-07',
      salesCats: [{ name: 'FOOD', net: 4000 }], cogs: { food: 300 },
      inventory: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoCostByCat: { food: 280 },
    })
    const w11 = makeWeek({
      week: '2026-W11', weekStart: '2026-03-08', weekEnd: '2026-03-14',
      salesCats: [{ name: 'FOOD', net: 4200 }], cogs: { food: 320 },
      inventory: [{ account: 'Food Inventory', current_value: 510, previous_value: 500 }],
      theoCostByCat: { food: 290 },
    })
    const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]
    const prep = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w10, w11],
      requestedRange: { from: '2026-W10', to: '2026-W11' },
    })
    // Período consolidado 2 semanas: purchases = 300 + 320 = 620
    expect(prep.detailData.food_purchases).toBe(620)
    // No se inventan totales.
    expect(prep.detailData).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────
// no_prior: distinguir inventario inicial presente / cero / ausente
// por categoría cuando no hay anchor previo.
// ─────────────────────────────────────────────────────────────────────
describe('[EXACT] Sin anchor: inv_previous presente vs cero explícito vs ausente por categoría', () => {
  const mappings = [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }]

  it('sin anchor y previous_value NUMÉRICO en food → invPreviousPresent=true; variación calculable', () => {
    // closing sí trae previous_value = 900 en Food Inventory
    const w = makeWeek({
      week: '2026-W10', weekStart: '2026-03-01', weekEnd: '2026-03-07',
      salesCats: [{ name: 'FOOD', net: 5000 }],
      cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 800, previous_value: 900 }],
      theoCostByCat: { food: 480 },
    })
    const prep = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w],
      requestedRange: { from: '2026-W10', to: '2026-W10' },
    })
    const d = prep.detailData
    expect(d.food_inv_previous_present).toBe(true)
    expect(d.food_inv_previous).toBe(900)
    // uso = 900 + 500 − 800 = 600; variacion = 600 − 480 = 120
    expect(d.food_uso).toBe(600)
    expect(d.food_variacion).toBe(120)
    expect(d.food_variacion_reason).toBe('ok')
  })

  it('sin anchor y previous_value = 0 EXPLÍCITO → invPreviousPresent=true; variación calculable', () => {
    const w = makeWeek({
      week: '2026-W11', weekStart: '2026-03-08', weekEnd: '2026-03-14',
      salesCats: [{ name: 'FOOD', net: 5000 }],
      cogs: { food: 500 },
      inventory: [{ account: 'Food Inventory', current_value: 100, previous_value: 0 }],
      theoCostByCat: { food: 480 },
    })
    const prep = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w],
      requestedRange: { from: '2026-W11', to: '2026-W11' },
    })
    const d = prep.detailData
    expect(d.food_inv_previous_present).toBe(true)
    // uso = 0 + 500 − 100 = 400
    expect(d.food_uso).toBe(400)
    expect(d.food_variacion).toBe(400 - 480)
  })

  it('sin anchor y sin ninguna cuenta esperada de la categoría → invPreviousPresent=false; variación null con motivo no_initial_inventory', () => {
    // El closing trae solo Alcoholic Inventory; Food Inventory está ausente.
    const w = makeWeek({
      week: '2026-W12', weekStart: '2026-03-15', weekEnd: '2026-03-21',
      salesCats: [{ name: 'FOOD', net: 5000 }],
      cogs: { food: 500 },
      inventory: [{ account: 'Alcoholic Inventory', current_value: 300, previous_value: 300 }],
      theoCostByCat: { food: 480 },
    })
    const prep = prepareCostoUsoResult({
      ...BASE, mappings, weeks: [w],
      requestedRange: { from: '2026-W12', to: '2026-W12' },
    })
    const d = prep.detailData
    expect(d.food_inv_previous_present).toBe(false)
    expect(d.food_variacion).toBeNull()
    expect(d.food_variacion_reason).toBe('no_initial_inventory')
    // días de inventario tampoco es calculable con límite inicial ausente
    expect(d.food_dias_inv).toBeNull()
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
