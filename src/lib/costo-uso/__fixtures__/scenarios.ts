// Fixtures deterministas para el sandbox de pruebas visuales.
// Datos SINTÉTICOS. No incluir clientes reales, empleados, montos reales.
// Solo se importa desde la ruta sandbox, que a su vez está gateada por
// process.env.NODE_ENV === 'development'.

export interface ScenarioInput {
  weeks: any[]
  mappings: { source_system: string; source_category: string; mapped_to: string }[]
  adjustments: any[]
  skippedWeeks: any[]
  opDiscountMappings: string[]
  fiscalYearStart?: string | null
  operatingDays?: number
  requestedRange?: { from: string; to: string } | null
}

const MAPPINGS_FULL = [
  { source_system: 'toast', source_category: 'FOOD',       mapped_to: 'food' },
  { source_system: 'toast', source_category: 'LIQUOR',     mapped_to: 'liquor' },
  { source_system: 'toast', source_category: 'BEER',       mapped_to: 'beer' },
  { source_system: 'toast', source_category: 'WINE',       mapped_to: 'wine' },
  { source_system: 'toast', source_category: 'NA BEV',     mapped_to: 'na_beverage' },
]

function week(
  wk: string,
  weekStart: string | null,
  weekEnd: string | null,
  opts: Partial<{
    salesCats: { name: string; net: number; gross?: number }[]
    netSales: number
    cogs: Record<string, number>
    invAccounts: { account: string; current_value: number; previous_value: number }[] | null
    theoByCat: Record<string, number>
    discountsItems: { name: string; amount: number }[]
    productMixRaw: Record<string, unknown>
  }> = {}
) {
  const inv = opts.invAccounts
  return {
    report: {
      id: 'rpt-' + wk, week: wk,
      week_start: weekStart, week_end: weekEnd,
      restaurant_id: 'sandbox',
    },
    sales: opts.salesCats || opts.netSales !== undefined ? {
      net_sales: opts.netSales ?? 0,
      categories: opts.salesCats || [],
    } : null,
    cogs: opts.cogs ? { by_category: opts.cogs } : null,
    inventory: inv === null ? null : (inv ? {
      by_account: inv,
      grand_total_current: inv.reduce((s, x) => s + x.current_value, 0),
      grand_total_previous: inv.reduce((s, x) => s + x.previous_value, 0),
    } : null),
    productMix: (opts.theoByCat || opts.productMixRaw) ? {
      theo_cost_by_category: opts.theoByCat || {},
      raw_data: opts.productMixRaw || undefined,
    } : null,
    discounts: opts.discountsItems ? { total: 0, items: opts.discountsItems } : null,
    waste: null,
    voids: null,
  }
}

export function getScenario(name: string): ScenarioInput | null {
  switch (name) {
    // 1. Período completo, sin incidencias. Sólo mapea las categorías
    //    que el fixture aporta (food + liquor), como haría un restaurante
    //    que efectivamente vende esas categorías. No fuerza mappings de
    //    beer / wine / na_beverage cuando el restaurante no las tiene.
    case 'complete': {
      return {
        weeks: [
          week('2026-W10', '2026-03-01', '2026-03-07', {
            salesCats: [{ name: 'FOOD', net: 8000 }, { name: 'LIQUOR', net: 2000 }],
            cogs: { food: 800, liquor: 200 },
            invAccounts: [
              { account: 'Food Inventory', current_value: 1000, previous_value: 950 },
              { account: 'Alcoholic Inventory', current_value: 300, previous_value: 280 },
            ],
            theoByCat: { food: 720, liquor: 180 },
            productMixRaw: { unmatched_items: [] },
          }),
          week('2026-W11', '2026-03-08', '2026-03-14', {
            salesCats: [{ name: 'FOOD', net: 8500 }, { name: 'LIQUOR', net: 2200 }],
            cogs: { food: 900, liquor: 250 },
            invAccounts: [
              { account: 'Food Inventory', current_value: 1050, previous_value: 1000 },
              { account: 'Alcoholic Inventory', current_value: 310, previous_value: 300 },
            ],
            theoByCat: { food: 780, liquor: 190 },
            productMixRaw: { unmatched_items: [] },
          }),
        ],
        mappings: [
          { source_system: 'toast', source_category: 'FOOD',   mapped_to: 'food' },
          { source_system: 'toast', source_category: 'LIQUOR', mapped_to: 'liquor' },
        ],
        adjustments: [],
        skippedWeeks: [],
        opDiscountMappings: [],
        fiscalYearStart: null,
        requestedRange: { from: '2026-W10', to: '2026-W11' },
      }
    }

    // 2. Teórico explícitamente cero (una categoría con theo=0 explícito).
    case 'theo-zero-explicit': {
      return {
        weeks: [
          week('2026-W20', '2026-05-04', '2026-05-10', {
            salesCats: [{ name: 'FOOD', net: 5000 }],
            cogs: { food: 500 },
            invAccounts: [{ account: 'Food Inventory', current_value: 900, previous_value: 900 }],
            theoByCat: { food: 0 },   // cero explícito
            productMixRaw: { unmatched_items: [] },
          }),
        ],
        mappings: [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }],
        adjustments: [], skippedWeeks: [], opDiscountMappings: [],
        requestedRange: { from: '2026-W20', to: '2026-W20' },
      }
    }

    // 3. Teórico ausente (productMix null).
    case 'theo-missing': {
      return {
        weeks: [
          week('2026-W21', '2026-05-11', '2026-05-17', {
            salesCats: [{ name: 'FOOD', net: 5000 }],
            cogs: { food: 500 },
            invAccounts: [{ account: 'Food Inventory', current_value: 900, previous_value: 900 }],
            // sin productMix
          }),
        ],
        mappings: [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }],
        adjustments: [], skippedWeeks: [], opDiscountMappings: [],
        requestedRange: { from: '2026-W21', to: '2026-W21' },
      }
    }

    // 4. Ventas cero con teórico presente.
    case 'zero-sales': {
      return {
        weeks: [
          week('2026-W22', '2026-05-18', '2026-05-24', {
            salesCats: [{ name: 'FOOD', net: 0 }],
            cogs: { food: 100 },
            invAccounts: [{ account: 'Food Inventory', current_value: 800, previous_value: 900 }],
            theoByCat: { food: 90 },
            productMixRaw: { unmatched_items: [] },
          }),
        ],
        mappings: [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }],
        adjustments: [], skippedWeeks: [], opDiscountMappings: [],
        requestedRange: { from: '2026-W22', to: '2026-W22' },
      }
    }

    // 5. Inventario parcial: solo trae la cuenta de food, no la de liquor.
    case 'partial-inventory': {
      return {
        weeks: [
          week('2026-W23', '2026-05-25', '2026-05-31', {
            salesCats: [{ name: 'FOOD', net: 5000 }, { name: 'LIQUOR', net: 1500 }],
            cogs: { food: 500, liquor: 150 },
            invAccounts: [{ account: 'Food Inventory', current_value: 900, previous_value: 900 }],
            theoByCat: { food: 450, liquor: 130 },
            productMixRaw: { unmatched_items: [] },
          }),
        ],
        mappings: MAPPINGS_FULL,
        adjustments: [], skippedWeeks: [], opDiscountMappings: [],
        requestedRange: { from: '2026-W23', to: '2026-W23' },
      }
    }

    // 6. Semana calendario faltante entre W20 y W22 (falta W21).
    case 'missing-week': {
      return {
        weeks: [
          week('2026-W20', '2026-05-04', '2026-05-10', {
            salesCats: [{ name: 'FOOD', net: 4000 }],
            cogs: { food: 500 },
            invAccounts: [{ account: 'Food Inventory', current_value: 900, previous_value: 900 }],
            theoByCat: { food: 400 },
            productMixRaw: { unmatched_items: [] },
          }),
          // NO W21
          week('2026-W22', '2026-05-18', '2026-05-24', {
            salesCats: [{ name: 'FOOD', net: 4200 }],
            cogs: { food: 520 },
            invAccounts: [{ account: 'Food Inventory', current_value: 950, previous_value: 900 }],
            theoByCat: { food: 420 },
            productMixRaw: { unmatched_items: [] },
          }),
        ],
        mappings: [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }],
        adjustments: [], skippedWeeks: [], opDiscountMappings: [],
        requestedRange: { from: '2026-W20', to: '2026-W22' },
      }
    }

    // 7. Rango sin cierre, con referencia inicial existente fuera del rango.
    case 'unclosed-with-anchor': {
      return {
        weeks: [
          week('2026-W30', '2026-07-20', '2026-07-26', {
            salesCats: [{ name: 'FOOD', net: 4000 }],
            cogs: { food: 400 },
            invAccounts: [{ account: 'Food Inventory', current_value: 900, previous_value: 900 }],
            theoByCat: { food: 380 },
            productMixRaw: { unmatched_items: [] },
          }),
          // W31 y W32 sin inventario:
          week('2026-W31', '2026-07-27', '2026-08-02', {
            salesCats: [{ name: 'FOOD', net: 4200 }],
            cogs: { food: 420 },
            invAccounts: null,
          }),
          week('2026-W32', '2026-08-03', '2026-08-09', {
            salesCats: [{ name: 'FOOD', net: 4100 }],
            cogs: { food: 410 },
            invAccounts: null,
          }),
        ],
        mappings: [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }],
        adjustments: [], skippedWeeks: [], opDiscountMappings: [],
        // Solicitud solo W31..W32 → no hay período, pero W30 sí es referencia
        requestedRange: { from: '2026-W31', to: '2026-W32' },
      }
    }

    // 8. Consumo bruto negativo (I0+P<I1) — se clampea y se registra.
    case 'negative-gross': {
      return {
        weeks: [
          week('2026-W40', '2026-09-28', '2026-10-04', {
            salesCats: [{ name: 'FOOD', net: 5000 }],
            cogs: { food: 100 },
            invAccounts: [{ account: 'Food Inventory', current_value: 1000, previous_value: 1000 }],
            theoByCat: { food: 400 },
            productMixRaw: { unmatched_items: [] },
          }),
          week('2026-W41', '2026-10-05', '2026-10-11', {
            salesCats: [{ name: 'FOOD', net: 5000 }],
            cogs: { food: 100 },
            // inv sube fuertemente → uso bruto negativo (1000+100-1500 = -400)
            invAccounts: [{ account: 'Food Inventory', current_value: 1500, previous_value: 1000 }],
            theoByCat: { food: 400 },
            productMixRaw: { unmatched_items: [] },
          }),
        ],
        mappings: [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }],
        adjustments: [], skippedWeeks: [], opDiscountMappings: [],
        requestedRange: { from: '2026-W40', to: '2026-W41' },
      }
    }

    // 9. Intervalo efectivo distinto del solicitado (anchor externo).
    case 'interval-extended': {
      return {
        weeks: [
          week('2026-W14', '2026-03-29', '2026-04-04', {
            salesCats: [{ name: 'FOOD', net: 4000 }],
            cogs: { food: 400 },
            invAccounts: [{ account: 'Food Inventory', current_value: 900, previous_value: 900 }],
            theoByCat: { food: 380 },
            productMixRaw: { unmatched_items: [] },
          }),
          week('2026-W15', '2026-04-05', '2026-04-11', {
            salesCats: [{ name: 'FOOD', net: 4200 }],
            cogs: { food: 420 },
            invAccounts: [{ account: 'Food Inventory', current_value: 920, previous_value: 900 }],
            theoByCat: { food: 400 },
            productMixRaw: { unmatched_items: [] },
          }),
        ],
        mappings: [{ source_system: 'toast', source_category: 'FOOD', mapped_to: 'food' }],
        adjustments: [], skippedWeeks: [], opDiscountMappings: [],
        // Solo W15 seleccionada → el motor absorbe W14 como anchor externo.
        requestedRange: { from: '2026-W15', to: '2026-W15' },
      }
    }

    default: return null
  }
}

export const SCENARIO_NAMES = [
  'complete',
  'theo-zero-explicit',
  'theo-missing',
  'zero-sales',
  'partial-inventory',
  'missing-week',
  'unclosed-with-anchor',
  'negative-gross',
  'interval-extended',
] as const
