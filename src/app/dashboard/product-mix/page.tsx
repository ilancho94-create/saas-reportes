'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurantId } from '@/lib/use-restaurant'

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ToastItem {
  item: string
  menu: string
  menu_category: string
  qty: number
  net_sales: number
}

interface R365Item {
  item: string
  qty: number
  sales: number
  unit_cost: number
  theo_cost: number
}

interface EnrichedItem {
  item: string
  menu_category: string
  qty: number
  net_sales: number
  price: number
  unit_cost: number
  theo_cost_total: number
  cost_pct: number
  margin: number
  menu_engineering: 'star' | 'plowhorse' | 'puzzle' | 'dog' | 'sin_costo'
}

interface WeekData {
  report: { id: string; week: string; week_start: string; week_end: string }
  pm: {
    by_category: Record<string, number>
    theo_cost_by_category: Record<string, number>
    total_theo_cost: number
    raw_data: {
      product_mix: { by_item: ToastItem[] }
      menu_analysis: { by_item: R365Item[] }
    }
  } | null
}

interface CostThresholds {
  food:       { green: number; yellow: number }
  beer:       { green: number; yellow: number }
  liquor:     { green: number; yellow: number }
  wine:       { green: number; yellow: number }
  na_beverage:{ green: number; yellow: number }
}

const DEFAULT_THRESHOLDS: CostThresholds = {
  food:        { green: 30, yellow: 38 },
  beer:        { green: 25, yellow: 32 },
  liquor:      { green: 20, yellow: 28 },
  wine:        { green: 30, yellow: 38 },
  na_beverage: { green: 20, yellow: 28 },
}

const CAT_LABELS: Record<string, string> = {
  food: 'Food', beer: 'Beer', liquor: 'Liquor',
  wine: 'Wine', na_beverage: 'N/A Bev', general: 'General',
}

const CAT_COLORS: Record<string, string> = {
  food: '#f97316', beer: '#eab308', liquor: '#a855f7',
  wine: '#ec4899', na_beverage: '#22c55e', general: '#6b7280',
}

const ME_CONFIG = {
  star:      { label: 'Stars',      emoji: '⭐', color: '#22c55e', bg: 'bg-green-950',  border: 'border-green-800',  text: 'text-green-400' },
  plowhorse: { label: 'Plowhorses', emoji: '🐴', color: '#3b82f6', bg: 'bg-blue-950',   border: 'border-blue-800',   text: 'text-blue-400'  },
  puzzle:    { label: 'Puzzles',    emoji: '🧩', color: '#eab308', bg: 'bg-yellow-950', border: 'border-yellow-800', text: 'text-yellow-400'},
  dog:       { label: 'Dogs',       emoji: '🐕', color: '#ef4444', bg: 'bg-red-950',    border: 'border-red-800',    text: 'text-red-400'   },
}

const RANGES = [
  { label: 'Últimas 4', value: 4 },
  { label: 'Últimas 8', value: 8 },
  { label: 'Todo',      value: 99 },
]

type ViewMode = 'range' | 'single' | 'custom'
type Tab = 'topbottom' | 'costo' | '8020' | 'matrix' | 'recomendaciones'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
function fmtD(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function pct(n: number) {
  return (n * 100).toFixed(1) + '%'
}

function loadThresholds(restaurantId: string): CostThresholds {
  try {
    const raw = localStorage.getItem(`pm_thresholds_${restaurantId}`)
    if (raw) return JSON.parse(raw)
  } catch {}
  return DEFAULT_THRESHOLDS
}

function saveThresholds(restaurantId: string, t: CostThresholds) {
  localStorage.setItem(`pm_thresholds_${restaurantId}`, JSON.stringify(t))
}

// Merge ítems de múltiples semanas sumando qty y net_sales
function mergeToastItems(weeks: WeekData[]): ToastItem[] {
  const map: Record<string, ToastItem> = {}
  for (const w of weeks) {
    const items = w.pm?.raw_data?.product_mix?.by_item || []
    for (const it of items) {
      const key = it.item.toLowerCase().trim()
      if (!map[key]) map[key] = { ...it, qty: 0, net_sales: 0 }
      map[key].qty += it.qty
      map[key].net_sales += it.net_sales
    }
  }
  return Object.values(map)
}

// Merge R365: promedia unit_cost, suma theo_cost
function mergeR365Items(weeks: WeekData[]): R365Item[] {
  const map: Record<string, { item: R365Item; count: number }> = {}
  for (const w of weeks) {
    const items = w.pm?.raw_data?.menu_analysis?.by_item || []
    for (const it of items) {
      const key = it.item.toLowerCase().trim()
      if (!map[key]) map[key] = { item: { ...it, theo_cost: 0, sales: 0, qty: 0 }, count: 0 }
      map[key].item.theo_cost += it.theo_cost
      map[key].item.sales    += it.sales
      map[key].item.qty      += it.qty
      map[key].item.unit_cost = it.unit_cost // tomar el último (más reciente)
      map[key].count++
    }
  }
  return Object.values(map).map(v => v.item)
}

// Join Toast + R365 y enriquecer
function buildEnrichedItems(toastItems: ToastItem[], r365Items: R365Item[]): EnrichedItem[] {
  const r365Map: Record<string, R365Item> = {}
  for (const it of r365Items) {
    r365Map[it.item.toLowerCase().trim()] = it
  }

  const enriched: EnrichedItem[] = []
  for (const toast of toastItems) {
    if (toast.qty <= 0 && toast.net_sales <= 0) continue
    const key = toast.item.toLowerCase().trim()
    const r365 = r365Map[key]
    const price      = r365 && r365.qty > 0 ? r365.sales / r365.qty : (toast.qty > 0 ? toast.net_sales / toast.qty : 0)
    const unit_cost  = r365?.unit_cost || 0
    const theo_total = r365?.theo_cost || 0
    const cost_pct   = price > 0 && unit_cost > 0 ? unit_cost / price : 0
    const margin     = price - unit_cost

    enriched.push({
      item:           toast.item,
      menu_category:  toast.menu_category,
      qty:            toast.qty,
      net_sales:      toast.net_sales,
      price,
      unit_cost,
      theo_cost_total: theo_total,
      cost_pct,
      margin,
      menu_engineering: 'sin_costo', // se calcula después
    })
  }

  // Clasificación Kasavana & Smith
  const withCost = enriched.filter(i => i.unit_cost > 0 && i.margin !== 0)
  if (withCost.length > 0) {
    const avgQty    = withCost.reduce((s, i) => s + i.qty, 0) / withCost.length
    const avgMargin = withCost.reduce((s, i) => s + i.margin, 0) / withCost.length
    for (const it of enriched) {
      if (it.unit_cost <= 0) { it.menu_engineering = 'sin_costo'; continue }
      const highPop    = it.qty >= avgQty
      const highMargin = it.margin >= avgMargin
      if (highPop && highMargin)   it.menu_engineering = 'star'
      else if (!highPop && highMargin) it.menu_engineering = 'puzzle'
      else if (highPop && !highMargin) it.menu_engineering = 'plowhorse'
      else it.menu_engineering = 'dog'
    }
  }

  return enriched.sort((a, b) => b.net_sales - a.net_sales)
}

// Badge de costo según thresholds
function CostBadge({ pctVal, category, thresholds }: { pctVal: number; category: string; thresholds: CostThresholds }) {
  const t = thresholds[category as keyof CostThresholds] || thresholds.food
  const pctNum = pctVal * 100
  const display = pctNum.toFixed(1) + '%'
  if (pctNum === 0) return <span className="text-gray-600 text-xs">—</span>
  if (pctNum < t.green)  return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-950 text-green-400">{display}</span>
  if (pctNum < t.yellow) return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-950 text-yellow-400">{display}</span>
  return <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-950 text-red-400">{display}</span>
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ProductMixPage() {
  const restaurantId = useRestaurantId()

  const [loading,    setLoading]    = useState(true)
  const [weeks,      setWeeks]      = useState<WeekData[]>([])
  const [restName,   setRestName]   = useState('')
  const [range,      setRange]      = useState(4)
  const [viewMode,   setViewMode]   = useState<ViewMode>('range')
  const [selWeek,    setSelWeek]    = useState('')
  const [rangeFrom,  setRangeFrom]  = useState('')
  const [rangeTo,    setRangeTo]    = useState('')
  const [activeTab,  setActiveTab]  = useState<Tab>('topbottom')
  const [catFilter,  setCatFilter]  = useState<string>('all')
  const [topN,       setTopN]       = useState<'top' | 'bottom'>('top')
  const [costSort,   setCostSort]   = useState<string>('net_sales')
  const [costDir,    setCostDir]    = useState<'asc' | 'desc'>('desc')
  const [showConfig, setShowConfig] = useState(false)
  const [thresholds, setThresholds] = useState<CostThresholds>(DEFAULT_THRESHOLDS)
  const [threshEdit, setThreshEdit] = useState<CostThresholds>(DEFAULT_THRESHOLDS)

  // ── Load ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (restaurantId) {
      setThresholds(loadThresholds(restaurantId))
      setThreshEdit(loadThresholds(restaurantId))
      loadData()
    }
  }, [restaurantId])

  async function loadData() {
    setLoading(true)
    const { data: rest } = await supabase.from('restaurants').select('name').eq('id', restaurantId).single()
    setRestName(rest?.name || '')

    const { data: reports } = await supabase
      .from('reports').select('*')
      .eq('restaurant_id', restaurantId)
      .order('week', { ascending: false })
      .limit(52)

    if (!reports || reports.length === 0) { setLoading(false); return }

    const weeksData: WeekData[] = await Promise.all(reports.map(async r => {
      const { data: pm } = await supabase
        .from('product_mix_data').select('*')
        .eq('report_id', r.id).single()
      return { report: r, pm: pm || null }
    }))

    const withData = weeksData.filter(w => w.pm !== null).reverse()
    setWeeks(withData)
    if (withData.length > 0) {
      setSelWeek(withData[withData.length - 1].report.week)
      setRangeFrom(withData[Math.max(0, withData.length - 4)].report.week)
      setRangeTo(withData[withData.length - 1].report.week)
    }
    setLoading(false)
  }

  // ── Filtered weeks ─────────────────────────────────────────────────────────

  const filtered = useMemo((): WeekData[] => {
    if (viewMode === 'single') {
      const w = weeks.find(w => w.report.week === selWeek)
      return w ? [w] : []
    }
    if (viewMode === 'custom' && rangeFrom && rangeTo) {
      return weeks.filter(w => w.report.week >= rangeFrom && w.report.week <= rangeTo)
    }
    return weeks.slice(-range)
  }, [weeks, viewMode, selWeek, rangeFrom, rangeTo, range])

  // ── Merged & enriched items ────────────────────────────────────────────────

  const allItems = useMemo(() => {
    const toast = mergeToastItems(filtered)
    const r365  = mergeR365Items(filtered)
    return buildEnrichedItems(toast, r365)
  }, [filtered])

  const totalSales = useMemo(() => allItems.reduce((s, i) => s + i.net_sales, 0), [allItems])
  const totalQty   = useMemo(() => allItems.reduce((s, i) => s + i.qty,       0), [allItems])

  const filteredItems = useMemo(() => {
    if (catFilter === 'all') return allItems
    return allItems.filter(i => i.menu_category === catFilter)
  }, [allItems, catFilter])

  const categories = useMemo(() => {
    const cats = new Set(allItems.map(i => i.menu_category))
    return Array.from(cats).filter(Boolean)
  }, [allItems])

  // ── Top / Bottom ───────────────────────────────────────────────────────────

  const topItems    = useMemo(() => [...filteredItems].sort((a, b) => b.net_sales - a.net_sales).slice(0, 15), [filteredItems])
  const bottomItems = useMemo(() => [...filteredItems].sort((a, b) => a.net_sales - b.net_sales).slice(0, 15), [filteredItems])
  const displayItems = topN === 'top' ? topItems : bottomItems

  // ── Costo table ────────────────────────────────────────────────────────────

  const costItems = useMemo(() => {
    const base = filteredItems.filter(i => i.unit_cost > 0)
    return [...base].sort((a, b) => {
      let va = a[costSort as keyof EnrichedItem] as number
      let vb = b[costSort as keyof EnrichedItem] as number
      return costDir === 'desc' ? vb - va : va - vb
    })
  }, [filteredItems, costSort, costDir])

  function toggleSort(col: string) {
    if (costSort === col) setCostDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setCostSort(col); setCostDir('desc') }
  }

  function SortIcon({ col }: { col: string }) {
    if (costSort !== col) return <span className="text-gray-700 ml-1">↕</span>
    return <span className="text-blue-400 ml-1">{costDir === 'desc' ? '↓' : '↑'}</span>
  }

  // ── 80/20 ─────────────────────────────────────────────────────────────────

  const pareto = useMemo(() => {
    const sorted = [...filteredItems].sort((a, b) => b.net_sales - a.net_sales)
    const total  = sorted.reduce((s, i) => s + i.net_sales, 0)
    let acc = 0
    const cross80 = { crossed: false, idx: -1 }
    return sorted.map((it, idx) => {
      acc += it.net_sales
      const cumPct = total > 0 ? acc / total : 0
      if (!cross80.crossed && cumPct >= 0.8) { cross80.crossed = true; cross80.idx = idx }
      return { ...it, cumPct, is80: idx <= cross80.idx }
    })
  }, [filteredItems])

  const items80 = useMemo(() => pareto.filter(i => i.is80).length, [pareto])

  // ── Matriz ME ──────────────────────────────────────────────────────────────

  const matrixGroups = useMemo(() => {
    const groups: Record<string, EnrichedItem[]> = { star: [], plowhorse: [], puzzle: [], dog: [] }
    for (const it of filteredItems) {
      if (it.menu_engineering !== 'sin_costo' && groups[it.menu_engineering]) {
        groups[it.menu_engineering].push(it)
      }
    }
    return groups
  }, [filteredItems])

  // ── Recomendaciones ────────────────────────────────────────────────────────

  const recommendations = useMemo(() => {
    const recs: { priority: 'alta' | 'media' | 'baja'; tipo: string; msg: string; items: string[] }[] = []

    const stars  = matrixGroups.star.slice(0, 5)
    const dogs   = matrixGroups.dog.filter(i => i.net_sales < totalSales * 0.002).slice(0, 5)
    const ph     = matrixGroups.plowhorse.filter(i => i.cost_pct > 0.38).slice(0, 4)
    const puzz   = matrixGroups.puzzle.slice(0, 4)

    // Ítems con costo > threshold rojo
    const highCost = costItems.filter(i => {
      const t = thresholds[i.menu_category as keyof CostThresholds]
      return t && i.cost_pct * 100 > t.yellow
    }).slice(0, 5)

    if (stars.length > 0)
      recs.push({ priority: 'alta', tipo: '⭐ Stars', msg: 'Mantén visibilidad alta. Fotografía en menú, posición estratégica, servidor debe conocerlos bien.', items: stars.map(i => i.item) })
    if (highCost.length > 0)
      recs.push({ priority: 'alta', tipo: '🔴 Costo alto', msg: 'Estos ítems superan el umbral de alerta. Revisa receta, porciones o precio de venta.', items: highCost.map(i => i.item + ' (' + (i.cost_pct * 100).toFixed(0) + '%)') })
    if (ph.length > 0)
      recs.push({ priority: 'media', tipo: '🐴 Plowhorses con costo alto', msg: 'Son populares pero su costo los hace poco rentables. Ajusta receta o reduce porción.', items: ph.map(i => i.item) })
    if (puzz.length > 0)
      recs.push({ priority: 'media', tipo: '🧩 Puzzles a reposicionar', msg: 'Alta rentabilidad pero baja venta. Reposiciona en menú, capacita a servidores o promuévelos.', items: puzz.map(i => i.item) })
    if (dogs.length > 0)
      recs.push({ priority: 'baja', tipo: '🐕 Dogs a evaluar', msg: 'Baja popularidad y baja rentabilidad. Evalúa eliminar del menú o rediseñar el platillo.', items: dogs.map(i => i.item) })

    return recs
  }, [matrixGroups, costItems, thresholds, totalSales])

  // ── KPIs ───────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const topItem    = allItems[0]
    const topCat     = Object.entries(filtered[filtered.length - 1]?.pm?.by_category || {}).sort((a, b) => b[1] - a[1])[0]
    const withCostI  = allItems.filter(i => i.unit_cost > 0)
    const avgCost    = withCostI.length > 0
      ? withCostI.reduce((s, i) => s + i.cost_pct, 0) / withCostI.length
      : 0
    return { topItem, topCat, avgCost }
  }, [allItems, filtered])

  const periodLabel = filtered.length > 1
    ? `${filtered[0]?.report?.week} → ${filtered[filtered.length - 1]?.report?.week}`
    : filtered[0]?.report?.week || '—'

  // ── Save thresholds ────────────────────────────────────────────────────────

  function handleSaveThresholds() {
    if (restaurantId) saveThresholds(restaurantId, threshEdit)
    setThresholds(threshEdit)
    setShowConfig(false)
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400 text-sm">Cargando Product Mix...</p>
    </div>
  )

  if (weeks.length === 0) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <p className="text-4xl mb-4">🍽️</p>
        <p className="text-white font-semibold mb-2">Sin datos de Product Mix</p>
        <p className="text-gray-500 text-sm mb-4">Sube los archivos Product Mix (Toast) y Menu Item Analysis (R365) desde el wizard.</p>
        <a href="/upload" className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition">
          Subir reporte →
        </a>
      </div>
    </div>
  )

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950">

      {/* ── Header ── */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div>
            <h1 className="text-white font-bold text-lg">🍽️ Product Mix</h1>
            <p className="text-gray-500 text-xs">{restName} · Ingeniería de menú y análisis de ítems</p>
          </div>
          <button onClick={() => setShowConfig(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${showConfig ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            ⚙️ Umbrales de costo
          </button>
        </div>

        {/* Selector de semana */}
        <div className="flex items-center gap-2 flex-wrap">
          {RANGES.map(r => (
            <button key={r.value} onClick={() => { setRange(r.value); setViewMode('range') }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${viewMode === 'range' && range === r.value ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              {r.label}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <select value={viewMode === 'single' ? selWeek : ''}
            onChange={e => { setSelWeek(e.target.value); setViewMode('single') }}
            className={`bg-gray-800 border rounded-lg px-3 py-1.5 text-xs focus:outline-none transition ${viewMode === 'single' ? 'border-blue-500 text-white' : 'border-gray-700 text-gray-400'}`}>
            <option value="">Semana específica...</option>
            {[...weeks].reverse().map(w => (
              <option key={w.report.week} value={w.report.week}>{w.report.week}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <select value={viewMode === 'custom' ? rangeFrom : ''}
              onChange={e => { setRangeFrom(e.target.value); setViewMode('custom') }}
              className={`bg-gray-800 border rounded-lg px-2 py-1.5 text-xs focus:outline-none transition ${viewMode === 'custom' ? 'border-blue-500 text-white' : 'border-gray-700 text-gray-400'}`}>
              <option value="">Desde...</option>
              {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
            </select>
            <span className="text-gray-600 text-xs">→</span>
            <select value={viewMode === 'custom' ? rangeTo : ''}
              onChange={e => { setRangeTo(e.target.value); setViewMode('custom') }}
              className={`bg-gray-800 border rounded-lg px-2 py-1.5 text-xs focus:outline-none transition ${viewMode === 'custom' ? 'border-blue-500 text-white' : 'border-gray-700 text-gray-400'}`}>
              <option value="">Hasta...</option>
              {[...weeks].reverse().map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
            </select>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── Panel de Configuración de Umbrales ── */}
        {showConfig && (
          <div className="bg-gray-900 border border-blue-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white font-semibold">⚙️ Umbrales de costo por categoría</h3>
                <p className="text-gray-500 text-xs mt-0.5">Define qué % de costo es verde, amarillo o rojo para cada categoría</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setThreshEdit(DEFAULT_THRESHOLDS) }}
                  className="text-gray-500 hover:text-gray-300 text-xs px-3 py-1.5 rounded-lg bg-gray-800 transition">
                  Resetear
                </button>
                <button onClick={handleSaveThresholds}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-1.5 rounded-lg font-medium transition">
                  Guardar
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-gray-500 text-xs pb-3 font-medium">Categoría</th>
                    <th className="text-center text-green-500 text-xs pb-3 font-medium">🟢 Verde (óptimo) &lt;</th>
                    <th className="text-center text-yellow-500 text-xs pb-3 font-medium">🟡 Amarillo (alerta) &lt;</th>
                    <th className="text-left text-red-500 text-xs pb-3 font-medium pl-6">🔴 Rojo = mayor al amarillo</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(DEFAULT_THRESHOLDS) as (keyof CostThresholds)[]).map(cat => (
                    <tr key={cat} className="border-b border-gray-800">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CAT_COLORS[cat] }} />
                          <span className="text-gray-300 font-medium">{CAT_LABELS[cat]}</span>
                        </div>
                      </td>
                      <td className="py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input type="number" min={1} max={99} step={1}
                            value={threshEdit[cat].green}
                            onChange={e => setThreshEdit(t => ({ ...t, [cat]: { ...t[cat], green: Number(e.target.value) } }))}
                            className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs text-center focus:outline-none focus:border-green-500" />
                          <span className="text-gray-600 text-xs">%</span>
                        </div>
                      </td>
                      <td className="py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input type="number" min={1} max={99} step={1}
                            value={threshEdit[cat].yellow}
                            onChange={e => setThreshEdit(t => ({ ...t, [cat]: { ...t[cat], yellow: Number(e.target.value) } }))}
                            className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs text-center focus:outline-none focus:border-yellow-500" />
                          <span className="text-gray-600 text-xs">%</span>
                        </div>
                      </td>
                      <td className="py-3 pl-6">
                        <span className="text-red-400 text-xs">&gt; {threshEdit[cat].yellow}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── KPIs ── */}
        <div>
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
            {filtered.length > 1 ? `Período — ${periodLabel} (${filtered.length} semanas)` : `Semana — ${periodLabel}`}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Ítems activos</p>
              <p className="text-2xl font-bold text-white">{allItems.length}</p>
              <p className="text-gray-600 text-xs mt-1">{allItems.filter(i => i.unit_cost > 0).length} con costo</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Ítem #1</p>
              <p className="text-sm font-bold text-blue-400 truncate">{kpis.topItem?.item || '—'}</p>
              <p className="text-gray-600 text-xs mt-1">{kpis.topItem ? fmt(kpis.topItem.net_sales) : ''}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Categoría líder</p>
              <p className="text-xl font-bold text-yellow-400">{kpis.topCat ? CAT_LABELS[kpis.topCat[0]] || kpis.topCat[0] : '—'}</p>
              <p className="text-gray-600 text-xs mt-1">{kpis.topCat ? fmt(kpis.topCat[1]) : ''}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Costo prom. ponderado</p>
              <p className="text-2xl font-bold text-purple-400">{pct(kpis.avgCost)}</p>
              <p className="text-gray-600 text-xs mt-1">Sobre ítems con costo</p>
            </div>
          </div>
        </div>

        {/* ── Filtro categoría (pills) ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-gray-600 text-xs font-medium">Filtrar:</span>
          <button onClick={() => setCatFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${catFilter === 'all' ? 'bg-white text-gray-900' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            Todos
          </button>
          {categories.map(cat => (
            <button key={cat} onClick={() => setCatFilter(cat)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${catFilter === cat ? 'text-gray-900' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              style={catFilter === cat ? { backgroundColor: CAT_COLORS[cat] || '#6b7280' } : {}}>
              {CAT_LABELS[cat] || cat}
            </button>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 border-b border-gray-800 overflow-x-auto">
          {([
            ['topbottom',      '📊 Top / Bottom'],
            ['costo',          '💲 Análisis de Costo'],
            ['8020',           '📐 Regla 80/20'],
            ['matrix',         '🎯 Ingeniería de Menú'],
            ['recomendaciones','💡 Recomendaciones'],
          ] as [Tab, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition border-b-2 -mb-px ${
                activeTab === id ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: TOP / BOTTOM                                             */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'topbottom' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setTopN('top')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${topN === 'top' ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                ↑ Top 15
              </button>
              <button onClick={() => setTopN('bottom')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${topN === 'bottom' ? 'bg-red-900 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                ↓ Bottom 15
              </button>
              <span className="text-gray-600 text-xs ml-2">{filteredItems.length} ítems en filtro activo</span>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-gray-500 text-xs p-4 font-medium">#</th>
                    <th className="text-left text-gray-500 text-xs p-4 font-medium">Ítem</th>
                    <th className="text-left text-gray-500 text-xs p-4 font-medium">Categoría</th>
                    <th className="text-right text-gray-500 text-xs p-4 font-medium">Qty</th>
                    <th className="text-right text-gray-500 text-xs p-4 font-medium">Net Sales</th>
                    <th className="text-right text-gray-500 text-xs p-4 font-medium">% del total</th>
                    <th className="text-center text-gray-500 text-xs p-4 font-medium">Clasificación</th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map((it, i) => (
                    <tr key={it.item} className="border-b border-gray-800 hover:bg-gray-800 transition">
                      <td className="p-4 text-gray-600 text-xs">{i + 1}</td>
                      <td className="p-4">
                        <span className="text-gray-300 font-medium">{it.item}</span>
                      </td>
                      <td className="p-4">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: (CAT_COLORS[it.menu_category] || '#6b7280') + '33', color: CAT_COLORS[it.menu_category] || '#6b7280' }}>
                          {CAT_LABELS[it.menu_category] || it.menu_category}
                        </span>
                      </td>
                      <td className="p-4 text-right text-gray-400">{it.qty.toLocaleString()}</td>
                      <td className="p-4 text-right text-white font-semibold">{fmt(it.net_sales)}</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-gray-800 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-blue-500"
                              style={{ width: `${Math.min((it.net_sales / (totalSales || 1)) * 100, 100)}%` }} />
                          </div>
                          <span className="text-gray-500 text-xs w-10 text-right">
                            {totalSales > 0 ? ((it.net_sales / totalSales) * 100).toFixed(1) + '%' : '—'}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        {it.menu_engineering !== 'sin_costo' ? (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ME_CONFIG[it.menu_engineering].bg} ${ME_CONFIG[it.menu_engineering].text}`}>
                            {ME_CONFIG[it.menu_engineering].emoji} {ME_CONFIG[it.menu_engineering].label.slice(0, -1)}
                          </span>
                        ) : (
                          <span className="text-gray-700 text-xs">Sin costo</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: ANÁLISIS DE COSTO                                        */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'costo' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-gray-500 text-xs">{costItems.length} ítems con costo registrado</p>
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Verde = óptimo</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Amarillo = alerta</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Rojo = crítico</span>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 text-xs p-4 font-medium">Ítem</th>
                      <th className="text-left text-gray-500 text-xs p-4 font-medium">Cat.</th>
                      <th className="text-right text-gray-500 text-xs p-4 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('qty')}>
                        Qty <SortIcon col="qty" />
                      </th>
                      <th className="text-right text-gray-500 text-xs p-4 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('price')}>
                        Precio <SortIcon col="price" />
                      </th>
                      <th className="text-right text-gray-500 text-xs p-4 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('unit_cost')}>
                        Unit Cost <SortIcon col="unit_cost" />
                      </th>
                      <th className="text-right text-gray-500 text-xs p-4 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('theo_cost_total')}>
                        Theo Cost $ <SortIcon col="theo_cost_total" />
                      </th>
                      <th className="text-center text-gray-500 text-xs p-4 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('cost_pct')}>
                        % Costo <SortIcon col="cost_pct" />
                      </th>
                      <th className="text-right text-gray-500 text-xs p-4 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('margin')}>
                        Margen $ <SortIcon col="margin" />
                      </th>
                      <th className="text-right text-gray-500 text-xs p-4 font-medium cursor-pointer hover:text-gray-300" onClick={() => toggleSort('net_sales')}>
                        Net Sales <SortIcon col="net_sales" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {costItems.map(it => (
                      <tr key={it.item} className="border-b border-gray-800 hover:bg-gray-800 transition">
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            {it.menu_engineering !== 'sin_costo' && (
                              <span title={ME_CONFIG[it.menu_engineering].label}>
                                {ME_CONFIG[it.menu_engineering].emoji}
                              </span>
                            )}
                            <span className="text-gray-300 font-medium">{it.item}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="text-xs" style={{ color: CAT_COLORS[it.menu_category] || '#6b7280' }}>
                            {CAT_LABELS[it.menu_category] || it.menu_category}
                          </span>
                        </td>
                        <td className="p-4 text-right text-gray-400 text-xs">{it.qty.toLocaleString()}</td>
                        <td className="p-4 text-right text-gray-300">{fmtD(it.price)}</td>
                        <td className="p-4 text-right text-gray-300">{fmtD(it.unit_cost)}</td>
                        <td className="p-4 text-right text-gray-400 text-xs">{fmt(it.theo_cost_total)}</td>
                        <td className="p-4 text-center">
                          <CostBadge pctVal={it.cost_pct} category={it.menu_category} thresholds={thresholds} />
                        </td>
                        <td className="p-4 text-right">
                          <span className={it.margin >= 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                            {fmtD(it.margin)}
                          </span>
                        </td>
                        <td className="p-4 text-right text-white font-semibold">{fmt(it.net_sales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: REGLA 80/20                                              */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === '8020' && (
          <div className="space-y-4">
            {/* Counter chip */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="bg-blue-950 border border-blue-800 rounded-xl px-5 py-3 flex items-center gap-3">
                <span className="text-blue-400 text-2xl font-bold">{items80}</span>
                <div>
                  <p className="text-blue-300 text-sm font-medium">ítems generan el 80% de tus ventas</p>
                  <p className="text-blue-600 text-xs">de {filteredItems.length} totales en el filtro activo</p>
                </div>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3">
                <p className="text-gray-500 text-xs mb-0.5">Concentración</p>
                <p className="text-white font-bold">{filteredItems.length > 0 ? ((items80 / filteredItems.length) * 100).toFixed(0) : 0}% de ítems</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3">
                <p className="text-gray-500 text-xs mb-0.5">Ventas Top {items80}</p>
                <p className="text-white font-bold">{fmt(pareto.filter(i => i.is80).reduce((s, i) => s + i.net_sales, 0))}</p>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 text-xs p-4 font-medium">#</th>
                      <th className="text-left text-gray-500 text-xs p-4 font-medium">Ítem</th>
                      <th className="text-left text-gray-500 text-xs p-4 font-medium">Cat.</th>
                      <th className="text-right text-gray-500 text-xs p-4 font-medium">Qty</th>
                      <th className="text-right text-gray-500 text-xs p-4 font-medium">Net Sales</th>
                      <th className="text-right text-gray-500 text-xs p-4 font-medium">% semana</th>
                      <th className="text-right text-gray-500 text-xs p-4 font-medium">% acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pareto.map((it, i) => {
                      const isDiv = i > 0 && it.is80 !== pareto[i - 1].is80
                      return (
                        <tr key={it.item}
                          className={`border-b border-gray-800 transition ${
                            it.is80 ? 'bg-blue-950/20 hover:bg-blue-950/40' : 'opacity-50 hover:opacity-70'
                          } ${isDiv ? 'border-t-2 border-blue-700' : ''}`}>
                          <td className="p-3 pl-4">
                            {isDiv && (
                              <div className="absolute -mt-3 left-4 right-4">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-px bg-blue-700" />
                                  <span className="text-blue-500 text-xs font-bold whitespace-nowrap">── 80% ──</span>
                                  <div className="flex-1 h-px bg-blue-700" />
                                </div>
                              </div>
                            )}
                            <span className={`text-xs ${it.is80 ? 'text-blue-400 font-semibold' : 'text-gray-600'}`}>{i + 1}</span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {it.is80 && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                              <span className={it.is80 ? 'text-white font-medium' : 'text-gray-600'}>{it.item}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="text-xs" style={{ color: it.is80 ? (CAT_COLORS[it.menu_category] || '#6b7280') : '#4b5563' }}>
                              {CAT_LABELS[it.menu_category] || it.menu_category}
                            </span>
                          </td>
                          <td className="p-3 text-right text-xs text-gray-400">{it.qty.toLocaleString()}</td>
                          <td className="p-3 text-right">
                            <span className={it.is80 ? 'text-white font-semibold' : 'text-gray-600'}>{fmt(it.net_sales)}</span>
                          </td>
                          <td className="p-3 text-right text-gray-500 text-xs">
                            {totalSales > 0 ? ((it.net_sales / totalSales) * 100).toFixed(1) + '%' : '—'}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-20 bg-gray-800 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full ${it.is80 ? 'bg-blue-500' : 'bg-gray-700'}`}
                                  style={{ width: `${Math.min(it.cumPct * 100, 100)}%` }} />
                              </div>
                              <span className={`text-xs w-12 text-right font-medium ${it.is80 ? 'text-blue-400' : 'text-gray-600'}`}>
                                {(it.cumPct * 100).toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: INGENIERÍA DE MENÚ                                       */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'matrix' && (
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-gray-500 text-xs">
                Clasificación <strong className="text-gray-300">Kasavana & Smith</strong> — Popularidad (qty vs promedio) × Rentabilidad (margen $ vs promedio).
                Solo ítems con costo registrado ({allItems.filter(i => i.unit_cost > 0).length} de {allItems.length}).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['star', 'puzzle', 'plowhorse', 'dog'] as const).map(type => {
                const cfg   = ME_CONFIG[type]
                const items = matrixGroups[type]
                return (
                  <div key={type} className={`${cfg.bg} border ${cfg.border} rounded-xl p-5`}>
                    {/* Header cuadrante */}
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className={`font-bold text-base ${cfg.text}`}>{cfg.emoji} {cfg.label}</h3>
                        <p className="text-gray-600 text-xs mt-0.5">
                          {type === 'star'      && 'Alta popularidad · Alto margen'}
                          {type === 'puzzle'    && 'Baja popularidad · Alto margen'}
                          {type === 'plowhorse' && 'Alta popularidad · Bajo margen'}
                          {type === 'dog'       && 'Baja popularidad · Bajo margen'}
                        </p>
                      </div>
                      <span className={`text-2xl font-bold ${cfg.text}`}>{items.length}</span>
                    </div>

                    {/* Lista de ítems */}
                    {items.length === 0 ? (
                      <p className="text-gray-700 text-xs text-center py-4">No hay ítems en este cuadrante</p>
                    ) : (
                      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                        {[...items].sort((a, b) => b.net_sales - a.net_sales).map(it => (
                          <div key={it.item}
                            className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-black/20 transition">
                            <div className="min-w-0 flex-1">
                              <p className="text-gray-300 text-xs font-medium truncate">{it.item}</p>
                              <p className="text-gray-600 text-xs">{it.qty} uds · {fmt(it.net_sales)}</p>
                            </div>
                            <div className="shrink-0 ml-3 text-right">
                              <CostBadge pctVal={it.cost_pct} category={it.menu_category} thresholds={thresholds} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Ítems sin costo */}
            {allItems.filter(i => i.menu_engineering === 'sin_costo').length > 0 && (
              <div className="bg-gray-900 border border-gray-700 border-dashed rounded-xl p-4">
                <p className="text-gray-500 text-xs font-semibold mb-2">
                  Sin clasificar ({allItems.filter(i => i.menu_engineering === 'sin_costo').length} ítems sin costo en R365)
                </p>
                <div className="flex flex-wrap gap-1">
                  {allItems.filter(i => i.menu_engineering === 'sin_costo').map(it => (
                    <span key={it.item} className="text-gray-600 text-xs bg-gray-800 px-2 py-0.5 rounded-full">{it.item}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* TAB: RECOMENDACIONES                                          */}
        {/* ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'recomendaciones' && (
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
              <span className="text-xl">💡</span>
              <p className="text-gray-400 text-sm">
                Recomendaciones generadas automáticamente para el período <strong className="text-white">{periodLabel}</strong>.
                Basadas en clasificación Kasavana & Smith y umbrales de costo configurados.
              </p>
            </div>

            {recommendations.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                <p className="text-gray-500">No hay suficientes datos para generar recomendaciones.</p>
                <p className="text-gray-600 text-xs mt-1">Asegúrate de subir el Product Mix y el Menu Item Analysis.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recommendations.map((rec, i) => (
                  <div key={i} className={`rounded-xl p-5 border ${
                    rec.priority === 'alta'  ? 'bg-red-950/30 border-red-900'    :
                    rec.priority === 'media' ? 'bg-yellow-950/30 border-yellow-900' :
                                              'bg-gray-900 border-gray-800'
                  }`}>
                    <div className="flex items-start gap-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 mt-0.5 ${
                        rec.priority === 'alta'  ? 'bg-red-900 text-red-400'    :
                        rec.priority === 'media' ? 'bg-yellow-900 text-yellow-400' :
                                                  'bg-gray-800 text-gray-400'
                      }`}>
                        {rec.priority === 'alta' ? '🔴 Prioritario' : rec.priority === 'media' ? '🟡 Importante' : '🔵 Monitorear'}
                      </span>
                      <div className="flex-1">
                        <p className="text-white font-semibold mb-1">{rec.tipo}</p>
                        <p className="text-gray-400 text-sm mb-3">{rec.msg}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {rec.items.map(item => (
                            <span key={item} className="text-xs bg-black/30 border border-gray-700 text-gray-300 px-2.5 py-1 rounded-full">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Resumen rápido por cuadrante */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
              {(['star', 'puzzle', 'plowhorse', 'dog'] as const).map(type => {
                const cfg   = ME_CONFIG[type]
                const items = matrixGroups[type]
                const sales = items.reduce((s, i) => s + i.net_sales, 0)
                return (
                  <div key={type} className={`${cfg.bg} border ${cfg.border} rounded-xl p-4`}>
                    <p className={`font-bold text-sm ${cfg.text}`}>{cfg.emoji} {cfg.label}</p>
                    <p className="text-white font-bold text-lg mt-1">{items.length} ítems</p>
                    <p className="text-gray-600 text-xs mt-0.5">{fmt(sales)} ventas</p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}