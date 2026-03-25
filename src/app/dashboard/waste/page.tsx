'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, LineChart, Line
} from 'recharts'

export default function WastePage() {
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])
  const [selectedWeek, setSelectedWeek] = useState<string>('')
  const [restaurant, setRestaurant] = useState<any>(null)
  const [reasons, setReasons] = useState<string[]>([])
  const [notes, setNotes] = useState<Record<string, { reason: string; note: string }>>({})
  const [savingNote, setSavingNote] = useState<string | null>(null)
  const [restaurantId, setRestaurantId] = useState<string>('00000000-0000-0000-0000-000000000001')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else loadData()
    })
  }, [])

  useEffect(() => {
    if (selectedWeek) loadNotes(selectedWeek)
  }, [selectedWeek])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles').select('restaurant_id').eq('id', user.id).single()
    const rid = profile?.restaurant_id || '00000000-0000-0000-0000-000000000001'
    setRestaurantId(rid)

    const { data: rest } = await supabase
      .from('restaurants').select('*').eq('id', rid).single()
    setRestaurant(rest)

    // Cargar razones configuradas
    const { data: reasonsData } = await supabase
      .from('waste_reasons')
      .select('reason')
      .eq('restaurant_id', rid)
      .eq('active', true)
      .order('sort_order')
    setReasons(reasonsData?.map((r: any) => r.reason) || [])

    const { data: reports } = await supabase
      .from('reports').select('*')
      .eq('restaurant_id', rid)
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

  async function loadNotes(week: string) {
    const { data } = await supabase
      .from('waste_notes')
      .select('item_name, reason, note')
      .eq('restaurant_id', restaurantId)
      .eq('week', week)

    const map: Record<string, { reason: string; note: string }> = {}
    for (const n of data || []) {
      map[n.item_name] = { reason: n.reason || '', note: n.note || '' }
    }
    setNotes(map)
  }

  async function saveNote(itemName: string, reason: string, note: string) {
    setSavingNote(itemName)
    await supabase.from('waste_notes').upsert({
      restaurant_id: restaurantId,
      week: selectedWeek,
      item_name: itemName,
      reason,
      note,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'restaurant_id,week,item_name' })
    setNotes(prev => ({ ...prev, [itemName]: { reason, note } }))
    setSavingNote(null)
  }

  function fmt(n: any) {
    if (n === null || n === undefined) return '—'
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  const selected = weeks.find(w => w.report.week === selectedWeek)
  const items: any[] = selected?.waste?.items || []
  const totalCost = selected?.waste?.total_cost || 0

  // Merma por categoría
  const byCategory: Record<string, number> = {}
  items.forEach((item: any) => {
    const cat = item.category || 'Sin categoría'
    byCategory[cat] = (byCategory[cat] || 0) + Number(item.total || 0)
  })
  const categoryData = Object.entries(byCategory)
    .map(([cat, total]) => ({ cat, total }))
    .sort((a, b) => b.total - a.total)

  // Merma por razón
  const byReason: Record<string, number> = {}
  items.forEach((item: any) => {
    const reason = notes[item.name]?.reason || 'Sin razón'
    byReason[reason] = (byReason[reason] || 0) + Number(item.total || 0)
  })
  const reasonData = Object.entries(byReason)
    .map(([reason, total]) => ({ reason: reason.length > 20 ? reason.substring(0, 20) + '...' : reason, total }))
    .sort((a, b) => b.total - a.total)

  const topItems = [...items]
    .sort((a, b) => Number(b.total || 0) - Number(a.total || 0))
    .slice(0, 10)

  const trendData = [...weeks].reverse().map(w => ({
    week: w.report.week.replace('2026-', ''),
    total: Number(w.waste?.total_cost || 0),
  }))

  const itemsWithReason = items.filter(i => notes[i.name]?.reason).length

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
          <p className="text-gray-500 text-xs mt-0.5">{restaurant?.name}</p>
        </div>
        <div className="flex items-center gap-3">
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
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {weeks.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-10 text-center">
            <div className="text-5xl mb-4">🗑️</div>
            <h2 className="text-white font-semibold text-lg mb-2">No hay datos de merma</h2>
            <p className="text-gray-500 mb-6">Sube el <strong>Waste History</strong> de R365.</p>
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
                <p className="text-gray-500 text-xs mb-1">Total merma</p>
                <p className="text-2xl font-bold text-red-400">{fmt(totalCost)}</p>
                <p className="text-gray-600 text-xs mt-1">{selectedWeek}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Items registrados</p>
                <p className="text-2xl font-bold text-white">{items.length}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Con razón asignada</p>
                <p className={`text-2xl font-bold ${itemsWithReason === items.length ? 'text-green-400' : 'text-yellow-400'}`}>
                  {itemsWithReason}/{items.length}
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Item más costoso</p>
                <p className="text-lg font-bold text-orange-400 truncate">{topItems[0]?.name || '—'}</p>
                <p className="text-gray-600 text-xs mt-1">{fmt(topItems[0]?.total)}</p>
              </div>
            </div>

            {/* Gráficas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Tendencia semanal</h2>
                <p className="text-gray-500 text-xs mb-4">Total $ por semana</p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => [fmt(v), 'Merma']} />
                    <Line type="monotone" dataKey="total" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Por categoría</h2>
                <p className="text-gray-500 text-xs mb-4">{selectedWeek}</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={categoryData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                    <YAxis type="category" dataKey="cat" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => [fmt(v), 'Merma']} />
                    <Bar dataKey="total" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Por razón</h2>
                <p className="text-gray-500 text-xs mb-4">{selectedWeek}</p>
                {itemsWithReason === 0 ? (
                  <div className="flex items-center justify-center h-36">
                    <p className="text-gray-600 text-xs text-center">Asigna razones a los items<br/>para ver este análisis</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={reasonData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                      <YAxis type="category" dataKey="reason" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} width={100} />
                      <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => [fmt(v), 'Merma']} />
                      <Bar dataKey="total" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Tabla con razones y notas */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Items — {selectedWeek}</h2>
                {itemsWithReason < items.length && (
                  <span className="text-yellow-400 text-xs">
                    ⚠️ {items.length - itemsWithReason} items sin razón
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Item</th>
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Categoría</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Qty</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Costo Unit.</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Total</th>
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium w-40">Razón</th>
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...items].sort((a, b) => Number(b.total || 0) - Number(a.total || 0)).map((item: any, i: number) => {
                      const itemNote = notes[item.name] || { reason: '', note: '' }
                      const isSaving = savingNote === item.name
                      return (
                        <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50 transition">
                          <td className="py-3 text-white font-medium">{item.name}</td>
                          <td className="py-3 text-gray-400 text-xs">{item.category || '—'}</td>
                          <td className="py-3 text-right text-gray-400 text-xs">{Number(item.qty || 0).toFixed(2)} {item.uom}</td>
                          <td className="py-3 text-right text-gray-400 text-xs">{fmt(item.unit_cost)}</td>
                          <td className="py-3 text-right font-bold text-red-400">{fmt(item.total)}</td>
                          <td className="py-3">
                            <select
                              value={itemNote.reason}
                              onChange={e => saveNote(item.name, e.target.value, itemNote.note)}
                              className={`w-full bg-gray-800 border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 transition ${
                                itemNote.reason ? 'border-gray-600 text-white' : 'border-gray-700 text-gray-500'
                              }`}
                            >
                              <option value="">Sin razón</option>
                              {reasons.map(r => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={itemNote.note}
                                onChange={e => setNotes(prev => ({ ...prev, [item.name]: { ...itemNote, note: e.target.value } }))}
                                onBlur={e => saveNote(item.name, itemNote.reason, e.target.value)}
                                placeholder="Agregar nota..."
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                              />
                              {isSaving && <span className="text-gray-600 text-xs shrink-0">💾</span>}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-700">
                      <td colSpan={4} className="py-3 text-white font-bold">Total</td>
                      <td className="py-3 text-right font-bold text-red-400">{fmt(totalCost)}</td>
                      <td colSpan={2} />
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