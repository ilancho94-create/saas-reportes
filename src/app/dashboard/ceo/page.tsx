'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

export default function CeoDashboard() {
  const [loading, setLoading] = useState(true)
  const [restaurant, setRestaurant] = useState<any>(null)
  const [weeks, setWeeks] = useState<any[]>([])
  const [latest, setLatest] = useState<any>(null)
  const [prev, setPrev] = useState<any>(null)

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
      .from('profiles')
      .select('restaurant_id')
      .eq('id', user.id)
      .single()

    if (!profile?.restaurant_id) { setLoading(false); return }

    const { data: rest } = await supabase
      .from('restaurants')
      .select('*, organizations(name)')
      .eq('id', profile.restaurant_id)
      .single()
    setRestaurant(rest)

    const { data: reports } = await supabase
      .from('reports')
      .select('*')
      .eq('restaurant_id', profile.restaurant_id)
      .order('created_at', { ascending: false })
      .limit(8)

    if (!reports || reports.length === 0) { setLoading(false); return }

    // Cargar todos los datos de cada semana
    const weeksData = await Promise.all(reports.map(async (r) => {
      const [s, l, w, c, a] = await Promise.all([
        supabase.from('sales_data').select('*').eq('report_id', r.id).single(),
        supabase.from('labor_data').select('*').eq('report_id', r.id).single(),
        supabase.from('waste_data').select('*').eq('report_id', r.id).single(),
        supabase.from('cogs_data').select('*').eq('report_id', r.id).single(),
        supabase.from('avt_data').select('*').eq('report_id', r.id).single(),
      ])
      return {
        report: r,
        sales: s.data,
        labor: l.data,
        waste: w.data,
        cogs: c.data,
        avt: a.data,
      }
    }))

    setWeeks(weeksData.reverse())
    setLatest(weeksData[0])
    setPrev(weeksData[1] || null)
    setLoading(false)
  }

  function fmt(n: any) {
    if (!n) return '—'
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  function pct(part: any, total: any) {
    if (!part || !total) return null
    return Number((Number(part) / Number(total) * 100).toFixed(1))
  }

  function diff(curr: any, prev: any) {
    if (!curr || !prev) return null
    return Number(curr) - Number(prev)
  }

  function KpiCard({ label, value, sub, prev, up_is_good = true, prefix = '' }: any) {
    const delta = prev !== undefined && prev !== null ? diff(value, prev) : null
    const isUp = delta !== null ? delta > 0 : null
    const good = up_is_good ? isUp : !isUp

    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p className="text-gray-500 text-xs mb-1">{label}</p>
        <p className="text-2xl font-bold text-white">
          {value !== null && value !== undefined ? prefix + (typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: 1 }) : value) : '—'}
        </p>
        {sub && <p className="text-gray-600 text-xs mt-1">{sub}</p>}
        {delta !== null && (
          <p className={`text-xs mt-1 font-medium ${good ? 'text-green-400' : 'text-red-400'}`}>
            {delta > 0 ? '▲' : '▼'} {prefix}{Math.abs(delta).toLocaleString('en-US', { maximumFractionDigits: 1 })} vs semana anterior
          </p>
        )}
      </div>
    )
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  )

  const latestSales = latest?.sales
  const latestLabor = latest?.labor
  const latestWaste = latest?.waste
  const latestCogs = latest?.cogs
  const latestAvt = latest?.avt

  const prevSales = prev?.sales
  const prevLabor = prev?.labor

  const laborPct = pct(latestLabor?.total_pay, latestSales?.net_sales)
  const prevLaborPct = pct(prevLabor?.total_pay, prevSales?.net_sales)
  const cogsPct = pct(latestCogs?.total, latestSales?.net_sales)

  // Datos para gráficas
  const chartData = weeks.map(w => ({
    week: w.report.week.replace('2026-', ''),
    ventas: w.sales?.net_sales || 0,
    labor: w.labor?.total_pay || 0,
    laborPct: pct(w.labor?.total_pay, w.sales?.net_sales) || 0,
    waste: w.waste?.total_cost || 0,
    avgGuest: w.sales?.avg_per_guest || 0,
  }))

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="text-gray-400 hover:text-white text-sm"
          >
            ← Dashboard
          </button>
          <span className="text-white font-semibold">Dashboard CEO</span>
          {restaurant && (
            <span className="text-gray-500 text-sm">· {restaurant.name}</span>
          )}
        </div>
        <span className="text-gray-500 text-xs">
          Última semana: {latest?.report?.week}
        </span>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">

        {/* KPIs principales */}
        <div>
          <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
            Semana actual — {latest?.report?.week_start} al {latest?.report?.week_end}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              label="Ventas Netas"
              value={latestSales?.net_sales}
              sub={`${latestSales?.orders || 0} órdenes · ${latestSales?.guests || 0} guests`}
              prev={prevSales?.net_sales}
              up_is_good={true}
              prefix="$"
            />
            <KpiCard
              label="% Labor Cost"
              value={laborPct}
              sub={`${fmt(latestLabor?.total_pay)} total`}
              prev={prevLaborPct}
              up_is_good={false}
              prefix=""
            />
            <KpiCard
              label="Avg / Guest"
              value={latestSales?.avg_per_guest ? Number(latestSales.avg_per_guest).toFixed(2) : null}
              sub={`Avg orden: ${fmt(latestSales?.avg_per_order)}`}
              prev={prevSales?.avg_per_guest ? Number(prevSales.avg_per_guest).toFixed(2) : null}
              up_is_good={true}
              prefix="$"
            />
            <KpiCard
              label="Waste"
              value={latestWaste?.total_cost}
              sub={`${latestWaste?.items?.length || 0} items`}
              prev={prev?.waste?.total_cost}
              up_is_good={false}
              prefix="$"
            />
          </div>
        </div>

        {/* KPIs secundarios */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 text-xs mb-1">% Food Cost</p>
            <p className="text-2xl font-bold text-orange-400">
              {cogsPct ? cogsPct + '%' : '—'}
            </p>
            <p className="text-gray-600 text-xs mt-1">{fmt(latestCogs?.total)} en compras</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 text-xs mb-1">OT Hours</p>
            <p className="text-2xl font-bold text-amber-400">
              {latestLabor?.total_ot_hours ? Number(latestLabor.total_ot_hours).toFixed(1) + 'h' : '—'}
            </p>
            <p className="text-gray-600 text-xs mt-1">{latestLabor?.total_hours?.toFixed(0)}h regulares</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 text-xs mb-1">AvT Neto</p>
            <p className={`text-2xl font-bold ${latestAvt?.net_variance > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {latestAvt ? fmt(latestAvt.net_variance) : '—'}
            </p>
            <p className="text-gray-600 text-xs mt-1">
              {latestAvt ? `Faltantes: ${fmt(latestAvt.total_shortages)}` : 'Sin datos'}
            </p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 text-xs mb-1">Ventas Brutas</p>
            <p className="text-2xl font-bold text-blue-300">
              {fmt(latestSales?.gross_sales)}
            </p>
            <p className="text-gray-600 text-xs mt-1">
              Desc: {fmt(latestSales?.discounts)}
            </p>
          </div>
        </div>

        {/* Gráfica ventas + labor */}
        {chartData.length > 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Ventas netas por semana</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Ventas']}
                  />
                  <Bar dataKey="ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">% Labor cost por semana</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(v: any) => [v + '%', '% Labor']}
                  />
                  <Line type="monotone" dataKey="laborPct" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Gráfica Avg/Guest + Waste */}
        {chartData.length > 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Avg / Guest por semana</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(v: any) => ['$' + Number(v).toFixed(2), 'Avg/Guest']}
                  />
                  <Line type="monotone" dataKey="avgGuest" stroke="#eab308" strokeWidth={2} dot={{ fill: '#eab308', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Waste por semana</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Waste']}
                  />
                  <Bar dataKey="waste" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Resumen semana actual */}
        {latestSales && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-4">Resumen ejecutivo — {latest?.report?.week}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-gray-500 text-xs mb-1">Lunch órdenes</p>
                <p className="text-white font-bold">{latestSales?.raw_data?.lunch?.orders || '—'}</p>
                <p className="text-gray-600 text-xs">{fmt(latestSales?.raw_data?.lunch?.net)}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 text-xs mb-1">Dinner órdenes</p>
                <p className="text-white font-bold">{latestSales?.raw_data?.dinner?.orders || '—'}</p>
                <p className="text-gray-600 text-xs">{fmt(latestSales?.raw_data?.dinner?.net)}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 text-xs mb-1">Tips totales</p>
                <p className="text-white font-bold">{fmt(latestSales?.raw_data?.tips)}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-500 text-xs mb-1">Impuestos</p>
                <p className="text-white font-bold">{fmt(latestSales?.raw_data?.tax)}</p>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}