'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

const ACCOUNT_MAP: Record<string, string> = {
  'Food Inventory': 'food',
  'Food bar Inventory': 'food',
  'Beer': 'beer',
  'Alcoholic Inventory': 'liquor',
  'Beverage Inventory': 'na_beverage',
  'Wine Inventory': 'wine',
}

const CATEGORIES = [
  { key: 'food', label: 'Food', color: '#f97316', meta: 28 },
  { key: 'na_beverage', label: 'NA Beverage', color: '#06b6d4', meta: 8 },
  { key: 'liquor', label: 'Liquor', color: '#a855f7', meta: 20 },
  { key: 'beer', label: 'Beer', color: '#eab308', meta: 20 },
  { key: 'wine', label: 'Wine', color: '#ec4899', meta: 20 },
]

export default function CostoUsoPage() {
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])
  const [restaurant, setRestaurant] = useState<any>(null)
  const [mappings, setMappings] = useState<any[]>([])
  const [alerts, setAlerts] = useState<string[]>([])
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd, setRangeEnd] = useState(99)

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

    const { data: maps } = await supabase
      .from('category_mappings').select('*').eq('restaurant_id', profile.restaurant_id)
    setMappings(maps || [])

    const { data: reports } = await supabase
      .from('reports').select('*')
      .eq('restaurant_id', profile.restaurant_id)
      .order('created_at', { ascending: false })
      .limit(12)

    if (!reports || reports.length === 0) { setLoading(false); return }

    const weeksData = await Promise.all(reports.map(async (r) => {
      const [s, c, inv] = await Promise.all([
        supabase.from('sales_data').select('*').eq('report_id', r.id).single(),
        supabase.from('cogs_data').select('*').eq('report_id', r.id).single(),
        supabase.from('inventory_data').select('*').eq('report_id', r.id).single(),
      ])
      return { report: r, sales: s.data, cogs: c.data, inventory: inv.data }
    }))

    const sorted = weeksData.reverse()
    setWeeks(sorted)
    setRangeStart(0)
    setRangeEnd(sorted.length - 1)

    // Detectar alertas de ajuste de inventario
    const newAlerts: string[] = []
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      if (prev.inventory && curr.inventory) {
        const prevCurrent = prev.inventory.grand_total_current
        const currPrevious = curr.inventory.grand_total_previous
        if (prevCurrent && currPrevious) {
          const diff = Math.abs(Number(prevCurrent) - Number(currPrevious))
          if (diff > 10) {
            newAlerts.push(
              `⚠️ Ajuste detectado entre ${prev.report.week} y ${curr.report.week}: ` +
              `inv. final anterior $${Number(prevCurrent).toLocaleString('en-US', { maximumFractionDigits: 0 })} ` +
              `vs inv. inicial actual $${Number(currPrevious).toLocaleString('en-US', { maximumFractionDigits: 0 })} ` +
              `(diferencia: $${diff.toFixed(0)})`
            )
          }
        }
      }
    }
    setAlerts(newAlerts)
    setLoading(false)
  }

  function fmt(n: any) {
    if (n === null || n === undefined) return '—'
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  function pct(part: any, total: any) {
    if (!part || !total) return null
    return parseFloat((Number(part) / Number(total) * 100).toFixed(1))
  }

  function getMappedSales(categories: any[], targetType: string) {
    if (!categories || !mappings.length) return 0
    return categories
      .filter((cat: any) => {
        const mapping = mappings.find(m =>
          m.source_category.toLowerCase() === cat.name.toLowerCase()
        )
        return mapping?.mapped_to === targetType
      })
      .reduce((sum: number, cat: any) => sum + Number(cat.net || 0), 0)
  }

  function getInventoryByCategory(invAccounts: any[], categoryKey: string) {
    if (!invAccounts) return { current: 0, previous: 0 }
    const accounts = Object.entries(ACCOUNT_MAP)
      .filter(([_, cat]) => cat === categoryKey)
      .map(([acc, _]) => acc)
    const current = invAccounts
      .filter(a => accounts.includes(a.account))
      .reduce((sum, a) => sum + Number(a.current_value || 0), 0)
    const previous = invAccounts
      .filter(a => accounts.includes(a.account))
      .reduce((sum, a) => sum + Number(a.previous_value || 0), 0)
    return { current, previous }
  }

  function calcUsoCost(prevInv: number, purchases: number, currInv: number) {
    return prevInv + purchases - currInv
  }

  function buildWeekData(w: any) {
    const netSales = w.sales?.net_sales || 0
    const cogsCat = w.cogs?.by_category || {}
    const invAccounts = w.inventory?.by_account || []
    const salesCategories = w.sales?.categories || []

    const result: any = { week: w.report.week.replace('2026-', ''), netSales }

    let totalUsoCost = 0
    let totalABSales = 0

    CATEGORIES.forEach(cat => {
      const inv = getInventoryByCategory(invAccounts, cat.key)
      const purchases = cogsCat[cat.key] || 0
      const uso = calcUsoCost(inv.previous, purchases, inv.current)
      const catSales = getMappedSales(salesCategories, cat.key) || netSales
      const usoPct = pct(uso, catSales)

      result[cat.key + '_uso'] = uso > 0 ? uso : 0
      result[cat.key + '_uso_pct'] = usoPct || 0
      result[cat.key + '_inv_current'] = inv.current
      result[cat.key + '_inv_previous'] = inv.previous
      result[cat.key + '_purchases'] = purchases

      if (uso > 0) totalUsoCost += uso
      totalABSales += catSales !== netSales ? catSales : 0
    })

    result.totalUsoCost = totalUsoCost
    result.totalUsoPct = pct(totalUsoCost, totalABSales || netSales) || 0
    result.hasInventory = invAccounts.length > 0
    return result
  }

  const filtered = weeks.slice(rangeStart, rangeEnd + 1)
  const chartData = filtered.map(buildWeekData)
  const latest = filtered[filtered.length - 1]
  const latestData = latest ? buildWeekData(latest) : null

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando costo de uso...</p>
    </div>
  )

  const hasInventory = weeks.some(w => w.inventory?.by_account?.length > 0)

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-white font-bold text-lg">📦 Costo de Uso</h1>
            <span className="bg-blue-900 text-blue-400 text-xs px-2 py-0.5 rounded-full font-medium">
              Inventario Real
            </span>
          </div>
          <p className="text-gray-500 text-xs mt-0.5">
            {restaurant?.name} · (Inv. Anterior + Compras − Inv. Actual) / Ventas
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-500 text-xs">Desde:</span>
          <select
            value={rangeStart}
            onChange={e => setRangeStart(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
          >
            {weeks.map((w, i) => (
              <option key={w.report.week} value={i}>{w.report.week}</option>
            ))}
          </select>
          <span className="text-gray-500 text-xs">Hasta:</span>
          <select
            value={rangeEnd}
            onChange={e => setRangeEnd(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
          >
            {weeks.map((w, i) => (
              <option key={w.report.week} value={i}>{w.report.week}</option>
            ))}
          </select>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Explicación */}
        <div className="bg-blue-950 border border-blue-900 rounded-xl px-5 py-3 flex items-start gap-3">
          <span className="text-blue-400 text-lg">ℹ️</span>
          <div>
            <p className="text-blue-300 text-sm font-medium">Costo de Uso de Inventario</p>
            <p className="text-blue-400 text-xs mt-0.5">
              Calcula el costo <strong>real</strong> de lo que se consumió:
              <strong> Inventario Anterior + Compras − Inventario Actual</strong>.
              Requiere subir el reporte Inventory Count Review cada semana.
            </p>
          </div>
        </div>

        {/* Alertas de ajuste */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((alert, i) => (
              <div key={i} className="bg-yellow-950 border border-yellow-800 rounded-xl px-5 py-3 flex items-start gap-3">
                <span className="text-yellow-400 text-lg shrink-0">⚠️</span>
                <p className="text-yellow-300 text-sm">{alert}</p>
              </div>
            ))}
          </div>
        )}

        {!hasInventory ? (
          <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-10 text-center">
            <div className="text-5xl mb-4">📦</div>
            <h2 className="text-white font-semibold text-lg mb-2">No hay datos de inventario</h2>
            <p className="text-gray-500 mb-6">
              Sube el reporte <strong>Inventory Count Review</strong> de R365 junto con tu reporte semanal.
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
            {/* KPIs semana más reciente */}
            {latestData && (
              <div>
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
                  Semana más reciente — {latest?.report?.week}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 md:col-span-1">
                    <p className="text-gray-500 text-xs mb-1">Total Costo de Uso A&B</p>
                    <p className="text-3xl font-bold text-blue-400">
                      {latestData.totalUsoPct ? latestData.totalUsoPct + '%' : '—'}
                    </p>
                    <p className="text-gray-600 text-xs mt-1">{fmt(latestData.totalUsoCost)} costo real</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-gray-500 text-xs mb-1">Inv. Actual Total</p>
                    <p className="text-2xl font-bold text-white">
                      {fmt(latest?.inventory?.grand_total_current)}
                    </p>
                    <p className="text-gray-600 text-xs mt-1">valor al cierre de semana</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-gray-500 text-xs mb-1">Inv. Anterior Total</p>
                    <p className="text-2xl font-bold text-white">
                      {fmt(latest?.inventory?.grand_total_previous)}
                    </p>
                    <p className="text-gray-600 text-xs mt-1">valor al inicio de semana</p>
                  </div>
                </div>

                {/* Cards por categoría */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {CATEGORIES.map(cat => {
                    const usoPct = latestData[cat.key + '_uso_pct']
                    const uso$ = latestData[cat.key + '_uso']
                    const overMeta = cat.meta && usoPct && usoPct > cat.meta
                    return (
                      <div
                        key={cat.key}
                        className="bg-gray-900 border border-gray-800 rounded-xl p-4"
                      >
                        <p className="text-gray-500 text-xs mb-1">{cat.label}</p>
                        <p className="text-lg font-bold" style={{ color: cat.color }}>
                          {usoPct ? usoPct + '%' : '—'}
                        </p>
                        <p className="text-gray-600 text-xs">{fmt(uso$)}</p>
                        <div className="mt-2 space-y-1 text-xs text-gray-600">
                          <p>Inv ant: {fmt(latestData[cat.key + '_inv_previous'])}</p>
                          <p>Compras: {fmt(latestData[cat.key + '_purchases'])}</p>
                          <p>Inv act: {fmt(latestData[cat.key + '_inv_current'])}</p>
                        </div>
                        {cat.meta && usoPct && (
                          <p className={`text-xs mt-2 ${overMeta ? 'text-red-400' : 'text-green-400'}`}>
                            {overMeta ? '▲ sobre meta' : '✓ en meta'}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Gráfica costo de uso % por semana */}
            {chartData.filter(d => d.hasInventory).length > 1 && (
              <>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h2 className="text-white font-semibold mb-1">Costo de Uso % por semana</h2>
                  <p className="text-gray-500 text-xs mb-4">Tendencia por categoría</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData.filter(d => d.hasInventory)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                      <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any, name: any) => [v + '%', name]} />
                      <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                      {CATEGORIES.map(cat => (
                        <Line
                          key={cat.key}
                          type="monotone"
                          dataKey={cat.key + '_uso_pct'}
                          name={cat.label}
                          stroke={cat.color}
                          strokeWidth={2}
                          dot={{ fill: cat.color, r: 3 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Gráfica costo de uso $ */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h2 className="text-white font-semibold mb-1">Costo de Uso $ por semana</h2>
                  <p className="text-gray-500 text-xs mb-4">Desglose en dólares</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={chartData.filter(d => d.hasInventory)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
                      <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any, name: any) => ['$' + Number(v).toLocaleString(), name]} />
                      <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                      {CATEGORIES.map(cat => (
                        <Bar key={cat.key} dataKey={cat.key + '_uso'} name={cat.label} fill={cat.color} stackId="a" />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {/* Tabla comparativa */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Detalle por semana — Costo de Uso</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Semana</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Food %</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Liquor %</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Beer %</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">NA Bev %</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Wine %</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Total Uso $</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Inventario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...filtered].reverse().map((w) => {
                      const d = buildWeekData(w)
                      return (
                        <tr key={w.report.id} className="border-b border-gray-800 hover:bg-gray-800 transition">
                          <td className="py-3 text-gray-300">{w.report.week}</td>
                          <td className="py-3 text-right text-orange-400">{d.food_uso_pct ? d.food_uso_pct + '%' : '—'}</td>
                          <td className="py-3 text-right text-purple-400">{d.liquor_uso_pct ? d.liquor_uso_pct + '%' : '—'}</td>
                          <td className="py-3 text-right text-yellow-400">{d.beer_uso_pct ? d.beer_uso_pct + '%' : '—'}</td>
                          <td className="py-3 text-right text-cyan-400">{d.na_beverage_uso_pct ? d.na_beverage_uso_pct + '%' : '—'}</td>
                          <td className="py-3 text-right text-pink-400">{d.wine_uso_pct ? d.wine_uso_pct + '%' : '—'}</td>
                          <td className="py-3 text-right text-white font-medium">{fmt(d.totalUsoCost)}</td>
                          <td className="py-3 text-right">
                            {d.hasInventory
                              ? <span className="text-green-400 text-xs">✓ Subido</span>
                              : <span className="text-gray-600 text-xs">— Sin datos</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
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