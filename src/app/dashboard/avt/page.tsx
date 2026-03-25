'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, LineChart, Line, ReferenceLine, Cell
} from 'recharts'

const REASONS = [
  'Conteo incorrecto', 'Merma no registrada', 'Robo/Theft',
  'Error de receta', 'Transferencia no registrada',
  'Ajuste de inventario', 'En investigación', 'Otro'
]
const ACTIONS = [
  'Ninguna', 'Revisar receta', 'Capacitar al staff',
  'Investigar', 'Ajustar par levels', 'Hacer conteo físico'
]
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'text-yellow-400' },
  in_progress: { label: 'En proceso', color: 'text-blue-400' },
  resolved: { label: 'Resuelto', color: 'text-green-400' },
}
const CATEGORIES = ['Todas', 'BAR', 'FOOD', 'BEVERAGE', 'CHEMICALS', 'SUPPLIES']

type SortKey = 'variance_dollar' | 'name' | 'unit_cost' | 'variance_qty'
type ViewMode = 'dollar' | 'qty'

export default function AvtPage() {
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])
  const [selectedWeek, setSelectedWeek] = useState('')
  const [restaurant, setRestaurant] = useState<any>(null)
  const [restaurantId, setRestaurantId] = useState('00000000-0000-0000-0000-000000000001')
  const [tracking, setTracking] = useState<Record<string, any>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('Todas')
  const [sortKey, setSortKey] = useState<SortKey>('variance_dollar')
  const [viewMode, setViewMode] = useState<ViewMode>('dollar')
  const [showAllShortages, setShowAllShortages] = useState(false)
  const [showAllOverages, setShowAllOverages] = useState(false)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'seguimiento'>('dashboard')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else loadData()
    })
  }, [])

  useEffect(() => {
    if (selectedWeek) loadTracking(selectedWeek)
  }, [selectedWeek])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
    const rid = profile?.restaurant_id || '00000000-0000-0000-0000-000000000001'
    setRestaurantId(rid)
    const { data: rest } = await supabase.from('restaurants').select('*').eq('id', rid).single()
    setRestaurant(rest)
    const { data: reports } = await supabase.from('reports').select('*')
      .eq('restaurant_id', rid).order('week', { ascending: false }).limit(12)
    if (!reports?.length) { setLoading(false); return }
    const weeksData = await Promise.all(reports.map(async r => {
      const { data: avt } = await supabase.from('avt_data').select('*').eq('report_id', r.id).single()
      return { report: r, avt }
    }))
    const withAvt = weeksData.filter(w => w.avt)
    setWeeks(withAvt)
    if (withAvt.length > 0) setSelectedWeek(withAvt[0].report.week)
    setLoading(false)
  }

  async function loadTracking(week: string) {
    const { data } = await supabase.from('avt_tracking')
      .select('*').eq('restaurant_id', restaurantId).eq('week', week)
    const map: Record<string, any> = {}
    for (const t of data || []) map[t.item_name] = t
    setTracking(map)
  }

  async function saveTracking(item: any, field: string, value: string) {
    setSavingId(item.name + field)
    const existing = tracking[item.name] || {}
    const upsertData = {
      restaurant_id: restaurantId,
      item_name: item.name,
      category: item.category,
      week: selectedWeek,
      variance_dollar: item.unexp_var_dollar,
      variance_qty: item.unexp_var_qty,
      unit_cost: item.unit_cost,
      uom: item.uom,
      type: item.unexp_var_dollar > 0 ? 'shortage' : 'overage',
      ...existing,
      [field]: value,
      updated_at: new Date().toISOString(),
    }
    await supabase.from('avt_tracking').upsert(upsertData, { onConflict: 'restaurant_id,item_name,week' })
    setTracking(prev => ({ ...prev, [item.name]: { ...existing, [field]: value } }))
    setSavingId(null)
  }

  function fmt(n: any) {
    if (n === null || n === undefined) return '—'
    const num = Number(n)
    return '$' + Math.abs(num).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }
  function fmtQty(n: any, uom: string) {
    if (!n) return '—'
    return Number(n).toFixed(2) + ' ' + (uom || '')
  }
  function fmtSigned(n: any) {
    if (!n) return '—'
    const num = Number(n)
    if (num > 0) return '+' + fmt(num)
    return '(' + fmt(num) + ')'
  }

  const selected = weeks.find(w => w.report.week === selectedWeek)
  const rawData = selected?.avt?.raw_data || selected?.avt

  // Reconstruir items desde raw_data con estructura nueva
  const allShortages: any[] = rawData?.shortages || selected?.avt?.shortages || []
  const allOverages: any[] = rawData?.overages || selected?.avt?.overages || []

  // Filtrar por categoría
  const filteredShortages = selectedCategory === 'Todas'
    ? allShortages
    : allShortages.filter((i: any) => i.category === selectedCategory)
  const filteredOverages = selectedCategory === 'Todas'
    ? allOverages
    : allOverages.filter((i: any) => i.category === selectedCategory)

  // Ordenar
  function sortItems(items: any[]) {
    return [...items].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name)
      if (sortKey === 'unit_cost') return Number(b.unit_cost) - Number(a.unit_cost)
      if (sortKey === 'variance_qty') return Math.abs(Number(b.unexp_var_qty || b.variance_qty)) - Math.abs(Number(a.unexp_var_qty || a.variance_qty))
      return Math.abs(Number(b.unexp_var_dollar || b.variance_dollar)) - Math.abs(Number(a.unexp_var_dollar || a.variance_dollar))
    })
  }

  const sortedShortages = sortItems(filteredShortages)
  const sortedOverages = sortItems(filteredOverages)
  const top10Shortages = sortedShortages.slice(0, 10)
  const top10Overages = sortedOverages.slice(0, 10)

  // KPIs
  const totalShortage = filteredShortages.reduce((a: number, b: any) => a + Math.abs(Number(b.unexp_var_dollar || b.variance_dollar || 0)), 0)
  const totalOverage = filteredOverages.reduce((a: number, b: any) => a + Math.abs(Number(b.unexp_var_dollar || b.variance_dollar || 0)), 0)
  const netVariance = totalShortage - totalOverage

  // Tendencia semanal
  const trendData = [...weeks].reverse().map(w => ({
    week: w.report.week.replace('2026-', ''),
    faltantes: Number(w.avt?.total_shortage_dollar || w.avt?.total_shortages || 0),
    sobrantes: Number(w.avt?.total_overage_dollar || w.avt?.total_overages || 0),
    neto: Number(w.avt?.net_variance_dollar || w.avt?.net_variance || 0),
  }))

  // Por categoría
  const byCatData = rawData?.by_category || []

  // Seguimiento pendiente
  const pendingTracking = Object.values(tracking).filter((t: any) => t.status !== 'resolved')
  const top10Names = new Set([...top10Shortages, ...top10Overages].map((i: any) => i.name))

  // Detectar repeticiones (items que aparecen en múltiples semanas)
  const repeatItems: Record<string, number> = {}
  weeks.forEach(w => {
    const s = w.avt?.shortages || []
    const o = w.avt?.overages || []
    ;[...s, ...o].forEach((item: any) => {
      repeatItems[item.name] = (repeatItems[item.name] || 0) + 1
    })
  })

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando AvT...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">📊 Actual vs Teórico</h1>
          <p className="text-gray-500 text-xs mt-0.5">
            {restaurant?.name} · Faltante = varianza inesperada positiva · Sobrante = negativa (entre paréntesis)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500">
            {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 bg-gray-900 px-6">
        <div className="flex gap-1">
          {[
            { key: 'dashboard', label: '📊 Dashboard' },
            { key: 'seguimiento', label: `🔍 Seguimiento ${pendingTracking.length > 0 ? `(${pendingTracking.length})` : ''}` },
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
            <div className="text-5xl mb-4">📊</div>
            <h2 className="text-white font-semibold text-lg mb-2">No hay datos de AvT</h2>
            <p className="text-gray-500 mb-6">Sube el <strong>Actual vs Theoretical Analysis</strong> de R365.</p>
            <button onClick={() => window.location.href = '/upload'}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg">
              Subir reporte
            </button>
          </div>
        ) : activeTab === 'dashboard' ? (
          <>
            {/* Filtros */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-xs">Categoría:</span>
                <div className="flex gap-1">
                  {CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${selectedCategory === cat ? 'bg-blue-600 border-blue-500 text-white' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-gray-500 text-xs">Ver en:</span>
                <button onClick={() => setViewMode('dollar')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${viewMode === 'dollar' ? 'bg-blue-600 border-blue-500 text-white' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
                  $ Dinero
                </button>
                <button onClick={() => setViewMode('qty')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${viewMode === 'qty' ? 'bg-blue-600 border-blue-500 text-white' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
                  Qty Cantidad
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 text-xs">Ordenar:</span>
                {(['variance_dollar', 'variance_qty', 'unit_cost', 'name'] as SortKey[]).map(key => (
                  <button key={key} onClick={() => setSortKey(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${sortKey === key ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-700 text-gray-500 hover:text-white'}`}>
                    {key === 'variance_dollar' ? '$ Varianza' : key === 'variance_qty' ? 'Qty' : key === 'unit_cost' ? 'Costo' : 'A-Z'}
                  </button>
                ))}
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Total Faltantes</p>
                <p className="text-2xl font-bold text-red-400">{fmt(totalShortage)}</p>
                <p className="text-gray-600 text-xs mt-1">{filteredShortages.length} items</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Total Sobrantes</p>
                <p className="text-2xl font-bold text-green-400">({fmt(totalOverage)})</p>
                <p className="text-gray-600 text-xs mt-1">{filteredOverages.length} items</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Varianza Neta</p>
                <p className={`text-2xl font-bold ${netVariance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {netVariance > 0 ? fmt(netVariance) : '(' + fmt(netVariance) + ')'}
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">Items recurrentes</p>
                <p className="text-2xl font-bold text-orange-400">
                  {Object.values(repeatItems).filter(c => c > 1).length}
                </p>
                <p className="text-gray-600 text-xs mt-1">aparecen 2+ semanas</p>
              </div>
            </div>

            {/* Gráficas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Tendencia semanal</h2>
                <p className="text-gray-500 text-xs mb-4">Faltantes, sobrantes y neto</p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + Math.abs(v)} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any, name: any) => [fmt(v), name]} />
                    <ReferenceLine y={0} stroke="#374151" />
                    <Line type="monotone" dataKey="faltantes" name="Faltantes" stroke="#ef4444" strokeWidth={2} dot={{ fill: '#ef4444', r: 3 }} />
                    <Line type="monotone" dataKey="sobrantes" name="Sobrantes" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e', r: 3 }} />
                    <Line type="monotone" dataKey="neto" name="Neto" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#f59e0b', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Por categoría</h2>
                <p className="text-gray-500 text-xs mb-4">Varianza neta {selectedWeek}</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={byCatData.map((c: any) => ({ ...c, neto: (c.total_shortage_dollar || 0) - (c.total_overage_dollar || 0) }))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + Math.abs(v)} />
                    <YAxis type="category" dataKey="category" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => [fmt(v), 'Varianza neta']} />
                    <Bar dataKey="neto" radius={[0, 4, 4, 0]}>
                      {byCatData.map((_: any, i: number) => (
                        <Cell key={i} fill="#ef4444" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Top faltantes</h2>
                <p className="text-gray-500 text-xs mb-4">{selectedWeek}</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={top10Shortages.slice(0, 5).map((i: any) => ({
                    name: i.name?.length > 15 ? i.name.substring(0, 15) + '...' : i.name,
                    fullName: i.name,
                    valor: viewMode === 'dollar' ? Math.abs(Number(i.unexp_var_dollar || i.variance_dollar || 0)) : Math.abs(Number(i.unexp_var_qty || i.variance_qty || 0)),
                  }))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => viewMode === 'dollar' ? '$' + v : v + ''} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} width={110} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any, _: any, props: any) => [viewMode === 'dollar' ? fmt(v) : v.toFixed(2), props.payload.fullName]} />
                    <Bar dataKey="valor" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top 10 Faltantes */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">
                  🔴 Top 10 Faltantes — {selectedWeek}
                  <span className="text-red-400 font-normal text-sm ml-2">({filteredShortages.length} total · {fmt(totalShortage)})</span>
                </h2>
                {filteredShortages.length > 10 && (
                  <button onClick={() => setShowAllShortages(!showAllShortages)}
                    className="text-blue-400 text-xs hover:text-blue-300 transition">
                    {showAllShortages ? 'Ver menos' : `Ver todos (${filteredShortages.length})`}
                  </button>
                )}
              </div>
              <ItemTable
                items={showAllShortages ? sortedShortages : top10Shortages}
                type="shortage"
                viewMode={viewMode}
                tracking={tracking}
                savingId={savingId}
                repeatItems={repeatItems}
                top10Names={top10Names}
                onSave={saveTracking}
                fmt={fmt}
                fmtQty={fmtQty}
                showTracking={true}
              />
            </div>

            {/* Top 10 Sobrantes */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">
                  🟢 Top 10 Sobrantes — {selectedWeek}
                  <span className="text-green-400 font-normal text-sm ml-2">({filteredOverages.length} total · ({fmt(totalOverage)}))</span>
                </h2>
                {filteredOverages.length > 10 && (
                  <button onClick={() => setShowAllOverages(!showAllOverages)}
                    className="text-blue-400 text-xs hover:text-blue-300 transition">
                    {showAllOverages ? 'Ver menos' : `Ver todos (${filteredOverages.length})`}
                  </button>
                )}
              </div>
              <ItemTable
                items={showAllOverages ? sortedOverages : top10Overages}
                type="overage"
                viewMode={viewMode}
                tracking={tracking}
                savingId={savingId}
                repeatItems={repeatItems}
                top10Names={top10Names}
                onSave={saveTracking}
                fmt={fmt}
                fmtQty={fmtQty}
                showTracking={true}
              />
            </div>
          </>
        ) : (
          /* TAB SEGUIMIENTO */
          <SeguimientoTab
            weeks={weeks}
            restaurantId={restaurantId}
            fmt={fmt}
          />
        )}
      </main>
    </div>
  )
}

function ItemTable({ items, type, viewMode, tracking, savingId, repeatItems, top10Names, onSave, fmt, fmtQty, showTracking }: any) {
  const isShortage = type === 'shortage'
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left text-gray-500 text-xs pb-3 font-medium">Item</th>
            <th className="text-left text-gray-500 text-xs pb-3 font-medium">Cat.</th>
            <th className="text-right text-gray-500 text-xs pb-3 font-medium">UOM</th>
            <th className="text-right text-gray-500 text-xs pb-3 font-medium">Costo Unit.</th>
            {viewMode === 'dollar' ? (
              <th className="text-right text-gray-500 text-xs pb-3 font-medium">Varianza $</th>
            ) : (
              <th className="text-right text-gray-500 text-xs pb-3 font-medium">Varianza Qty</th>
            )}
            {showTracking && (
              <>
                <th className="text-left text-gray-500 text-xs pb-3 font-medium w-36">Razón</th>
                <th className="text-left text-gray-500 text-xs pb-3 font-medium w-36">Acción</th>
                <th className="text-left text-gray-500 text-xs pb-3 font-medium w-24">Responsable</th>
                <th className="text-left text-gray-500 text-xs pb-3 font-medium w-24">Estado</th>
                <th className="text-left text-gray-500 text-xs pb-3 font-medium">Nota</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, i: number) => {
            const varDollar = Math.abs(Number(item.unexp_var_dollar || item.variance_dollar || 0))
            const varQty = Math.abs(Number(item.unexp_var_qty || item.variance_qty || 0))
            const t = tracking[item.name] || {}
            const isRepeat = (repeatItems[item.name] || 0) > 1
            const isTop10 = top10Names.has(item.name)
            return (
              <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50 transition">
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${isShortage ? 'text-red-300' : 'text-green-300'}`}>
                      {item.name}
                    </span>
                    {isRepeat && <span className="text-orange-400 text-xs bg-orange-950 px-1.5 py-0.5 rounded" title="Aparece en múltiples semanas">⚠️ recurrente</span>}
                  </div>
                </td>
                <td className="py-2.5 text-gray-500 text-xs">{item.category || '—'}</td>
                <td className="py-2.5 text-right text-gray-500 text-xs">{item.uom}</td>
                <td className="py-2.5 text-right text-gray-400 text-xs">{fmt(item.unit_cost)}</td>
                {viewMode === 'dollar' ? (
                  <td className="py-2.5 text-right font-bold">
                    <span className={isShortage ? 'text-red-400' : 'text-green-400'}>
                      {isShortage ? fmt(varDollar) : '(' + fmt(varDollar) + ')'}
                    </span>
                  </td>
                ) : (
                  <td className="py-2.5 text-right font-bold">
                    <span className={isShortage ? 'text-red-400' : 'text-green-400'}>
                      {isShortage ? '+' : '(-'}{varQty.toFixed(3)}{isShortage ? '' : ')'} {item.uom}
                    </span>
                  </td>
                )}
                {showTracking && isTop10 && (
                  <>
                    <td className="py-2.5 pr-2">
                      <select value={t.reason || ''} onChange={e => onSave(item, 'reason', e.target.value)}
                        className={`w-full bg-gray-800 border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500 ${t.reason ? 'border-gray-600 text-white' : 'border-gray-700 text-gray-500'}`}>
                        <option value="">Sin razón</option>
                        {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="py-2.5 pr-2">
                      <select value={t.action_required || ''} onChange={e => onSave(item, 'action_required', e.target.value)}
                        className={`w-full bg-gray-800 border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500 ${t.action_required ? 'border-gray-600 text-white' : 'border-gray-700 text-gray-500'}`}>
                        <option value="">Sin acción</option>
                        {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </td>
                    <td className="py-2.5 pr-2">
                      <input type="text" value={t.responsible || ''} placeholder="Nombre..."
                        onChange={e => onSave(item, 'responsible', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
                    </td>
                    <td className="py-2.5 pr-2">
                      <select value={t.status || 'pending'} onChange={e => onSave(item, 'status', e.target.value)}
                        className={`w-full bg-gray-800 border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500 ${STATUS_LABELS[t.status || 'pending'].color} border-gray-700`}>
                        {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </td>
                    <td className="py-2.5">
                      <input type="text" value={t.note || ''} placeholder="Agregar nota..."
                        onChange={e => onSave(item, 'note', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
                    </td>
                  </>
                )}
                {showTracking && !isTop10 && <td colSpan={5} />}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SeguimientoTab({ weeks, restaurantId, fmt }: any) {
  const [trackingAll, setTrackingAll] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    loadAll()
  }, [])

  async function loadAll() {
    const { data } = await supabase.from('avt_tracking')
      .select('*').eq('restaurant_id', restaurantId)
      .order('updated_at', { ascending: false })
    setTrackingAll(data || [])
    setLoading(false)
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('avt_tracking').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setTrackingAll(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  const filtered = filterStatus === 'all' ? trackingAll : trackingAll.filter(t => t.status === filterStatus)

  // Detectar recurrentes
  const itemWeekCount: Record<string, number> = {}
  trackingAll.forEach(t => { itemWeekCount[t.item_name] = (itemWeekCount[t.item_name] || 0) + 1 })
  const recurrentes = Object.entries(itemWeekCount).filter(([_, c]) => c > 1).sort((a, b) => b[1] - a[1])

  if (loading) return <div className="text-gray-400 text-sm py-8 text-center">Cargando seguimiento...</div>

  return (
    <div className="space-y-6">
      {/* Recurrentes alert */}
      {recurrentes.length > 0 && (
        <div className="bg-orange-950 border border-orange-800 rounded-xl p-5">
          <h3 className="text-orange-300 font-semibold mb-3">⚠️ Items recurrentes ({recurrentes.length})</h3>
          <div className="flex flex-wrap gap-2">
            {recurrentes.map(([name, count]) => (
              <span key={name} className="bg-orange-900 text-orange-300 text-xs px-3 py-1 rounded-full">
                {name} · {count} semanas
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filtros status */}
      <div className="flex items-center gap-2">
        {[
          { key: 'all', label: 'Todos' },
          { key: 'pending', label: 'Pendientes' },
          { key: 'in_progress', label: 'En proceso' },
          { key: 'resolved', label: 'Resueltos' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilterStatus(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${filterStatus === f.key ? 'bg-blue-600 border-blue-500 text-white' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
            {f.label} ({f.key === 'all' ? trackingAll.length : trackingAll.filter(t => t.status === f.key).length})
          </button>
        ))}
      </div>

      {/* Tabla seguimiento */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-gray-500 text-xs pb-3">Semana</th>
                <th className="text-left text-gray-500 text-xs pb-3">Item</th>
                <th className="text-left text-gray-500 text-xs pb-3">Cat.</th>
                <th className="text-left text-gray-500 text-xs pb-3">Tipo</th>
                <th className="text-right text-gray-500 text-xs pb-3">Varianza $</th>
                <th className="text-left text-gray-500 text-xs pb-3">Razón</th>
                <th className="text-left text-gray-500 text-xs pb-3">Acción</th>
                <th className="text-left text-gray-500 text-xs pb-3">Responsable</th>
                <th className="text-left text-gray-500 text-xs pb-3">Estado</th>
                <th className="text-left text-gray-500 text-xs pb-3">Nota</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t: any) => (
                <tr key={t.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition">
                  <td className="py-2.5 text-gray-400 text-xs">{t.week}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-1">
                      <span className="text-white text-xs font-medium">{t.item_name}</span>
                      {(itemWeekCount[t.item_name] || 0) > 1 && (
                        <span className="text-orange-400 text-xs">⚠️</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 text-gray-500 text-xs">{t.category}</td>
                  <td className="py-2.5">
                    <span className={`text-xs font-medium ${t.type === 'shortage' ? 'text-red-400' : 'text-green-400'}`}>
                      {t.type === 'shortage' ? 'Faltante' : 'Sobrante'}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <span className={`text-xs font-bold ${t.type === 'shortage' ? 'text-red-400' : 'text-green-400'}`}>
                      {t.type === 'shortage' ? fmt(t.variance_dollar) : '(' + fmt(t.variance_dollar) + ')'}
                    </span>
                  </td>
                  <td className="py-2.5 text-gray-400 text-xs">{t.reason || '—'}</td>
                  <td className="py-2.5 text-gray-400 text-xs">{t.action_required || '—'}</td>
                  <td className="py-2.5 text-gray-400 text-xs">{t.responsible || '—'}</td>
                  <td className="py-2.5">
                    <select value={t.status} onChange={e => updateStatus(t.id, e.target.value)}
                      className={`bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs focus:outline-none ${STATUS_LABELS[t.status]?.color}`}>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5 text-gray-500 text-xs">{t.note || '—'}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-gray-600 text-sm">No hay registros</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}