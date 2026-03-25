'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurantId } from '@/lib/use-restaurant'
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
  const restaurantId = useRestaurantId()
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])
  const [range, setRange] = useState(4)
  const [restaurantName, setRestaurantName] = useState('')
  const [activeTab, setActiveTab] = useState<'resumen' | 'empleados' | 'comparativa'>('resumen')
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterPosition, setFilterPosition] = useState('')
  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number | null>(null)

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
  const displayWeekIdx = selectedWeekIdx !== null ? selectedWeekIdx : filtered.length - 1
  const latest = filtered[displayWeekIdx] || filtered[filtered.length - 1]
  const prev = filtered[filtered.length - 2]

  const laborPct = pct(latest?.labor?.total_pay, latest?.sales?.net_sales)
  const prevLaborPct = pct(prev?.labor?.total_pay, prev?.sales?.net_sales)
  const laborDiff = laborPct && prevLaborPct ? (laborPct - prevLaborPct).toFixed(1) : null

  const chartData = filtered.map(w => ({
    week: w.report.week.replace('2026-', ''),
    laborPct: pct(w.labor?.total_pay, w.sales?.net_sales) || 0,
    'labor$': w.labor?.total_pay || 0,
    horas: w.labor?.total_hours || 0,
    ot: w.labor?.total_ot_hours || 0,
  }))

  // Empleados de todas las semanas para filtros
  const allEmployees = [...new Set(
    filtered.flatMap(w => (w.labor?.by_employee || []).map((e: any) => e.name))
  )].sort()

  const allPositions = [...new Set(
    filtered.flatMap(w => (w.labor?.by_employee || []).map((e: any) => e.position))
  )].sort()

  // Empleados filtrados de la semana seleccionada
  const filteredEmployees = (latest?.labor?.by_employee || [])
    .filter((e: any) => {
      const matchEmp = !filterEmployee || e.name.toLowerCase().includes(filterEmployee.toLowerCase())
      const matchPos = !filterPosition || e.position === filterPosition
      return matchEmp && matchPos
    })
    .sort((a: any, b: any) => b.total_pay - a.total_pay)

  // Tendencia de un empleado específico a través de semanas
  const employeeTrend = filterEmployee
    ? filtered.map(w => {
        const emp = (w.labor?.by_employee || []).find((e: any) =>
          e.name.toLowerCase().includes(filterEmployee.toLowerCase())
        )
        return {
          week: w.report.week.replace('2026-', ''),
          horas: emp ? Number(emp.regular_hours) + Number(emp.ot_hours || 0) : 0,
          costo: emp ? Number(emp.total_pay) : 0,
          ot: emp ? Number(emp.ot_hours || 0) : 0,
        }
      })
    : []

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando labor...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">👥 Labor</h1>
          <p className="text-gray-500 text-xs">{restaurantName} · Análisis de labor por período</p>
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map(r => (
            <button key={r.value} onClick={() => { setRange(r.value); setSelectedWeekIdx(null) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                range === r.value ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-gray-800 bg-gray-900 px-6">
        <div className="flex gap-1">
          {[{ key: 'resumen', label: '📊 Resumen' }, { key: 'empleados', label: '👤 Por empleado / puesto' }, { key: 'comparativa', label: '📈 Comparativa semanal' }].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 ${
                activeTab === tab.key ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* KPIs */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider flex-1">
              Semana — {latest?.report?.week} ({latest?.report?.week_start} al {latest?.report?.week_end})
            </p>
            {filtered.length > 1 && (
              <select
                value={displayWeekIdx}
                onChange={e => setSelectedWeekIdx(Number(e.target.value))}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500">
                {filtered.map((w, i) => (
                  <option key={i} value={i}>{w.report.week}</option>
                ))}
              </select>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">% Labor Cost</p>
              <p className="text-2xl font-bold text-purple-400">{laborPct ? laborPct + '%' : '—'}</p>
              {laborDiff && (
                <p className={`text-xs mt-1 font-medium ${Number(laborDiff) <= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {Number(laborDiff) > 0 ? '▲' : '▼'} {Math.abs(Number(laborDiff))}% vs sem. ant.
                </p>
              )}
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Costo Total</p>
              <p className="text-2xl font-bold text-white">{fmt(latest?.labor?.total_pay)}</p>
              <p className="text-gray-600 text-xs mt-1">{latest?.labor?.by_employee?.length || 0} empleados</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Horas Regulares</p>
              <p className="text-2xl font-bold text-blue-400">
                {latest?.labor?.total_hours ? Number(latest.labor.total_hours).toFixed(0) + 'h' : '—'}
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <p className="text-gray-500 text-xs mb-1">Overtime</p>
              <p className={`text-2xl font-bold ${latest?.labor?.total_ot_hours > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                {latest?.labor?.total_ot_hours ? Number(latest.labor.total_ot_hours).toFixed(1) + 'h' : '0h'}
              </p>
            </div>
          </div>
        </div>

        {activeTab === 'resumen' && (
          <>
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
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any) => [v + '%', '% Labor']} />
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
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Labor $']} />
                    <Bar dataKey="labor$" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

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
                          <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${Math.min(posPct || 0, 100)}%` }} />
                        </div>
                        <span className="text-gray-500 text-xs w-10">{Number(pos.regular_hours).toFixed(0)}h</span>
                        {pos.ot_hours > 0 && <span className="text-amber-400 text-xs w-14">{Number(pos.ot_hours).toFixed(1)}h OT</span>}
                        <span className="text-white text-sm font-medium w-16 text-right">{fmt(pos.total_pay)}</span>
                        <span className="text-gray-500 text-xs w-10 text-right">{posPct}%</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">OT</th>
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

        {activeTab === 'empleados' && (
          <>
            {/* Filtros */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-48">
                <label className="text-gray-500 text-xs mb-1 block">Buscar empleado</label>
                <input type="text" value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)}
                  placeholder="Nombre del empleado..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div className="min-w-48">
                <label className="text-gray-500 text-xs mb-1 block">Filtrar por puesto</label>
                <select value={filterPosition} onChange={e => setFilterPosition(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                  <option value="">Todos los puestos</option>
                  {allPositions.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {(filterEmployee || filterPosition) && (
                <button onClick={() => { setFilterEmployee(''); setFilterPosition('') }}
                  className="mt-4 text-gray-400 hover:text-white text-xs border border-gray-700 px-3 py-2 rounded-lg transition">
                  Limpiar filtros
                </button>
              )}
            </div>

            {/* Tendencia del empleado si está buscando uno */}
            {filterEmployee && employeeTrend.some(e => e.costo > 0) && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Tendencia — {filterEmployee}</h2>
                <p className="text-gray-500 text-xs mb-4">Horas y costo a través de las semanas</p>
                <div className="grid grid-cols-2 gap-4">
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={employeeTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => v + 'h'} />
                      <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                        formatter={(v: any, name: any) => [v + 'h', name]} />
                      <Line type="monotone" dataKey="horas" name="Total horas" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
                      <Line type="monotone" dataKey="ot" name="OT" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={employeeTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                      <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                        formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Costo']} />
                      <Bar dataKey="costo" fill="#a855f7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Tabla de empleados */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">
                  Empleados — {latest?.report?.week}
                  <span className="text-gray-500 font-normal text-sm ml-2">
                    ({filteredEmployees.length} empleados · {fmt(filteredEmployees.reduce((a: number, e: any) => a + Number(e.total_pay), 0))})
                  </span>
                </h2>
              </div>
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
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">% del total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((emp: any) => {
                      const empPct = pct(emp.total_pay, latest?.labor?.total_pay)
                      return (
                        <tr key={emp.name} className="border-b border-gray-800 hover:bg-gray-800 transition">
                          <td className="py-3 text-gray-300 font-medium">{emp.name}</td>
                          <td className="py-3">
                            <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{emp.position}</span>
                          </td>
                          <td className="py-3 text-right text-gray-400">${Number(emp.hourly_rate).toFixed(2)}</td>
                          <td className="py-3 text-right text-gray-400">{Number(emp.regular_hours).toFixed(1)}h</td>
                          <td className="py-3 text-right">
                            <span className={emp.ot_hours > 0 ? 'text-amber-400' : 'text-gray-600'}>
                              {emp.ot_hours > 0 ? Number(emp.ot_hours).toFixed(1) + 'h' : '—'}
                            </span>
                          </td>
                          <td className="py-3 text-right text-white font-medium">{fmt(emp.total_pay)}</td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-gray-800 rounded-full h-1.5">
                                <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${Math.min(empPct || 0, 100)}%` }} />
                              </div>
                              <span className="text-gray-500 text-xs w-8">{empPct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-700">
                      <td colSpan={3} className="py-3 text-gray-400 font-medium">Total</td>
                      <td className="py-3 text-right text-white font-bold">
                        {filteredEmployees.reduce((a: number, e: any) => a + Number(e.regular_hours), 0).toFixed(0)}h
                      </td>
                      <td className="py-3 text-right text-amber-400 font-bold">
                        {filteredEmployees.reduce((a: number, e: any) => a + Number(e.ot_hours || 0), 0).toFixed(1)}h
                      </td>
                      <td className="py-3 text-right text-white font-bold">
                        {fmt(filteredEmployees.reduce((a: number, e: any) => a + Number(e.total_pay), 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}

        {activeTab === 'comparativa' && (
          <ComparativaTab filtered={filtered} fmt={fmt} pct={pct} />
        )}

      </main>
    </div>
  )
}

function ComparativaTab({ filtered, fmt, pct }: any) {
  // Build employee comparison: current vs previous week
  const latest = filtered[filtered.length - 1]
  const prev = filtered[filtered.length - 2]

  const latestEmps: any[] = latest?.labor?.by_employee || []
  const prevEmps: any[] = prev?.labor?.by_employee || []
  const prevMap: Record<string, any> = {}
  prevEmps.forEach(e => { prevMap[e.name] = e })

  // Compare employees
  const comparison = latestEmps.map(emp => {
    const prevEmp = prevMap[emp.name]
    const hoursDiff = prevEmp ? Number(emp.regular_hours) + Number(emp.ot_hours || 0) - (Number(prevEmp.regular_hours) + Number(prevEmp.ot_hours || 0)) : null
    const costDiff = prevEmp ? Number(emp.total_pay) - Number(prevEmp.total_pay) : null
    const otDiff = prevEmp ? Number(emp.ot_hours || 0) - Number(prevEmp.ot_hours || 0) : null
    return { ...emp, prevEmp, hoursDiff, costDiff, otDiff, isNew: !prevEmp }
  }).sort((a, b) => Math.abs(b.costDiff || 0) - Math.abs(a.costDiff || 0))

  // Employees who left (in prev but not in latest)
  const leftEmps = prevEmps.filter(e => !latestEmps.find(le => le.name === e.name))

  // Top OT across all weeks
  const otRanking: Record<string, number> = {}
  filtered.forEach((w: any) => {
    (w.labor?.by_employee || []).forEach((e: any) => {
      otRanking[e.name] = (otRanking[e.name] || 0) + Number(e.ot_hours || 0)
    })
  })
  const topOT = Object.entries(otRanking)
    .filter(([_, h]) => h > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  // Cost per hour by position across weeks
  const positionCostPerHour: Record<string, { totalPay: number; totalHours: number }> = {}
  filtered.forEach((w: any) => {
    (w.labor?.by_position || []).forEach((p: any) => {
      if (!positionCostPerHour[p.position]) positionCostPerHour[p.position] = { totalPay: 0, totalHours: 0 }
      positionCostPerHour[p.position].totalPay += Number(p.total_pay || 0)
      positionCostPerHour[p.position].totalHours += Number(p.regular_hours || 0) + Number(p.ot_hours || 0)
    })
  })
  const positionRates = Object.entries(positionCostPerHour)
    .map(([pos, data]) => ({
      pos,
      rate: data.totalHours > 0 ? data.totalPay / data.totalHours : 0,
      totalPay: data.totalPay,
    }))
    .sort((a, b) => b.rate - a.rate)

  if (filtered.length < 2) return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
      <p className="text-gray-500">Necesitas al menos 2 semanas de datos para ver la comparativa.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Employee week-over-week comparison */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-white font-semibold mb-1">
          Comparativa por empleado — {latest?.report?.week} vs {prev?.report?.week}
        </h2>
        <p className="text-gray-500 text-xs mb-4">Diferencia de horas y costo entre las dos semanas más recientes</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-500 text-xs pb-3 font-medium">Empleado</th>
                <th className="text-left text-gray-500 text-xs pb-3 font-medium">Puesto</th>
                <th className="text-right text-gray-500 text-xs pb-3 font-medium">Sem. ant. hrs</th>
                <th className="text-right text-gray-500 text-xs pb-3 font-medium">Esta sem. hrs</th>
                <th className="text-right text-gray-500 text-xs pb-3 font-medium">Δ Horas</th>
                <th className="text-right text-gray-500 text-xs pb-3 font-medium">Sem. ant. $</th>
                <th className="text-right text-gray-500 text-xs pb-3 font-medium">Esta sem. $</th>
                <th className="text-right text-gray-500 text-xs pb-3 font-medium">Δ Costo</th>
                <th className="text-right text-gray-500 text-xs pb-3 font-medium">Δ OT</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((emp: any) => {
                const totalHours = Number(emp.regular_hours) + Number(emp.ot_hours || 0)
                const prevTotalHours = emp.prevEmp ? Number(emp.prevEmp.regular_hours) + Number(emp.prevEmp.ot_hours || 0) : null
                return (
                  <tr key={emp.name} className={`border-b border-gray-800 hover:bg-gray-800 transition ${emp.isNew ? 'bg-blue-950/20' : ''}`}>
                    <td className="py-2.5 text-gray-300 font-medium">
                      {emp.name}
                      {emp.isNew && <span className="ml-2 text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">Nuevo</span>}
                    </td>
                    <td className="py-2.5">
                      <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{emp.position}</span>
                    </td>
                    <td className="py-2.5 text-right text-gray-500 text-xs">
                      {prevTotalHours !== null ? prevTotalHours.toFixed(1) + 'h' : '—'}
                    </td>
                    <td className="py-2.5 text-right text-gray-300 text-xs">{totalHours.toFixed(1)}h</td>
                    <td className="py-2.5 text-right text-xs">
                      {emp.hoursDiff !== null ? (
                        <span className={emp.hoursDiff > 0 ? 'text-red-400' : emp.hoursDiff < 0 ? 'text-green-400' : 'text-gray-600'}>
                          {emp.hoursDiff > 0 ? '+' : ''}{emp.hoursDiff.toFixed(1)}h
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-2.5 text-right text-gray-500 text-xs">
                      {emp.prevEmp ? fmt(emp.prevEmp.total_pay) : '—'}
                    </td>
                    <td className="py-2.5 text-right text-white text-xs font-medium">{fmt(emp.total_pay)}</td>
                    <td className="py-2.5 text-right text-xs">
                      {emp.costDiff !== null ? (
                        <span className={emp.costDiff > 0 ? 'text-red-400' : emp.costDiff < 0 ? 'text-green-400' : 'text-gray-600'}>
                          {emp.costDiff > 0 ? '+' : ''}{fmt(emp.costDiff)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-2.5 text-right text-xs">
                      {emp.otDiff !== null && emp.otDiff !== 0 ? (
                        <span className={emp.otDiff > 0 ? 'text-amber-400' : 'text-green-400'}>
                          {emp.otDiff > 0 ? '+' : ''}{emp.otDiff.toFixed(1)}h
                        </span>
                      ) : <span className="text-gray-600">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {leftEmps.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <p className="text-gray-500 text-xs mb-2">No trabajaron esta semana ({leftEmps.length}):</p>
            <div className="flex flex-wrap gap-2">
              {leftEmps.map(e => (
                <span key={e.name} className="text-xs bg-gray-800 text-gray-500 px-2.5 py-1 rounded-full">
                  {e.name} · {e.position}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top OT */}
        {topOT.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-1">Top Overtime acumulado</h2>
            <p className="text-gray-500 text-xs mb-4">Empleados con más horas extra en el período</p>
            <div className="space-y-3">
              {topOT.map(([name, hours], i) => (
                <div key={name} className="flex items-center gap-3">
                  <span className={`text-xs font-bold w-5 ${i === 0 ? 'text-amber-400' : 'text-gray-500'}`}>{i + 1}</span>
                  <span className="text-gray-300 text-sm flex-1 truncate">{name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-gray-800 rounded-full h-1.5">
                      <div className="bg-amber-500 h-1.5 rounded-full"
                        style={{ width: `${Math.min((hours / topOT[0][1]) * 100, 100)}%` }} />
                    </div>
                    <span className="text-amber-400 text-xs font-medium w-12 text-right">{hours.toFixed(1)}h</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cost per hour by position */}
        {positionRates.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-1">Costo promedio por hora / puesto</h2>
            <p className="text-gray-500 text-xs mb-4">Promedio acumulado del período seleccionado</p>
            <div className="space-y-3">
              {positionRates.map(({ pos, rate, totalPay }) => (
                <div key={pos} className="flex items-center gap-3">
                  <span className="text-gray-300 text-sm flex-1 truncate">{pos}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-gray-800 rounded-full h-1.5">
                      <div className="bg-purple-500 h-1.5 rounded-full"
                        style={{ width: `${Math.min((rate / positionRates[0].rate) * 100, 100)}%` }} />
                    </div>
                    <span className="text-purple-400 text-xs font-medium w-16 text-right">
                      ${rate.toFixed(2)}/h
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Weekly trend per position */}
      {filtered[0]?.labor?.by_position && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">Costo por puesto semana a semana</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-500 text-xs pb-3 font-medium">Puesto</th>
                  {filtered.map((w: any) => (
                    <th key={w.report.week} className="text-right text-gray-500 text-xs pb-3 font-medium">
                      {w.report.week.replace('2026-', '')}
                    </th>
                  ))}
                  <th className="text-right text-gray-500 text-xs pb-3 font-medium">Tendencia</th>
                </tr>
              </thead>
              <tbody>
                {[...new Set(filtered.flatMap((w: any) => (w.labor?.by_position || []).map((p: any) => p.position)))].map((pos: any) => {
                  const values = filtered.map((w: any) => {
                    const p = (w.labor?.by_position || []).find((p: any) => p.position === pos)
                    return p ? Number(p.total_pay) : null
                  })
                  const validValues = (values.filter((v: any) => v !== null) as number[])
                  const trend = validValues.length >= 2
                    ? validValues[validValues.length - 1] - validValues[validValues.length - 2]
                    : null
                  return (
                    <tr key={pos} className="border-b border-gray-800 hover:bg-gray-800 transition">
                      <td className="py-2.5 text-gray-300 text-sm">{pos}</td>
                      {values.map((val: any, i: number) => (
                        <td key={i} className="py-2.5 text-right text-gray-400 text-xs">
                          {val !== null ? fmt(val) : <span className="text-gray-700">—</span>}
                        </td>
                      ))}
                      <td className="py-2.5 text-right">
                        {trend !== null ? (
                          <span className={`text-xs font-medium ${trend > 0 ? 'text-red-400' : trend < 0 ? 'text-green-400' : 'text-gray-600'}`}>
                            {trend > 0 ? '▲' : '▼'} {fmt(Math.abs(trend))}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}