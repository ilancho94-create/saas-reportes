'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, ComposedChart, ReferenceLine, Cell
} from 'recharts'

type Tab = 'resumen' | 'ventas' | 'costos' | 'labor' | 'operaciones'
function trafficLight(value: number | null | undefined, metaGreen: number, metaYellow: number, higherIsBad = true): string {
  if (value === null || value === undefined) return 'gray'
  if (higherIsBad) {
    if (value <= metaGreen) return 'green'
    if (value <= metaYellow) return 'yellow'
    return 'red'
  } else {
    if (value >= metaGreen) return 'green'
    if (value >= metaYellow) return 'yellow'
    return 'red'
  }
}

const LIGHT_COLORS: Record<string, string> = {
  green: 'text-green-400', yellow: 'text-yellow-400', red: 'text-red-400', gray: 'text-gray-500'
}
const LIGHT_BG: Record<string, string> = {
  green: 'bg-green-400', yellow: 'bg-yellow-400', red: 'bg-red-400', gray: 'bg-gray-600'
}

function fmt(n: any): string {
  if (n === null || n === undefined || isNaN(Number(n))) return '—'
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function fmtPct(n: any): string {
  if (n === null || n === undefined || isNaN(Number(n))) return '—'
  return Number(n).toFixed(1) + '%'
}

function safeNum(n: any): number {
  const v = Number(n)
  return isNaN(v) ? 0 : v
}

export default function CeoDashboard() {
  const { currentOrganization } = useAuth()
  const [loading, setLoading] = useState(true)
  const [restaurantsData, setRestaurantsData] = useState<any[]>([])
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<Tab>('resumen')
  const [allWeeks, setAllWeeks] = useState<string[]>([])
  const [selectedWeek, setSelectedWeek] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else loadData()
    })
  }, [currentOrganization])

  async function loadData() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: userRests } = await supabase.from('user_restaurants')
      .select('restaurant_id, role').eq('user_id', user.id)
    if (!userRests?.length) { setLoading(false); return }

    const restIds = userRests.map((r: any) => r.restaurant_id)
    const { data: rests } = await supabase.from('restaurants').select('*').in('id', restIds)
    if (!rests?.length) { setLoading(false); return }

    const allRestData = await Promise.all(rests.map(async (rest: any) => {
      const { data: reports } = await supabase.from('reports').select('*')
        .eq('restaurant_id', rest.id).order('week', { ascending: false }).limit(52)
      if (!reports?.length) return { restaurant: rest, weeks: [] }

      const weeksData = await Promise.all(reports.map(async (r: any) => {
        const [s, l, w, c, v, d, ep, avt] = await Promise.all([
          supabase.from('sales_data').select('*').eq('report_id', r.id).single(),
          supabase.from('labor_data').select('*').eq('report_id', r.id).single(),
          supabase.from('waste_data').select('*').eq('report_id', r.id).single(),
          supabase.from('cogs_data').select('*').eq('report_id', r.id).single(),
          supabase.from('voids_data').select('*').eq('report_id', r.id).single(),
          supabase.from('discounts_data').select('*').eq('report_id', r.id).single(),
          supabase.from('employee_performance_data').select('*').eq('report_id', r.id).single(),
          supabase.from('avt_data').select('*').eq('report_id', r.id).single(),
        ])
        return {
          report: r,
          sales: s.data ?? null, labor: l.data ?? null, waste: w.data ?? null,
          cogs: c.data ?? null, voids: v.data ?? null, discounts: d.data ?? null,
          employee: ep.data ?? null, avt: avt.data ?? null,
        }
      }))
      return { restaurant: rest, weeks: weeksData.reverse() }
    }))

    setRestaurantsData(allRestData)
    const weekSet = new Set<string>()
    allRestData.forEach((r: any) => r.weeks.forEach((w: any) => weekSet.add(w.report.week)))
    const sortedWeeks = Array.from(weekSet).sort().reverse()
    setAllWeeks(sortedWeeks)
    if (sortedWeeks.length > 0) {
      setSelectedWeek(sortedWeeks[0])
    }
    setLoading(false)
  }

  const activeRests = selectedRestaurant === 'all'
    ? restaurantsData
    : restaurantsData.filter((r: any) => r.restaurant.id === selectedRestaurant)

  function getFilteredWeeks(restData: any): any[] {
    const weeks: any[] = restData.weeks
    if (!weeks.length) return []
    return weeks.filter((w: any) => w.report.week === selectedWeek)
  }

  function aggregateRestData(restData: any): any | null {
    const fw = getFilteredWeeks(restData)
    if (!fw.length) return null
    const latest = fw[fw.length - 1]
    const totalSales = fw.reduce((s: number, w: any) => s + safeNum(w.sales?.net_sales), 0)
    const totalLabor = fw.reduce((s: number, w: any) => s + safeNum(w.labor?.total_pay), 0)
    const totalCOGS = fw.reduce((s: number, w: any) => s + safeNum(w.cogs?.total), 0)
    const totalWaste = fw.reduce((s: number, w: any) => s + safeNum(w.waste?.total_cost), 0)
    const totalOrders = fw.reduce((s: number, w: any) => s + safeNum(w.sales?.orders), 0)
    const totalGuests = fw.reduce((s: number, w: any) => s + safeNum(w.sales?.guests), 0)
    const laborPct = totalSales > 0 ? totalLabor / totalSales * 100 : null
    const cogsPct = totalSales > 0 ? totalCOGS / totalSales * 100 : null
    const profit = totalSales - totalLabor - totalCOGS
    const profitPct = totalSales > 0 ? profit / totalSales * 100 : null
    const avgGuest = totalGuests > 0 ? totalSales / totalGuests : null
    return { restaurant: restData.restaurant, latest, fw, totalSales, totalLabor, totalCOGS, totalWaste, totalOrders, totalGuests, laborPct, cogsPct, profit, profitPct, avgGuest }
  }

  const aggregated: any[] = activeRests.map(aggregateRestData).filter(Boolean)

  const combined = aggregated.reduce((acc: any, r: any) => ({
    totalSales: safeNum(acc.totalSales) + safeNum(r.totalSales),
    totalLabor: safeNum(acc.totalLabor) + safeNum(r.totalLabor),
    totalCOGS: safeNum(acc.totalCOGS) + safeNum(r.totalCOGS),
    totalWaste: safeNum(acc.totalWaste) + safeNum(r.totalWaste),
    totalOrders: safeNum(acc.totalOrders) + safeNum(r.totalOrders),
    totalGuests: safeNum(acc.totalGuests) + safeNum(r.totalGuests),
  }), { totalSales: 0, totalLabor: 0, totalCOGS: 0, totalWaste: 0, totalOrders: 0, totalGuests: 0 })

  combined.laborPct = combined.totalSales > 0 ? combined.totalLabor / combined.totalSales * 100 : null
  combined.cogsPct = combined.totalSales > 0 ? combined.totalCOGS / combined.totalSales * 100 : null
  combined.profit = combined.totalSales - combined.totalLabor - combined.totalCOGS
  combined.profitPct = combined.totalSales > 0 ? combined.profit / combined.totalSales * 100 : null
  combined.avgGuest = combined.totalGuests > 0 ? combined.totalSales / combined.totalGuests : null

  // Semana seleccionada + las 11 anteriores para gráficas de tendencia
  const chartWeeks = (() => {
    const idx = allWeeks.indexOf(selectedWeek)
    if (idx === -1) return [...allWeeks].reverse()
    return allWeeks.slice(idx, idx + 12).reverse()
  })()

  const chartData = chartWeeks.map((week: string) => {
    let sales = 0, labor = 0, cogs = 0, waste = 0, guests = 0
    activeRests.forEach((r: any) => {
      const w = r.weeks.find((wk: any) => wk.report.week === week)
      if (w) {
        sales += safeNum(w.sales?.net_sales); labor += safeNum(w.labor?.total_pay)
        cogs += safeNum(w.cogs?.total); waste += safeNum(w.waste?.total_cost)
        guests += safeNum(w.sales?.guests)
      }
    })
    const profit = sales - labor - cogs
    return {
      week: week.replace('2026-', ''),
      ventas: sales > 0 ? sales : null, labor: labor > 0 ? labor : null,
      cogs: cogs > 0 ? cogs : null, profit: sales > 0 ? profit : null,
      waste: waste > 0 ? waste : null,
      laborPct: sales > 0 ? parseFloat((labor / sales * 100).toFixed(1)) : null,
      cogsPct: sales > 0 ? parseFloat((cogs / sales * 100).toFixed(1)) : null,
      profitPct: sales > 0 ? parseFloat((profit / sales * 100).toFixed(1)) : null,
      avgGuest: guests > 0 ? parseFloat((sales / guests).toFixed(2)) : null,
    }
  }).filter((d: any) => d.ventas)

  // ── FIX: semana de detalle = última semana del filtro activo ──────────────
  const detailWeekData = aggregated[0]?.latest  // latest ya es la última del filtro

  const tabs: { id: Tab; label: string }[] = [
    { id: 'resumen', label: '📊 Resumen' }, { id: 'ventas', label: '💰 Ventas' },
    { id: 'costos', label: '💸 Costos' }, { id: 'labor', label: '👥 Labor' },
    { id: 'operaciones', label: '⚙️ Operaciones' },
  ]

  const tooltipStyle = { backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Cargando CEO Dashboard...</p></div>

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h1 className="text-white font-bold text-xl">👑 Dashboard CEO</h1>
            <p className="text-gray-500 text-xs mt-0.5">{currentOrganization?.name || 'Organización'} · Vista ejecutiva</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <select value={selectedRestaurant} onChange={e => setSelectedRestaurant(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500">
              <option value="all">🏢 Todos ({restaurantsData.length})</option>
              {restaurantsData.map((r: any) => <option key={r.restaurant.id} value={r.restaurant.id}>{r.restaurant.name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-gray-500 text-xs">Semana:</span>
          {allWeeks.length > 0 && (
            <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500">
              {allWeeks.map((w: string) => <option key={w} value={w}>{w}</option>)}
            </select>
          )}
          <span className="text-gray-600 text-xs ml-2">Las gráficas muestran hasta la semana seleccionada</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* RESUMEN */}
        {activeTab === 'resumen' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Ventas Netas', icon: '💰', value: fmt(combined.totalSales), sub: `${combined.totalOrders} órdenes`, color: 'text-blue-400', light: null },
                { label: 'Profit', icon: '📈', value: fmt(combined.profit), sub: fmtPct(combined.profitPct) + ' margen', color: safeNum(combined.profit) >= 0 ? 'text-green-400' : 'text-red-400', light: trafficLight(combined.profitPct, 15, 5, false) },
                { label: '% Labor', icon: '👥', value: fmtPct(combined.laborPct), sub: fmt(combined.totalLabor), color: 'text-purple-400', light: trafficLight(combined.laborPct, 28, 33) },
                { label: '% COGS', icon: '🛒', value: fmtPct(combined.cogsPct), sub: fmt(combined.totalCOGS), color: 'text-orange-400', light: trafficLight(combined.cogsPct, 28, 33) },
              ].map((kpi, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-500 text-xs">{kpi.label}</p>
                    <div className="flex items-center gap-2">
                      {kpi.light && <div className={`w-2.5 h-2.5 rounded-full ${LIGHT_BG[kpi.light]}`} />}
                      <span className="text-lg">{kpi.icon}</span>
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-gray-600 text-xs mt-1">{kpi.sub}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Avg / Guest', icon: '🧾', value: combined.avgGuest ? '$' + Number(combined.avgGuest).toFixed(2) : '—', sub: `${combined.totalGuests} comensales`, color: 'text-yellow-400' },
                { label: 'Waste Total', icon: '🗑️', value: fmt(combined.totalWaste), sub: 'merma registrada', color: 'text-red-400' },
                { label: 'Restaurantes', icon: '🏢', value: String(activeRests.length), sub: 'activos en período', color: 'text-white' },
                { label: 'Semanas', icon: '📅', value: String(chartData.length), sub: 'con datos', color: 'text-gray-300' },
              ].map((kpi, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-500 text-xs">{kpi.label}</p>
                    <span className="text-lg">{kpi.icon}</span>
                  </div>
                  <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-gray-600 text-xs mt-1">{kpi.sub}</p>
                </div>
              ))}
            </div>
            {aggregated.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">🚦 Estado por restaurante</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {['Restaurante', 'Ventas', 'Profit', '% Profit', '% Labor', '% COGS', 'Avg/Guest', 'Waste', 'Estado'].map((h, i) => (
                          <th key={i} className={`text-gray-500 text-xs pb-3 font-medium ${i === 0 ? 'text-left' : i === 8 ? 'text-center' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {aggregated.map((r: any, i: number) => {
                        const ll = trafficLight(r.laborPct, 28, 33)
                        const lc = trafficLight(r.cogsPct, 28, 33)
                        const lp = trafficLight(r.profitPct, 15, 5, false)
                        const overall = [ll, lc, lp].includes('red') ? 'red' : [ll, lc, lp].includes('yellow') ? 'yellow' : 'green'
                        return (
                          <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50 transition">
                            <td className="py-3 text-white font-medium">{r.restaurant.name}</td>
                            <td className="py-3 text-right text-white">{fmt(r.totalSales)}</td>
                            <td className={`py-3 text-right font-bold ${safeNum(r.profit) >= 0 ? 'text-green-400' : 'text-red-400'}`}>{fmt(r.profit)}</td>
                            <td className={`py-3 text-right font-bold ${LIGHT_COLORS[lp]}`}>{fmtPct(r.profitPct)}</td>
                            <td className={`py-3 text-right font-bold ${LIGHT_COLORS[ll]}`}>{fmtPct(r.laborPct)}</td>
                            <td className={`py-3 text-right font-bold ${LIGHT_COLORS[lc]}`}>{fmtPct(r.cogsPct)}</td>
                            <td className="py-3 text-right text-gray-400">{r.avgGuest ? '$' + Number(r.avgGuest).toFixed(2) : '—'}</td>
                            <td className="py-3 text-right text-red-400">{fmt(r.totalWaste)}</td>
                            <td className="py-3 text-center"><div className={`w-3 h-3 rounded-full mx-auto ${LIGHT_BG[overall]}`} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-gray-600 text-xs mt-3">🟢 &lt;28% labor/COGS, &gt;15% profit · 🟡 Atención · 🔴 Acción requerida</p>
              </div>
            )}
            {chartData.length > 1 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Ventas, Labor y COGS — tendencia</h2>
                <p className="text-gray-500 text-xs mb-4">Barras = ventas · Líneas = % costos</p>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => '$' + (v / 1000).toFixed(0) + 'k'} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v + '%'} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmt(safeNum(v)), '']} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="ventas" name="Ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} opacity={0.7} />
                    <Line yAxisId="right" type="monotone" dataKey="laborPct" name="% Labor" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 3 }} connectNulls />
                    <Line yAxisId="right" type="monotone" dataKey="cogsPct" name="% COGS" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 3 }} connectNulls />
                    <Line yAxisId="right" type="monotone" dataKey="profitPct" name="% Profit" stroke="#22c55e" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#22c55e', r: 3 }} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            {aggregated.length > 1 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h2 className="text-white font-semibold mb-4">Ventas por restaurante</h2>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={aggregated.map((r: any) => ({ name: r.restaurant.name.split(' ')[0], ventas: r.totalSales }))}>
                      <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => '$' + (v / 1000).toFixed(0) + 'k'} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmt(v), 'Ventas']} />
                      <Bar dataKey="ventas" radius={[4, 4, 0, 0]}>
                        {aggregated.map((_: any, i: number) => <Cell key={i} fill={['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444'][i % 5]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h2 className="text-white font-semibold mb-4">% Profit por restaurante</h2>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={aggregated.map((r: any) => ({ name: r.restaurant.name.split(' ')[0], profit: r.profitPct }))}>
                      <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v + '%'} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmtPct(v), '% Profit']} />
                      <ReferenceLine y={0} stroke="#374151" />
                      <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                        {aggregated.map((r: any, i: number) => <Cell key={i} fill={safeNum(r.profitPct) >= 15 ? '#22c55e' : safeNum(r.profitPct) >= 5 ? '#f59e0b' : '#ef4444'} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}

        {/* VENTAS */}
        {activeTab === 'ventas' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Ventas Netas', value: fmt(combined.totalSales), sub: `${combined.totalOrders} órdenes`, color: 'text-blue-400' },
                { label: 'Ventas Brutas', value: fmt(aggregated.reduce((s: number, r: any) => s + safeNum(r.latest?.sales?.gross_sales), 0)), sub: 'incluye tax y tips', color: 'text-white' },
                { label: 'Avg / Guest', value: combined.avgGuest ? '$' + Number(combined.avgGuest).toFixed(2) : '—', sub: `${combined.totalGuests} comensales`, color: 'text-yellow-400' },
                { label: 'Órdenes', value: String(combined.totalOrders || 0), sub: 'total período', color: 'text-green-400' },
              ].map((kpi, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-gray-500 text-xs mb-1">{kpi.label}</p>
                  <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-gray-600 text-xs mt-1">{kpi.sub}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Ventas netas por semana</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => '$' + (v / 1000).toFixed(0) + 'k'} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmt(v), 'Ventas']} />
                    <Bar dataKey="ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Avg / Guest por semana</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => '$' + v} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => ['$' + Number(v).toFixed(2), 'Avg/Guest']} />
                    <Line type="monotone" dataKey="avgGuest" stroke="#eab308" strokeWidth={2} dot={{ fill: '#eab308', r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            {aggregated[0]?.latest?.sales?.categories && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Ventas por categoría — {aggregated[0]?.latest?.report?.week}</h2>
                <div className="space-y-3">
                  {(aggregated[0].latest.sales.categories as any[]).map((cat: any) => (
                    <div key={cat.name} className="flex items-center gap-4">
                      <span className="text-gray-400 text-sm w-40 truncate">{cat.name}</span>
                      <div className="flex-1 bg-gray-800 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(safeNum(cat.pct), 100)}%` }} />
                      </div>
                      <span className="text-white text-sm font-medium w-24 text-right">{fmt(cat.net)}</span>
                      <span className="text-gray-500 text-xs w-12 text-right">{safeNum(cat.pct).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {aggregated[0]?.latest?.sales?.lunch_dinner && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-gray-500 text-xs mb-3">🌞 Lunch</p>
                  <p className="text-white text-2xl font-bold">{aggregated[0].latest.sales.lunch_dinner?.lunch?.orders || '—'} órdenes</p>
                  <p className="text-gray-400 text-sm mt-1">{fmt(aggregated[0].latest.sales.lunch_dinner?.lunch?.net)}</p>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <p className="text-gray-500 text-xs mb-3">🌙 Dinner</p>
                  <p className="text-white text-2xl font-bold">{aggregated[0].latest.sales.lunch_dinner?.dinner?.orders || '—'} órdenes</p>
                  <p className="text-gray-400 text-sm mt-1">{fmt(aggregated[0].latest.sales.lunch_dinner?.dinner?.net)}</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* COSTOS */}
        {activeTab === 'costos' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Profit Total', value: fmt(combined.profit), sub: fmtPct(combined.profitPct) + ' margen', color: safeNum(combined.profit) >= 0 ? 'text-green-400' : 'text-red-400', light: trafficLight(combined.profitPct, 15, 5, false) },
                { label: 'COGS Total', value: fmt(combined.totalCOGS), sub: fmtPct(combined.cogsPct) + ' de ventas', color: 'text-orange-400', light: trafficLight(combined.cogsPct, 28, 33) },
                { label: 'Labor Total', value: fmt(combined.totalLabor), sub: fmtPct(combined.laborPct) + ' de ventas', color: 'text-purple-400', light: trafficLight(combined.laborPct, 28, 33) },
                { label: 'Waste Total', value: fmt(combined.totalWaste), sub: 'merma del período', color: 'text-red-400', light: null },
              ].map((kpi, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-500 text-xs">{kpi.label}</p>
                    {kpi.light && <div className={`w-2.5 h-2.5 rounded-full ${LIGHT_BG[kpi.light]}`} />}
                  </div>
                  <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-gray-600 text-xs mt-1">{kpi.sub}</p>
                </div>
              ))}
            </div>
            {chartData.length > 1 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Profit semanal</h2>
                <p className="text-gray-500 text-xs mb-4">Verde = ganancia · Rojo = pérdida</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => '$' + (v / 1000).toFixed(0) + 'k'} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmt(v), 'Profit']} />
                    <ReferenceLine y={0} stroke="#374151" />
                    <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                      {chartData.map((d: any, i: number) => <Cell key={i} fill={safeNum(d.profit) >= 0 ? '#22c55e' : '#ef4444'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {chartData.length > 1 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">% Costos por semana</h2>
                <p className="text-gray-500 text-xs mb-4">Labor + COGS + Profit %</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v + '%'} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v + '%', '']} />
                    <Legend />
                    <Line type="monotone" dataKey="laborPct" name="% Labor" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="cogsPct" name="% COGS" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="profitPct" name="% Profit" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            {aggregated[0]?.latest?.cogs?.by_category && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">COGS por categoría — {aggregated[0]?.latest?.report?.week}</h2>
                <div className="space-y-3">
                  {Object.entries(aggregated[0].latest.cogs.by_category as Record<string, unknown>).map(([cat, val]) => {
                    const amount = safeNum(val)
                    const netSales = safeNum(aggregated[0].latest?.sales?.net_sales)
                    const pct = netSales > 0 ? (amount / netSales * 100) : 0
                    return (
                      <div key={cat} className="flex items-center gap-4">
                        <span className="text-gray-400 text-sm w-32 capitalize">{cat}</span>
                        <div className="flex-1 bg-gray-800 rounded-full h-2">
                          <div className="bg-orange-500 h-2 rounded-full" style={{ width: `${Math.min(pct * 3, 100)}%` }} />
                        </div>
                        <span className="text-white text-sm font-medium w-24 text-right">{fmt(amount)}</span>
                        <span className="text-gray-500 text-xs w-12 text-right">{pct.toFixed(1)}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* LABOR */}
        {activeTab === 'labor' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: '% Labor', value: fmtPct(combined.laborPct), sub: 'del total de ventas', color: 'text-purple-400', light: trafficLight(combined.laborPct, 28, 33) },
                { label: 'Costo Labor', value: fmt(combined.totalLabor), sub: 'período seleccionado', color: 'text-white', light: null },
                { label: 'Horas Reg.', value: aggregated.reduce((s: number, r: any) => s + safeNum(r.latest?.labor?.total_hours), 0).toFixed(0) + 'h', sub: 'semana más reciente', color: 'text-blue-400', light: null },
                { label: 'Horas OT', value: aggregated.reduce((s: number, r: any) => s + safeNum(r.latest?.labor?.total_ot_hours), 0).toFixed(1) + 'h', sub: 'overtime', color: 'text-amber-400', light: null },
              ].map((kpi, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-500 text-xs">{kpi.label}</p>
                    {kpi.light && <div className={`w-2.5 h-2.5 rounded-full ${LIGHT_BG[kpi.light]}`} />}
                  </div>
                  <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-gray-600 text-xs mt-1">{kpi.sub}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">% Labor por semana</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v + '%'} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [v + '%', '% Labor']} />
                    <ReferenceLine y={28} stroke="#22c55e" strokeDasharray="4 4" />
                    <ReferenceLine y={33} stroke="#ef4444" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="laborPct" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Costo labor por semana</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => '$' + (v / 1000).toFixed(0) + 'k'} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmt(v), 'Labor']} />
                    <Bar dataKey="labor" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* FIX: Labor por puesto usa latest que ya es la semana filtrada */}
            {aggregated[0]?.latest?.labor?.by_position && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Labor por puesto — {aggregated[0]?.latest?.report?.week}</h2>
                <div className="space-y-2">
                  {(aggregated[0].latest.labor.by_position as any[]).map((pos: any, i: number) => {
                    const totalPay = safeNum(aggregated[0].latest.labor.total_pay)
                    return (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800">
                        <span className="text-gray-300 text-sm">{pos.position}</span>
                        <div className="flex items-center gap-6">
                          <span className="text-gray-500 text-xs">{safeNum(pos.regular_hours).toFixed(0)}h reg</span>
                          {safeNum(pos.ot_hours) > 0 && <span className="text-amber-400 text-xs">{safeNum(pos.ot_hours).toFixed(1)}h OT</span>}
                          <span className="text-white font-medium">{fmt(pos.total_pay)}</span>
                          <span className="text-gray-500 text-xs w-10 text-right">{totalPay > 0 ? (safeNum(pos.total_pay) / totalPay * 100).toFixed(1) : 0}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* OPERACIONES */}
        {activeTab === 'operaciones' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-white font-semibold">🗑️ Waste / Merma</h2>
                  <span className="text-red-400 font-bold">{fmt(combined.totalWaste)}</span>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [fmt(v), 'Waste']} />
                    <Bar dataKey="waste" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">📊 Actual vs Teórico</h2>
                {aggregated.map((r: any, i: number) => {
                  const a = r.latest?.avt
                  if (!a) return <p key={i} className="text-gray-500 text-sm">Sin datos AvT — {r.restaurant.name}</p>
                  return (
                    <div key={i} className="mb-3 pb-3 border-b border-gray-800 last:border-0">
                      <p className="text-gray-400 text-xs mb-2 font-medium">{r.restaurant.name}</p>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Faltantes</span><span className="text-red-400">{fmt(a.total_shortage_dollar)}</span></div>
                      <div className="flex justify-between text-sm mt-1"><span className="text-gray-500">Sobrantes</span><span className="text-green-400">{fmt(a.total_overage_dollar)}</span></div>
                      <div className="flex justify-between text-sm mt-1"><span className="text-gray-500">Neto</span><span className={safeNum(a.net_variance) > 0 ? 'text-red-400 font-bold' : 'text-green-400 font-bold'}>{fmt(a.net_variance)}</span></div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* FIX: Employee performers usa latest que ya es la semana filtrada */}
            {aggregated.some((r: any) => (r.latest?.employee?.employees?.length ?? 0) > 0) && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">🏆 Top Employee Performers — {aggregated[0]?.latest?.report?.week}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {['Empleado', 'Restaurante', 'Ventas', '$/Hora', '$/Comensal', 'Ticket Prom.'].map((h, i) => (
                          <th key={i} className={`text-gray-500 text-xs pb-3 font-medium ${i <= 1 ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {aggregated.flatMap((r: any) =>
                        ((r.latest?.employee?.employees ?? []) as any[])
                          .filter((e: any) => safeNum(e.net_sales) > 0 && safeNum(e.total_labor_hours) > 0)
                          .map((e: any) => ({ ...e, restaurantName: r.restaurant.name }))
                      ).sort((a: any, b: any) => safeNum(b.net_sales_per_hour) - safeNum(a.net_sales_per_hour))
                        .slice(0, 8)
                        .map((e: any, i: number) => (
                          <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                            <td className="py-2.5 text-white font-medium">{i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}{e.name}</td>
                            <td className="py-2.5 text-gray-500 text-xs">{e.restaurantName}</td>
                            <td className="py-2.5 text-right text-white">{fmt(e.net_sales)}</td>
                            <td className="py-2.5 text-right text-blue-400">${safeNum(e.net_sales_per_hour).toFixed(2)}</td>
                            <td className="py-2.5 text-right text-green-400">${safeNum(e.avg_net_sales_per_guest).toFixed(2)}</td>
                            <td className="py-2.5 text-right text-purple-400">${safeNum(e.avg_order_value).toFixed(2)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* FIX: Voids y Discounts usan latest que ya es la semana filtrada */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {aggregated[0]?.latest?.voids && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-white font-semibold">❌ Top Voids — {aggregated[0]?.latest?.report?.week}</h2>
                    <span className="text-red-400 font-bold">{fmt(aggregated[0].latest.voids?.total)}</span>
                  </div>
                  {((aggregated[0].latest.voids?.items ?? []) as any[]).slice(0, 5).map((item: any, i: number) => (
                    <div key={i} className="flex justify-between py-2 border-b border-gray-800">
                      <div><p className="text-gray-300 text-sm">{item.item_name}</p><p className="text-gray-600 text-xs">{item.reason}</p></div>
                      <span className="text-red-400 text-sm">${safeNum(item.price).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
              {aggregated[0]?.latest?.discounts && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-white font-semibold">🏷️ Top Descuentos — {aggregated[0]?.latest?.report?.week}</h2>
                    <span className="text-orange-400 font-bold">{fmt(aggregated[0].latest.discounts?.total)}</span>
                  </div>
                  {((aggregated[0].latest.discounts?.items ?? []) as any[]).slice(0, 5).map((item: any, i: number) => (
                    <div key={i} className="flex justify-between py-2 border-b border-gray-800">
                      <div><p className="text-gray-300 text-sm">{item.name}</p><p className="text-gray-600 text-xs">{item.applications} aplicaciones</p></div>
                      <span className="text-orange-400 text-sm">{fmt(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}