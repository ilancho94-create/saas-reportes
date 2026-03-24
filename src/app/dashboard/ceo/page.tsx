'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, ReferenceLine
} from 'recharts'

const TABS = ['Resumen', 'Financiero', 'Labor', 'Costos']

export default function CeoDashboard() {
  const [loading, setLoading] = useState(true)
  const [restaurant, setRestaurant] = useState<any>(null)
  const [weeks, setWeeks] = useState<any[]>([])
  const [latest, setLatest] = useState<any>(null)
  const [prev, setPrev] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('Resumen')

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
      .from('reports').select('*').eq('restaurant_id', profile.restaurant_id)
      .order('created_at', { ascending: false }).limit(8)
    if (!reports || reports.length === 0) { setLoading(false); return }

    const weeksData = await Promise.all(reports.map(async (r) => {
      const [s, l, w, c, a] = await Promise.all([
        supabase.from('sales_data').select('*').eq('report_id', r.id).single(),
        supabase.from('labor_data').select('*').eq('report_id', r.id).single(),
        supabase.from('waste_data').select('*').eq('report_id', r.id).single(),
        supabase.from('cogs_data').select('*').eq('report_id', r.id).single(),
        supabase.from('avt_data').select('*').eq('report_id', r.id).single(),
      ])
      return { report: r, sales: s.data, labor: l.data, waste: w.data, cogs: c.data, avt: a.data }
    }))

    setWeeks(weeksData.reverse())
    setLatest(weeksData[weeksData.length - 1])
    setPrev(weeksData[weeksData.length - 2] || null)
    setLoading(false)
  }

  function fmt(n: any, decimals = 0) {
    if (n === null || n === undefined) return '—'
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })
  }

  function pct(part: any, total: any) {
    if (!part || !total) return null
    return parseFloat((Number(part) / Number(total) * 100).toFixed(1))
  }

  function delta(curr: any, prev: any) {
    if (curr === null || curr === undefined || prev === null || prev === undefined) return null
    return parseFloat((Number(curr) - Number(prev)).toFixed(1))
  }

  function DeltaBadge({ curr, prev, upIsGood = true, suffix = '', prefix = '' }: any) {
    const d = delta(curr, prev)
    if (d === null) return null
    const isUp = d > 0
    const isGood = upIsGood ? isUp : !isUp
    return (
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isGood ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
        {isUp ? '▲' : '▼'} {prefix}{Math.abs(d).toLocaleString('en-US', { maximumFractionDigits: 1 })}{suffix}
      </span>
    )
  }

  function KpiCard({ icon, label, value, suffix = '', prefix = '', sub, curr, prev, upIsGood = true, color = 'text-white' }: any) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-2xl">{icon}</span>
          <DeltaBadge curr={curr} prev={prev} upIsGood={upIsGood} suffix={suffix} prefix={prefix} />
        </div>
        <div>
          <p className={`text-2xl font-bold ${color}`}>
            {value !== null && value !== undefined ? `${prefix}${value}${suffix}` : '—'}
          </p>
          <p className="text-gray-500 text-xs mt-0.5">{label}</p>
        </div>
        {sub && <p className="text-gray-600 text-xs border-t border-gray-800 pt-2">{sub}</p>}
      </div>
    )
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="text-4xl mb-3">📊</div>
        <p className="text-gray-400">Cargando dashboard CEO...</p>
      </div>
    </div>
  )

  const s = latest?.sales
  const l = latest?.labor
  const w = latest?.waste
  const c = latest?.cogs
  const a = latest?.avt
  const ps = prev?.sales
  const pl = prev?.labor

  const laborPct = pct(l?.total_pay, s?.net_sales)
  const prevLaborPct = pct(pl?.total_pay, ps?.net_sales)
  const foodCostPct = pct(c?.by_category?.food, s?.net_sales)
  const primeCost = laborPct !== null && foodCostPct !== null ? parseFloat((laborPct + foodCostPct).toFixed(1)) : null

  const chartData = weeks.map(wk => ({
    week: wk.report.week.replace('2026-', ''),
    ventas: wk.sales?.net_sales || 0,
    labor$: wk.labor?.total_pay || 0,
    laborPct: pct(wk.labor?.total_pay, wk.sales?.net_sales) || 0,
    foodCost: pct(wk.cogs?.by_category?.food, wk.sales?.net_sales) || 0,
    waste: wk.waste?.total_cost || 0,
    avgGuest: wk.sales?.avg_per_guest || 0,
    primeCost: (() => {
      const lp = pct(wk.labor?.total_pay, wk.sales?.net_sales)
      const fp = pct(wk.cogs?.by_category?.food, wk.sales?.net_sales)
      return lp && fp ? parseFloat((lp + fp).toFixed(1)) : 0
    })(),
  }))

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => window.location.href = '/dashboard'} className="text-gray-400 hover:text-white text-sm transition">
              ← Dashboard
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold">Dashboard CEO</span>
                <span className="bg-yellow-900 text-yellow-400 text-xs px-2 py-0.5 rounded-full">👑 Ejecutivo</span>
              </div>
              <p className="text-gray-500 text-xs mt-0.5">{restaurant?.name} · {restaurant?.organizations?.name}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-white text-sm font-medium">{latest?.report?.week}</p>
            <p className="text-gray-500 text-xs">{latest?.report?.week_start} al {latest?.report?.week_end}</p>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-800 bg-gray-900 px-6">
        <div className="max-w-6xl mx-auto flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 ${
                activeTab === tab
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* TAB: RESUMEN */}
        {activeTab === 'Resumen' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard icon="💰" label="Ventas Netas" value={s?.net_sales ? Number(s.net_sales).toLocaleString('en-US', {maximumFractionDigits:0}) : null} prefix="$" sub={`${s?.orders || 0} órdenes · ${s?.guests || 0} guests`} curr={s?.net_sales} prev={ps?.net_sales} upIsGood={true} color="text-blue-400" />
              <KpiCard icon="👥" label="% Labor Cost" value={laborPct} suffix="%" sub={`${fmt(l?.total_pay)} total · ${l?.total_ot_hours?.toFixed(1)}h OT`} curr={laborPct} prev={prevLaborPct} upIsGood={false} color="text-purple-400" />
              <KpiCard icon="🍽️" label="Avg / Guest" value={s?.avg_per_guest ? Number(s.avg_per_guest).toFixed(2) : null} prefix="$" sub={`Avg orden: ${fmt(s?.avg_per_order)}`} curr={s?.avg_per_guest} prev={ps?.avg_per_guest} upIsGood={true} color="text-yellow-400" />
              <KpiCard icon="⭐" label="Prime Cost" value={primeCost} suffix="%" sub="Labor + Food Cost" curr={primeCost} prev={null} upIsGood={false} color={primeCost && primeCost > 65 ? 'text-red-400' : 'text-green-400'} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard icon="🛒" label="Food Cost %" value={foodCostPct} suffix="%" sub={`${fmt(c?.by_category?.food)} en food`} curr={foodCostPct} prev={null} upIsGood={false} color="text-orange-400" />
              <KpiCard icon="🗑️" label="Waste" value={w?.total_cost ? Number(w.total_cost).toLocaleString('en-US',{maximumFractionDigits:0}) : null} prefix="$" sub={`${w?.items?.length || 0} items registrados`} curr={w?.total_cost} prev={prev?.waste?.total_cost} upIsGood={false} color="text-green-400" />
              <KpiCard icon="📊" label="AvT Neto" value={a?.net_variance ? Number(a.net_variance).toLocaleString('en-US',{maximumFractionDigits:0}) : null} prefix="$" sub={`Faltantes: ${fmt(a?.total_shortages)}`} curr={null} prev={null} upIsGood={false} color={a?.net_variance > 0 ? 'text-red-400' : 'text-green-400'} />
              <KpiCard icon="🏷️" label="Descuentos" value={s?.discounts ? Number(s.discounts).toLocaleString('en-US',{maximumFractionDigits:0}) : null} prefix="$" sub={`Ventas brutas: ${fmt(s?.gross_sales)}`} curr={s?.discounts} prev={ps?.discounts} upIsGood={false} color="text-red-400" />
            </div>

            {/* Gráfica combinada ventas + prime cost */}
            {chartData.length > 1 && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h2 className="text-white font-semibold mb-1">Tendencia — Ventas & Prime Cost</h2>
                <p className="text-gray-500 text-xs mb-4">Últimas {chartData.length} semanas</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} labelStyle={{ color: '#9ca3af' }} formatter={(v: any, name: string) => name === 'ventas' ? ['$' + Number(v).toLocaleString(), 'Ventas'] : [v + '%', name === 'primeCost' ? 'Prime Cost' : '% Labor']} />
                    <Legend formatter={(v) => v === 'ventas' ? 'Ventas' : v === 'primeCost' ? 'Prime Cost %' : '% Labor'} wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                    <Line yAxisId="left" type="monotone" dataKey="ventas" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
                    <Line yAxisId="right" type="monotone" dataKey="laborPct" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 3 }} />
                    <Line yAxisId="right" type="monotone" dataKey="primeCost" stroke="#f97316" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#f97316', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Resumen lunch/dinner */}
            {s && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Lunch órdenes', value: s?.raw_data?.lunch?.orders, sub: fmt(s?.raw_data?.lunch?.net) },
                  { label: 'Dinner órdenes', value: s?.raw_data?.dinner?.orders, sub: fmt(s?.raw_data?.dinner?.net) },
                  { label: 'Tips totales', value: fmt(s?.raw_data?.tips), sub: 'del período' },
                  { label: 'Impuestos', value: fmt(s?.raw_data?.tax), sub: 'del período' },
                ].map(item => (
                  <div key={item.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                    <p className="text-gray-500 text-xs mb-1">{item.label}</p>
                    <p className="text-white font-bold text-lg">{item.value || '—'}</p>
                    <p className="text-gray-600 text-xs">{item.sub}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* TAB: FINANCIERO */}
        {activeTab === 'Financiero' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h2 className="text-white font-semibold mb-4">Ventas por semana</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Ventas']} />
                    <Bar dataKey="ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h2 className="text-white font-semibold mb-4">Avg / Guest por semana</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => ['$' + Number(v).toFixed(2), 'Avg/Guest']} />
                    <Line type="monotone" dataKey="avgGuest" stroke="#eab308" strokeWidth={2} dot={{ fill: '#eab308', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            {s?.categories && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h2 className="text-white font-semibold mb-4">Ventas por categoría — {latest?.report?.week}</h2>
                <div className="space-y-3">
                  {s.categories.map((cat: any) => (
                    <div key={cat.name} className="flex items-center gap-4">
                      <span className="text-gray-400 text-sm w-40 truncate">{cat.name}</span>
                      <div className="flex-1 bg-gray-800 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(Number(cat.pct), 100)}%` }} />
                      </div>
                      <span className="text-white text-sm font-medium w-20 text-right">{fmt(cat.net)}</span>
                      <span className="text-gray-500 text-xs w-12 text-right">{Number(cat.pct).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* TAB: LABOR */}
        {activeTab === 'Labor' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h2 className="text-white font-semibold mb-4">% Labor cost por semana</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                    <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Meta 30%', fill: '#ef4444', fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => [v + '%', '% Labor']} />
                    <Line type="monotone" dataKey="laborPct" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h2 className="text-white font-semibold mb-4">Costo labor $ por semana</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(1) + 'k'} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Labor $']} />
                    <Bar dataKey="labor$" fill="#a855f7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            {l?.by_position && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h2 className="text-white font-semibold mb-4">Labor por puesto — {latest?.report?.week}</h2>
                <div className="space-y-3">
                  {l.by_position.map((pos: any) => (
                    <div key={pos.position} className="flex items-center justify-between py-2 border-b border-gray-800">
                      <span className="text-gray-300 text-sm">{pos.position}</span>
                      <div className="flex items-center gap-6">
                        <span className="text-gray-500 text-xs">{Number(pos.regular_hours).toFixed(0)}h reg</span>
                        {pos.ot_hours > 0 && <span className="text-amber-400 text-xs">{Number(pos.ot_hours).toFixed(1)}h OT</span>}
                        <span className="text-white font-medium text-sm">{fmt(pos.total_pay)}</span>
                        <span className="text-gray-500 text-xs w-12 text-right">{pct(pos.total_pay, l.total_pay)?.toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* TAB: COSTOS */}
        {activeTab === 'Costos' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <h2 className="text-white font-semibold mb-4">Waste por semana</h2>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Waste']} />
                    <Bar dataKey="waste" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {c?.by_category && (
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                  <h2 className="text-white font-semibold mb-4">COGS por categoría</h2>
                  <div className="space-y-3">
                    {Object.entries(c.by_category).map(([key, val]: any) => (
                      <div key={key} className="flex items-center gap-4">
                        <span className="text-gray-400 text-sm w-28 capitalize">{key.replace('_', ' ')}</span>
                        <div className="flex-1 bg-gray-800 rounded-full h-2">
                          <div className="bg-orange-500 h-2 rounded-full" style={{ width: `${Math.min(pct(val, c.total) || 0, 100)}%` }} />
                        </div>
                        <span className="text-white text-sm font-medium w-20 text-right">{fmt(val)}</span>
                        <span className="text-gray-500 text-xs w-10 text-right">{pct(val, c.total)?.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between">
                    <span className="text-gray-400 text-sm font-medium">Total COGS</span>
                    <span className="text-white font-bold">{fmt(c.total)}</span>
                  </div>
                </div>
              )}
            </div>
            {w?.items && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white font-semibold">Top Waste items — {latest?.report?.week}</h2>
                  <span className="text-green-400 font-bold">{fmt(w.total_cost)}</span>
                </div>
                <div className="space-y-2">
                  {w.items.slice(0, 10).map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800">
                      <div>
                        <p className="text-gray-300 text-sm">{item.name}</p>
                        <p className="text-gray-600 text-xs">{item.qty} {item.uom} · {item.category}</p>
                      </div>
                      <span className="text-white text-sm font-medium">${Number(item.total).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

      </main>
    </div>
  )
}