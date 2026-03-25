'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurantId } from '@/lib/use-restaurant'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, LineChart, Line
} from 'recharts'

export default function WastePage() {
  const restaurantId = useRestaurantId()
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])
  const [selectedWeek, setSelectedWeek] = useState<string>('')
  const [restaurantName, setRestaurantName] = useState('')

  useEffect(() => {
    if (restaurantId) loadData()
  }, [restaurantId])

  async function loadData() {
    if (!restaurantId) return
    setLoading(true)
    setWeeks([])

    const { data: rest } = await supabase
      .from('restaurants').select('name').eq('id', restaurantId).single()
    setRestaurantName(rest?.name || '')

    const { data: reports } = await supabase
      .from('reports').select('*')
      .eq('restaurant_id', restaurantId)
      .order('week', { ascending: false })
      .limit(12)

    if (!reports || reports.length === 0) { setLoading(false); return }

    const weeksData = await Promise.all(reports.map(async (r) => {
      const { data: waste } = await supabase
        .from('waste_data').select('*').eq('report_id', r.id).single()
      return { report: r, waste }
    }))

    const withWaste = weeksData.filter(w => w.waste)
    setWeeks(withWaste)
    if (withWaste.length > 0) setSelectedWeek(withWaste[0].report.week)
    setLoading(false)
  }

  function fmt(n: any) {
    if (n === null || n === undefined) return '—'
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  const selected = weeks.find(w => w.report.week === selectedWeek)
  const items: any[] = selected?.waste?.items || []
  const totalCost = selected?.waste?.total_cost || 0

  const byCategory: Record<string, number> = {}
  items.forEach((item: any) => {
    const cat = item.category || 'Sin categoría'
    byCategory[cat] = (byCategory[cat] || 0) + Number(item.total || 0)
  })
  const categoryData = Object.entries(byCategory)
    .map(([cat, total]) => ({ cat, total }))
    .sort((a, b) => b.total - a.total)

  const topItems = [...items]
    .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
    .slice(0, 10)

  const trendData = [...weeks].reverse().map(w => ({
    week: w.report.week.replace('2026-', ''),
    total: Number(w.waste?.total_cost || 0),
  }))

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando waste...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">🗑️ Waste — Merma</h1>
          <p className="text-gray-500 text-xs mt-0.5">{restaurantName}</p>
        </div>
        <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500">
          {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
        </select>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {weeks.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-10 text-center">
            <div className="text-5xl mb-4">🗑️</div>
            <h2 className="text-white font-semibold text-lg mb-2">No hay datos de merma</h2>
            <p className="text-gray-500 mb-6">Sube el <strong>Waste History</strong> de R365 para ver la merma semanal.</p>
            <button onClick={() => window.location.href = '/upload'}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg">
              Subir reporte
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Total merma</p>
                <p className="text-2xl font-bold text-red-400">{fmt(totalCost)}</p>
                <p className="text-gray-600 text-xs mt-1">{selectedWeek}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Items registrados</p>
                <p className="text-2xl font-bold text-white">{items.length}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Categorías</p>
                <p className="text-2xl font-bold text-white">{categoryData.length}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Item más caro</p>
                <p className="text-lg font-bold text-orange-400 truncate">{topItems[0]?.name || '—'}</p>
                <p className="text-gray-600 text-xs mt-1">{fmt(topItems[0]?.total)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Tendencia semanal</h2>
                <p className="text-gray-500 text-xs mb-4">Total $ de merma por semana</p>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any) => [fmt(v), 'Merma']} />
                    <Line type="monotone" dataKey="total" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Merma por categoría</h2>
                <p className="text-gray-500 text-xs mb-4">{selectedWeek}</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={categoryData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                    <YAxis type="category" dataKey="cat" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any) => [fmt(v), 'Merma']} />
                    <Bar dataKey="total" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Items más costosos — {selectedWeek}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">#</th>
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Item</th>
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Categoría</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Cantidad</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Costo Unit.</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Total</th>
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Comentario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topItems.map((item: any, i: number) => (
                      <tr key={i} className="border-b border-gray-800 hover:bg-gray-800 transition">
                        <td className="py-3 text-gray-600 text-xs">{i + 1}</td>
                        <td className="py-3 text-white font-medium">{item.name}</td>
                        <td className="py-3 text-gray-400 text-xs">{item.category || '—'}</td>
                        <td className="py-3 text-right text-gray-400">{Number(item.qty || 0).toFixed(2)} {item.uom}</td>
                        <td className="py-3 text-right text-gray-400">{fmt(item.unit_cost)}</td>
                        <td className="py-3 text-right font-bold text-red-400">{fmt(item.total)}</td>
                        <td className="py-3 text-gray-500 text-xs">{item.comment || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Todos los items — {selectedWeek}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Item</th>
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Categoría</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Cantidad</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Costo Unit.</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Total</th>
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Comentario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...items].sort((a, b) => Number(b.total || 0) - Number(a.total || 0)).map((item: any, i: number) => (
                      <tr key={i} className="border-b border-gray-800 hover:bg-gray-800 transition">
                        <td className="py-2.5 text-white text-sm">{item.name}</td>
                        <td className="py-2.5 text-gray-400 text-xs">{item.category || '—'}</td>
                        <td className="py-2.5 text-right text-gray-400 text-xs">{Number(item.qty || 0).toFixed(2)} {item.uom}</td>
                        <td className="py-2.5 text-right text-gray-400 text-xs">{fmt(item.unit_cost)}</td>
                        <td className="py-2.5 text-right font-medium text-red-400">{fmt(item.total)}</td>
                        <td className="py-2.5 text-gray-500 text-xs">{item.comment || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-700">
                      <td colSpan={4} className="py-3 text-white font-bold">Total</td>
                      <td className="py-3 text-right font-bold text-red-400">{fmt(totalCost)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}