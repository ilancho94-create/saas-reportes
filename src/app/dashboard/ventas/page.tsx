'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurantId } from '@/lib/use-restaurant'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell
} from 'recharts'

const COLORS = ['#3b82f6', '#a855f7', '#eab308', '#22c55e', '#f97316', '#ec4899', '#06b6d4']

const RANGES = [
  { label: 'Últimas 4 semanas', value: 4 },
  { label: 'Últimas 8 semanas', value: 8 },
  { label: 'Todo', value: 99 },
]

type ViewMode = 'range' | 'single' | 'custom'

export default function VentasPage() {
  const restaurantId = useRestaurantId()
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])
  const [range, setRange] = useState(4)
  const [restaurantName, setRestaurantName] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('range')
  const [selectedWeek, setSelectedWeek] = useState('')
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')

  useEffect(() => {
    if (restaurantId) loadData()
  }, [restaurantId])

  async function loadData() {
    setLoading(true)

    const { data: rest } = await supabase
      .from('restaurants').select('name').eq('id', restaurantId).single()
    setRestaurantName(rest?.name || '')

    const { data: reports } = await supabase
      .from('reports').select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .limit(12)

    if (!reports || reports.length === 0) { setLoading(false); return }

    const weeksData = await Promise.all(reports.map(async (r) => {
      const { data: s } = await supabase
        .from('sales_data').select('*').eq('report_id', r.id).single()
      return { report: r, sales: s }
    }))

    const sorted = weeksData.reverse()
    setWeeks(sorted)
    if (sorted.length > 0) {
      setSelectedWeek(sorted[sorted.length - 1].report.week)
      setRangeFrom(sorted[Math.max(0, sorted.length - 4)].report.week)
      setRangeTo(sorted[sorted.length - 1].report.week)
    }
    setLoading(false)
  }

  function fmt(n: any) {
    if (!n) return '—'
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  // Compute filtered based on viewMode
  const filtered = (() => {
    if (viewMode === 'single') {
      const w = weeks.find(w => w.report.week === selectedWeek)
      return w ? [w] : []
    }
    if (viewMode === 'custom' && rangeFrom && rangeTo) {
      return weeks.filter(w => w.report.week >= rangeFrom && w.report.week <= rangeTo)
    }
    return weeks.slice(-range)
  })()
  const latest = filtered[filtered.length - 1]
  const prev = filtered[filtered.length - 2]

  const chartData = filtered.map(w => ({
    week: w.report.week.replace('2026-', ''),
    ventas: w.sales?.net_sales || 0,
    ordenes: w.sales?.orders || 0,
    guests: w.sales?.guests || 0,
    avgGuest: w.sales?.avg_per_guest || 0,
    avgOrden: w.sales?.avg_per_order || 0,
    descuentos: w.sales?.discounts || 0,
  }))

  const latestCategories = latest?.sales?.categories || []
  const latestRevenueCenters = latest?.sales?.revenue_centers || []

  const salesDiff = latest?.sales?.net_sales && prev?.sales?.net_sales
    ? ((latest.sales.net_sales - prev.sales.net_sales) / prev.sales.net_sales * 100).toFixed(1)
    : null

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando ventas...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">💰 Ventas</h1>
          <p className="text-gray-500 text-xs">{restaurantName} · Análisis de ventas por período</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {RANGES.map(r => (
            <button key={r.value} onClick={() => { setRange(r.value); setViewMode('range') }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                viewMode === 'range' && range === r.value ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}>
              {r.label}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <select value={viewMode === 'single' ? selectedWeek : ''}
            onChange={e => { setSelectedWeek(e.target.value); setViewMode('single') }}
            className={`bg-gray-800 border rounded-lg px-3 py-1.5 text-xs focus:outline-none transition ${
              viewMode === 'single' ? 'border-blue-500 text-white' : 'border-gray-700 text-gray-400'
            }`}>
            <option value="">Semana específica...</option>
            {[...weeks].reverse().map(w => (
              <option key={w.report.week} value={w.report.week}>{w.report.week}</option>
            ))}
          </select>
          <div className="flex items-center gap-1.5">
            <select value={viewMode === 'custom' ? rangeFrom : ''}
              onChange={e => { setRangeFrom(e.target.value); setViewMode('custom') }}
              className={`bg-gray-800 border rounded-lg px-2 py-1.5 text-xs focus:outline-none transition ${
                viewMode === 'custom' ? 'border-blue-500 text-white' : 'border-gray-700 text-gray-400'
              }`}>
              <option value="">Desde...</option>
              {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
            </select>
            <span className="text-gray-600 text-xs">→</span>
            <select value={viewMode === 'custom' ? rangeTo : ''}
              onChange={e => { setRangeTo(e.target.value); setViewMode('custom') }}
              className={`bg-gray-800 border rounded-lg px-2 py-1.5 text-xs focus:outline-none transition ${
                viewMode === 'custom' ? 'border-blue-500 text-white' : 'border-gray-700 text-gray-400'
              }`}>
              <option value="">Hasta...</option>
              {[...weeks].reverse().map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
            </select>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div>
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
            Semana más reciente — {latest?.report?.week} ({latest?.report?.week_start} al {latest?.report?.week_end})
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Ventas Netas</p>
              <p className="text-2xl font-bold text-blue-400">{fmt(latest?.sales?.net_sales)}</p>
              {salesDiff && (
                <p className={`text-xs mt-1 font-medium ${Number(salesDiff) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {Number(salesDiff) >= 0 ? '▲' : '▼'} {Math.abs(Number(salesDiff))}% vs semana anterior
                </p>
              )}
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Órdenes</p>
              <p className="text-2xl font-bold text-white">{latest?.sales?.orders || '—'}</p>
              <p className="text-gray-600 text-xs mt-1">{latest?.sales?.guests} guests</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Avg / Guest</p>
              <p className="text-2xl font-bold text-yellow-400">
                {latest?.sales?.avg_per_guest ? '$' + Number(latest.sales.avg_per_guest).toFixed(2) : '—'}
              </p>
              <p className="text-gray-600 text-xs mt-1">Avg orden: {fmt(latest?.sales?.avg_per_order)}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Descuentos</p>
              <p className="text-2xl font-bold text-red-400">{fmt(latest?.sales?.discounts)}</p>
              <p className="text-gray-600 text-xs mt-1">
                {latest?.sales?.net_sales && latest?.sales?.discounts
                  ? (Number(latest.sales.discounts) / Number(latest.sales.net_sales) * 100).toFixed(1) + '% de ventas'
                  : ''}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-1">Ventas netas por semana</h2>
          <p className="text-gray-500 text-xs mb-4">Últimas {filtered.length} semanas</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Ventas']} />
              <Bar dataKey="ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-1">Avg / Guest por semana</h2>
            <p className="text-gray-500 text-xs mb-4">Tendencia del ticket promedio</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                  formatter={(v: any) => ['$' + Number(v).toFixed(2), 'Avg/Guest']} />
                <Line type="monotone" dataKey="avgGuest" stroke="#eab308" strokeWidth={2} dot={{ fill: '#eab308', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-1">Órdenes y Guests por semana</h2>
            <p className="text-gray-500 text-xs mb-4">Volumen de servicio</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                <Line type="monotone" dataKey="ordenes" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
                <Line type="monotone" dataKey="guests" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-1">Descuentos por semana</h2>
          <p className="text-gray-500 text-xs mb-4">Impacto en ventas</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Descuentos']} />
              <Bar dataKey="descuentos" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {latestCategories.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-1">Ventas por categoría</h2>
              <p className="text-gray-500 text-xs mb-4">{latest?.report?.week}</p>
              <div className="space-y-3">
                {latestCategories.map((cat: any, i: number) => (
                  <div key={cat.name} className="flex items-center gap-3">
                    <span className="text-gray-400 text-sm w-36 truncate">{cat.name}</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-2">
                      <div className="h-2 rounded-full"
                        style={{ width: `${Math.min(Number(cat.pct), 100)}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                    </div>
                    <span className="text-white text-sm font-medium w-20 text-right">{fmt(cat.net)}</span>
                    <span className="text-gray-500 text-xs w-10 text-right">{Number(cat.pct).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {latestRevenueCenters.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-1">Revenue Centers</h2>
              <p className="text-gray-500 text-xs mb-4">{latest?.report?.week}</p>
              <div className="flex gap-6">
                <PieChart width={140} height={140}>
                  <Pie data={latestRevenueCenters} cx={65} cy={65} innerRadius={40} outerRadius={65}
                    dataKey="net" nameKey="name">
                    {latestRevenueCenters.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(v: any) => ['$' + Number(v).toLocaleString()]} />
                </PieChart>
                <div className="flex-1 space-y-2 justify-center flex flex-col">
                  {latestRevenueCenters.map((rc: any, i: number) => (
                    <div key={rc.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span className="text-gray-400 text-xs">{rc.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-white text-xs font-medium">{fmt(rc.net)}</span>
                        <span className="text-gray-600 text-xs ml-2">{Number(rc.pct).toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">Comparativo por semana</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-500 text-xs pb-3 font-medium">Semana</th>
                  <th className="text-right text-gray-500 text-xs pb-3 font-medium">Ventas Netas</th>
                  <th className="text-right text-gray-500 text-xs pb-3 font-medium">Órdenes</th>
                  <th className="text-right text-gray-500 text-xs pb-3 font-medium">Guests</th>
                  <th className="text-right text-gray-500 text-xs pb-3 font-medium">Avg/Guest</th>
                  <th className="text-right text-gray-500 text-xs pb-3 font-medium">Descuentos</th>
                  <th className="text-right text-gray-500 text-xs pb-3 font-medium">vs anterior</th>
                </tr>
              </thead>
              <tbody>
                {[...filtered].reverse().map((w, i) => {
                  const prevW = [...filtered].reverse()[i + 1]
                  const diff = w.sales?.net_sales && prevW?.sales?.net_sales
                    ? ((w.sales.net_sales - prevW.sales.net_sales) / prevW.sales.net_sales * 100).toFixed(1)
                    : null
                  return (
                    <tr key={w.report.id} className="border-b border-gray-800 hover:bg-gray-800 transition">
                      <td className="py-3 text-gray-300">{w.report.week}</td>
                      <td className="py-3 text-right text-white font-medium">{fmt(w.sales?.net_sales)}</td>
                      <td className="py-3 text-right text-gray-400">{w.sales?.orders || '—'}</td>
                      <td className="py-3 text-right text-gray-400">{w.sales?.guests || '—'}</td>
                      <td className="py-3 text-right text-gray-400">
                        {w.sales?.avg_per_guest ? '$' + Number(w.sales.avg_per_guest).toFixed(2) : '—'}
                      </td>
                      <td className="py-3 text-right text-red-400">{fmt(w.sales?.discounts)}</td>
                      <td className="py-3 text-right">
                        {diff ? (
                          <span className={`text-xs font-medium ${Number(diff) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {Number(diff) >= 0 ? '▲' : '▼'} {Math.abs(Number(diff))}%
                          </span>
                        ) : <span className="text-gray-600">—</span>}
                      </td>
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