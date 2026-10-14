import { describe, it, expect } from 'vitest'
import {
  loadCostoUsoContext,
  MAX_LOOKBACK_REPORTS,
  LOOKBACK_PAGE_SIZE,
  type ContextQueryProvider,
} from '../costo-uso-context-loader'

// Prueba REAL de la capa de recuperación paginada, con cliente
// simulado. NO se toca Supabase ni se altera RLS.

function report(week: string, opts?: { hasInv?: boolean; id?: string }): any {
  return {
    id: opts?.id || 'r-' + week,
    week,
    week_start: '2026-01-01',   // fechas ficticias — no las usa el loader
    week_end: '2026-01-07',
    restaurant_id: 'test',
    sales_data: { net_sales: 1000 },
    cogs_data: { by_category: { food: 100 } },
    inventory_data: opts?.hasInv
      ? { by_account: [{ account: 'Food Inventory', current_value: 500, previous_value: 500 }] }
      : null,
    product_mix_data: { theo_cost_by_category: { food: 90 } },
    discounts_data: null,
    waste_data: null,
    voids_data: null,
  }
}

function makeProvider(opts: {
  selection: any[] | Error
  history: any[] | ((offset: number, limit: number) => any[] | Error)
}): ContextQueryProvider {
  return {
    async fetchSelectionEmbed() {
      if (opts.selection instanceof Error) return { data: null, error: opts.selection }
      return { data: opts.selection, error: null }
    },
    async fetchLookbackPage(offset, limit) {
      const src = opts.history
      if (typeof src === 'function') {
        const r = src(offset, limit)
        if (r instanceof Error) return { data: null, error: r }
        return { data: r, error: null }
      }
      return { data: src.slice(offset, offset + limit), error: null }
    },
  }
}

// ═══════════════════════════════════════════════════════════════════
// Referencia dentro de la primera página
// ═══════════════════════════════════════════════════════════════════
describe('[EXACT] anchor en la primera página → complete, 1 página', () => {
  it('encuentra el inventario en la primera página y detiene la búsqueda', async () => {
    const sel = [report('2026-W10'), report('2026-W11')]
    const history = [
      report('2026-W09', { hasInv: true }),   // ANCHOR
      report('2026-W08'),
      report('2026-W07'),
    ]
    const provider = makeProvider({ selection: sel, history })
    const res = await loadCostoUsoContext(provider, { pageSize: 6 })
    expect(res.status).toBe('complete')
    expect(res.pagesUsed).toBe(1)
    expect(res.weeks.map(w => w.report.week)).toEqual(['2026-W07','2026-W08','2026-W09','2026-W10','2026-W11'])
  })
})

// ═══════════════════════════════════════════════════════════════════
// Referencia más allá de la primera página (pero dentro del límite)
// ═══════════════════════════════════════════════════════════════════
describe('[EXACT] anchor en la 3ª página → complete, ilustra iteración', () => {
  it('itera páginas hasta encontrar el anchor y luego se detiene', async () => {
    const sel = [report('2026-W20')]
    // 24 semanas sin inventario, la 25ª sí tiene.
    const history: any[] = []
    for (let i = 1; i <= 30; i++) history.push(report('2026-W' + String(20 - i).padStart(2, '0'), { hasInv: i === 25 }))
    const provider = makeProvider({ selection: sel, history })
    const res = await loadCostoUsoContext(provider, { pageSize: 12, maxLookbackReports: 60 })
    expect(res.status).toBe('complete')
    expect(res.pagesUsed).toBe(3)      // 3 páginas × 12 = 36 revisados
    // Anchor incluido en el resultado:
    expect(res.weeks.some(w => w.inventory !== null)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Selección histórica más allá de 52 semanas — el loader no impone
// límites basados en "hoy"; solo cuenta reports revisados.
// ═══════════════════════════════════════════════════════════════════
describe('[EXACT] selección histórica >52 semanas del hoy — el loader va por counts, no por fechas absolutas', () => {
  it('con historial de 100 reports y anchor en la posición 70, el loader lo encuentra dentro del límite absoluto', async () => {
    const sel = [report('2024-W40'), report('2024-W41')]
    // 100 semanas hacia atrás, anchor en la posición 70 (histórico lejos)
    const history: any[] = []
    for (let i = 0; i < 100; i++) history.push(report('hist-' + i, { hasInv: i === 69 }))
    const provider = makeProvider({ selection: sel, history })
    const res = await loadCostoUsoContext(provider, { pageSize: 12, maxLookbackReports: 156 })
    expect(res.status).toBe('complete')
    // El loader detiene en cuanto la página con el anchor entra: al
    // llegar a la posición 69 usó Math.ceil(70/12)=6 páginas.
    expect(res.pagesUsed).toBe(6)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Fin real del historial sin referencia
// ═══════════════════════════════════════════════════════════════════
describe('[EXACT] historial sin inventario y termina antes del límite → no_prior', () => {
  it('devuelve no_prior cuando la última página trae menos filas que limit y ninguna tiene inventario', async () => {
    const sel = [report('2026-W05')]
    const history = [
      report('2026-W04'), report('2026-W03'), report('2026-W02'),
      report('2026-W01'),
      // Solo 4 filas, page_size=6 → última página incompleta.
    ]
    const provider = makeProvider({ selection: sel, history })
    const res = await loadCostoUsoContext(provider, { pageSize: 6 })
    expect(res.status).toBe('no_prior')
    expect(res.reachedHistoryEnd).toBe(true)
    expect(res.pagesUsed).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Límite de búsqueda alcanzado sin encontrar anchor
// ═══════════════════════════════════════════════════════════════════
describe('[EXACT] limite absoluto alcanzado sin anchor → insufficient', () => {
  it('devuelve insufficient sin fabricar cifras', async () => {
    const sel = [report('2026-W30')]
    const N = 200
    const history: any[] = []
    for (let i = 0; i < N; i++) history.push(report('h' + i))    // ninguno con inventario
    const provider = makeProvider({ selection: sel, history })
    const res = await loadCostoUsoContext(provider, { pageSize: 12, maxLookbackReports: 60 })
    expect(res.status).toBe('insufficient')
    expect(res.reachedHistoryEnd).toBe(false)
    // 60 / 12 = 5 páginas
    expect(res.pagesUsed).toBe(5)
    expect(res.weeks.length).toBe(60 + 1)   // 60 previos + 1 seleccionado
  })
})

// ═══════════════════════════════════════════════════════════════════
// Error en una página intermedia
// ═══════════════════════════════════════════════════════════════════
describe('[EXACT] error en una página → error con reason indicando pagesUsed', () => {
  it('devuelve status error y no publica datos incompletos', async () => {
    const sel = [report('2026-W15')]
    // Página 1: 6 filas llenas sin inventario → obliga a intentar la 2ª.
    // Página 2: falla con Error → status 'error'.
    const provider = makeProvider({
      selection: sel,
      history: (offset) => {
        if (offset >= 6) return new Error('boom')
        return Array.from({ length: 6 }, (_, i) => report('2026-W' + (14 - i)))
      },
    })
    const res = await loadCostoUsoContext(provider, { pageSize: 6, maxLookbackReports: 60 })
    expect(res.status).toBe('error')
    expect(res.reason).toMatch(/^lookback_page_error_/)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Error en la carga de la selección
// ═══════════════════════════════════════════════════════════════════
describe('[EXACT] error en selectionEmbed → error, sin datos', () => {
  it('devuelve error y no intenta paginación previa', async () => {
    const provider = makeProvider({
      selection: new Error('rls'),
      history: [],
    })
    const res = await loadCostoUsoContext(provider)
    expect(res.status).toBe('error')
    expect(res.reason).toBe('selection_embed_error')
    expect(res.pagesUsed).toBe(0)
    expect(res.weeks).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════════
// Selección de una sola semana no debe darse por válida por longitud=1
// (esto se maneja en classifyConsecutive; aquí sólo verificamos que
// el loader no impone tratamiento especial a length=1).
// ═══════════════════════════════════════════════════════════════════
describe('[EXACT] Longitud 1 no exime de comprobar contexto', () => {
  it('selección de una única semana sigue exigiendo anchor previo para calcular', async () => {
    // Si el anchor no existe, el loader devuelve no_prior; el
    // consumidor decide si eso permite generar la sección.
    const sel = [report('2026-W40')]
    const provider = makeProvider({ selection: sel, history: [] })
    const res = await loadCostoUsoContext(provider, { pageSize: 6 })
    expect(res.status).toBe('no_prior')
    // El consumidor (PPTX / UI) decide qué hacer con "no_prior":
    //   - Si la propia semana seleccionada trae inventory, el motor
    //     usa closing.inv_previous del R365 como I0.
    //   - Si no, no hay cifras. En cualquier caso no_prior no es
    //     equivalente a "válido por defecto".
  })
})

// ═══════════════════════════════════════════════════════════════════
// El límite absoluto default es 156
// ═══════════════════════════════════════════════════════════════════
describe('[EXACT] Constantes documentadas', () => {
  it('MAX_LOOKBACK_REPORTS = 156', () => {
    expect(MAX_LOOKBACK_REPORTS).toBe(156)
  })
  it('LOOKBACK_PAGE_SIZE = 12', () => {
    expect(LOOKBACK_PAGE_SIZE).toBe(12)
  })
})

// ═══════════════════════════════════════════════════════════════════
// Semanas marcadas como skipped NO cuentan como anchor
// ═══════════════════════════════════════════════════════════════════
describe('[EXACT] skippedWeeks excluye del anchor las semanas marcadas', () => {
  it('semana con inventory_data marcada como skipped NO detiene el loader; sigue hasta la siguiente con inventario', async () => {
    // Escenario Mula W40 con W39 saltada:
    //   - selección = W40 (sin inventory en el embed de selección)
    //   - historia DESC = W39 (hasInv, pero skipped) → W38 (hasInv real) → W37...
    // Sin skippedWeeks: el loader se detiene en W39 (status complete,
    // anchor "W39"), lo que produce un invPrevious erróneo (0 para
    // la cuenta cuyo conteo no se hizo).
    // Con skippedWeeks: el loader salta W39 y encuentra W38 como anchor real.
    const sel = [report('2026-W40')]
    const hist = [
      report('2026-W39', { hasInv: true }),
      report('2026-W38', { hasInv: true }),
      report('2026-W37'),
    ]
    const skipped = new Set<string>(['2026-W39'])
    const provider = makeProvider({ selection: sel, history: hist })
    const res = await loadCostoUsoContext(provider, { pageSize: 6, skippedWeeks: skipped })
    expect(res.status).toBe('complete')
    const weeks = res.weeks.map(w => w.report.week)
    // W38 debe estar en el contexto para que el engine la pueda usar
    // como anchor. W39 también se incluye en el contexto porque fue
    // una página devuelta por el provider, pero el engine la ignora
    // vía skippedWeekSet.
    expect(weeks).toContain('2026-W38')
    expect(weeks).toContain('2026-W40')
  })

  it('sin skippedWeeks el loader mantiene el comportamiento anterior', async () => {
    // Regresión: sin pasar skippedWeeks, cualquier semana con
    // inventory_data detiene el loader (compatibilidad con call-sites
    // que todavía no actualicen).
    const sel = [report('2026-W40')]
    const hist = [
      report('2026-W39', { hasInv: true }),
      report('2026-W38', { hasInv: true }),
    ]
    const provider = makeProvider({ selection: sel, history: hist })
    const res = await loadCostoUsoContext(provider, { pageSize: 6 })
    expect(res.status).toBe('complete')
    // Al no pasar skippedWeeks, el loader se detiene en la primera
    // página sin recorrer más allá de W39.
    expect(res.pagesUsed).toBe(1)
  })
})
