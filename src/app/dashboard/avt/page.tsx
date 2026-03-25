'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, LineChart, Line, ReferenceLine
} from 'recharts'

export default function AvtPage() {
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])
  const [selectedWeek, setSelectedWeek] = useState<string>('')
  const [restaurant, setRestaurant] = useState<any>(null)

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
      .from('restaurants').select('*').eq('id', profile.restaurant_id).single()
    setRestaurant(rest)

    const { data: reports } = await supabase
      .from('reports').select('*')
      .eq('restaurant_id', profile.restaurant_id)
      .order('week', { ascending: false })
      .limit(12)

    if (!reports || reports.length === 0) { setLoading(false); return }

    const weeksData = await Promise.all(reports.map(async (r) => {
      const { data: avt } = await supabase
        .from('avt_data').select('*').eq('report_id', r.id).single()
      return { report: r, avt }
    }))

    const withAvt = weeksData.filter(w => w.avt)
    setWeeks(withAvt)
    if (withAvt.length > 0) setSelectedWeek(withAvt[0].report.week)
    setLoading(false)
  }

  function fmt(n: any) {
    if (n === null || n === undefined) return '—'
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  function fmtQty(n: any, uom: string) {
    if (n === null || n === undefined) return '—'
    return Number(n).toFixed(3) + ' ' + (uom || '')
  }

  const selected = weeks.find(w => w.report.week === selectedWeek)
  const shortages: any[] = selected?.avt?.shortages || []
  const overages: any[] = selected?.avt?.overages || []
  const netVariance = selected?.avt?.net_variance || 0
  const totalShortages = selected?.avt?.total_shortages || shortages.reduce((a: number, b: any) => a + Number(b.variance_dollar || 0), 0)
  const totalOverages = selected?.avt?.total_overages || overages.reduce((a: number, b: any) => a + Number(b.variance_dollar || 0), 0)

  const topShortages = [...shortages]
    .sort((a, b) => Number(b.variance_dollar || 0) - Number(a.variance_dollar || 0))
    .slice(0, 10)

  const shortageChartData = topShortages.map(s => ({
    name: s.name?.length > 15 ? s.name.substring(0, 15) + '...' : s.name,
    fullName: s.name,
    valor: Number(s.variance_dollar || 0),
  }))

  const trendData = [...weeks].reverse().map(w => ({
    week: w.report.week.replace('2026-', ''),
    faltantes: Number(w.avt?.total_shortages || 0),
    sobrantes: Number(w.avt?.total_overages || 0),
    neto: Number(w.avt?.net_variance || 0),
  }))

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando AvT...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">📊 Actual vs Teórico</h1>
          <p className="text-gray-500 text-xs mt-0.5">
            {restaurant?.name} · Faltante = varianza positiva · Sobrante = varianza negativa
          </p>
        </div>
        <select
          value={selectedWeek}
          onChange={e => setSelectedWeek(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
        >
          {weeks.map(w => (
            <option key={w.report.week} value={w.report.week}>{w.report.week}</option>
          ))}
        </select>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {weeks.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-10 text-center">
            <div className="text-5xl mb-4">📊</div>
            <h2 className="text-white font-semibold text-lg mb-2">No hay datos de AvT</h2>
            <p className="text-gray-500 mb-6">
              Sube el <strong>Actual vs Theoretical Analysis</strong> de R365.
            </p>
            <button
              onClick={() => window.location.href = '/upload'}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg"
            >
              Subir reporte
            </button>
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Total Faltantes</p>
                <p className="text-2xl font-bold text-red-400">{fmt(totalShortages)}</p>
                <p className="text-gray-600 text-xs mt-1">{shortages.length} items</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Total Sobrantes</p>
                <p className="text-2xl font-bold text-green-400">{fmt(totalOverages)}</p>
                <p className="text-gray-600 text-xs mt-1">{overages.length} items</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Varianza Neta</p>
                <p className={`text-2xl font-bold ${netVariance > 0 ? 'text-red-400' : netVariance < 0 ? 'text-green-400' : 'text-gray-400'}`}>
                  {netVariance > 0 ? '+' : ''}{fmt(netVariance)}
                </p>
                <p className="text-gray-600 text-xs mt-1">
                  {netVariance > 0 ? 'más consumo que teórico' : netVariance < 0 ? 'menos consumo que teórico' : ''}
                </p>
              </div>
            </div>

            {/* Gráficas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Top faltantes — {selectedWeek}</h2>
                <p className="text-gray-500 text-xs mb-4">Varianza $ positiva (más consumo del teórico)</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={shortageChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} width={110} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any, _: any, props: any) => [fmt(v), props.payload.fullName]}
                    />
                    <Bar dataKey="valor" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Tendencia semanal</h2>
                <p className="text-gray-500 text-xs mb-4">Faltantes vs sobrantes por semana</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any, name: any) => [fmt(v), name]}
                    />
                    <ReferenceLine y={0} stroke="#374151" />
                    <Line type="monotone" dataKey="faltantes" name="Faltantes" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} />
                    <Line type="monotone" dataKey="sobrantes" name="Sobrantes" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 3 }} />
                    <Line type="monotone" dataKey="neto" name="Neto" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#f59e0b', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabla faltantes */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">
                Faltantes — {selectedWeek}
                <span className="text-red-400 font-normal text-sm ml-2">
                  ({shortages.length} items · {fmt(totalShortages)})
                </span>
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Item</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">UOM</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Costo Unit.</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Varianza Qty</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Varianza $</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...shortages]
                      .sort((a, b) => Number(b.variance_dollar || 0) - Number(a.variance_dollar || 0))
                      .map((item: any, i: number) => (
                        <tr key={i} className="border-b border-gray-800 hover:bg-gray-800 transition">
                          <td className="py-2.5 text-white">{item.name}</td>
                          <td className="py-2.5 text-right text-gray-500 text-xs">{item.uom}</td>
                          <td className="py-2.5 text-right text-gray-400 text-xs">{fmt(item.unit_cost)}</td>
                          <td className="py-2.5 text-right text-red-400 text-xs">{fmtQty(item.variance_qty, item.uom)}</td>
                          <td className="py-2.5 text-right font-bold text-red-400">{fmt(item.variance_dollar)}</td>
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-700">
                      <td colSpan={4} className="py-3 text-white font-bold">Total Faltantes</td>
                      <td className="py-3 text-right font-bold text-red-400">{fmt(totalShortages)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Tabla sobrantes */}
            {overages.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">
                  Sobrantes — {selectedWeek}
                  <span className="text-green-400 font-normal text-sm ml-2">
                    ({overages.length} items · {fmt(totalOverages)})
                  </span>
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left text-gray-500 text-xs pb-3 font-medium">Item</th>
                        <th className="text-right text-gray-500 text-xs pb-3 font-medium">UOM</th>
                        <th className="text-right text-gray-500 text-xs pb-3 font-medium">Costo Unit.</th>
                        <th className="text-right text-gray-500 text-xs pb-3 font-medium">Varianza Qty</th>
                        <th className="text-right text-gray-500 text-xs pb-3 font-medium">Varianza $</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...overages]
                        .sort((a, b) => Number(b.variance_dollar || 0) - Number(a.variance_dollar || 0))
                        .map((item: any, i: number) => (
                          <tr key={i} className="border-b border-gray-800 hover:bg-gray-800 transition">
                            <td className="py-2.5 text-white">{item.name}</td>
                            <td className="py-2.5 text-right text-gray-500 text-xs">{item.uom}</td>
                            <td className="py-2.5 text-right text-gray-400 text-xs">{fmt(item.unit_cost)}</td>
                            <td className="py-2.5 text-right text-green-400 text-xs">{fmtQty(item.variance_qty, item.uom)}</td>
                            <td className="py-2.5 text-right font-bold text-green-400">{fmt(item.variance_dollar)}</td>
                          </tr>
                        ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-700">
                        <td colSpan={4} className="py-3 text-white font-bold">Total Sobrantes</td>
                        <td className="py-3 text-right font-bold text-green-400">{fmt(totalOverages)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}