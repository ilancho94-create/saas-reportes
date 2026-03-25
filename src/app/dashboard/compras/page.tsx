'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine, Cell
} from 'recharts'

const CATEGORIES = ['Todas', 'BAR', 'FOOD', 'BEVERAGE', 'CHEMICALS', 'SUPPLIES']

export default function ComprasPage() {
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<string[]>([])
  const [selectedWeek, setSelectedWeek] = useState('')
  const [restaurantId, setRestaurantId] = useState('00000000-0000-0000-0000-000000000001')
  const [restaurant, setRestaurant] = useState<any>(null)
  const [currentItems, setCurrentItems] = useState<any[]>([])
  const [prevItems, setPrevItems] = useState<any[]>([])
  const [allData, setAllData] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'impacto' | 'tendencia' | 'proveedores' | 'tabla'>('impacto')
  const [selectedCategory, setSelectedCategory] = useState('Todas')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else loadData()
    })
  }, [])

  useEffect(() => {
    if (selectedWeek) loadWeekData(selectedWeek)
  }, [selectedWeek])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
    const rid = profile?.restaurant_id || '00000000-0000-0000-0000-000000000001'
    setRestaurantId(rid)
    const { data: rest } = await supabase.from('restaurants').select('*').eq('id', rid).single()
    setRestaurant(rest)

    // Obtener semanas con datos de receiving
    const { data: allRows } = await supabase
      .from('receiving_data')
      .select('week, item_name, uom, category, vendor, total_qty, unit_cost, total_cost')
      .eq('restaurant_id', rid)
      .order('week', { ascending: false })

    if (!allRows?.length) { setLoading(false); return }

    setAllData(allRows)
    const uniqueWeeks = [...new Set(allRows.map(r => r.week))].sort().reverse()
    setWeeks(uniqueWeeks)
    setSelectedWeek(uniqueWeeks[0])
    setLoading(false)
  }

  async function loadWeekData(week: string) {
    const current = allData.filter(r => r.week === week)
    setCurrentItems(current)

    // Semana anterior
    const weekIdx = weeks.indexOf(week)
    if (weekIdx < weeks.length - 1) {
      const prevWeek = weeks[weekIdx + 1]
      const prev = allData.filter(r => r.week === prevWeek)
      setPrevItems(prev)
    } else {
      setPrevItems([])
    }
  }

  function fmt(n: any) {
    if (!n && n !== 0) return '—'
    return '$' + Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function fmtShort(n: any) {
    if (!n && n !== 0) return '—'
    return '$' + Math.abs(Number(n)).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  // Calcular variaciones para impacto
  const prevMap: Record<string, any> = {}
  prevItems.forEach(i => { prevMap[i.item_name] = i })

  const variations = currentItems
    .filter(item => {
      if (selectedCategory !== 'Todas' && item.category !== selectedCategory) return false
      const prev = prevMap[item.item_name]
      return prev && Math.abs(item.unit_cost - prev.unit_cost) > 0.001
    })
    .map(item => {
      const prev = prevMap[item.item_name]
      const diff = item.unit_cost - prev.unit_cost
      const impact = diff * item.total_qty
      const pct = prev.unit_cost > 0 ? (diff / prev.unit_cost) * 100 : 0
      return { ...item, prev_cost: prev.unit_cost, diff, impact, pct }
    })
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact))

  const increased = variations.filter(v => v.impact > 0).sort((a, b) => b.impact - a.impact)
  const decreased = variations.filter(v => v.impact < 0).sort((a, b) => a.impact - b.impact)
  const totalImpact = variations.reduce((a, b) => a + b.impact, 0)

  // Nuevos items esta semana
  const newItems = currentItems.filter(i => !prevMap[i.item_name])

  // KPIs por categoría para impacto
  const impactByCat: Record<string, number> = {}
  variations.forEach(v => {
    impactByCat[v.category] = (impactByCat[v.category] || 0) + v.impact
  })
  const byCatData = Object.entries(impactByCat).map(([cat, impact]) => ({ cat, impact })).sort((a, b) => b.impact - a.impact)

  // Tendencia por item
  const itemHistory = (itemName: string) => {
    return allData
      .filter(r => r.item_name === itemName)
      .sort((a, b) => a.week.localeCompare(b.week))
      .map(r => ({ week: r.week.replace('2026-', ''), unit_cost: r.unit_cost, total_cost: r.total_cost, total_qty: r.total_qty }))
  }

  // Items filtrados para búsqueda
  const filteredItems = currentItems.filter(item => {
    const matchCat = selectedCategory === 'Todas' || item.category === selectedCategory
    const matchSearch = !searchQuery || item.item_name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchCat && matchSearch
  })

  // Proveedores por item buscado
  const vendorAnalysis = (itemName: string) => {
    const history = allData.filter(r => r.item_name === itemName)
    const byVendor: Record<string, { weeks: number; avg_cost: number; min_cost: number; max_cost: number; costs: number[] }> = {}
    history.forEach(r => {
      if (!byVendor[r.vendor]) byVendor[r.vendor] = { weeks: 0, avg_cost: 0, min_cost: Infinity, max_cost: -Infinity, costs: [] }
      byVendor[r.vendor].weeks++
      byVendor[r.vendor].costs.push(r.unit_cost)
      byVendor[r.vendor].min_cost = Math.min(byVendor[r.vendor].min_cost, r.unit_cost)
      byVendor[r.vendor].max_cost = Math.max(byVendor[r.vendor].max_cost, r.unit_cost)
    })
    Object.values(byVendor).forEach(v => {
      v.avg_cost = v.costs.reduce((a, b) => a + b, 0) / v.costs.length
    })
    return Object.entries(byVendor).map(([vendor, data]) => ({ vendor, ...data })).sort((a, b) => a.avg_cost - b.avg_cost)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando datos de compras...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">🧾 Compras de Insumos</h1>
          <p className="text-gray-500 text-xs mt-0.5">{restaurant?.name} · Variación de precios y análisis de proveedores</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500">
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500">
            {weeks.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 bg-gray-900 px-6">
        <div className="flex gap-1">
          {[
            { key: 'impacto', label: '📈 Impacto Semanal' },
            { key: 'tendencia', label: '📉 Tendencia por Item' },
            { key: 'proveedores', label: '🏭 Proveedores' },
            { key: 'tabla', label: '📋 Tabla Completa' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 ${activeTab === tab.key ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {weeks.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-10 text-center">
            <div className="text-5xl mb-4">🧾</div>
            <h2 className="text-white font-semibold text-lg mb-2">No hay datos de compras</h2>
            <p className="text-gray-500 mb-6">Sube el reporte <strong>Receiving by Purchased Item</strong> de R365 en el paso 11 del wizard.</p>
            <button onClick={() => window.location.href = '/upload'}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg">
              Subir reporte
            </button>
          </div>
        ) : activeTab === 'impacto' ? (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Impacto neto {selectedWeek}</p>
                <p className={`text-2xl font-bold ${totalImpact > 0 ? 'text-red-400' : totalImpact < 0 ? 'text-green-400' : 'text-gray-400'}`}>
                  {totalImpact > 0 ? '+' : ''}{fmt(totalImpact)}
                </p>
                <p className="text-gray-600 text-xs mt-1">vs semana anterior</p>
              </div>
              <div className="bg-red-950 border border-red-800 rounded-xl p-5">
                <p className="text-red-400 text-xs mb-1">Items que subieron</p>
                <p className="text-2xl font-bold text-red-400">{increased.length}</p>
                <p className="text-red-600 text-xs mt-1">+{fmt(increased.reduce((a, b) => a + b.impact, 0))}</p>
              </div>
              <div className="bg-green-950 border border-green-800 rounded-xl p-5">
                <p className="text-green-400 text-xs mb-1">Items que bajaron</p>
                <p className="text-2xl font-bold text-green-400">{decreased.length}</p>
                <p className="text-green-600 text-xs mt-1">{fmt(decreased.reduce((a, b) => a + b.impact, 0))}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Items nuevos esta semana</p>
                <p className="text-2xl font-bold text-blue-400">{newItems.length}</p>
                <p className="text-gray-600 text-xs mt-1">no comprados la semana pasada</p>
              </div>
            </div>

            {/* Gráfica por categoría */}
            {byCatData.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Impacto por categoría</h2>
                <p className="text-gray-500 text-xs mb-4">Variación de costo neta en $ — rojo = subió, verde = bajó</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={byCatData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v.toFixed(0)} />
                    <YAxis type="category" dataKey="cat" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any) => [fmt(v), 'Impacto']} />
                    <ReferenceLine x={0} stroke="#374151" />
                    <Bar dataKey="impact" radius={[0, 4, 4, 0]}>
                      {byCatData.map((entry, i) => <Cell key={i} fill={entry.impact > 0 ? '#ef4444' : '#22c55e'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Items que subieron */}
            {increased.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">
                  🔴 Items que subieron de precio
                  <span className="text-red-400 font-normal text-sm ml-2">({increased.length} items · +{fmt(increased.reduce((a, b) => a + b.impact, 0))})</span>
                </h2>
                <VariationTable items={increased} type="increase" fmt={fmt} />
              </div>
            )}

            {/* Items que bajaron */}
            {decreased.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">
                  🟢 Items que bajaron de precio
                  <span className="text-green-400 font-normal text-sm ml-2">({decreased.length} items · {fmt(decreased.reduce((a, b) => a + b.impact, 0))})</span>
                </h2>
                <VariationTable items={decreased} type="decrease" fmt={fmt} />
              </div>
            )}

            {/* Items nuevos */}
            {newItems.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">
                  🆕 Items nuevos esta semana
                  <span className="text-blue-400 font-normal text-sm ml-2">({newItems.filter(i => selectedCategory === 'Todas' || i.category === selectedCategory).length} items)</span>
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left text-gray-500 text-xs pb-3">Item</th>
                        <th className="text-left text-gray-500 text-xs pb-3">Cat.</th>
                        <th className="text-left text-gray-500 text-xs pb-3">Proveedor</th>
                        <th className="text-right text-gray-500 text-xs pb-3">UOM</th>
                        <th className="text-right text-gray-500 text-xs pb-3">Costo Unit.</th>
                        <th className="text-right text-gray-500 text-xs pb-3">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newItems
                        .filter(i => selectedCategory === 'Todas' || i.category === selectedCategory)
                        .map((item, i) => (
                          <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                            <td className="py-2.5 text-blue-300 text-sm font-medium">{item.item_name}</td>
                            <td className="py-2.5 text-gray-500 text-xs">{item.category}</td>
                            <td className="py-2.5 text-gray-400 text-xs">{item.vendor}</td>
                            <td className="py-2.5 text-right text-gray-500 text-xs">{item.uom}</td>
                            <td className="py-2.5 text-right text-gray-300 text-xs">{fmt(item.unit_cost)}</td>
                            <td className="py-2.5 text-right text-gray-300 text-xs">{fmt(item.total_cost)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : activeTab === 'tendencia' ? (
          <div className="space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Buscar item</h2>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Escribe el nombre del item..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>

            {searchQuery && (() => {
              const matches = [...new Set(allData.map(r => r.item_name))]
                .filter(name => name.toLowerCase().includes(searchQuery.toLowerCase()))
                .slice(0, 5)

              return matches.map(itemName => {
                const history = itemHistory(itemName)
                const vendors = vendorAnalysis(itemName)
                const latestItem = allData.find(r => r.item_name === itemName && r.week === weeks[0])

                return (
                  <div key={itemName} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-white font-bold text-base">{itemName}</h3>
                        <p className="text-gray-500 text-xs mt-0.5">
                          {latestItem?.category} · {latestItem?.uom} · Proveedor actual: {latestItem?.vendor || '—'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-white font-bold">{fmt(latestItem?.unit_cost)}</p>
                        <p className="text-gray-500 text-xs">costo actual</p>
                      </div>
                    </div>

                    {history.length > 1 && (
                      <>
                        <p className="text-gray-500 text-xs mb-3">Historial de precio unitario</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <LineChart data={history}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                            <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v.toFixed(2)} />
                            <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                              formatter={(v: any) => [fmt(v), 'Costo unit.']} />
                            <Line type="monotone" dataKey="unit_cost" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </>
                    )}

                    {vendors.length > 1 && (
                      <div className="mt-4">
                        <p className="text-gray-500 text-xs mb-2">Proveedores históricos</p>
                        <div className="space-y-2">
                          {vendors.map((v, i) => (
                            <div key={i} className={`flex items-center justify-between p-2 rounded-lg border ${i === 0 ? 'bg-green-950 border-green-800' : 'bg-gray-800 border-gray-700'}`}>
                              <div>
                                <p className="text-white text-xs font-medium">{v.vendor}</p>
                                <p className="text-gray-500 text-xs">{v.weeks} semanas comprado</p>
                              </div>
                              <div className="text-right">
                                <p className={`text-sm font-bold ${i === 0 ? 'text-green-400' : 'text-gray-300'}`}>{fmt(v.avg_cost)}</p>
                                <p className="text-gray-600 text-xs">prom. · min {fmt(v.min_cost)} · max {fmt(v.max_cost)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            })()}

            {!searchQuery && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
                <p className="text-gray-500">Escribe el nombre de un insumo para ver su tendencia de precio e historial de proveedores.</p>
              </div>
            )}
          </div>
        ) : activeTab === 'proveedores' ? (
          <div className="space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Análisis de proveedores</h2>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar item para comparar proveedores..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 mb-4"
              />

              {searchQuery ? (() => {
                const matches = [...new Set(allData.map(r => r.item_name))]
                  .filter(name => name.toLowerCase().includes(searchQuery.toLowerCase()))
                  .slice(0, 8)

                return (
                  <div className="space-y-4">
                    {matches.map(itemName => {
                      const vendors = vendorAnalysis(itemName)
                      if (vendors.length < 2) return null
                      const savings = vendors[vendors.length - 1].avg_cost - vendors[0].avg_cost
                      return (
                        <div key={itemName} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-white font-medium">{itemName}</p>
                            <span className="text-green-400 text-xs bg-green-950 px-2 py-1 rounded">
                              Ahorro potencial: {fmt(savings)}/unidad
                            </span>
                          </div>
                          <div className="space-y-2">
                            {vendors.map((v, i) => (
                              <div key={i} className={`flex items-center justify-between p-2 rounded-lg ${i === 0 ? 'bg-green-950 border border-green-800' : 'bg-gray-700'}`}>
                                <div className="flex items-center gap-2">
                                  {i === 0 && <span className="text-green-400 text-xs">⭐ Más barato</span>}
                                  <p className="text-white text-xs">{v.vendor}</p>
                                  <span className="text-gray-500 text-xs">· {v.weeks} sem.</span>
                                </div>
                                <p className={`text-sm font-bold ${i === 0 ? 'text-green-400' : 'text-gray-300'}`}>{fmt(v.avg_cost)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    }).filter(Boolean)}
                    {matches.length === 0 && <p className="text-gray-500 text-sm text-center py-4">No se encontraron items</p>}
                  </div>
                )
              })() : (
                <p className="text-gray-500 text-sm text-center py-4">Busca un item para ver comparativa de proveedores</p>
              )}
            </div>
          </div>
        ) : (
          /* TABLA COMPLETA */
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">
                Todos los insumos — {selectedWeek}
                <span className="text-gray-500 font-normal text-sm ml-2">
                  ({filteredItems.length} items · {fmt(filteredItems.reduce((a, b) => a + b.total_cost, 0))} total)
                </span>
              </h2>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar item..."
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-blue-500 w-48"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-gray-500 text-xs pb-3">#</th>
                    <th className="text-left text-gray-500 text-xs pb-3">Item</th>
                    <th className="text-left text-gray-500 text-xs pb-3">Cat.</th>
                    <th className="text-left text-gray-500 text-xs pb-3">Proveedor</th>
                    <th className="text-right text-gray-500 text-xs pb-3">UOM</th>
                    <th className="text-right text-gray-500 text-xs pb-3">Qty</th>
                    <th className="text-right text-gray-500 text-xs pb-3">Costo Unit.</th>
                    <th className="text-right text-gray-500 text-xs pb-3">Total</th>
                    <th className="text-right text-gray-500 text-xs pb-3">vs ant.</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems
                    .sort((a, b) => b.total_cost - a.total_cost)
                    .map((item, i) => {
                      const prev = prevMap[item.item_name]
                      const diff = prev ? item.unit_cost - prev.unit_cost : null
                      const pct = prev && prev.unit_cost > 0 ? (diff! / prev.unit_cost) * 100 : null
                      return (
                        <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50 transition">
                          <td className="py-2.5 text-gray-600 text-xs">{i + 1}</td>
                          <td className="py-2.5 text-white text-sm font-medium">{item.item_name}</td>
                          <td className="py-2.5 text-gray-500 text-xs">{item.category}</td>
                          <td className="py-2.5 text-gray-400 text-xs">{item.vendor}</td>
                          <td className="py-2.5 text-right text-gray-500 text-xs">{item.uom}</td>
                          <td className="py-2.5 text-right text-gray-400 text-xs">{Number(item.total_qty).toFixed(2)}</td>
                          <td className="py-2.5 text-right text-gray-300 text-xs">{fmt(item.unit_cost)}</td>
                          <td className="py-2.5 text-right text-white text-xs font-medium">{fmt(item.total_cost)}</td>
                          <td className="py-2.5 text-right text-xs">
                            {diff === null ? <span className="text-blue-400">Nuevo</span> :
                              Math.abs(diff) < 0.001 ? <span className="text-gray-600">—</span> :
                              diff > 0 ? <span className="text-red-400">+{pct!.toFixed(1)}%</span> :
                              <span className="text-green-400">{pct!.toFixed(1)}%</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function VariationTable({ items, type, fmt }: any) {
  const isIncrease = type === 'increase'
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left text-gray-500 text-xs pb-3">#</th>
            <th className="text-left text-gray-500 text-xs pb-3">Item</th>
            <th className="text-left text-gray-500 text-xs pb-3">Cat.</th>
            <th className="text-right text-gray-500 text-xs pb-3">Sem. ant.</th>
            <th className="text-right text-gray-500 text-xs pb-3">Esta sem.</th>
            <th className="text-right text-gray-500 text-xs pb-3">Variación</th>
            <th className="text-right text-gray-500 text-xs pb-3">Qty</th>
            <th className="text-right text-gray-500 text-xs pb-3">Impacto $</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, i: number) => (
            <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50 transition">
              <td className="py-2.5 text-gray-600 text-xs">{i + 1}</td>
              <td className="py-2.5">
                <p className={`text-sm font-medium ${isIncrease ? 'text-red-300' : 'text-green-300'}`}>{item.item_name}</p>
                <p className="text-gray-600 text-xs">{item.vendor}</p>
              </td>
              <td className="py-2.5 text-gray-500 text-xs">{item.category}</td>
              <td className="py-2.5 text-right text-gray-400 text-xs">{fmt(item.prev_cost)}</td>
              <td className="py-2.5 text-right text-gray-300 text-xs">{fmt(item.unit_cost)}</td>
              <td className="py-2.5 text-right text-xs">
                <span className={isIncrease ? 'text-red-400' : 'text-green-400'}>
                  {isIncrease ? '+' : ''}{item.pct.toFixed(1)}%
                </span>
              </td>
              <td className="py-2.5 text-right text-gray-400 text-xs">{Number(item.total_qty).toFixed(2)} {item.uom}</td>
              <td className="py-2.5 text-right font-bold">
                <span className={isIncrease ? 'text-red-400' : 'text-green-400'}>
                  {isIncrease ? '+' : ''}{fmt(item.impact)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}