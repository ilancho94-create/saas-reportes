'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurantId } from '@/lib/use-restaurant'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, ReferenceLine
} from 'recharts'

const CATEGORIES_BASE = [
  { key: 'food', label: 'Food', color: '#f97316', defaultMeta: 28 },
  { key: 'na_beverage', label: 'NA Beverage', color: '#06b6d4', defaultMeta: 8 },
  { key: 'liquor', label: 'Liquor', color: '#a855f7', defaultMeta: 20 },
  { key: 'beer', label: 'Beer', color: '#eab308', defaultMeta: 20 },
  { key: 'wine', label: 'Wine', color: '#ec4899', defaultMeta: 20 },
  { key: 'general', label: 'General', color: '#6b7280', defaultMeta: null },
]

type ViewMode = 'range' | 'compare'
type Shortcut = 'last1' | 'last4' | 'last8' | 'month' | 'custom'

export default function FoodCostPage() {
  const restaurantId = useRestaurantId()
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])   // sorted ASC (oldest first)
  const [restaurantName, setRestaurantName] = useState('')
  const [mappings, setMappings] = useState<any[]>([])
  const [costTargets, setCostTargets] = useState<Record<string, number>>({})
  const [activeCategory, setActiveCategory] = useState('food')
  const [viewMode, setViewMode] = useState<ViewMode>('range')
  const [shortcut, setShortcut] = useState<Shortcut>('last4')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [compareA, setCompareA] = useState<string>('')
  const [compareB, setCompareB] = useState<string>('')
  const [hiddenLines, setHiddenLines] = useState<string[]>([])

  const CATEGORIES = CATEGORIES_BASE.map(cat => ({
    ...cat,
    meta: costTargets[cat.key] !== undefined ? costTargets[cat.key] : cat.defaultMeta,
  }))

  useEffect(() => { if (restaurantId) loadData() }, [restaurantId])

  async function loadData() {
    if (!restaurantId) return
    setLoading(true)
    setWeeks([])

    const { data: rest } = await supabase
      .from('restaurants').select('name').eq('id', restaurantId).single()
    setRestaurantName(rest?.name || '')

    const { data: maps } = await supabase
      .from('category_mappings').select('*').eq('restaurant_id', restaurantId)
    setMappings(maps || [])

    const { data: tgts } = await supabase
      .from('cost_targets').select('category, target_pct').eq('restaurant_id', restaurantId)
    if (tgts?.length) {
      const m: Record<string, number> = {}
      tgts.forEach((t: any) => { m[t.category] = Number(t.target_pct) })
      setCostTargets(m)
    }

    const { data: reports } = await supabase
      .from('reports').select('*')
      .eq('restaurant_id', restaurantId)
      .order('week', { ascending: true })   // ← ASC: oldest first
      .limit(52)

    if (!reports || reports.length === 0) { setLoading(false); return }

    const weeksData = await Promise.all(reports.map(async (r) => {
      const [s, c] = await Promise.all([
        supabase.from('sales_data').select('*').eq('report_id', r.id).single(),
        supabase.from('cogs_data').select('*').eq('report_id', r.id).single(),
      ])
      return { report: r, sales: s.data, cogs: c.data }
    }))

    setWeeks(weeksData)

    const last = weeksData[weeksData.length - 1]
    const secondLast = weeksData[weeksData.length - 2]
    setCustomFrom(weeksData.length >= 4 ? weeksData[weeksData.length - 4].report.week : weeksData[0].report.week)
    setCustomTo(last?.report.week || '')
    setCompareA(secondLast?.report.week || last?.report.week || '')
    setCompareB(last?.report.week || '')
    setLoading(false)
  }

  // ── Filtered by shortcut ─────────────────────────────────────────────────
  const filtered = (() => {
    if (weeks.length === 0) return []
    if (shortcut === 'last1') return weeks.slice(-1)
    if (shortcut === 'last4') return weeks.slice(-4)
    if (shortcut === 'last8') return weeks.slice(-8)
    if (shortcut === 'month') {
      const now = new Date()
      const y = now.getFullYear(), m = now.getMonth()
      return weeks.filter(w => {
        const d = new Date(w.report.week_start)
        return d.getFullYear() === y && d.getMonth() === m
      })
    }
    if (shortcut === 'custom' && customFrom && customTo) {
      const from = customFrom <= customTo ? customFrom : customTo
      const to = customFrom <= customTo ? customTo : customFrom
      return weeks.filter(w => w.report.week >= from && w.report.week <= to)
    }
    return weeks.slice(-4)
  })()

  function fmt(n: any) {
    if (!n) return '—'
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  function pct(part: any, total: any) {
    if (!part || !total) return null
    return parseFloat((Number(part) / Number(total) * 100).toFixed(1))
  }

  function getMappedSales(categories: any[], targetType: string) {
    if (!categories || !mappings.length) return 0
    return categories
      .filter((cat: any) => {
        const mapping = mappings.find(m => m.source_category.toLowerCase() === cat.name.toLowerCase())
        return mapping?.mapped_to === targetType
      })
      .reduce((sum: number, cat: any) => sum + Number(cat.net || 0), 0)
  }

  function buildWeekData(w: any) {
    const netSales = w.sales?.net_sales || 0
    const cat = w.cogs?.by_category || {}
    const categories = w.sales?.categories || []
    const foodSales = getMappedSales(categories, 'food') || netSales
    const beerSales = getMappedSales(categories, 'beer') || netSales
    const liquorSales = getMappedSales(categories, 'liquor') || netSales
    const naBevSales = getMappedSales(categories, 'na_beverage') || netSales
    const wineSales = getMappedSales(categories, 'wine') || netSales
    const totalABSales = foodSales + beerSales + liquorSales + naBevSales + wineSales || netSales
    const totalABRaw = (cat.food || 0) + (cat.na_beverage || 0) + (cat.liquor || 0) + (cat.beer || 0) + (cat.wine || 0)
    return {
      week: w.report.week.replace('2026-', ''),
      food: pct(cat.food, foodSales) || 0,
      na_beverage: pct(cat.na_beverage, naBevSales) || 0,
      liquor: pct(cat.liquor, liquorSales) || 0,
      beer: pct(cat.beer, beerSales) || 0,
      wine: pct(cat.wine, wineSales) || 0,
      general: pct(cat.general, netSales) || 0,
      totalAB: pct(totalABRaw, totalABSales) || 0,
      'food$': cat.food || 0, 'na_beverage$': cat.na_beverage || 0,
      'liquor$': cat.liquor || 0, 'beer$': cat.beer || 0,
      'wine$': cat.wine || 0, 'general$': cat.general || 0,
      'total$': w.cogs?.total || 0,
      foodSales, beerSales, liquorSales, naBevSales, wineSales,
      totalABSales, totalABRaw, netSales, cat,
    }
  }

  const chartData = filtered.map(buildWeekData)
  const latest = filtered[filtered.length - 1]
  const latestData = latest ? buildWeekData(latest) : null
  const weekAData = compareA ? buildWeekData(weeks.find(w => w.report.week === compareA) || weeks[0]) : null
  const weekBData = compareB ? buildWeekData(weeks.find(w => w.report.week === compareB) || weeks[weeks.length - 1]) : null
  const activeCat = CATEGORIES.find(c => c.key === activeCategory)

  function toggleLine(key: string) {
    setHiddenLines(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  function getSemaforoColor(val: number | null, meta: number | null) {
    if (!val || !meta) return 'text-gray-400'
    const diff = val - meta
    if (diff <= 0) return 'text-green-400'
    if (diff <= 3) return 'text-yellow-400'
    return 'text-red-400'
  }

  function getSemaforoLabel(val: number | null, meta: number | null) {
    if (!val || !meta) return ''
    const diff = val - meta
    if (diff <= 0) return `✓ ${Math.abs(diff).toFixed(1)}pts bajo meta`
    if (diff <= 3) return `⚠ ${diff.toFixed(1)}pts sobre meta`
    return `▲ ${diff.toFixed(1)}pts sobre meta`
  }

  const SHORTCUTS: { key: Shortcut; label: string }[] = [
    { key: 'last1', label: 'Última semana' },
    { key: 'last4', label: 'Últimas 4 sem' },
    { key: 'last8', label: 'Últimas 8 sem' },
    { key: 'month', label: 'Este mes' },
    { key: 'custom', label: 'Custom' },
  ]

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      {/* ── Header ── */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-white font-bold text-lg">🛒 Food Cost</h1>
            <span className="bg-orange-900 text-orange-400 text-xs px-2 py-0.5 rounded-full font-medium">Costo de Compra</span>
          </div>
          <p className="text-gray-500 text-xs mt-0.5">{restaurantName} · Compras de proveedores / Ventas</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setViewMode('range')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${viewMode === 'range' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            Rango
          </button>
          <button onClick={() => setViewMode('compare')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${viewMode === 'compare' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
            Comparar semanas
          </button>
        </div>
      </div>

      {/* ── Selector de rango ── */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-3">
        {viewMode === 'range' ? (
          <div className="flex items-center gap-2 flex-wrap">
            {SHORTCUTS.map(s => (
              <button key={s.key} onClick={() => setShortcut(s.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${shortcut === s.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                {s.label}
              </button>
            ))}
            {shortcut === 'custom' && (
              <div className="flex items-center gap-2 ml-2">
                <select value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500">
                  {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
                </select>
                <span className="text-gray-500 text-xs">→</span>
                <select value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500">
                  {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
                </select>
              </div>
            )}
            <span className="text-gray-600 text-xs ml-2">{filtered.length} semanas</span>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <span className="text-gray-500 text-xs">Semana A:</span>
            <select value={compareA} onChange={e => setCompareA(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500">
              {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
            </select>
            <span className="text-gray-500 text-xs">vs Semana B:</span>
            <select value={compareB} onChange={e => setCompareB(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500">
              {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
            </select>
          </div>
        )}
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-orange-950 border border-orange-900 rounded-xl px-5 py-3 flex items-start gap-3">
          <span className="text-orange-400 text-lg">ℹ️</span>
          <div>
            <p className="text-orange-300 text-sm font-medium">Costo de Compra</p>
            <p className="text-orange-400 text-xs mt-0.5">
              Este reporte muestra lo que se <strong>compró a proveedores</strong> vs las ventas del período.
              {Object.keys(costTargets).length > 0 ? ' · Metas configuradas en Settings.' : ' · Configura tus metas en Settings → Metas de Costo.'}
            </p>
          </div>
        </div>

        {/* ── RANGO ── */}
        {viewMode === 'range' && latestData && (
          <>
            <div>
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
                Semana más reciente — {latest?.report?.week}
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 md:col-span-2">
                  <p className="text-gray-500 text-xs mb-1">Total A&B — Costo de Compra</p>
                  <p className="text-3xl font-bold text-white">
                    {latestData.totalABRaw ? pct(latestData.totalABRaw, latestData.totalABSales) + '%' : '—'}
                  </p>
                  <p className="text-gray-600 text-xs mt-1">{fmt(latestData.totalABRaw)} comprado · Ventas A&B: {fmt(latestData.totalABSales)}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-gray-500 text-xs mb-1">Total COGS</p>
                  <p className="text-2xl font-bold text-orange-400">{fmt(latest?.cogs?.total)}</p>
                  <p className="text-gray-600 text-xs mt-1">incluyendo general</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-gray-500 text-xs mb-1">% COGS Total</p>
                  <p className="text-2xl font-bold text-orange-400">
                    {pct(latest?.cogs?.total, latestData.netSales) ? pct(latest?.cogs?.total, latestData.netSales) + '%' : '—'}
                  </p>
                  <p className="text-gray-600 text-xs mt-1">vs ventas netas</p>
                </div>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {CATEGORIES.map(cat => {
                  const catSales = ({ food: latestData.foodSales, beer: latestData.beerSales, liquor: latestData.liquorSales, na_beverage: latestData.naBevSales, wine: latestData.wineSales, general: latestData.netSales } as any)[cat.key] || latestData.netSales
                  const val = pct(latestData.cat[cat.key], catSales)
                  const meta = cat.meta
                  return (
                    <button key={cat.key} onClick={() => setActiveCategory(cat.key)}
                      className={`rounded-xl p-4 text-left transition border ${activeCategory === cat.key ? 'border-2 bg-gray-800' : 'border-gray-800 bg-gray-900 hover:bg-gray-800'}`}
                      style={{ borderColor: activeCategory === cat.key ? cat.color : undefined }}>
                      <p className="text-gray-500 text-xs mb-1">{cat.label}</p>
                      <p className="text-lg font-bold" style={{ color: cat.color }}>{val ? val + '%' : '—'}</p>
                      {meta !== null && <p className="text-gray-600 text-xs">Meta: {meta}%</p>}
                      <p className="text-gray-600 text-xs">{fmt(latestData.cat[cat.key])}</p>
                      {meta && val && (
                        <p className={`text-xs mt-1 font-medium ${getSemaforoColor(val, meta)}`}>{getSemaforoLabel(val, meta)}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-gray-500 text-xs">Mostrar/ocultar:</span>
              {CATEGORIES.map(cat => (
                <button key={cat.key} onClick={() => toggleLine(cat.key)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition border ${hiddenLines.includes(cat.key) ? 'border-gray-700 bg-gray-900 text-gray-600' : 'border-gray-700 bg-gray-800 text-white'}`}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: hiddenLines.includes(cat.key) ? '#4b5563' : cat.color }} />
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-white font-semibold">% {activeCat?.label} — Costo de Compra</h2>
                {activeCat?.meta !== null && (
                  <span className="text-xs text-gray-500">Meta: <span className="text-white font-medium">{activeCat?.meta}%</span></span>
                )}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                  {activeCat?.meta !== null && (
                    <ReferenceLine y={activeCat?.meta} stroke="#ef4444" strokeDasharray="4 4"
                      label={{ value: `Meta ${activeCat?.meta}%`, fill: '#ef4444', fontSize: 10, position: 'right' }} />
                  )}
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(v: any) => [v + '%', activeCat?.label]} />
                  <Line type="monotone" dataKey={activeCategory} stroke={activeCat?.color} strokeWidth={2}
                    dot={{ fill: activeCat?.color, r: 4 }} hide={hiddenLines.includes(activeCategory)} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-1">Total A&B % — Todas las categorías</h2>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(v: any, name: any) => [v + '%', name]} />
                  {CATEGORIES.filter(c => c.meta !== null).map(cat => (
                    <ReferenceLine key={cat.key + '_ref'} y={cat.meta!} stroke={cat.color} strokeDasharray="3 3" strokeOpacity={0.4} />
                  ))}
                  {CATEGORIES.map(cat => (
                    <Line key={cat.key} type="monotone" dataKey={cat.key} name={cat.label} stroke={cat.color}
                      strokeWidth={2} dot={false} hide={hiddenLines.includes(cat.key)} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-1">Compras en $ por categoría</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(v: any, name: any) => ['$' + Number(v).toLocaleString(), name]} />
                  <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                  {CATEGORIES.map(cat => (
                    <Bar key={cat.key} dataKey={cat.key + '$'} name={cat.label} fill={cat.color} stackId="a"
                      hide={hiddenLines.includes(cat.key)} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Comparativo por semana</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Semana</th>
                      {CATEGORIES.filter(c => c.key !== 'general').map(cat => (
                        <th key={cat.key} className="text-right text-gray-500 text-xs pb-3 font-medium">
                          {cat.label} {cat.meta ? <span className="text-gray-700">({cat.meta}%)</span> : ''}
                        </th>
                      ))}
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Total A&B %</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Total $</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...filtered].reverse().map((w) => {
                      const d = buildWeekData(w)
                      return (
                        <tr key={w.report.id} className="border-b border-gray-800 hover:bg-gray-800 transition">
                          <td className="py-3">
                            <p className="text-gray-300">{w.report.week}</p>
                            <p className="text-gray-600 text-xs">{w.report.week_start} → {w.report.week_end}</p>
                          </td>
                          {CATEGORIES.filter(c => c.key !== 'general').map(cat => {
                            const val = d[cat.key as keyof typeof d] as number
                            return (
                              <td key={cat.key} className="py-3 text-right">
                                <span className={`font-medium ${getSemaforoColor(val, cat.meta)}`}>{val ? val + '%' : '—'}</span>
                              </td>
                            )
                          })}
                          <td className="py-3 text-right">
                            <span className={`font-medium ${d.totalAB > 35 ? 'text-red-400' : 'text-green-400'}`}>
                              {d.totalAB ? d.totalAB + '%' : '—'}
                            </span>
                          </td>
                          <td className="py-3 text-right text-white font-medium">{fmt(w.cogs?.total)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── COMPARAR ── */}
        {viewMode === 'compare' && weekAData && weekBData && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[{ label: compareA, data: weekAData }, { label: compareB, data: weekBData }].map(({ label, data }) => (
                <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h2 className="text-white font-bold text-lg mb-1">{label}</h2>
                  <p className="text-gray-500 text-xs mb-4">Costo de Compra</p>
                  <div className="space-y-3">
                    {CATEGORIES.map(cat => {
                      const catSales = ({ food: data.foodSales, beer: data.beerSales, liquor: data.liquorSales, na_beverage: data.naBevSales, wine: data.wineSales, general: data.netSales } as any)[cat.key] || data.netSales
                      const val = pct(data.cat[cat.key], catSales)
                      const meta = cat.meta
                      return (
                        <div key={cat.key} className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="text-gray-400 text-sm w-24">{cat.label}</span>
                          <div className="flex-1 bg-gray-800 rounded-full h-2">
                            <div className="h-2 rounded-full" style={{ width: `${Math.min(val || 0, 100)}%`, backgroundColor: cat.color }} />
                          </div>
                          <span className={`font-medium text-sm w-14 text-right ${getSemaforoColor(val, meta)}`}>{val ? val + '%' : '—'}</span>
                          <span className="text-gray-600 text-xs w-16 text-right">{fmt(data.cat[cat.key])}</span>
                          {meta && val && (
                            <span className={`text-xs w-20 ${getSemaforoColor(val, meta)}`}>{getSemaforoLabel(val, meta)}</span>
                          )}
                        </div>
                      )
                    })}
                    <div className="pt-3 border-t border-gray-800 flex justify-between">
                      <span className="text-gray-400 text-sm font-medium">Total A&B</span>
                      <span className={`font-bold ${data.totalABRaw > 0 && pct(data.totalABRaw, data.totalABSales)! > 35 ? 'text-red-400' : 'text-green-400'}`}>
                        {pct(data.totalABRaw, data.totalABSales) ? pct(data.totalABRaw, data.totalABSales) + '%' : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-sm font-medium">Total COGS</span>
                      <span className="text-white font-bold">{fmt((data as any)['total$'])}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Diferencias {compareA} vs {compareB}</h2>
              <div className="space-y-3">
                {CATEGORIES.map(cat => {
                  const getSales = (d: any) => ({ food: d.foodSales, beer: d.beerSales, liquor: d.liquorSales, na_beverage: d.naBevSales, wine: d.wineSales, general: d.netSales } as any)[cat.key] || d.netSales
                  const valA = pct(weekAData.cat[cat.key], getSales(weekAData))
                  const valB = pct(weekBData.cat[cat.key], getSales(weekBData))
                  if (!valA && !valB) return null
                  const diff = valA && valB ? parseFloat((valB - valA).toFixed(1)) : null
                  return (
                    <div key={cat.key} className="flex items-center justify-between py-2 border-b border-gray-800">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                        <span className="text-gray-300 text-sm">{cat.label}</span>
                        {cat.meta && <span className="text-gray-600 text-xs">meta: {cat.meta}%</span>}
                      </div>
                      <div className="flex items-center gap-6">
                        <span className={`text-sm ${getSemaforoColor(valA, cat.meta)}`}>{valA ? valA + '%' : '—'}</span>
                        <span className="text-gray-600">→</span>
                        <span className={`text-sm ${getSemaforoColor(valB, cat.meta)}`}>{valB ? valB + '%' : '—'}</span>
                        {diff !== null && (
                          <span className={`text-sm font-medium w-16 text-right ${diff > 0 ? 'text-red-400' : diff < 0 ? 'text-green-400' : 'text-gray-500'}`}>
                            {diff > 0 ? '+' : ''}{diff}%
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}