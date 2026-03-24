'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, ReferenceLine
} from 'recharts'

const RANGES = [
  { label: 'Últimas 4 semanas', value: 4 },
  { label: 'Últimas 8 semanas', value: 8 },
  { label: 'Todo', value: 99 },
]

export default function LaborPage() {
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])
  const [range, setRange] = useState(4)
  const [restaurant, setRestaurant] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'resumen' | 'empleados'>('resumen')

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
      .from('reports').select('*')
      .eq('restaurant_id', profile.restaurant_id)
      .order('created_at', { ascending: false })
      .limit(12)

    if (!reports || reports.length === 0) { setLoading(false); return }

    const weeksData = await Promise.all(reports.map(async (r) => {
      const [s, l] = await Promise.all([
        supabase.from('sales_data').select('net_sales').eq('report_id', r.id).single(),
        supabase.from('labor_data').select('*').eq('report_id', r.id).single(),
      ])
      return { report: r, sales: s.data, labor: l.data }
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

  const filtered = weeks.slice(-range)
  const latest = filtered[filtered.length - 1]
  const prev = filtered[filtered.length - 2]

  const laborPct = pct(latest?.labor?.total_pay, latest?.sales?.net_sales)
  const prevLaborPct = pct(prev?.labor?.total_pay, prev?.sales?.net_sales)
  const laborDiff = laborPct && prevLaborPct ? (laborPct - prevLaborPct).toFixed(1) : null

  const chartData = filtered.map(w => ({
    week: w.report.week.replace('2026-', ''),
    laborPct: pct(w.labor?.total_pay, w.sales?.net_sales) || 0,
    labor$: w.labor?.total_pay || 0,
    horas: w.labor?.total_hours || 0,
    ot: w.labor?.total_ot_hours || 0,
  }))

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando labor...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">👥 Labor</h1>
          <p className="text-gray-500 text-xs">{restaurant?.name} · Análisis de labor por período</p>
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

      {/* Tabs */}
      <div className="border-b border-gray-800 bg-gray-900 px-6">
        <div className="flex gap-1">
          {[
            { key: 'resumen', label: 'Resumen' },
            { key: 'empleados', label: 'Por empleado' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 ${
                activeTab === tab.key
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* KPIs semana más reciente */}
        <div>
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
            Semana más reciente — {latest?.report?.week} ({latest?.report?.week_start} al {latest?.report?.week_end})
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">% Labor Cost</p>
              <p className="text-2xl font-bold text-purple-400">{laborPct ? laborPct + '%' : '—'}</p>
              {laborDiff && (
                <p className={`text-xs mt-1 font-medium ${Number(laborDiff) <= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {Number(laborDiff) > 0 ? '▲' : '▼'} {Math.abs(Number(laborDiff))}% vs semana anterior
                </p>
              )}
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Costo Total</p>
              <p className="text-2xl font-bold text-white">{fmt(latest?.labor?.total_pay)}</p>
              <p className="text-gray-600 text-xs mt-1">período completo</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Horas Regulares</p>
              <p className="text-2xl font-bold text-blue-400">
                {latest?.labor?.total_hours ? Number(latest.labor.total_hours).toFixed(0) + 'h' : '—'}
              </p>
              <p className="text-gray-600 text-xs mt-1">horas trabajadas</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Overtime</p>
              <p className={`text-2xl font-bold ${latest?.labor?.total_ot_hours > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                {latest?.labor?.total_ot_hours ? Number(latest.labor.total_ot_hours).toFixed(1) + 'h' : '0h'}
              </p>
              <p className="text-gray-600 text-xs mt-1">horas extra</p>
            </div>
          </div>
        </div>

        {activeTab === 'resumen' && (
          <>
            {/* Gráficas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">% Labor Cost por semana</h2>
                <p className="text-gray-500 text-xs mb-4">Meta recomendada: 30%</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                    <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="4 4" label={{ value: '30%', fill: '#ef4444', fontSize: 10, position: 'right' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any) => [v + '%', '% Labor']}
                    />
                    <Line type="monotone" dataKey="laborPct" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Costo labor $ por semana</h2>
                <p className="text-gray-500 text-xs mb-4">Gasto total en nómina</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(1) + 'k'} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Labor $']}
                    />
                    <Bar dataKey="labor$" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Horas regulares vs OT */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-1">Horas regulares vs Overtime</h2>
              <p className="text-gray-500 text-xs mb-4">Control de horas extra</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} />
                  <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                  <Bar dataKey="horas" name="Regulares" fill="#3b82f6" radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="ot" name="Overtime" fill="#f59e0b" radius={[4, 4, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Labor por puesto semana más reciente */}
            {latest?.labor?.by_position && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Labor por puesto — {latest?.report?.week}</h2>
                <div className="space-y-3">
                  {latest.labor.by_position.map((pos: any) => {
                    const posPct = pct(pos.total_pay, latest.labor.total_pay)
                    return (
                      <div key={pos.position} className="flex items-center gap-4">
                        <span className="text-gray-300 text-sm w-32 truncate">{pos.position}</span>
                        <div className="flex-1 bg-gray-800 rounded-full h-2">
                          <div
                            className="bg-purple-500 h-2 rounded-full"
                            style={{ width: `${Math.min(posPct || 0, 100)}%` }}
                          />
                        </div>
                        <span className="text-gray-500 text-xs w-10">{Number(pos.regular_hours).toFixed(0)}h</span>
                        {pos.ot_hours > 0 && (
                          <span className="text-amber-400 text-xs w-14">{Number(pos.ot_hours).toFixed(1)}h OT</span>
                        )}
                        <span className="text-white text-sm font-medium w-16 text-right">{fmt(pos.total_pay)}</span>
                        <span className="text-gray-500 text-xs w-10 text-right">{posPct}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tabla comparativa */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Comparativo por semana</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Semana</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">% Labor</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Costo Total</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Horas Reg</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">OT Hours</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Ventas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...filtered].reverse().map((w) => {
                      const wp = pct(w.labor?.total_pay, w.sales?.net_sales)
                      return (
                        <tr key={w.report.id} className="border-b border-gray-800 hover:bg-gray-800 transition">
                          <td className="py-3 text-gray-300">{w.report.week}</td>
                          <td className="py-3 text-right">
                            <span className={`font-medium ${wp && wp > 30 ? 'text-red-400' : 'text-green-400'}`}>
                              {wp ? wp + '%' : '—'}
                            </span>
                          </td>
                          <td className="py-3 text-right text-white font-medium">{fmt(w.labor?.total_pay)}</td>
                          <td className="py-3 text-right text-gray-400">{w.labor?.total_hours ? Number(w.labor.total_hours).toFixed(0) + 'h' : '—'}</td>
                          <td className="py-3 text-right">
                            <span className={w.labor?.total_ot_hours > 0 ? 'text-amber-400' : 'text-gray-600'}>
                              {w.labor?.total_ot_hours ? Number(w.labor.total_ot_hours).toFixed(1) + 'h' : '0h'}
                            </span>
                          </td>
                          <td className="py-3 text-right text-gray-400">{fmt(w.sales?.net_sales)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === 'empleados' && latest?.labor?.by_employee && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-4">Labor por empleado — {latest?.report?.week}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-gray-500 text-xs pb-3 font-medium">Empleado</th>
                    <th className="text-left text-gray-500 text-xs pb-3 font-medium">Puesto</th>
                    <th className="text-right text-gray-500 text-xs pb-3 font-medium">$/hr</th>
                    <th className="text-right text-gray-500 text-xs pb-3 font-medium">Horas Reg</th>
                    <th className="text-right text-gray-500 text-xs pb-3 font-medium">OT</th>
                    <th className="text-right text-gray-500 text-xs pb-3 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.labor.by_employee
                    .sort((a: any, b: any) => b.total_pay - a.total_pay)
                    .map((emp: any) => (
                      <tr key={emp.name} className="border-b border-gray-800 hover:bg-gray-800 transition">
                        <td className="py-3 text-gray-300 font-medium">{emp.name}</td>
                        <td className="py-3 text-gray-500">{emp.position}</td>
                        <td className="py-3 text-right text-gray-400">${Number(emp.hourly_rate).toFixed(2)}</td>
                        <td className="py-3 text-right text-gray-400">{Number(emp.regular_hours).toFixed(1)}h</td>
                        <td className="py-3 text-right">
                          <span className={emp.ot_hours > 0 ? 'text-amber-400' : 'text-gray-600'}>
                            {emp.ot_hours > 0 ? Number(emp.ot_hours).toFixed(1) + 'h' : '—'}
                          </span>
                        </td>
                        <td className="py-3 text-right text-white font-medium">{fmt(emp.total_pay)}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-700">
                    <td colSpan={3} className="py-3 text-gray-400 font-medium">Total</td>
                    <td className="py-3 text-right text-white font-bold">
                      {Number(latest.labor.total_hours).toFixed(0)}h
                    </td>
                    <td className="py-3 text-right text-amber-400 font-bold">
                      {Number(latest.labor.total_ot_hours).toFixed(1)}h
                    </td>
                    <td className="py-3 text-right text-white font-bold">{fmt(latest.labor.total_pay)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}