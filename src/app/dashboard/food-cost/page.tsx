'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

const CATEGORIES = [
  { key: 'food', label: 'Food', color: '#f97316', meta: 28 },
  { key: 'na_beverage', label: 'NA Beverage', color: '#06b6d4', meta: 8 },
  { key: 'liquor', label: 'Liquor', color: '#a855f7', meta: 20 },
  { key: 'beer', label: 'Beer', color: '#eab308', meta: 20 },
  { key: 'wine', label: 'Wine', color: '#ec4899', meta: 20 },
  { key: 'general', label: 'General', color: '#6b7280', meta: null },
]

type ViewMode = 'range' | 'compare'

export default function FoodCostPage() {
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])
  const [restaurant, setRestaurant] = useState<any>(null)
  const [mappings, setMappings] = useState<any[]>([])
  const [activeCategory, setActiveCategory] = useState('food')
  const [viewMode, setViewMode] = useState<ViewMode>('range')
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd, setRangeEnd] = useState(99)
  const [compareA, setCompareA] = useState<string>('')
  const [compareB, setCompareB] = useState<string>('')
  const [hiddenLines, setHiddenLines] = useState<string[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else loadData()
    })
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles').select('restaurant_id').eq('id', user.id).single()
    if (!profile?.restaurant_id) { setLoading(false); return }

    const { data: rest } = await supabase
      .from('restaurants').select('*, organizations(name)').eq('id', profile.restaurant_id).single()
    setRestaurant(rest)

    const { data: maps } = await supabase
      .from('category_mappings').select('*').eq('restaurant_id', profile.restaurant_id)
    setMappings(maps || [])

    const { data: reports } = await supabase
      .from('reports').select('*')
      .eq('restaurant_id', profile.restaurant_id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (!reports || reports.length === 0) { setLoading(false); return }

    const weeksData = await Promise.all(reports.map(async (r) => {
      const [s, c] = await Promise.all([
        supabase.from('sales_data').select('*').eq('report_id', r.id).single(),
        supabase.from('cogs_data').select('*').eq('report_id', r.id).single(),
      ])
      return { report: r, sales: s.data, cogs: c.data }
    }))

    const sorted = weeksData.reverse()
    setWeeks(sorted)
    setRangeStart(0)
    setRangeEnd(sorted.length - 1)
    if (sorted.length >= 2) {
      setCompareA(sorted[sorted.length - 2].report.week)
      setCompareB(sorted[sorted.length - 1].report.week)
    } else if (sorted.length === 1) {
      setCompareA(sorted[0].report.week)
      setCompareB(sorted[0].report.week)
    }
    setLoading(false)
  }

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
        const mapping = mappings.find(m =>
          m.source_category.toLowerCase() === cat.name.toLowerCase()
        )
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
      food$: cat.food || 0,
      na_beverage$: cat.na_beverage || 0,
      liquor$: cat.liquor || 0,
      beer$: cat.beer || 0,
      wine$: cat.wine || 0,
      general$: cat.general || 0,
      total$: w.cogs?.total || 0,
      foodSales, beerSales, liquorSales, naBevSales, wineSales,
      totalABSales, totalABRaw, netSales,
      cat,
    }
  }

  const filtered = weeks.slice(rangeStart, rangeEnd + 1)
  const chartData = filtered.map(buildWeekData)
  const latest = filtered[filtered.length - 1]
  const latestData = latest ? buildWeekData(latest) : null

  const weekAData = compareA ? buildWeekData(weeks.find(w => w.report.week === compareA) || weeks[0]) : null
  const weekBData = compareB ? buildWeekData(weeks.find(w => w.report.week === compareB) || weeks[weeks.length - 1]) : null

  const activeCat = CATEGORIES.find(c => c.key === activeCategory)

  function toggleLine(key: string) {
    setHiddenLines(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-white font-bold text-lg">🛒 Food Cost</h1>
            <span className="bg-orange-900 text-orange-400 text-xs px-2 py-0.5 rounded-full font-medium">
              Costo de Compra
            </span>
          </div>
          <p className="text-gray-500 text-xs mt-0.5">{restaurant?.name} · Compras de proveedores / Ventas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('range')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${viewMode === 'range' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            Rango
          </button>
          <button
            onClick={() => setViewMode('compare')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${viewMode === 'compare' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            Comparar semanas
          </button>
        </div>
      </div>

      <div className="border-b border-gray-800 bg-gray-900 px-6 py-3">
        {viewMode === 'range' ? (
          <div className="flex items-center gap-4">
            <span className="text-gray-500 text-xs">Desde:</span>
            <select
              value={rangeStart}
              onChange={e => setRangeStart(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
            >
              {weeks.map((w, i) => (
                <option key={w.report.week} value={i}>{w.report.week}</option>
              ))}
            </select>
            <span className="text-gray-500 text-xs">Hasta:</span>
            <select
              value={rangeEnd}
              onChange={e => setRangeEnd(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
            >
              {weeks.map((w, i) => (
                <option key={w.report.week} value={i}>{w.report.week}</option>
              ))}
            </select>
            <span className="text-gray-500 text-xs">{filtered.length} semanas seleccionadas</span>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <span className="text-gray-500 text-xs">Semana A:</span>
            <select
              value={compareA}
              onChange={e => setCompareA(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
            >
              {weeks.map(w => (
                <option key={w.report.week} value={w.report.week}>{w.report.week}</option>
              ))}
            </select>
            <span className="text-gray-500 text-xs">vs Semana B:</span>
            <select
              value={compareB}
              onChange={e => setCompareB(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
            >
              {weeks.map(w => (
                <option key={w.report.week} value={w.report.week}>{w.report.week}</option>
              ))}
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
              No refleja el consumo real de inventario. Próximamente: Costo de Uso (inventario inicial + compras − inventario final).
            </p>
          </div>
        </div>

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
                  <p className="text-gray-600 text-xs mt-1">
                    {fmt(latestData.totalABRaw)} comprado · Ventas A&B: {fmt(latestData.totalABSales)}
                  </p>
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
                  const catSales = {
                    food: latestData.foodSales,
                    beer: latestData.beerSales,
                    liquor: latestData.liquorSales,
                    na_beverage: latestData.naBevSales,
                    wine: latestData.wineSales,
                    general: latestData.netSales,
                  }[cat.key] || latestData.netSales
                  const val = pct(latestData.cat[cat.key], catSales)
                  const overMeta = cat.meta && val && val > cat.meta
                  return (
                    <button
                      key={cat.key}
                      onClick={() => setActiveCategory(cat.key)}
                      className={`rounded-xl p-4 text-left transition border ${activeCategory === cat.key ? 'border-2 bg-gray-800' : 'border-gray-800 bg-gray-900 hover:bg-gray-800'}`}
                      style={{ borderColor: activeCategory === cat.key ? cat.color : undefined }}
                    >
                      <p className="text-gray-500 text-xs mb-1">{cat.label}</p>
                      <p className="text-lg font-bold" style={{ color: cat.color }}>
                        {val ? val + '%' : '—'}
                      </p>
                      <p className="text-gray-600 text-xs">{fmt(latestData.cat[cat.key])}</p>
                      {cat.meta && val && (
                        <p className={`text-xs mt-1 ${overMeta ? 'text-red-400' : 'text-green-400'}`}>
                          {overMeta ? '▲ sobre meta' : '✓ en meta'}
                        </p>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-gray-500 text-xs">Mostrar/ocultar:</span>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => toggleLine(cat.key)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition border ${
                    hiddenLines.includes(cat.key)
                      ? 'border-gray-700 bg-gray-900 text-gray-600'
                      : 'border-gray-700 bg-gray-800 text-white'
                  }`}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: hiddenLines.includes(cat.key) ? '#4b5563' : cat.color }}
                  />
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-1">% {activeCat?.label} — Costo de Compra</h2>
              <p className="text-gray-500 text-xs mb-4">
                {activeCat?.meta ? `Meta recomendada: ${activeCat.meta}%` : 'Tendencia histórica'}
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(v: any) => [v + '%', activeCat?.label]}
                  />
                  <Line type="monotone" dataKey={activeCategory} stroke={activeCat?.color} strokeWidth={2} dot={{ fill: activeCat?.color, r: 4 }} hide={hiddenLines.includes(activeCategory)} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-1">Total A&B % — Costo de Compra por semana</h2>
              <p className="text-gray-500 text-xs mb-4">Haz click en los botones arriba para mostrar/ocultar categorías</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any, name: any) => [v + '%', name]} />
                  {CATEGORIES.map(cat => (
                    <Line
                      key={cat.key}
                      type="monotone"
                      dataKey={cat.key}
                      name={cat.label}
                      stroke={cat.color}
                      strokeWidth={2}
                      dot={false}
                      hide={hiddenLines.includes(cat.key)}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-1">Compras en $ por categoría</h2>
              <p className="text-gray-500 text-xs mb-4">Desglose semanal de compras a proveedores</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any, name: any) => ['$' + Number(v).toLocaleString(), name]} />
                  <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                  {CATEGORIES.map(cat => (
                    <Bar key={cat.key} dataKey={cat.key + '$'} name={cat.label} fill={cat.color} stackId="a" hide={hiddenLines.includes(cat.key)} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Comparativo por semana — Costo de Compra</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Semana</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Food %</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Liquor %</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Beer %</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">NA Bev %</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Total A&B %</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Total $</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...filtered].reverse().map((w) => {
                      const d = buildWeekData(w)
                      return (
                        <tr key={w.report.id} className="border-b border-gray-800 hover:bg-gray-800 transition">
                          <td className="py-3 text-gray-300">{w.report.week}</td>
                          <td className="py-3 text-right text-orange-400">{d.food ? d.food + '%' : '—'}</td>
                          <td className="py-3 text-right text-purple-400">{d.liquor ? d.liquor + '%' : '—'}</td>
                          <td className="py-3 text-right text-yellow-400">{d.beer ? d.beer + '%' : '—'}</td>
                          <td className="py-3 text-right text-cyan-400">{d.na_beverage ? d.na_beverage + '%' : '—'}</td>
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

        {viewMode === 'compare' && weekAData && weekBData && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[{ label: compareA, data: weekAData }, { label: compareB, data: weekBData }].map(({ label, data }) => (
                <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h2 className="text-white font-bold text-lg mb-1">{label}</h2>
                  <p className="text-gray-500 text-xs mb-4">Costo de Compra</p>
                  <div className="space-y-3">
                    {CATEGORIES.map(cat => {
                      const catSales = {
                        food: data.foodSales,
                        beer: data.beerSales,
                        liquor: data.liquorSales,
                        na_beverage: data.naBevSales,
                        wine: data.wineSales,
                        general: data.netSales,
                      }[cat.key] || data.netSales
                      const val = pct(data.cat[cat.key], catSales)
                      const overMeta = cat.meta && val && val > cat.meta
                      return (
                        <div key={cat.key} className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="text-gray-400 text-sm w-24">{cat.label}</span>
                          <div className="flex-1 bg-gray-800 rounded-full h-2">
                            <div
                              className="h-2 rounded-full"
                              style={{ width: `${Math.min(val || 0, 100)}%`, backgroundColor: cat.color }}
                            />
                          </div>
                          <span className="font-medium text-sm w-14 text-right" style={{ color: cat.color }}>
                            {val ? val + '%' : '—'}
                          </span>
                          <span className="text-gray-600 text-xs w-16 text-right">{fmt(data.cat[cat.key])}</span>
                          {cat.meta && val && (
                            <span className={`text-xs w-20 ${overMeta ? 'text-red-400' : 'text-green-400'}`}>
                              {overMeta ? '▲ sobre meta' : '✓ en meta'}
                            </span>
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
                      <span className="text-white font-bold">{fmt(data.total$)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Diferencias {compareA} vs {compareB}</h2>
              <div className="space-y-3">
                {CATEGORIES.map(cat => {
                  const getSales = (d: any) => ({
                    food: d.foodSales, beer: d.beerSales, liquor: d.liquorSales,
                    na_beverage: d.naBevSales, wine: d.wineSales, general: d.netSales,
                  }[cat.key] || d.netSales)
                  const valA = pct(weekAData.cat[cat.key], getSales(weekAData))
                  const valB = pct(weekBData.cat[cat.key], getSales(weekBData))
                  if (!valA && !valB) return null
                  const diff = valA && valB ? parseFloat((valB - valA).toFixed(1)) : null
                  return (
                    <div key={cat.key} className="flex items-center justify-between py-2 border-b border-gray-800">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                        <span className="text-gray-300 text-sm">{cat.label}</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="text-gray-500 text-sm">{valA ? valA + '%' : '—'}</span>
                        <span className="text-gray-600">→</span>
                        <span className="text-gray-300 text-sm">{valB ? valB + '%' : '—'}</span>
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