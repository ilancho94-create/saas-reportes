'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurantId } from '@/lib/use-restaurant'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'

type SortKey = 'net_sales' | 'net_sales_per_hour' | 'avg_net_sales_per_guest' | 'avg_order_value' | 'void_amount'

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']

export default function EmployeePage() {
  const restaurantId = useRestaurantId()
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])
  const [selectedWeek, setSelectedWeek] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('net_sales')
  const [hiddenEmployees, setHiddenEmployees] = useState<Set<string>>(new Set())
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null)

  useEffect(() => { if (restaurantId) loadData() }, [restaurantId])

  async function loadData() {
    if (!restaurantId) return
    setLoading(true)

    const { data: rest } = await supabase.from('restaurants').select('name').eq('id', restaurantId).single()
    setRestaurantName(rest?.name || '')

    const { data: reports } = await supabase.from('reports').select('*')
      .eq('restaurant_id', restaurantId).order('week', { ascending: false }).limit(12)

    if (!reports?.length) { setLoading(false); return }

    const weeksData = await Promise.all(reports.map(async r => {
      const { data: ep } = await supabase.from('employee_performance_data')
        .select('*').eq('report_id', r.id).single()
      return { report: r, ep }
    }))

    const withData = weeksData.filter(w => w.ep)
    setWeeks(withData)
    if (withData.length > 0) setSelectedWeek(withData[0].report.week)
    setLoading(false)
  }

  function fmt(n: any) {
    if (!n && n !== 0) return '—'
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }
  function fmtDec(n: any, d = 1) {
    if (!n && n !== 0) return '—'
    return '$' + Number(n).toFixed(d)
  }
  function fmtNum(n: any) {
    if (!n && n !== 0) return '—'
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 1 })
  }
  function fmtMin(n: any) {
    if (!n) return '—'
    const mins = Math.round(Number(n) / 60)
    return mins + ' min'
  }

  const selected = weeks.find(w => w.report.week === selectedWeek)
  const employees: any[] = (selected?.ep?.employees || [])
    .filter((e: any) => !hiddenEmployees.has(e.name))
    .filter((e: any) => e.total_labor_hours > 0 || e.net_sales > 0)

  const sorted = [...employees].sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0))

  // History for selected employee across weeks
  const employeeHistory = selectedEmployee
    ? weeks.map(w => {
        const emp = (w.ep?.employees || []).find((e: any) => e.name === selectedEmployee)
        if (!emp) return null
        return { week: w.report.week.replace('2026-', ''), ...emp }
      }).filter(Boolean).reverse()
    : []

  // Averages
  const validEmps = employees.filter(e => e.total_labor_hours > 0)
  const avgNetSalesPerHour = validEmps.length > 0
    ? validEmps.reduce((s, e) => s + Number(e.net_sales_per_hour || 0), 0) / validEmps.length : 0
  const avgTicket = employees.length > 0
    ? employees.reduce((s, e) => s + Number(e.avg_order_value || 0), 0) / employees.length : 0
  const totalSales = employees.reduce((s, e) => s + Number(e.net_sales || 0), 0)
  const totalVoids = employees.reduce((s, e) => s + Number(e.void_amount || 0), 0)

  const allEmployeeNames = selected?.ep?.employees?.map((e: any) => e.name) || []

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'net_sales', label: 'Ventas totales' },
    { key: 'net_sales_per_hour', label: 'Ventas/hora' },
    { key: 'avg_net_sales_per_guest', label: 'Venta/comensal' },
    { key: 'avg_order_value', label: 'Ticket promedio' },
    { key: 'void_amount', label: 'Voids $' },
  ]

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando Employee Productivity...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">👥 Employee Productivity</h1>
          <p className="text-gray-500 text-xs mt-0.5">{restaurantName} · Rendimiento por servidor</p>
        </div>
        {weeks.length > 0 && (
          <select value={selectedWeek} onChange={e => { setSelectedWeek(e.target.value); setSelectedEmployee(null) }}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500">
            {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
          </select>
        )}
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {weeks.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-10 text-center">
            <div className="text-5xl mb-4">👥</div>
            <h2 className="text-white font-semibold text-lg mb-2">No hay datos de Employee Productivity</h2>
            <p className="text-gray-500 mb-6">Sube el <strong>Employee Performance Report</strong> de Toast.</p>
            <button onClick={() => window.location.href = '/upload'}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg">
              Subir reporte
            </button>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Ventas Totales</p>
                <p className="text-2xl font-bold text-white">{fmt(totalSales)}</p>
                <p className="text-gray-600 text-xs mt-1">{employees.length} empleados</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Promedio Ventas/Hora</p>
                <p className="text-2xl font-bold text-blue-400">{fmtDec(avgNetSalesPerHour)}</p>
                <p className="text-gray-600 text-xs mt-1">empleados con horas</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Ticket Promedio</p>
                <p className="text-2xl font-bold text-green-400">{fmtDec(avgTicket)}</p>
                <p className="text-gray-600 text-xs mt-1">promedio del equipo</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Total Voids</p>
                <p className="text-2xl font-bold text-red-400">{fmt(totalVoids)}</p>
                <p className="text-gray-600 text-xs mt-1">semana</p>
              </div>
            </div>

            {/* Controles */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-gray-500 text-xs">Ordenar por:</span>
              <div className="flex gap-1 flex-wrap">
                {SORT_OPTIONS.map(opt => (
                  <button key={opt.key} onClick={() => setSortKey(opt.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${sortKey === opt.key ? 'bg-blue-600 border-blue-500 text-white' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Ocultar empleados */}
              {allEmployeeNames.length > 0 && (
                <div className="ml-auto flex items-center gap-2 flex-wrap">
                  <span className="text-gray-500 text-xs">Ocultar:</span>
                  {allEmployeeNames.map((name: string) => (
                    <button key={name} onClick={() => {
                      setHiddenEmployees(prev => {
                        const next = new Set(prev)
                        next.has(name) ? next.delete(name) : next.add(name)
                        return next
                      })
                    }}
                      className={`px-2 py-1 rounded text-xs transition ${hiddenEmployees.has(name) ? 'bg-gray-700 text-gray-500 line-through' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                      {name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Gráfica de ranking */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-1">
                Ranking — {SORT_OPTIONS.find(o => o.key === sortKey)?.label}
              </h2>
              <p className="text-gray-500 text-xs mb-4">{selectedWeek} · Clic en barra para ver detalle</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sorted.map(e => ({
                  name: e.name.split(' ')[0],
                  fullName: e.name,
                  valor: Number(e[sortKey] || 0),
                }))} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => sortKey.includes('sales') || sortKey === 'void_amount' ? '$' + Math.round(v) : String(v)} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(v: any, _: any, props: any) => [
                      sortKey.includes('sales') || sortKey === 'void_amount' ? '$' + Number(v).toFixed(2) : Number(v).toFixed(1),
                      props.payload.fullName
                    ]} />
                  <Bar dataKey="valor" radius={[0, 4, 4, 0]} onClick={(data: any) => setSelectedEmployee(data.fullName === selectedEmployee ? null : data.fullName)}>
                    {sorted.map((e, i) => (
                      <Cell key={i} fill={e.name === selectedEmployee ? '#f59e0b' : COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Panel de detalle del empleado seleccionado */}
            {selectedEmployee && (
              <div className="bg-gray-900 border border-blue-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-white font-semibold text-base">{selectedEmployee}</h3>
                    <p className="text-gray-500 text-xs mt-0.5">Historial en {employeeHistory.length} semana{employeeHistory.length !== 1 ? 's' : ''}</p>
                  </div>
                  <button onClick={() => setSelectedEmployee(null)} className="text-gray-500 hover:text-white text-sm">✕</button>
                </div>
                {employeeHistory.length > 1 && (
                  <div className="mb-4">
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={employeeHistory}>
                        <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                        <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                          formatter={(v: any) => ['$' + Number(v).toFixed(0), 'Net Sales']} />
                        <Bar dataKey="net_sales" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left text-gray-500 pb-2 font-medium">Semana</th>
                        <th className="text-right text-gray-500 pb-2 font-medium">Ventas</th>
                        <th className="text-right text-gray-500 pb-2 font-medium">$/hora</th>
                        <th className="text-right text-gray-500 pb-2 font-medium">$/comensal</th>
                        <th className="text-right text-gray-500 pb-2 font-medium">Ticket</th>
                        <th className="text-right text-gray-500 pb-2 font-medium">Horas</th>
                        <th className="text-right text-gray-500 pb-2 font-medium">Comensales</th>
                        <th className="text-right text-gray-500 pb-2 font-medium">Voids $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeHistory.map((h: any, i: number) => (
                        <tr key={i} className={`border-b border-gray-800 ${h.week === selectedWeek?.replace('2026-', '') ? 'bg-blue-950/30' : ''}`}>
                          <td className={`py-1.5 ${h.week === selectedWeek?.replace('2026-', '') ? 'text-blue-400 font-semibold' : 'text-gray-400'}`}>{h.week}</td>
                          <td className="py-1.5 text-right text-white font-medium">{fmt(h.net_sales)}</td>
                          <td className="py-1.5 text-right text-blue-400">{fmtDec(h.net_sales_per_hour)}</td>
                          <td className="py-1.5 text-right text-green-400">{fmtDec(h.avg_net_sales_per_guest)}</td>
                          <td className="py-1.5 text-right text-purple-400">{fmtDec(h.avg_order_value)}</td>
                          <td className="py-1.5 text-right text-gray-400">{fmtNum(h.total_labor_hours)}h</td>
                          <td className="py-1.5 text-right text-gray-400">{h.guest_count}</td>
                          <td className="py-1.5 text-right text-red-400">{fmt(h.void_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tabla principal */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-800 bg-gray-950">
                    <tr>
                      <th className="text-left text-gray-500 text-xs py-3 px-4 font-medium">#</th>
                      <th className="text-left text-gray-500 text-xs py-3 font-medium">Empleado</th>
                      <th className="text-right text-gray-500 text-xs py-3 font-medium">Ventas Netas</th>
                      <th className="text-right text-gray-500 text-xs py-3 font-medium">$/Hora</th>
                      <th className="text-right text-gray-500 text-xs py-3 font-medium">$/Comensal</th>
                      <th className="text-right text-gray-500 text-xs py-3 font-medium">Ticket Prom.</th>
                      <th className="text-right text-gray-500 text-xs py-3 font-medium">Horas</th>
                      <th className="text-right text-gray-500 text-xs py-3 font-medium">Comensales</th>
                      <th className="text-right text-gray-500 text-xs py-3 font-medium">Órdenes</th>
                      <th className="text-right text-gray-500 text-xs py-3 font-medium">T. Turno</th>
                      <th className="text-right text-gray-500 text-xs py-3 pr-4 font-medium">Voids $</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((emp, i) => {
                      const isSelected = selectedEmployee === emp.name
                      const isTop = i === 0
                      return (
                        <tr key={emp.name}
                          onClick={() => setSelectedEmployee(isSelected ? null : emp.name)}
                          className={`border-b border-gray-800 cursor-pointer transition ${isSelected ? 'bg-blue-950/30' : 'hover:bg-gray-800/50'}`}>
                          <td className="py-3 px-4 text-gray-600 text-xs">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                                {emp.name.charAt(0)}
                              </div>
                              <span className={`font-medium text-sm ${isTop ? 'text-yellow-300' : 'text-white'}`}>{emp.name}</span>
                            </div>
                          </td>
                          <td className="py-3 text-right font-bold text-white">{fmt(emp.net_sales)}</td>
                          <td className="py-3 text-right text-blue-400 text-sm">
                            {emp.net_sales_per_hour > 0 ? fmtDec(emp.net_sales_per_hour) : '—'}
                          </td>
                          <td className="py-3 text-right text-green-400 text-sm">{fmtDec(emp.avg_net_sales_per_guest)}</td>
                          <td className="py-3 text-right text-purple-400 text-sm">{fmtDec(emp.avg_order_value)}</td>
                          <td className="py-3 text-right text-gray-400 text-sm">
                            {emp.total_labor_hours > 0 ? fmtNum(emp.total_labor_hours) + 'h' : '—'}
                          </td>
                          <td className="py-3 text-right text-gray-400 text-sm">{emp.guest_count}</td>
                          <td className="py-3 text-right text-gray-400 text-sm">{emp.order_count}</td>
                          <td className="py-3 text-right text-gray-400 text-sm">{fmtMin(emp.avg_turn_time)}</td>
                          <td className="py-3 text-right pr-4">
                            {emp.void_amount > 0
                              ? <span className="text-red-400 text-sm font-medium">{fmt(emp.void_amount)}</span>
                              : <span className="text-gray-700">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                    {sorted.length === 0 && (
                      <tr><td colSpan={11} className="py-10 text-center text-gray-600">No hay datos para esta semana</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}