'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

const RANGES = [
  { label: 'Últimas 4 semanas', value: 4 },
  { label: 'Últimas 8 semanas', value: 8 },
  { label: 'Todo', value: 99 },
]

const CATEGORIES = [
  { key: 'food', label: 'Food', color: '#f97316', meta: 28 },
  { key: 'na_beverage', label: 'NA Beverage', color: '#06b6d4', meta: 8 },
  { key: 'liquor', label: 'Liquor', color: '#a855f7', meta: 20 },
  { key: 'beer', label: 'Beer', color: '#eab308', meta: 20 },
  { key: 'wine', label: 'Wine', color: '#ec4899', meta: 20 },
  { key: 'general', label: 'General', color: '#6b7280', meta: null },
]

export default function FoodCostPage() {
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])
  const [range, setRange] = useState(4)
  const [restaurant, setRestaurant] = useState<any>(null)
  const [mappings, setMappings] = useState<any[]>([])
  const [activeCategory, setActiveCategory] = useState('food')

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
      .from('category_mappings')
      .select('*')
      .eq('restaurant_id', profile.restaurant_id)
    setMappings(maps || [])

    const { data: reports } = await supabase
      .from('reports').select('*')
      .eq('restaurant_id', profile.restaurant_id)
      .order('created_at', { ascending: false })
      .limit(12)

    if (!reports || reports.length === 0) { setLoading(false); return }

    const weeksData = await Promise.all(reports.map(async (r) => {
      const [s, c] = await Promise.all([
        supabase.from('sales_data').select('*').eq('report_id', r.id).single(),
        supabase.from('cogs_data').select('*').eq('report_id', r.id).single(),
      ])
      return { report: r, sales: s.data, cogs: c.data }
    }))

    setWeeks(weeksData.reverse())
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

  const filtered = weeks.slice(-range)
  const latest = filtered[filtered.length - 1]

  const latestCat = latest?.cogs?.by_category || {}
  const latestSales = latest?.sales?.net_sales || 0
  const latestCategories = latest?.sales?.categories || []

  const foodSales = getMappedSales(latestCategories, 'food')
  const beerSales = getMappedSales(latestCategories, 'beer')
  const liquorSales = getMappedSales(latestCategories, 'liquor')
  const naBevSales = getMappedSales(latestCategories, 'na_beverage')
  const wineSales = getMappedSales(latestCategories, 'wine')

  const totalAB = (latestCat.food || 0) + (latestCat.na_beverage || 0) + (latestCat.liquor || 0) + (latestCat.beer || 0) + (latestCat.wine || 0)
  const totalABSales = foodSales + beerSales + liquorSales + naBevSales + wineSales || latestSales
  const totalABPct = pct(totalAB, totalABSales)

  function getCatSales(catKey: string) {
    const map: Record<string, number> = {
      food: foodSales,
      beer: beerSales,
      liquor: liquorSales,
      na_beverage: naBevSales,
      wine: wineSales,
      general: latestSales,
    }
    return map[catKey] || latestSales
  }

  const chartData = filtered.map(w => {
    const sales = w.sales?.net_sales || 0
    const cat = w.cogs?.by_category || {}
    const categories = w.sales?.categories || []

    const wFoodSales = getMappedSales(categories, 'food') || sales
    const wBeerSales = getMappedSales(categories, 'beer') || sales
    const wLiquorSales = getMappedSales(categories, 'liquor') || sales
    const wNaBevSales = getMappedSales(categories, 'na_beverage') || sales
    const wWineSales = getMappedSales(categories, 'wine') || sales
    const wTotalABSales = wFoodSales + wBeerSales + wLiquorSales + wNaBevSales + wWineSales || sales
    const wTotalAB = (cat.food || 0) + (cat.na_beverage || 0) + (cat.liquor || 0) + (cat.beer || 0) + (cat.wine || 0)

    return {
      week: w.report.week.replace('2026-', ''),
      food: pct(cat.food, wFoodSales) || 0,
      na_beverage: pct(cat.na_beverage, wNaBevSales) || 0,
      liquor: pct(cat.liquor, wLiquorSales) || 0,
      beer: pct(cat.beer, wBeerSales) || 0,
      wine: pct(cat.wine, wWineSales) || 0,
      general: pct(cat.general, sales) || 0,
      totalAB: pct(wTotalAB, wTotalABSales) || 0,
      food$: cat.food || 0,
      na_beverage$: cat.na_beverage || 0,
      liquor$: cat.liquor || 0,
      beer$: cat.beer || 0,
      wine$: cat.wine || 0,
      general$: cat.general || 0,
      total$: w.cogs?.total || 0,
    }
  })

  const activeCat = CATEGORIES.find(c => c.key === activeCategory)

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando food cost...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">🛒 Food Cost</h1>
          <p className="text-gray-500 text-xs">{restaurant?.name} · COGS por categoría</p>
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                range === r.value ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        <div>
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
            Semana más reciente — {latest?.report?.week} ({latest?.report?.week_start} al {latest?.report?.week_end})
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 md:col-span-2">
              <p className="text-gray-500 text-xs mb-1">Total A&B (Food + Beverages)</p>
              <p className="text-3xl font-bold text-white">{totalABPct ? totalABPct + '%' : '—'}</p>
              <p className="text-gray-600 text-xs mt-1">{fmt(totalAB)} en compras · Ventas A&B: {fmt(totalABSales)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Total COGS</p>
              <p className="text-2xl font-bold text-orange-400">{fmt(latest?.cogs?.total)}</p>
              <p className="text-gray-600 text-xs mt-1">incluyendo general</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">% COGS Total</p>
              <p className="text-2xl font-bold text-orange-400">
                {pct(latest?.cogs?.total, latestSales) ? pct(latest?.cogs?.total, latestSales) + '%' : '—'}
              </p>
              <p className="text-gray-600 text-xs mt-1">vs ventas netas totales</p>
            </div>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {CATEGORIES.map(cat => {
              const val = pct(latestCat[cat.key], getCatSales(cat.key))
              const overMeta = cat.meta && val && val > cat.meta
              return (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={`rounded-xl p-4 text-left transition border ${
                    activeCategory === cat.key
                      ? 'border-2 bg-gray-800'
                      : 'border-gray-800 bg-gray-900 hover:bg-gray-800'
                  }`}
                  style={{ borderColor: activeCategory === cat.key ? cat.color : undefined }}
                >
                  <p className="text-gray-500 text-xs mb-1">{cat.label}</p>
                  <p className="text-lg font-bold" style={{ color: cat.color }}>
                    {val ? val + '%' : '—'}
                  </p>
                  <p className="text-gray-600 text-xs">{fmt(latestCat[cat.key])}</p>
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

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-1">% {activeCat?.label} por semana</h2>
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
              <Line type="monotone" dataKey={activeCategory} stroke={activeCat?.color} strokeWidth={2} dot={{ fill: activeCat?.color, r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-1">Total A&B % por semana</h2>
          <p className="text-gray-500 text-xs mb-4">Food + NA Beverage + Liquor + Beer + Wine vs ventas mapeadas</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => [v + '%']} />
              <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
              <Line type="monotone" dataKey="food" name="Food" stroke="#f97316" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="liquor" name="Liquor" stroke="#a855f7" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="beer" name="Beer" stroke="#eab308" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="na_beverage" name="NA Bev" stroke="#06b6d4" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-1">COGS en $ por categoría</h2>
          <p className="text-gray-500 text-xs mb-4">Desglose de compras por semana</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any, name: any) => ['$' + Number(v).toLocaleString(), name]} />
              <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
              <Bar dataKey="food$" name="Food" fill="#f97316" stackId="a" />
              <Bar dataKey="na_beverage$" name="NA Bev" fill="#06b6d4" stackId="a" />
              <Bar dataKey="liquor$" name="Liquor" fill="#a855f7" stackId="a" />
              <Bar dataKey="beer$" name="Beer" fill="#eab308" stackId="a" />
              <Bar dataKey="wine$" name="Wine" fill="#ec4899" stackId="a" />
              <Bar dataKey="general$" name="General" fill="#6b7280" stackId="a" radius={[4, 4, 0, 0]} />
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
                  const s = w.sales?.net_sales
                  const cat = w.cogs?.by_category || {}
                  const cats = w.sales?.categories || []
                  const wFood = getMappedSales(cats, 'food') || s
                  const wBeer = getMappedSales(cats, 'beer') || s
                  const wLiquor = getMappedSales(cats, 'liquor') || s
                  const wNaBev = getMappedSales(cats, 'na_beverage') || s
                  const wWine = getMappedSales(cats, 'wine') || s
                  const wTotalABSales = wFood + wBeer + wLiquor + wNaBev + wWine || s
                  const wTotalAB = (cat.food || 0) + (cat.na_beverage || 0) + (cat.liquor || 0) + (cat.beer || 0) + (cat.wine || 0)
                  return (
                    <tr key={w.report.id} className="border-b border-gray-800 hover:bg-gray-800 transition">
                      <td className="py-3 text-gray-300">{w.report.week}</td>
                      <td className="py-3 text-right text-orange-400">{pct(cat.food, wFood) ? pct(cat.food, wFood) + '%' : '—'}</td>
                      <td className="py-3 text-right text-purple-400">{pct(cat.liquor, wLiquor) ? pct(cat.liquor, wLiquor) + '%' : '—'}</td>
                      <td className="py-3 text-right text-yellow-400">{pct(cat.beer, wBeer) ? pct(cat.beer, wBeer) + '%' : '—'}</td>
                      <td className="py-3 text-right text-cyan-400">{pct(cat.na_beverage, wNaBev) ? pct(cat.na_beverage, wNaBev) + '%' : '—'}</td>
                      <td className="py-3 text-right">
                        <span className={`font-medium ${pct(wTotalAB, wTotalABSales) && pct(wTotalAB, wTotalABSales)! > 35 ? 'text-red-400' : 'text-green-400'}`}>
                          {pct(wTotalAB, wTotalABSales) ? pct(wTotalAB, wTotalABSales) + '%' : '—'}
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

      </main>
    </div>
  )
}