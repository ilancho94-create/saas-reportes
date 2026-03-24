'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, ComposedChart, Area
} from 'recharts'

export default function CeoDashboard() {
  const [loading, setLoading] = useState(true)
  const [restaurant, setRestaurant] = useState<any>(null)
  const [weeks, setWeeks] = useState<any[]>([])
  const [latest, setLatest] = useState<any>(null)
  const [prev, setPrev] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('overview')

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

    const { data: reports } = await supabase
      .from('reports').select('*').eq('restaurant_id', profile.restaurant_id)
      .order('created_at', { ascending: false }).limit(8)

    if (!reports || reports.length === 0) { setLoading(false); return }

    const weeksData = await Promise.all(reports.map(async (r) => {
      const [s, l, w, c, a, v, d] = await Promise.all([
        supabase.from('sales_data').select('*').eq('report_id', r.id).single(),
        supabase.from('labor_data').select('*').eq('report_id', r.id).single(),
        supabase.from('waste_data').select('*').eq('report_id', r.id).single(),
        supabase.from('cogs_data').select('*').eq('report_id', r.id).single(),
        supabase.from('avt_data').select('*').eq('report_id', r.id).single(),
        supabase.from('voids_data').select('*').eq('report_id', r.id).single(),
        supabase.from('discounts_data').select('*').eq('report_id', r.id).single(),
      ])
      return { report: r, sales: s.data, labor: l.data, waste: w.data, cogs: c.data, avt: a.data, voids: v.data, discounts: d.data }
    }))

    const sorted = weeksData.reverse()
    setWeeks(sorted)
    setLatest(sorted[sorted.length - 1])
    setPrev(sorted[sorted.length - 2] || null)
    setLoading(false)
  }

  function fmt(n: any) {
    if (n === null || n === undefined) return '—'
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  function pct(part: any, total: any) {
    if (!part || !total) return null
    return Number((Number(part) / Number(total) * 100).toFixed(1))
  }

  function delta(curr: any, prev: any) {
    if (curr === null || curr === undefined || prev === null || prev === undefined) return null
    return Number(curr) - Number(prev)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  )

  const s = latest?.sales
  const l = latest?.labor
  const w = latest?.waste
  const c = latest?.cogs
  const a = latest?.avt
  const v = latest?.voids
  const d = latest?.discounts

  const ps = prev?.sales
  const pl = prev?.labor

  const laborPct = pct(l?.total_pay, s?.net_sales)
  const prevLaborPct = pct(pl?.total_pay, ps?.net_sales)
  // Food cost = solo categoría food del COGS
  const foodCost = c?.by_category?.food || null
  const foodCostPct = pct(foodCost, s?.net_sales)

  const chartData = weeks.map(wk => ({
    week: wk.report.week.replace('2026-', ''),
    ventas: wk.sales?.net_sales || 0,
    laborPct: pct(wk.labor?.total_pay, wk.sales?.net_sales) || 0,
    foodCostPct: pct(wk.cogs?.by_category?.food, wk.sales?.net_sales) || 0,
    avgGuest: Number(wk.sales?.avg_per_guest || 0),
    waste: wk.waste?.total_cost || 0,
    labor: wk.labor?.total_pay || 0,
  }))

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'financiero', label: 'Financiero' },
    { id: 'labor', label: 'Labor' },
    { id: 'operaciones', label: 'Operaciones' },
  ]

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <button onClick={() => window.location.href = '/dashboard'} className="text-gray-400 hover:text-white text-sm">← Dashboard</button>
            <div>
              <h1 className="text-white font-bold text-lg">Dashboard CEO</h1>
              <p className="text-gray-500 text-xs">{restaurant?.name} · {restaurant?.organizations?.name}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-xs">Última semana</p>
            <p className="text-white font-semibold">{latest?.report?.week}</p>
            <p className="text-gray-500 text-xs">{latest?.report?.week_start} al {latest?.report?.week_end}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">

        {/* ===== OVERVIEW ===== */}
        {activeTab === 'overview' && (
          <>
            {/* KPIs principales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: 'Ventas Netas', icon: '💰',
                  value: fmt(s?.net_sales),
                  sub: `${s?.orders || 0} órdenes · ${s?.guests || 0} guests`,
                  d: delta(s?.net_sales, ps?.net_sales),
                  good: true, prefix: '$'
                },
                {
                  label: '% Labor Cost', icon: '👥',
                  value: laborPct !== null ? laborPct + '%' : '—',
                  sub: `${fmt(l?.total_pay)} total`,
                  d: prevLaborPct !== null && laborPct !== null ? laborPct - prevLaborPct : null,
                  good: false, prefix: ''
                },
                {
                  label: 'Avg / Guest', icon: '🧾',
                  value: s?.avg_per_guest ? '$' + Number(s.avg_per_guest).toFixed(2) : '—',
                  sub: `Avg orden: ${fmt(s?.avg_per_order)}`,
                  d: delta(s?.avg_per_guest, ps?.avg_per_guest),
                  good: true, prefix: '$'
                },
                {
                  label: 'Waste', icon: '🗑️',
                  value: fmt(w?.total_cost),
                  sub: `${w?.items?.length || 0} items`,
                  d: delta(w?.total_cost, prev?.waste?.total_cost),
                  good: false, prefix: '$'
                },
              ].map((kpi, i) => {
                const isUp = kpi.d !== null ? kpi.d > 0 : null
                const isGood = kpi.good ? isUp : (isUp === null ? null : !isUp)
                return (
                  <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-gray-500 text-xs">{kpi.label}</p>
                      <span className="text-lg">{kpi.icon}</span>
                    </div>
                    <p className="text-2xl font-bold text-white">{kpi.value}</p>
                    <p className="text-gray-600 text-xs mt-1">{kpi.sub}</p>
                    {kpi.d !== null && (
                      <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${isGood ? 'text-green-400' : 'text-red-400'}`}>
                        <span>{kpi.d > 0 ? '▲' : '▼'}</span>
                        <span>{kpi.prefix}{Math.abs(kpi.d).toLocaleString('en-US', { maximumFractionDigits: 1 })} vs anterior</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* KPIs secundarios */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-500 text-xs">% Food Cost</p>
                  <span className="text-lg">🛒</span>
                </div>
                <p className="text-2xl font-bold text-orange-400">{foodCostPct !== null ? foodCostPct + '%' : '—'}</p>
                <p className="text-gray-600 text-xs mt-1">{fmt(foodCost)} en food</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-500 text-xs">OT Hours</p>
                  <span className="text-lg">⏰</span>
                </div>
                <p className="text-2xl font-bold text-amber-400">{l?.total_ot_hours ? Number(l.total_ot_hours).toFixed(1) + 'h' : '—'}</p>
                <p className="text-gray-600 text-xs mt-1">{l?.total_hours?.toFixed(0)}h regulares</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-500 text-xs">AvT Neto</p>
                  <span className="text-lg">📊</span>
                </div>
                <p className={`text-2xl font-bold ${a?.net_variance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {a ? fmt(a.net_variance) : '—'}
                </p>
                <p className="text-gray-600 text-xs mt-1">{a ? `Faltantes: ${fmt(a.total_shortages)}` : 'Sin datos'}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-500 text-xs">Descuentos</p>
                  <span className="text-lg">🏷️</span>
                </div>
                <p className="text-2xl font-bold text-yellow-400">{fmt(d?.total)}</p>
                <p className="text-gray-600 text-xs mt-1">Voids: {fmt(v?.total)}</p>
              </div>
            </div>

            {/* Gráfica combinada ventas + costos */}
            {chartData.length > 1 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Ventas & Costos — últimas semanas</h2>
                <p className="text-gray-500 text-xs mb-4">Barras = ventas netas · Líneas = % Labor y % Food Cost</p>
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any, name: string) => {
                        if (name === 'ventas') return ['$' + Number(v).toLocaleString(), 'Ventas']
                        if (name === 'laborPct') return [v + '%', '% Labor']
                        if (name === 'foodCostPct') return [v + '%', '% Food Cost']
                        return [v, name]
                      }}
                    />
                    <Legend formatter={(v) => v === 'ventas' ? 'Ventas' : v === 'laborPct' ? '% Labor' : '% Food Cost'} />
                    <Bar yAxisId="left" dataKey="ventas" fill="#3b82f6" radius={[4,4,0,0]} opacity={0.8} />
                    <Line yAxisId="right" type="monotone" dataKey="laborPct" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 4 }} />
                    <Line yAxisId="right" type="monotone" dataKey="foodCostPct" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 4 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Lunch vs Dinner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-3">🌞 Lunch</p>
                <p className="text-white text-2xl font-bold">{s?.raw_data?.lunch?.orders || '—'} órdenes</p>
                <p className="text-gray-400 text-sm mt-1">{fmt(s?.raw_data?.lunch?.net)}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-3">🌙 Dinner</p>
                <p className="text-white text-2xl font-bold">{s?.raw_data?.dinner?.orders || '—'} órdenes</p>
                <p className="text-gray-400 text-sm mt-1">{fmt(s?.raw_data?.dinner?.net)}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-3">💵 Otros</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Tips</span>
                    <span className="text-white">{fmt(s?.raw_data?.tips)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Impuestos</span>
                    <span className="text-white">{fmt(s?.raw_data?.tax)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Ventas brutas</span>
                    <span className="text-white">{fmt(s?.gross_sales)}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ===== FINANCIERO ===== */}
        {activeTab === 'financiero' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Ventas netas por semana</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Ventas']} />
                    <Bar dataKey="ventas" fill="#3b82f6" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Avg / Guest por semana</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => ['$' + Number(v).toFixed(2), 'Avg/Guest']} />
                    <Line type="monotone" dataKey="avgGuest" stroke="#eab308" strokeWidth={2} dot={{ fill: '#eab308', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            {/* Categorías de ventas */}
            {s?.categories && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Ventas por categoría — {latest?.report?.week}</h2>
                <div className="space-y-3">
                  {s.categories.map((cat: any) => (
                    <div key={cat.name} className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm w-40">{cat.name}</span>
                      <div className="flex-1 mx-4 bg-gray-800 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(Number(cat.pct), 100)}%` }} />
                      </div>
                      <span className="text-white text-sm font-medium w-20 text-right">{fmt(cat.net)}</span>
                      <span className="text-gray-500 text-xs w-12 text-right">{Number(cat.pct).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== LABOR ===== */}
        {activeTab === 'labor' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">% Labor Cost por semana</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => [v + '%', '% Labor']} />
                    <Line type="monotone" dataKey="laborPct" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Costo labor por semana</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Labor']} />
                    <Bar dataKey="labor" fill="#a855f7" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {l?.by_position && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Labor por puesto — {latest?.report?.week}</h2>
                <div className="space-y-3">
                  {l.by_position.map((pos: any) => (
                    <div key={pos.position} className="flex items-center justify-between py-2 border-b border-gray-800">
                      <span className="text-gray-300 text-sm">{pos.position}</span>
                      <div className="flex items-center gap-6">
                        <span className="text-gray-500 text-xs">{Number(pos.regular_hours).toFixed(0)}h reg</span>
                        {pos.ot_hours > 0 && <span className="text-amber-400 text-xs">{Number(pos.ot_hours).toFixed(1)}h OT</span>}
                        <span className="text-white font-medium">{fmt(pos.total_pay)}</span>
                        <span className="text-gray-500 text-xs w-12 text-right">{pct(pos.total_pay, l.total_pay)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ===== OPERACIONES ===== */}
        {activeTab === 'operaciones' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Waste */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-white font-semibold">Waste / Merma</h2>
                  <span className="text-green-400 font-bold">{fmt(w?.total_cost)}</span>
                </div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Waste']} />
                    <Bar dataKey="waste" fill="#22c55e" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* AvT */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Actual vs Teórico</h2>
                {a ? (
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-sm">Faltantes</span>
                      <span className="text-red-400 font-medium">{fmt(a.total_shortages)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-sm">Sobrantes</span>
                      <span className="text-green-400 font-medium">{fmt(a.total_overages)}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-800 pt-3">
                      <span className="text-gray-300 text-sm font-medium">Neto</span>
                      <span className={`font-bold ${a.net_variance > 0 ? 'text-red-400' : 'text-green-400'}`}>{fmt(a.net_variance)}</span>
                    </div>
                  </div>
                ) : <p className="text-gray-500 text-sm">Sin datos de AvT</p>}
              </div>
            </div>
            {/* Voids + Descuentos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-white font-semibold">Top Voids</h2>
                  <span className="text-red-400 font-bold">{fmt(v?.total)}</span>
                </div>
                {v?.items?.slice(0, 5).map((item: any, i: number) => (
                  <div key={i} className="flex justify-between py-2 border-b border-gray-800">
                    <div>
                      <p className="text-gray-300 text-sm">{item.item_name}</p>
                      <p className="text-gray-600 text-xs">{item.reason}</p>
                    </div>
                    <span className="text-red-400 text-sm">${Number(item.price).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-white font-semibold">Top Descuentos</h2>
                  <span className="text-orange-400 font-bold">{fmt(d?.total)}</span>
                </div>
                {d?.items?.slice(0, 5).map((item: any, i: number) => (
                  <div key={i} className="flex justify-between py-2 border-b border-gray-800">
                    <div>
                      <p className="text-gray-300 text-sm">{item.name}</p>
                      <p className="text-gray-600 text-xs">{item.applications} aplicaciones</p>
                    </div>
                    <span className="text-orange-400 text-sm">{fmt(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

      </main>
    </div>
  )
}