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
type Tab = 'resumen' | 'descuentos' | 'voids' | 'detalle'

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
  const [activeTab, setActiveTab] = useState<Tab>('resumen')

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
      .order('week', { ascending: false })
      .limit(52)

    if (!reports || reports.length === 0) { setLoading(false); return }

    const weeksData = await Promise.all(reports.map(async (r) => {
      const [{ data: s }, { data: d }, { data: v }] = await Promise.all([
        supabase.from('sales_data').select('*').eq('report_id', r.id).single(),
        supabase.from('discounts_data').select('*').eq('report_id', r.id).single(),
        supabase.from('voids_data').select('*').eq('report_id', r.id).single(),
      ])
      return { report: r, sales: s, discounts: d, voids: v }
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
    if (n === null || n === undefined || n === '') return '—'
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  function fmtPct(n: any) {
    if (n === null || n === undefined) return '—'
    return Number(n).toFixed(1) + '%'
  }

  // ── Filtered weeks (rango activo) ─────────────────────────────────────────
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

  // ── Rango anterior (mismo número de semanas, inmediatamente antes) ─────────
  const prevRange = (() => {
    if (filtered.length === 0) return []
    const firstIdx = weeks.findIndex(w => w.report.week === filtered[0].report.week)
    const start = Math.max(0, firstIdx - filtered.length)
    return weeks.slice(start, firstIdx)
  })()

  // ── KPIs sumados del rango ─────────────────────────────────────────────────
  function sumRange(arr: any[], field: string) {
    return arr.reduce((acc, w) => acc + (Number(w.sales?.[field]) || 0), 0)
  }
  function sumRangeOrders(arr: any[]) {
    return arr.reduce((acc, w) => acc + (Number(w.sales?.orders) || 0), 0)
  }
  function sumRangeGuests(arr: any[]) {
    return arr.reduce((acc, w) => acc + (Number(w.sales?.guests) || 0), 0)
  }

  const totalVentas = sumRange(filtered, 'net_sales')
  const totalOrdenes = sumRangeOrders(filtered)
  const totalGuests = sumRangeGuests(filtered)
  const totalDescuentos = sumRange(filtered, 'discounts')
  const avgGuest = totalGuests > 0 ? totalVentas / totalGuests : 0

  const prevTotalVentas = sumRange(prevRange, 'net_sales')
  const prevTotalOrdenes = sumRangeOrders(prevRange)
  const prevTotalGuests = sumRangeGuests(prevRange)
  const prevTotalDescuentos = sumRange(prevRange, 'discounts')
  const prevAvgGuest = prevTotalGuests > 0 ? prevTotalVentas / prevTotalGuests : 0

  function diffPct(curr: number, prev: number) {
    if (!prev) return null
    return ((curr - prev) / prev * 100).toFixed(1)
  }

  const diffVentas = diffPct(totalVentas, prevTotalVentas)
  const diffOrdenes = diffPct(totalOrdenes, prevTotalOrdenes)
  const diffGuests = diffPct(totalGuests, prevTotalGuests)
  const diffDescuentos = diffPct(totalDescuentos, prevTotalDescuentos)
  const diffAvgGuest = diffPct(avgGuest, prevAvgGuest)

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartData = filtered.map(w => ({
    week: w.report.week.replace('2026-', ''),
    ventas: w.sales?.net_sales || 0,
    ordenes: w.sales?.orders || 0,
    guests: w.sales?.guests || 0,
    avgGuest: w.sales?.avg_per_guest || 0,
    descuentos: w.sales?.discounts || 0,
  }))

  // ── Latest week para detalles ──────────────────────────────────────────────
  const latest = filtered[filtered.length - 1]
  const latestCategories = latest?.sales?.categories || []
  const latestRevenueCenters = latest?.sales?.revenue_centers || []

  // ── Descuentos: agregar todos los items del rango ─────────────────────────
  const discountItems = (() => {
    const map: Record<string, { name: string; applications: number; orders: number; amount: number }> = {}
    filtered.forEach(w => {
      const items = w.discounts?.items || w.discounts?.raw_data?.items || []
      items.forEach((item: any) => {
        const key = item.name
        if (!map[key]) map[key] = { name: item.name, applications: 0, orders: 0, amount: 0 }
        map[key].applications += Number(item.applications) || 0
        map[key].orders += Number(item.orders) || 0
        map[key].amount += Number(item.amount) || 0
      })
    })
    return Object.values(map).sort((a, b) => b.amount - a.amount)
  })()

  const totalDiscountAmount = discountItems.reduce((s, i) => s + i.amount, 0)

  // ── Voids: agregar todos los items del rango ───────────────────────────────
  const voidsByReason = (() => {
    const map: Record<string, { reason: string; count: number; total: number }> = {}
    filtered.forEach(w => {
      const reasons = w.voids?.raw_data?.by_reason || []
      reasons.forEach((r: any) => {
        if (!map[r.reason]) map[r.reason] = { reason: r.reason, count: 0, total: 0 }
        map[r.reason].count += Number(r.count) || 0
        map[r.reason].total += Number(r.total) || 0
      })
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  })()

  const voidItems = (() => {
    const all: any[] = []
    filtered.forEach(w => {
      const items = w.voids?.items || w.voids?.raw_data?.items || []
      items.forEach((item: any) => all.push(item))
    })
    // Agrupar por servidor
    const map: Record<string, { server: string; count: number; total: number }> = {}
    all.forEach((item: any) => {
      const key = item.server || 'Desconocido'
      if (!map[key]) map[key] = { server: key, count: 0, total: 0 }
      map[key].count += Number(item.quantity) || 1
      map[key].total += Number(item.price) || 0
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  })()

  const totalVoids = filtered.reduce((s, w) => s + (Number(w.voids?.total) || Number(w.voids?.raw_data?.total) || 0), 0)
  const totalVoidItems = filtered.reduce((s, w) => s + (Number(w.voids?.total_items) || Number(w.voids?.raw_data?.total_items) || 0), 0)

  // ── Lunch/Dinner del rango ─────────────────────────────────────────────────
  const lunchDinnerData = filtered.map(w => {
    const ld = w.sales?.lunch_dinner || w.sales?.raw_data?.lunch_dinner || {}
    return {
      week: w.report.week.replace('2026-', ''),
      lunch: ld.lunch?.net || 0,
      dinner: ld.dinner?.net || 0,
    }
  })

  // ── Diff badge ────────────────────────────────────────────────────────────
  function DiffBadge({ diff, invert = false }: { diff: string | null; invert?: boolean }) {
    if (!diff) return null
    const n = Number(diff)
    const positive = invert ? n <= 0 : n >= 0
    return (
      <p className={`text-xs mt-1 font-medium ${positive ? 'text-green-400' : 'text-red-400'}`}>
        {n >= 0 ? '▲' : '▼'} {Math.abs(n)}% vs período anterior
      </p>
    )
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando ventas...</p>
    </div>
  )

  const periodLabel = filtered.length > 1
    ? `${filtered[0]?.report?.week} → ${filtered[filtered.length - 1]?.report?.week}`
    : latest?.report?.week

  return (
    <div className="min-h-screen bg-gray-950">
      {/* ── Header ── */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
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

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* ── KPIs sumados del rango ── */}
        <div>
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
            {filtered.length > 1 ? `Período — ${periodLabel} (${filtered.length} semanas)` : `Semana — ${periodLabel} (${latest?.report?.week_start} al ${latest?.report?.week_end})`}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Ventas Netas</p>
              <p className="text-2xl font-bold text-blue-400">{fmt(totalVentas)}</p>
              <DiffBadge diff={diffVentas} />
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Órdenes</p>
              <p className="text-2xl font-bold text-white">{totalOrdenes || '—'}</p>
              <DiffBadge diff={diffOrdenes} />
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Guests</p>
              <p className="text-2xl font-bold text-purple-400">{totalGuests || '—'}</p>
              <DiffBadge diff={diffGuests} />
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Avg / Guest</p>
              <p className="text-2xl font-bold text-yellow-400">
                {avgGuest ? '$' + avgGuest.toFixed(2) : '—'}
              </p>
              <DiffBadge diff={diffAvgGuest} />
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Descuentos</p>
              <p className="text-2xl font-bold text-red-400">{fmt(totalDescuentos)}</p>
              <p className="text-gray-600 text-xs mt-0.5">
                {totalVentas ? (totalDescuentos / totalVentas * 100).toFixed(1) + '% de ventas' : ''}
              </p>
              <DiffBadge diff={diffDescuentos} invert />
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 border-b border-gray-800">
          {(['resumen', 'descuentos', 'voids', 'detalle'] as Tab[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium capitalize transition border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              {tab === 'resumen' ? '📊 Resumen'
                : tab === 'descuentos' ? '🏷️ Descuentos'
                : tab === 'voids' ? '❌ Voids'
                : '🔍 Detalle'}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════ */}
        {/* TAB: RESUMEN                                               */}
        {/* ══════════════════════════════════════════════════════════ */}
        {activeTab === 'resumen' && (
          <div className="space-y-6">
            {/* Ventas por semana */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-1">Ventas netas por semana</h2>
              <p className="text-gray-500 text-xs mb-4">Últimas {filtered.length} semanas</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Ventas']} />
                  <Bar dataKey="ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Avg/Guest */}
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

              {/* Órdenes y Guests */}
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

            {/* Lunch vs Dinner */}
            {lunchDinnerData.some(d => d.lunch > 0 || d.dinner > 0) && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Lunch vs Dinner por semana</h2>
                <p className="text-gray-500 text-xs mb-4">Distribución de ventas por turno</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={lunchDinnerData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any, name: any) => ['$' + Number(v).toLocaleString(), name]} />
                    <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                    <Bar dataKey="lunch" name="Lunch" fill="#3b82f6" radius={[4, 4, 0, 0]} stackId="a" />
                    <Bar dataKey="dinner" name="Dinner" fill="#a855f7" radius={[0, 0, 0, 0]} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Categorías + Revenue Centers */}
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

            {/* Tabla comparativo semana vs semana */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Comparativo semana vs semana</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Semana</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Ventas Netas</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">vs anterior</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Órdenes</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Guests</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Avg/Guest</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Descuentos</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">% Desc.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...filtered].reverse().map((w, i, arr) => {
                      const prevW = arr[i + 1]
                      const diff = w.sales?.net_sales && prevW?.sales?.net_sales
                        ? ((w.sales.net_sales - prevW.sales.net_sales) / prevW.sales.net_sales * 100).toFixed(1)
                        : null
                      const pctDesc = w.sales?.net_sales && w.sales?.discounts
                        ? (Number(w.sales.discounts) / Number(w.sales.net_sales) * 100).toFixed(1)
                        : null
                      return (
                        <tr key={w.report.id} className="border-b border-gray-800 hover:bg-gray-800 transition">
                          <td className="py-3">
                            <p className="text-gray-300">{w.report.week}</p>
                            <p className="text-gray-600 text-xs">{w.report.week_start} → {w.report.week_end}</p>
                          </td>
                          <td className="py-3 text-right text-white font-semibold">{fmt(w.sales?.net_sales)}</td>
                          <td className="py-3 text-right">
                            {diff ? (
                              <span className={`text-xs font-medium ${Number(diff) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {Number(diff) >= 0 ? '▲' : '▼'} {Math.abs(Number(diff))}%
                              </span>
                            ) : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="py-3 text-right text-gray-400">{w.sales?.orders || '—'}</td>
                          <td className="py-3 text-right text-gray-400">{w.sales?.guests || '—'}</td>
                          <td className="py-3 text-right text-gray-400">
                            {w.sales?.avg_per_guest ? '$' + Number(w.sales.avg_per_guest).toFixed(2) : '—'}
                          </td>
                          <td className="py-3 text-right text-red-400">{fmt(w.sales?.discounts)}</td>
                          <td className="py-3 text-right text-gray-500 text-xs">{pctDesc ? pctDesc + '%' : '—'}</td>
                        </tr>
                      )
                    })}
                    {/* Fila totales */}
                    {filtered.length > 1 && (
                      <tr className="border-t-2 border-gray-700 bg-gray-800">
                        <td className="py-3 text-white font-semibold text-xs uppercase tracking-wider">Total período</td>
                        <td className="py-3 text-right text-blue-400 font-bold">{fmt(totalVentas)}</td>
                        <td className="py-3 text-right">
                          {diffVentas && (
                            <span className={`text-xs font-medium ${Number(diffVentas) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {Number(diffVentas) >= 0 ? '▲' : '▼'} {Math.abs(Number(diffVentas))}% vs per. ant.
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right text-white font-semibold">{totalOrdenes || '—'}</td>
                        <td className="py-3 text-right text-white font-semibold">{totalGuests || '—'}</td>
                        <td className="py-3 text-right text-yellow-400 font-semibold">
                          {avgGuest ? '$' + avgGuest.toFixed(2) : '—'}
                        </td>
                        <td className="py-3 text-right text-red-400 font-semibold">{fmt(totalDescuentos)}</td>
                        <td className="py-3 text-right text-gray-400 text-xs">
                          {totalVentas ? (totalDescuentos / totalVentas * 100).toFixed(1) + '%' : '—'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* TAB: DESCUENTOS                                            */}
        {/* ══════════════════════════════════════════════════════════ */}
        {activeTab === 'descuentos' && (
          <div className="space-y-6">
            {/* KPIs descuentos */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Total Descuentos</p>
                <p className="text-2xl font-bold text-red-400">{fmt(totalDiscountAmount)}</p>
                <p className="text-gray-600 text-xs mt-1">
                  {totalVentas ? (totalDiscountAmount / totalVentas * 100).toFixed(1) + '% de ventas netas' : ''}
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Tipos de descuento</p>
                <p className="text-2xl font-bold text-white">{discountItems.length}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Total aplicaciones</p>
                <p className="text-2xl font-bold text-white">
                  {discountItems.reduce((s, i) => s + i.applications, 0).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Gráfica */}
            {discountItems.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Descuentos por tipo</h2>
                <ResponsiveContainer width="100%" height={Math.max(180, discountItems.length * 36)}>
                  <BarChart data={discountItems} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false}
                      tickFormatter={v => '$' + (v / 1000).toFixed(1) + 'k'} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false}
                      tickLine={false} width={180} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Monto']} />
                    <Bar dataKey="amount" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Tabla ranking */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Ranking de descuentos</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">#</th>
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Tipo</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Monto</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">% de ventas</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Aplicaciones</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Órdenes</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Promedio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discountItems.map((item, i) => (
                      <tr key={item.name} className="border-b border-gray-800 hover:bg-gray-800 transition">
                        <td className="py-3 text-gray-600 text-xs">{i + 1}</td>
                        <td className="py-3 text-gray-300">{item.name}</td>
                        <td className="py-3 text-right text-red-400 font-semibold">{fmt(item.amount)}</td>
                        <td className="py-3 text-right">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            totalVentas && item.amount / totalVentas > 0.03
                              ? 'bg-red-900 text-red-300'
                              : 'bg-gray-800 text-gray-400'
                          }`}>
                            {totalVentas ? (item.amount / totalVentas * 100).toFixed(1) + '%' : '—'}
                          </span>
                        </td>
                        <td className="py-3 text-right text-gray-400">{item.applications.toLocaleString()}</td>
                        <td className="py-3 text-right text-gray-400">{item.orders.toLocaleString()}</td>
                        <td className="py-3 text-right text-gray-400">
                          {item.applications ? fmt(item.amount / item.applications) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Descuentos por semana */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Descuentos por semana</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false}
                    tickFormatter={v => '$' + v} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Descuentos']} />
                  <Bar dataKey="descuentos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* TAB: VOIDS                                                 */}
        {/* ══════════════════════════════════════════════════════════ */}
        {activeTab === 'voids' && (
          <div className="space-y-6">
            {/* KPIs voids */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Total Voids</p>
                <p className="text-2xl font-bold text-orange-400">{fmt(totalVoids)}</p>
                <p className="text-gray-600 text-xs mt-1">
                  {totalVentas ? (totalVoids / totalVentas * 100).toFixed(2) + '% de ventas' : ''}
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Items anulados</p>
                <p className="text-2xl font-bold text-white">{totalVoidItems || '—'}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Razones distintas</p>
                <p className="text-2xl font-bold text-white">{voidsByReason.length}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Por razón */}
              {voidsByReason.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h2 className="text-white font-semibold mb-4">Voids por razón</h2>
                  <div className="space-y-3">
                    {voidsByReason.map((r, i) => (
                      <div key={r.reason} className="flex items-center gap-3">
                        <span className="text-gray-400 text-sm w-40 truncate">{r.reason}</span>
                        <div className="flex-1 bg-gray-800 rounded-full h-2">
                          <div className="h-2 rounded-full"
                            style={{
                              width: `${Math.min((r.total / (voidsByReason[0]?.total || 1)) * 100, 100)}%`,
                              backgroundColor: COLORS[i % COLORS.length]
                            }} />
                        </div>
                        <span className="text-white text-sm font-medium w-20 text-right">{fmt(r.total)}</span>
                        <span className="text-gray-500 text-xs w-12 text-right">{r.count} items</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Por servidor */}
              {voidItems.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h2 className="text-white font-semibold mb-4">Voids por servidor</h2>
                  <div className="space-y-2">
                    {voidItems.slice(0, 10).map((s, i) => (
                      <div key={s.server} className="flex items-center justify-between py-1.5 border-b border-gray-800">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600 text-xs w-4">{i + 1}</span>
                          <span className="text-gray-300 text-sm">{s.server}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-gray-500 text-xs">{s.count} items</span>
                          <span className="text-orange-400 font-semibold text-sm">{fmt(s.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Tabla detalle voids */}
            {voidsByReason.length === 0 && voidItems.length === 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center">
                <p className="text-gray-500">No hay datos de voids para el período seleccionado.</p>
                <p className="text-gray-600 text-xs mt-1">Sube el reporte de Voids desde el wizard.</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════ */}
        {/* TAB: DETALLE                                               */}
        {/* ══════════════════════════════════════════════════════════ */}
        {activeTab === 'detalle' && (
          <div className="space-y-6">
            {filtered.map(w => {
              const s = w.sales
              if (!s) return null
              const ld = s.lunch_dinner || s.raw_data?.lunch_dinner || {}
              const tips = s.tips || s.raw_data?.tips
              const tax = s.tax || s.raw_data?.tax
              const gratuity = s.gratuity || s.raw_data?.gratuity
              const refunds = s.refunds || s.raw_data?.refunds

              return (
                <div key={w.report.id} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-white font-semibold">{w.report.week}</h2>
                      <p className="text-gray-500 text-xs">{w.report.week_start} al {w.report.week_end}</p>
                    </div>
                    <span className="text-blue-400 font-bold text-lg">{fmt(s.net_sales)}</span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                    <div>
                      <p className="text-gray-500 text-xs">Ventas Brutas</p>
                      <p className="text-white font-semibold">{fmt(s.gross_sales)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Órdenes / Guests</p>
                      <p className="text-white font-semibold">{s.orders} / {s.guests}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Avg/Guest · Avg/Orden</p>
                      <p className="text-white font-semibold">
                        {s.avg_per_guest ? '$' + Number(s.avg_per_guest).toFixed(2) : '—'} · {fmt(s.avg_per_order)}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Descuentos</p>
                      <p className="text-red-400 font-semibold">
                        {fmt(s.discounts)}
                        {s.net_sales ? <span className="text-gray-600 text-xs ml-1">({(Number(s.discounts) / Number(s.net_sales) * 100).toFixed(1)}%)</span> : ''}
                      </p>
                    </div>
                    {refunds > 0 && (
                      <div>
                        <p className="text-gray-500 text-xs">Refunds</p>
                        <p className="text-orange-400 font-semibold">{fmt(refunds)}</p>
                      </div>
                    )}
                    {tips > 0 && (
                      <div>
                        <p className="text-gray-500 text-xs">Tips</p>
                        <p className="text-green-400 font-semibold">{fmt(tips)}</p>
                      </div>
                    )}
                    {tax > 0 && (
                      <div>
                        <p className="text-gray-500 text-xs">Impuestos</p>
                        <p className="text-gray-300 font-semibold">{fmt(tax)}</p>
                      </div>
                    )}
                    {gratuity > 0 && (
                      <div>
                        <p className="text-gray-500 text-xs">Gratuity</p>
                        <p className="text-gray-300 font-semibold">{fmt(gratuity)}</p>
                      </div>
                    )}
                  </div>

                  {/* Lunch / Dinner */}
                  {(ld.lunch?.net > 0 || ld.dinner?.net > 0) && (
                    <div className="grid grid-cols-2 gap-4 mb-5 p-4 bg-gray-800 rounded-lg">
                      <div>
                        <p className="text-gray-500 text-xs mb-1">🌞 Lunch</p>
                        <p className="text-white font-semibold">{fmt(ld.lunch?.net)}</p>
                        <p className="text-gray-600 text-xs">{ld.lunch?.orders} órdenes · {fmt(ld.lunch?.discounts)} desc.</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs mb-1">🌙 Dinner</p>
                        <p className="text-white font-semibold">{fmt(ld.dinner?.net)}</p>
                        <p className="text-gray-600 text-xs">{ld.dinner?.orders} órdenes · {fmt(ld.dinner?.discounts)} desc.</p>
                      </div>
                    </div>
                  )}

                  {/* Categorías */}
                  {(s.categories || []).length > 0 && (
                    <div>
                      <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Categorías</p>
                      <div className="space-y-2">
                        {(s.categories || []).map((cat: any, i: number) => (
                          <div key={cat.name} className="flex items-center gap-3">
                            <span className="text-gray-400 text-xs w-36 truncate">{cat.name}</span>
                            <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                              <div className="h-1.5 rounded-full"
                                style={{ width: `${Math.min(Number(cat.pct), 100)}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                            </div>
                            <span className="text-white text-xs font-medium w-20 text-right">{fmt(cat.net)}</span>
                            <span className="text-gray-600 text-xs w-10 text-right">{Number(cat.pct).toFixed(1)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      </main>
    </div>
  )
}