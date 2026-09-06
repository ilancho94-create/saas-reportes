import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

// Cargamos .env.local ANTES de importar los módulos que crean el
// cliente Supabase — el test no toca Supabase, pero la cadena de
// imports incluye supabase-ssr que exige env vars.
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  const envFile = path.join(process.cwd(), '.env.local')
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
    }
  }
}

const { generatePPTX } = await import('../generate-pptx')
type ExportConfig = import('../data-fetcher').ExportConfig
type ExportData = import('../data-fetcher').ExportData
type WeekData = import('../data-fetcher').WeekData
type EngineWeekShape = import('../data-fetcher').EngineWeekShape

/**
 * Genera archivos .pptx REALES con datos sintéticos para verificación
 * visual de la sección Costo de Uso. Solo se ejecuta cuando la env
 * GEN_PPTX=1 está presente — evita ensuciar corridas normales.
 *
 *   GEN_PPTX=1 npx vitest run generate-pptx.samples
 *
 * NO usa datos reales de ningún cliente. NO se conecta a Supabase.
 */

const OUT_DIR = path.join(process.cwd(), 'docs/informes/bloque-14/pptx')

// Adaptador de pptxgenjs a Node — .writeFile en Node graba a disk
// directamente cuando se pasa un fileName absoluto o relativo.
async function writeToFile(pptx: any, outPath: string): Promise<void> {
  // Preferimos write({ outputType: 'nodebuffer' }) + fs.writeFileSync
  // porque writeFile de pptxgenjs escribe donde process.cwd() aunque
  // demos ruta absoluta en algunos builds.
  const nodeBuf: any = await pptx.write({ outputType: 'nodebuffer' })
  fs.writeFileSync(outPath, nodeBuf)
}

function makeReport(week: string, opts: {
  weekStart: string; weekEnd: string; id?: string
  netSales?: number; salesCats?: { name: string; net: number; gross?: number }[]
  cogs?: Record<string, number>
  inv?: { account: string; current_value: number; previous_value: number }[] | null
  theoByCat?: Record<string, number> | null
  discounts?: { total?: number; items?: { name: string; amount: number }[] } | null
  waste?: { total_cost?: number; items?: any[] } | null
  voids?: { total?: number; items?: any[] } | null
} = { weekStart: '', weekEnd: '' }): EngineWeekShape {
  return {
    report: {
      id: opts.id || 'r-' + week,
      week,
      week_start: opts.weekStart,
      week_end: opts.weekEnd,
      restaurant_id: 'sandbox',
    },
    sales: opts.salesCats ? {
      net_sales: opts.netSales ?? opts.salesCats.reduce((s, c) => s + c.net, 0),
      categories: opts.salesCats,
    } : (opts.netSales !== undefined ? { net_sales: opts.netSales, categories: [] } : null),
    cogs: opts.cogs ? { by_category: opts.cogs } : null,
    inventory: opts.inv ? {
      by_account: opts.inv,
      grand_total_current: opts.inv.reduce((s, x) => s + x.current_value, 0),
      grand_total_previous: opts.inv.reduce((s, x) => s + x.previous_value, 0),
    } : (opts.inv === null ? null : null),
    productMix: opts.theoByCat ? { theo_cost_by_category: opts.theoByCat } : null,
    discounts: opts.discounts ?? null,
    waste: opts.waste ?? null,
    voids: opts.voids ?? null,
  }
}

// Convierte una EngineWeekShape a WeekData del fetcher.
function toWeekData(w: EngineWeekShape): WeekData {
  return {
    week: w.report.week,
    weekStart: w.report.week_start,
    weekEnd: w.report.week_end,
    sales: w.sales,
    labor: null,
    cogs: w.cogs,
    waste: w.waste,
    inventory: w.inventory,
    productMix: w.productMix,
    avt: null,
    employee: null,
    kitchen: null,
    receiving: null,
    discounts: w.discounts,
    voids: w.voids,
  }
}

function buildScenario(name: string, weeks: EngineWeekShape[], config: Partial<ExportConfig> & {
  costTargets?: Record<string, number>
  operatingDays?: number | null
  fiscalYearStart?: string | null
  mappings?: any[]
  requestedWeeks: string[]
  loadErrors?: string[]
  contextStatus?: 'complete' | 'no_prior' | 'insufficient' | 'error'
}): { config: ExportConfig; data: ExportData } {
  const requestedWeeks = config.requestedWeeks
  const requestedWeeksSet = new Set(requestedWeeks)
  const selectedWeeks = weeks.filter(w => requestedWeeksSet.has(w.report.week))
  const weeksData = selectedWeeks.map(toWeekData)
  return {
    config: {
      restaurantIds: ['sandbox'],
      weeks: requestedWeeks,
      sections: ['food_cost'],
      notes: {},
      template: { id: 'default', name: 'default', colorPrimary: '3B82F6', colorSecondary: '22C55E', colorAccent: 'F59E0B' },
      format: 'pptx',
      language: 'es',
      costoUsoSalesBase: (config.costoUsoSalesBase as any) || 'net',
    },
    data: {
      restaurant: { id: 'sandbox', name: 'Sandbox — ' + name, organizations: { name: 'DineWise Sandbox' } },
      weeks: weeksData,
      summary: {
        totalSales: 0, totalLabor: 0, totalCOGS: 0, totalWaste: 0,
        laborPct: null, cogsPct: null, profit: 0, profitPct: null,
        avgGuest: null, totalOrders: 0, totalGuests: 0,
      },
      costoUsoContext: {
        mappings: config.mappings || [
          { source_category: 'FOOD',   mapped_to: 'food' },
          { source_category: 'LIQUOR', mapped_to: 'liquor' },
        ],
        adjustments: [],
        skippedWeeks: [],
        opDiscountMappings: [],
        costTargets: config.costTargets || {},
        operatingDays: config.operatingDays === undefined ? 6 : config.operatingDays,
        fiscalYearStart: config.fiscalYearStart ?? null,
        requestedWeeks,
        loadErrors: config.loadErrors ?? [],
        engineWeeks: weeks,
        anchorLookbackExhausted: (config.contextStatus === 'insufficient'),
        anchorLookbackWeeks: 2,
        contextStatus: config.contextStatus ?? 'complete',
        contextStatusReason: 'sandbox',
        contextPagesUsed: 2,
      },
    },
  }
}

// Skip por default — solo se genera cuando GEN_PPTX=1.
const shouldRun = process.env.GEN_PPTX === '1'
const maybe = shouldRun ? describe : describe.skip

maybe('[GEN] PPTX Costo de Uso — 7 escenarios', () => {
  it.beforeAll?.(() => fs.mkdirSync(OUT_DIR, { recursive: true }))

  // Escenario 1: datos completos, ventas desiguales, net
  it('1-complete-net.pptx', async () => {
    const w1 = makeReport('2026-W10', {
      weekStart: '2026-03-01', weekEnd: '2026-03-07',
      salesCats: [{ name: 'FOOD', net: 8000 }, { name: 'LIQUOR', net: 2000 }],
      cogs: { food: 800, liquor: 200 },
      inv: [
        { account: 'Food Inventory', current_value: 1000, previous_value: 950 },
        { account: 'Alcoholic Inventory', current_value: 300, previous_value: 280 },
      ],
      theoByCat: { food: 720, liquor: 180 },
    })
    const w2 = makeReport('2026-W11', {
      weekStart: '2026-03-08', weekEnd: '2026-03-14',
      salesCats: [{ name: 'FOOD', net: 8500 }, { name: 'LIQUOR', net: 2200 }],
      cogs: { food: 900, liquor: 250 },
      inv: [
        { account: 'Food Inventory', current_value: 1050, previous_value: 1000 },
        { account: 'Alcoholic Inventory', current_value: 310, previous_value: 300 },
      ],
      theoByCat: { food: 780, liquor: 190 },
    })
    const { config, data } = buildScenario('complete-net', [w1, w2], {
      requestedWeeks: ['2026-W10', '2026-W11'],
    })
    const pptx = await generatePPTX(config, [data]) as any
    // generatePPTX crea el archivo por sí solo con writeFile — no
    // devuelve nada. Vamos a interceptar sacando `write` desde el
    // registro global no es posible; en su lugar el propio generador
    // ya escribe. Verificamos que se creó UN archivo *.pptx en cwd.
    // NOTA: pptxgenjs escribe en cwd con el nombre restName+week.
    // Comprobamos que EXISTA un pptx generado; nombre exacto no crítico.
    // Buscamos el más reciente y lo movemos al OUT_DIR con el nombre esperado.
    const generated = findLatestPptx(process.cwd())
    expect(generated).toBeTruthy()
    if (generated) {
      const dst = path.join(OUT_DIR, '1-complete-net.pptx')
      fs.renameSync(generated, dst)
      expect(fs.statSync(dst).size).toBeGreaterThan(1000)
    }
  })

  // Escenario 2: datos completos, base BRUTAS
  it('2-complete-gross.pptx', async () => {
    const w = makeReport('2026-W20', {
      weekStart: '2026-05-04', weekEnd: '2026-05-10',
      salesCats: [{ name: 'FOOD', net: 8000, gross: 8500 }],
      cogs: { food: 500 },
      inv: [{ account: 'Food Inventory', current_value: 900, previous_value: 1000 }],
      theoByCat: { food: 480 },
      discounts: { total: 500, items: [{ name: 'Staff Meal', amount: 500 }] },
    })
    const { config, data } = buildScenario('complete-gross', [w], {
      requestedWeeks: ['2026-W20'],
      costoUsoSalesBase: 'gross',
      mappings: [{ source_category: 'FOOD', mapped_to: 'food' }],
    })
    await generatePPTX(config, [data])
    const generated = findLatestPptx(process.cwd())
    expect(generated).toBeTruthy()
    if (generated) fs.renameSync(generated, path.join(OUT_DIR, '2-complete-gross.pptx'))
  })

  // Escenario 3: teórico incompleto → variación null
  it('3-partial-theo.pptx', async () => {
    const w = makeReport('2026-W22', {
      weekStart: '2026-05-18', weekEnd: '2026-05-24',
      salesCats: [{ name: 'FOOD', net: 8000 }, { name: 'LIQUOR', net: 1500 }],
      cogs: { food: 700, liquor: 200 },
      inv: [
        { account: 'Food Inventory', current_value: 500, previous_value: 500 },
        { account: 'Alcoholic Inventory', current_value: 200, previous_value: 200 },
      ],
      theoByCat: { food: 680 },   // liquor sin teórico
    })
    const { config, data } = buildScenario('partial-theo', [w], {
      requestedWeeks: ['2026-W22'],
      mappings: [
        { source_category: 'FOOD',   mapped_to: 'food' },
        { source_category: 'LIQUOR', mapped_to: 'liquor' },
      ],
    })
    await generatePPTX(config, [data])
    const generated = findLatestPptx(process.cwd())
    expect(generated).toBeTruthy()
    if (generated) fs.renameSync(generated, path.join(OUT_DIR, '3-partial-theo.pptx'))
  })

  // Escenario 4: operating_days ausente
  it('4-no-op-days.pptx', async () => {
    const w = makeReport('2026-W30', {
      weekStart: '2026-07-20', weekEnd: '2026-07-26',
      salesCats: [{ name: 'FOOD', net: 5000 }],
      cogs: { food: 500 },
      inv: [{ account: 'Food Inventory', current_value: 800, previous_value: 900 }],
      theoByCat: { food: 480 },
    })
    const { config, data } = buildScenario('no-op-days', [w], {
      requestedWeeks: ['2026-W30'],
      operatingDays: null,
      mappings: [{ source_category: 'FOOD', mapped_to: 'food' }],
    })
    await generatePPTX(config, [data])
    const generated = findLatestPptx(process.cwd())
    expect(generated).toBeTruthy()
    if (generated) fs.renameSync(generated, path.join(OUT_DIR, '4-no-op-days.pptx'))
  })

  // Escenario 5: selección no consecutiva
  it('5-non-consecutive.pptx', async () => {
    const w1 = makeReport('2026-W10', {
      weekStart: '2026-03-01', weekEnd: '2026-03-07',
      salesCats: [{ name: 'FOOD', net: 5000 }], cogs: { food: 500 },
      inv: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoByCat: { food: 480 },
    })
    const w2 = makeReport('2026-W12', {
      weekStart: '2026-03-15', weekEnd: '2026-03-21',
      salesCats: [{ name: 'FOOD', net: 5200 }], cogs: { food: 520 },
      inv: [{ account: 'Food Inventory', current_value: 520, previous_value: 500 }],
      theoByCat: { food: 500 },
    })
    const { config, data } = buildScenario('non-consecutive', [w1, w2], {
      requestedWeeks: ['2026-W10', '2026-W12'],
      mappings: [{ source_category: 'FOOD', mapped_to: 'food' }],
    })
    await generatePPTX(config, [data])
    const generated = findLatestPptx(process.cwd())
    expect(generated).toBeTruthy()
    if (generated) fs.renameSync(generated, path.join(OUT_DIR, '5-non-consecutive.pptx'))
  })

  // Escenario 6: error indispensable
  it('6-critical-error.pptx', async () => {
    const w = makeReport('2026-W40', {
      weekStart: '2026-09-28', weekEnd: '2026-10-04',
      salesCats: [{ name: 'FOOD', net: 5000 }], cogs: { food: 500 },
      inv: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoByCat: { food: 480 },
    })
    const { config, data } = buildScenario('critical-error', [w], {
      requestedWeeks: ['2026-W40'],
      loadErrors: ['category_mappings: timeout'],
    })
    await generatePPTX(config, [data])
    const generated = findLatestPptx(process.cwd())
    expect(generated).toBeTruthy()
    if (generated) fs.renameSync(generated, path.join(OUT_DIR, '6-critical-error.pptx'))
  })

  // Escenario 7: contextStatus insufficient
  it('7-context-insufficient.pptx', async () => {
    const w = makeReport('2026-W45', {
      weekStart: '2026-11-08', weekEnd: '2026-11-14',
      salesCats: [{ name: 'FOOD', net: 5000 }], cogs: { food: 500 },
      inv: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }],
      theoByCat: { food: 480 },
    })
    const { config, data } = buildScenario('context-insufficient', [w], {
      requestedWeeks: ['2026-W45'],
      contextStatus: 'insufficient',
    })
    await generatePPTX(config, [data])
    const generated = findLatestPptx(process.cwd())
    expect(generated).toBeTruthy()
    if (generated) fs.renameSync(generated, path.join(OUT_DIR, '7-context-insufficient.pptx'))
  })
})

function findLatestPptx(dir: string): string | null {
  const entries = fs.readdirSync(dir).filter(f => f.endsWith('.pptx'))
  if (!entries.length) return null
  let best: { name: string; mtime: number } | null = null
  for (const name of entries) {
    const stat = fs.statSync(path.join(dir, name))
    if (!best || stat.mtimeMs > best.mtime) best = { name, mtime: stat.mtimeMs }
  }
  return best ? path.join(dir, best.name) : null
}
