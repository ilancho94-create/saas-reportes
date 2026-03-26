'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurantId } from '@/lib/use-restaurant'
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
const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pendiente', color: 'text-yellow-400', bg: 'bg-yellow-950' },
  in_progress: { label: 'En proceso', color: 'text-blue-400', bg: 'bg-blue-950' },
  resolved: { label: 'Resuelto', color: 'text-green-400', bg: 'bg-green-950' },
}
const MAIN_CATEGORIES_FALLBACK = ['BAR', 'FOOD', 'BEVERAGE', 'CHEMICALS', 'SUPPLIES']
type SortKey = 'variance_dollar' | 'name' | 'unit_cost' | 'variance_qty'
type ViewMode = 'dollar' | 'qty'
type ActiveTab = 'dashboard' | 'seguimiento' | 'detalle' | 'inventario'

export default function AvtPage() {
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])
  const [selectedWeek, setSelectedWeek] = useState('')
  const restaurantIdHook = useRestaurantId()
  const restaurantId = restaurantIdHook || '00000000-0000-0000-0000-000000000001'
  const [restaurantName, setRestaurantName] = useState('')
  const [tracking, setTracking] = useState<Record<string, any>>({})
  const [allTracking, setAllTracking] = useState<any[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState('Todas')
  const [sortKey, setSortKey] = useState<SortKey>('variance_dollar')
  const [viewMode, setViewMode] = useState<ViewMode>('dollar')
  const [showAllShortages, setShowAllShortages] = useState(false)
  const [showAllOverages, setShowAllOverages] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard')
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [activeCategories, setActiveCategories] = useState<string[]>(MAIN_CATEGORIES_FALLBACK)

  useEffect(() => { if (restaurantIdHook) loadData() }, [restaurantIdHook])
  useEffect(() => { if (selectedWeek && restaurantId) loadTracking(selectedWeek) }, [selectedWeek, restaurantId])

  async function loadData() {
    if (!restaurantIdHook) return
    setLoading(true)
    setWeeks([])
    const { data: rest } = await supabase.from('restaurants').select('name').eq('id', restaurantId).single()
    setRestaurantName(rest?.name || '')
    const { data: reports } = await supabase.from('reports').select('*')
      .eq('restaurant_id', restaurantId).order('week', { ascending: false }).limit(12)
    if (!reports?.length) { setLoading(false); return }
    const weeksData = await Promise.all(reports.map(async r => {
      const { data: avt } = await supabase.from('avt_data').select('*').eq('report_id', r.id).single()
      return { report: r, avt }
    }))
    const withAvt = weeksData.filter(w => w.avt)
    setWeeks(withAvt)
    if (withAvt.length > 0) setSelectedWeek(withAvt[0].report.week)
    const { data: allT } = await supabase.from('avt_tracking')
      .select('*').eq('restaurant_id', restaurantId).order('week', { ascending: false })
    setAllTracking(allT || [])
    setLoading(false)
    const { data: cats } = await supabase.from('avt_categories')
      .select('category').eq('restaurant_id', restaurantId).eq('active', true).order('category')
    if (cats && cats.length > 0) setActiveCategories(cats.map((c: any) => c.category))
  }

  async function loadTracking(week: string) {
    const { data: weekTracking } = await supabase.from('avt_tracking')
      .select('*').eq('restaurant_id', restaurantId).eq('week', week)
    const map: Record<string, any> = {}
    for (const t of weekTracking || []) map[t.item_name] = t
    setTracking(map)
  }

  async function saveTracking(item: any, updates: Record<string, any>) {
    setSavingId(item.name)
    const existing = tracking[item.name] || {}
    const lastResolved = allTracking.find(t =>
      t.item_name === item.name && t.status === 'resolved' && t.week !== selectedWeek
    )
    const recurred = !!lastResolved && !existing.id
    const upsertData = {
      restaurant_id: restaurantId,
      item_name: item.name,
      category: item.category,
      week: selectedWeek,
      variance_dollar: Math.abs(Number(item.variance_dollar || 0)),
      variance_qty: Math.abs(Number(item.variance_qty || 0)),
      unit_cost: item.unit_cost,
      uom: item.uom,
      type: Number(item.variance_dollar) > 0 ? 'shortage' : 'overage',
      is_prefilled: false,
      recurred,
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    }
    await supabase.from('avt_tracking').upsert(upsertData, { onConflict: 'restaurant_id,item_name,week' })
    const newTracking = { ...existing, ...updates, recurred }
    setTracking(prev => ({ ...prev, [item.name]: newTracking }))
    setAllTracking(prev => {
      const idx = prev.findIndex(t => t.item_name === item.name && t.week === selectedWeek)
      if (idx >= 0) { const updated = [...prev]; updated[idx] = { ...updated[idx], ...updates }; return updated }
      return [{ ...upsertData, ...updates }, ...prev]
    })
    setSavingId(null)
  }

  function getPrefillData(itemName: string): any {
    const history = allTracking.filter(t => t.item_name === itemName && t.week !== selectedWeek)
    if (!history.length) return null
    return history[0]
  }

  function getItemHistory(itemName: string): any[] {
    return allTracking.filter(t => t.item_name === itemName && t.week !== selectedWeek)
  }

  function getRecurrenceInfo(itemName: string) {
    const history = allTracking.filter(t => t.item_name === itemName)
    const uniqueWeeks = [...new Set(history.map(t => t.week))].sort().reverse()
    const lastEntry = history[0]
    const wasResolved = history.some(t => t.status === 'resolved' && t.week !== selectedWeek)
    const currentEntry = tracking[itemName]
    const recurred = wasResolved && !currentEntry?.id
    return {
      weekCount: uniqueWeeks.length,
      lastReason: lastEntry?.reason,
      lastStatus: lastEntry?.status,
      lastResponsible: lastEntry?.responsible,
      lastNote: lastEntry?.note,
      recurred,
      wasResolved,
    }
  }

  function fmt(n: any) {
    if (n === null || n === undefined) return '—'
    return '$' + Math.abs(Number(n)).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  function fmtN(n: any, decimals = 2) {
    if (n === null || n === undefined || n === 0) return '—'
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  }

  const selected = weeks.find(w => w.report.week === selectedWeek)
  const avt = selected?.avt
  const allShortages: any[] = avt?.shortages || []
  const allOverages: any[] = avt?.overages || []
  const allItems: any[] = avt?.all_items || []
  const byCategory: any[] = avt?.by_category || []

  const filteredShortages = selectedCategory === 'Todas'
    ? allShortages : allShortages.filter((i: any) => i.category === selectedCategory)
  const filteredOverages = selectedCategory === 'Todas'
    ? allOverages : allOverages.filter((i: any) => i.category === selectedCategory)

  function sortItems(items: any[]) {
    return [...items].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name)
      if (sortKey === 'unit_cost') return Math.abs(Number(b.unit_cost)) - Math.abs(Number(a.unit_cost))
      if (sortKey === 'variance_qty') return Math.abs(Number(b.variance_qty)) - Math.abs(Number(a.variance_qty))
      return Math.abs(Number(b.variance_dollar)) - Math.abs(Number(a.variance_dollar))
    })
  }

  const sortedShortages = sortItems(filteredShortages)
  const sortedOverages = sortItems(filteredOverages)
  const displayShortages = showAllShortages ? sortedShortages : sortedShortages.slice(0, 10)
  const displayOverages = showAllOverages ? sortedOverages : sortedOverages.slice(0, 10)

  const totalShortage = filteredShortages.reduce((a, b) => a + Math.abs(Number(b.variance_dollar || 0)), 0)
  const totalOverage = filteredOverages.reduce((a, b) => a + Math.abs(Number(b.variance_dollar || 0)), 0)
  const netVariance = totalShortage - totalOverage

  const trendData = [...weeks].reverse().map(w => {
    const wShortages: any[] = w.avt?.shortages || []
    const wOverages: any[] = w.avt?.overages || []
    const filtered_s = selectedCategory === 'Todas' ? wShortages : wShortages.filter((i: any) => i.category === selectedCategory)
    const filtered_o = selectedCategory === 'Todas' ? wOverages : wOverages.filter((i: any) => i.category === selectedCategory)
    const faltantes = filtered_s.reduce((a: number, b: any) => a + Math.abs(Number(b.variance_dollar || 0)), 0)
    const sobrantes = filtered_o.reduce((a: number, b: any) => a + Math.abs(Number(b.variance_dollar || 0)), 0)
    return { week: w.report.week.replace('2026-', ''), faltantes, sobrantes, neto: faltantes - sobrantes }
  })

  const itemStatsMap: Record<string, { weekCount: number; totalDollar: number; category: string }> = {}
  weeks.forEach(w => {
    const s: any[] = w.avt?.shortages || []
    const o: any[] = w.avt?.overages || []
    const combined = [...s, ...o]
    const filtered = selectedCategory === 'Todas' ? combined : combined.filter((i: any) => i.category === selectedCategory)
    filtered.forEach((item: any) => {
      if (!item.name) return
      if (!itemStatsMap[item.name]) itemStatsMap[item.name] = { weekCount: 0, totalDollar: 0, category: item.category }
      itemStatsMap[item.name].weekCount += 1
      itemStatsMap[item.name].totalDollar += Math.abs(Number(item.variance_dollar || 0))
    })
  })
  const recurrentItems = Object.entries(itemStatsMap)
    .filter(([_, v]) => v.weekCount > 1)
    .sort((a, b) => b[1].totalDollar - a[1].totalDollar)
    .map(([name, v]) => {
      const info = getRecurrenceInfo(name)
      return { name, ...v, ...info }
    })

  const pendingCount = Object.values(tracking).filter((t: any) => t.status === 'pending' || !t.status).length

  const top10ByCat = activeCategories.map(cat => {
    const catShortages = [...allShortages.filter((i: any) => i.category === cat)]
      .sort((a, b) => Math.abs(Number(b.variance_dollar)) - Math.abs(Number(a.variance_dollar))).slice(0, 10)
    const catOverages = [...allOverages.filter((i: any) => i.category === cat)]
      .sort((a, b) => Math.abs(Number(b.variance_dollar)) - Math.abs(Number(a.variance_dollar))).slice(0, 10)
    return { cat, shortages: catShortages, overages: catOverages }
  }).filter(c => c.shortages.length > 0 || c.overages.length > 0)

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
            {restaurantName} · Faltante = varianza inesperada positiva (rojo) · Sobrante = negativa (entre paréntesis)
          </p>
        </div>
        <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500">
          {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
        </select>
      </div>

      <div className="border-b border-gray-800 bg-gray-900 px-6">
        <div className="flex gap-1">
          {([
            { id: 'dashboard', label: '📊 Dashboard' },
            { id: 'detalle', label: '🔍 Detalle' },
            { id: 'inventario', label: '📦 Inventario' },
            { id: 'seguimiento', label: `📋 Seguimiento${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
          ] as { id: ActiveTab; label: string }[]).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 ${activeTab === tab.id ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
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
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-gray-500 text-xs">Categoría:</span>
              <div className="flex gap-1 flex-wrap">
                {['Todas', ...activeCategories].map(cat => (
                  <button key={cat} onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${selectedCategory === cat ? 'bg-blue-600 border-blue-500 text-white' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
                    {cat}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-gray-500 text-xs">Ver:</span>
                {(['dollar', 'qty'] as ViewMode[]).map(m => (
                  <button key={m} onClick={() => setViewMode(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${viewMode === m ? 'bg-blue-600 border-blue-500 text-white' : 'border-gray-700 text-gray-400'}`}>
                    {m === 'dollar' ? '$ Dinero' : 'Qty'}
                  </button>
                ))}
                <span className="text-gray-500 text-xs ml-2">Ordenar:</span>
                {(['variance_dollar', 'variance_qty', 'unit_cost', 'name'] as SortKey[]).map(key => (
                  <button key={key} onClick={() => setSortKey(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${sortKey === key ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-700 text-gray-500 hover:text-white'}`}>
                    {key === 'variance_dollar' ? '$ Var' : key === 'variance_qty' ? 'Qty' : key === 'unit_cost' ? 'Costo' : 'A-Z'}
                  </button>
                ))}
              </div>
            </div>

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
                <p className="text-gray-500 text-xs mb-1">Seguimiento</p>
                <span className="text-yellow-400 text-sm font-bold">{pendingCount} pend.</span>
                <button onClick={() => setActiveTab('seguimiento')} className="block text-blue-400 text-xs mt-1 hover:text-blue-300">Ver seguimiento →</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Tendencia semanal</h2>
                <div className="flex items-center gap-4 mb-4 flex-wrap">
                  <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-red-500 rounded"/><span className="text-gray-500 text-xs">Faltantes — lo que se perdió (positivo = malo)</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-green-500 rounded"/><span className="text-gray-500 text-xs">Sobrantes — exceso sobre teórico (bueno)</span></div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-yellow-500 rounded" style={{borderTop:'2px dashed #f59e0b',background:'none'}}/><span className="text-gray-500 text-xs">Neto — diferencia real (cerca de $0 = bien)</span></div>
                </div>
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
                <p className="text-gray-500 text-xs mb-1">Varianza neta {selectedWeek}</p>
                <p className="text-gray-600 text-xs mb-4">Barra hacia la derecha = faltante (malo) · hacia la izquierda = sobrante (bueno)</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={byCategory.map((c: any) => ({ category: c.category, neto: (c.total_shortage_dollar || 0) - (c.total_overage_dollar || 0) }))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + Math.abs(v)} />
                    <YAxis type="category" dataKey="category" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => [fmt(v), 'Varianza neta']} />
                    <Bar dataKey="neto" radius={[0, 4, 4, 0]}>
                      {byCategory.map((_: any, i: number) => <Cell key={i} fill="#ef4444" />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Top 5 faltantes</h2>
                <p className="text-gray-500 text-xs mb-1">{selectedWeek} · {selectedCategory}</p>
                <p className="text-gray-600 text-xs mb-4">Items con mayor pérdida $ — lo que se usó de más vs receta teórica</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={sortedShortages.slice(0, 5).map((i: any) => ({
                    name: i.name?.length > 15 ? i.name.substring(0, 15) + '...' : i.name,
                    fullName: i.name,
                    valor: viewMode === 'dollar' ? Math.abs(Number(i.variance_dollar || 0)) : Math.abs(Number(i.variance_qty || 0)),
                  }))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => viewMode === 'dollar' ? '$' + v : String(v)} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={false} tickLine={false} width={110} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any, _: any, props: any) => [viewMode === 'dollar' ? fmt(v) : v.toFixed(3), props.payload.fullName]} />
                    <Bar dataKey="valor" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {recurrentItems.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">
                  ⚠️ Items con historial — {recurrentItems.length} items aparecen en múltiples semanas
                </h2>
                <p className="text-gray-500 text-xs mb-4">Ordenados por impacto $ total acumulado · {selectedCategory !== 'Todas' ? `Filtrado: ${selectedCategory}` : 'Todas las categorías'}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {recurrentItems.slice(0, 12).map(item => (
                    <div key={item.name} className={`rounded-xl p-4 border ${item.recurred ? 'bg-red-950 border-red-800' : item.lastStatus === 'resolved' ? 'bg-green-950 border-green-800' : 'bg-gray-800 border-gray-700'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-white text-sm font-medium leading-tight">{item.name}</p>
                        <div className="text-right ml-2 shrink-0">
                          <p className="text-gray-400 text-xs">{item.weekCount} sem.</p>
                          <p className="text-red-400 text-xs font-bold">{fmt(item.totalDollar)}</p>
                        </div>
                      </div>
                      {item.recurred && <p className="text-red-400 text-xs font-semibold mb-1">🔄 Recayó — estaba resuelto</p>}
                      {item.lastStatus && <p className={`text-xs mb-1 ${STATUS_LABELS[item.lastStatus]?.color}`}>Estado: {STATUS_LABELS[item.lastStatus]?.label}</p>}
                      {item.lastReason && <p className="text-gray-400 text-xs mb-1">Razón: {item.lastReason}</p>}
                      {item.lastResponsible && <p className="text-gray-400 text-xs mb-1">Responsable: {item.lastResponsible}</p>}
                      {item.lastNote && <p className="text-gray-500 text-xs italic">"{item.lastNote}"</p>}
                      {!item.lastReason && !item.lastStatus && <p className="text-gray-600 text-xs">Sin seguimiento registrado</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">🔴 Faltantes — {selectedWeek}
                  <span className="text-red-400 font-normal text-sm ml-2">({filteredShortages.length} items · {fmt(totalShortage)})</span>
                </h2>
                {filteredShortages.length > 10 && (
                  <button onClick={() => setShowAllShortages(!showAllShortages)} className="text-blue-400 text-xs hover:text-blue-300 transition">
                    {showAllShortages ? 'Ver menos' : `Ver todos (${filteredShortages.length})`}
                  </button>
                )}
              </div>
              <SimpleTable items={displayShortages} type="shortage" viewMode={viewMode}
                allTracking={allTracking} selectedWeek={selectedWeek} fmt={fmt} getRecurrenceInfo={getRecurrenceInfo} />
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">🟢 Sobrantes — {selectedWeek}
                  <span className="text-green-400 font-normal text-sm ml-2">({filteredOverages.length} items · ({fmt(totalOverage)}))</span>
                </h2>
                {filteredOverages.length > 10 && (
                  <button onClick={() => setShowAllOverages(!showAllOverages)} className="text-blue-400 text-xs hover:text-blue-300 transition">
                    {showAllOverages ? 'Ver menos' : `Ver todos (${filteredOverages.length})`}
                  </button>
                )}
              </div>
              <SimpleTable items={displayOverages} type="overage" viewMode={viewMode}
                allTracking={allTracking} selectedWeek={selectedWeek} fmt={fmt} getRecurrenceInfo={getRecurrenceInfo} />
            </div>
          </>

        ) : activeTab === 'detalle' ? (
          <DetalleTab weeks={weeks} selectedWeek={selectedWeek} allShortages={allShortages} allOverages={allOverages} fmt={fmt} />

        ) : activeTab === 'inventario' ? (
          <InventarioTab allItems={allItems} selectedWeek={selectedWeek} fmt={fmt} fmtN={fmtN} weeks={weeks} />

        ) : (
          <SeguimientoTab
            weeks={weeks} selectedWeek={selectedWeek} allShortages={allShortages} allOverages={allOverages}
            tracking={tracking} savingId={savingId} restaurantId={restaurantId} allTracking={allTracking}
            onSave={saveTracking} getPrefillData={getPrefillData} getItemHistory={getItemHistory}
            fmt={fmt} top10ByCat={top10ByCat} expandedItem={expandedItem} setExpandedItem={setExpandedItem}
          />
        )}
      </main>
    </div>
  )
}

// ── PESTAÑA INVENTARIO ─────────────────────────────────────────────────────
function InventarioTab({ allItems, selectedWeek, fmt, fmtN, weeks }: any) {
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('Todas')
  const [subCatFilter, setSubCatFilter] = useState('Todas')
  const [viewMode, setViewMode] = useState<'qty' | 'dollar'>('qty')
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [sortCol, setSortCol] = useState<string>('unexplained_amt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const noData = !allItems || allItems.length === 0

  const categories = ['Todas', ...Array.from(new Set((allItems || []).map((i: any) => i.category).filter(Boolean))).sort() as string[]]
  const subCategories = catFilter === 'Todas'
    ? ['Todas']
    : ['Todas', ...Array.from(new Set((allItems || []).filter((i: any) => i.category === catFilter).map((i: any) => i.sub_category).filter(Boolean))).sort() as string[]]

  const filtered = (allItems || []).filter((i: any) => {
    const matchSearch = !search || i.name?.toLowerCase().includes(search.toLowerCase())
    const matchCat = catFilter === 'Todas' || i.category === catFilter
    const matchSub = subCatFilter === 'Todas' || i.sub_category === subCatFilter
    return matchSearch && matchCat && matchSub
  }).sort((a: any, b: any) => {
    const av = Math.abs(Number(a[sortCol] || 0))
    const bv = Math.abs(Number(b[sortCol] || 0))
    if (sortCol === 'name') return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    return sortDir === 'desc' ? bv - av : av - bv
  })

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }

  function SortBtn({ col, label }: { col: string; label: string }) {
    const active = sortCol === col
    return (
      <button onClick={() => toggleSort(col)}
        className={`flex items-center gap-1 hover:text-white transition ${active ? 'text-white' : 'text-gray-500'}`}>
        {label}
        <span className="text-xs">{active ? (sortDir === 'desc' ? '↓' : '↑') : '↕'}</span>
      </button>
    )
  }

  // Historial de un item en semanas anteriores
  function getItemWeekHistory(itemName: string) {
    return weeks.map((w: any) => {
      const item = (w.avt?.all_items || []).find((i: any) => i.name === itemName)
      if (!item) return null
      return { week: w.report.week.replace('2026-', ''), fullWeek: w.report.week, ...item }
    }).filter(Boolean).reverse()
  }

  const itemHistory = selectedItem ? getItemWeekHistory(selectedItem) : []
  const selectedItemData = selectedItem ? (allItems || []).find((i: any) => i.name === selectedItem) : null

  if (noData) return (
    <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-10 text-center">
      <div className="text-5xl mb-4">📦</div>
      <h2 className="text-white font-semibold text-lg mb-2">Sin datos de inventario</h2>
      <p className="text-gray-500">Los datos detallados de inventario estarán disponibles al subir un nuevo reporte de AvT.</p>
      <p className="text-gray-600 text-xs mt-2">Los reportes anteriores no tienen este nivel de detalle — sube uno nuevo para verlo.</p>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
            <input type="text" placeholder="Buscar item..."
              value={search} onChange={e => { setSearch(e.target.value); setSelectedItem(null) }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          </div>
          <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setSubCatFilter('Todas') }}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none">
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {subCategories.length > 2 && (
            <select value={subCatFilter} onChange={e => setSubCatFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none">
              {subCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <div className="flex gap-1 ml-auto">
            {(['qty', 'dollar'] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${viewMode === m ? 'bg-blue-600 border-blue-500 text-white' : 'border-gray-700 text-gray-500'}`}>
                {m === 'qty' ? 'Qty' : '$ Dinero'}
              </button>
            ))}
          </div>
        </div>
        <p className="text-gray-600 text-xs">{filtered.length} items · {selectedWeek} · Clic en item para ver historial</p>
      </div>

      {/* Panel de detalle del item seleccionado */}
      {selectedItem && selectedItemData && (
        <div className="bg-gray-900 border border-blue-800 rounded-xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold text-base">{selectedItem}</h3>
              <p className="text-gray-500 text-xs mt-0.5">{selectedItemData.category} · {selectedItemData.sub_category} · {selectedItemData.uom} · ${selectedItemData.unit_cost}/unit</p>
            </div>
            <button onClick={() => setSelectedItem(null)} className="text-gray-500 hover:text-white text-sm">✕</button>
          </div>

          {/* KPIs del item esta semana */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Inventario Inicial', qty: selectedItemData.begin_qty, amt: selectedItemData.begin_amt, color: 'text-gray-300' },
              { label: 'Compras', qty: selectedItemData.purchase_qty, amt: selectedItemData.purchase_amt, color: 'text-blue-300' },
              { label: 'Inventario Final', qty: selectedItemData.end_qty, amt: selectedItemData.end_amt, color: 'text-gray-300' },
              { label: 'Actual Usado', qty: selectedItemData.actual_qty, amt: selectedItemData.actual_amt, color: 'text-purple-300' },
            ].map(k => (
              <div key={k.label} className="bg-gray-800 rounded-lg p-3">
                <p className="text-gray-500 text-xs mb-1">{k.label}</p>
                <p className={`font-bold text-sm ${k.color}`}>
                  {viewMode === 'qty' ? fmtN(k.qty, 3) : fmt(k.amt)}
                </p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Teórico', qty: selectedItemData.theo_qty, amt: selectedItemData.theo_amt, color: 'text-yellow-300' },
              { label: 'Merma', qty: selectedItemData.waste_qty, amt: selectedItemData.waste_amt, color: 'text-orange-300' },
              { label: 'Varianza Total', qty: selectedItemData.variance_qty, amt: selectedItemData.variance_amt, color: selectedItemData.variance_amt > 0 ? 'text-red-400' : 'text-green-400' },
              { label: 'Varianza Inesperada', qty: selectedItemData.unexplained_qty, amt: selectedItemData.unexplained_amt, color: selectedItemData.unexplained_amt > 0 ? 'text-red-400' : selectedItemData.unexplained_amt < 0 ? 'text-green-400' : 'text-gray-500' },
            ].map(k => (
              <div key={k.label} className={`rounded-lg p-3 ${Math.abs(Number(k.amt)) > 0 && k.label === 'Varianza Inesperada' ? (Number(k.amt) > 0 ? 'bg-red-950 border border-red-800' : 'bg-green-950 border border-green-800') : 'bg-gray-800'}`}>
                <p className="text-gray-500 text-xs mb-1">{k.label}</p>
                <p className={`font-bold text-sm ${k.color}`}>
                  {viewMode === 'qty' ? fmtN(k.qty, 3) : (k.amt === 0 ? '—' : (Number(k.amt) >= 0 ? fmt(k.amt) : '(' + fmt(Math.abs(Number(k.amt))) + ')'))}
                </p>
              </div>
            ))}
          </div>

          {/* Historial en semanas anteriores */}
          {itemHistory.length > 1 && (
            <div>
              <p className="text-gray-500 text-xs font-semibold mb-2">Historial de varianza inesperada ({itemHistory.length} semanas):</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-600 pb-2 font-medium">Semana</th>
                      <th className="text-right text-gray-600 pb-2 font-medium">Inicial</th>
                      <th className="text-right text-gray-600 pb-2 font-medium">Compras</th>
                      <th className="text-right text-gray-600 pb-2 font-medium">Final</th>
                      <th className="text-right text-gray-600 pb-2 font-medium">Actual</th>
                      <th className="text-right text-gray-600 pb-2 font-medium">Teórico</th>
                      <th className="text-right text-gray-600 pb-2 font-medium">Merma</th>
                      <th className="text-right text-gray-600 pb-2 font-medium">Var. Inesperada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemHistory.map((h: any, i: number) => {
                      const isCurrentWeek = h.fullWeek === selectedWeek
                      const unexp = Number(h.unexplained_amt || h.unexplained_qty || 0)
                      return (
                        <tr key={i} className={`border-b border-gray-800 ${isCurrentWeek ? 'bg-blue-950/30' : ''}`}>
                          <td className={`py-1.5 ${isCurrentWeek ? 'text-blue-400 font-semibold' : 'text-gray-400'}`}>{h.week}</td>
                          <td className="py-1.5 text-right text-gray-400">{viewMode === 'qty' ? fmtN(h.begin_qty, 2) : fmt(h.begin_amt)}</td>
                          <td className="py-1.5 text-right text-blue-400">{viewMode === 'qty' ? fmtN(h.purchase_qty, 2) : fmt(h.purchase_amt)}</td>
                          <td className="py-1.5 text-right text-gray-400">{viewMode === 'qty' ? fmtN(h.end_qty, 2) : fmt(h.end_amt)}</td>
                          <td className="py-1.5 text-right text-purple-400">{viewMode === 'qty' ? fmtN(h.actual_qty, 2) : fmt(h.actual_amt)}</td>
                          <td className="py-1.5 text-right text-yellow-400">{viewMode === 'qty' ? fmtN(h.theo_qty, 2) : fmt(h.theo_amt)}</td>
                          <td className="py-1.5 text-right text-orange-400">{viewMode === 'qty' ? fmtN(h.waste_qty, 2) : fmt(h.waste_amt)}</td>
                          <td className={`py-1.5 text-right font-bold ${unexp > 0 ? 'text-red-400' : unexp < 0 ? 'text-green-400' : 'text-gray-600'}`}>
                            {viewMode === 'qty'
                              ? (h.unexplained_qty === 0 ? '—' : fmtN(h.unexplained_qty, 3))
                              : (unexp === 0 ? '—' : unexp > 0 ? fmt(unexp) : '(' + fmt(Math.abs(unexp)) + ')')}
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
      )}

      {/* Tabla principal */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b border-gray-800 bg-gray-950">
              <tr>
                <th className="text-left text-gray-500 py-3 px-4 font-medium w-8">#</th>
                <th className="text-left text-gray-500 py-3 font-medium"><SortBtn col="name" label="Item" /></th>
                <th className="text-left text-gray-500 py-3 font-medium">Cat.</th>
                <th className="text-left text-gray-500 py-3 font-medium">UOM</th>
                <th className="text-right text-gray-500 py-3 font-medium"><SortBtn col="begin_qty" label="Inicial" /></th>
                <th className="text-right text-gray-500 py-3 font-medium"><SortBtn col="purchase_qty" label="Compras" /></th>
                <th className="text-right text-gray-500 py-3 font-medium">Transfer</th>
                <th className="text-right text-gray-500 py-3 font-medium"><SortBtn col="end_qty" label="Final" /></th>
                <th className="text-right text-gray-500 py-3 font-medium"><SortBtn col="actual_qty" label="Actual" /></th>
                <th className="text-right text-gray-500 py-3 font-medium"><SortBtn col="theo_qty" label="Teórico" /></th>
                <th className="text-right text-gray-500 py-3 font-medium"><SortBtn col="waste_qty" label="Merma" /></th>
                <th className="text-right text-gray-500 py-3 pr-4 font-medium"><SortBtn col="unexplained_amt" label="Var. Inesperada" /></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item: any, i: number) => {
                const unexp = viewMode === 'qty' ? Number(item.unexplained_qty || 0) : Number(item.unexplained_amt || 0)
                const isSelected = selectedItem === item.name
                return (
                  <tr key={i} onClick={() => setSelectedItem(isSelected ? null : item.name)}
                    className={`border-b border-gray-800 cursor-pointer transition ${isSelected ? 'bg-blue-950/30' : 'hover:bg-gray-800/40'}`}>
                    <td className="py-2 px-4 text-gray-600">{i + 1}</td>
                    <td className="py-2 text-white font-medium">{item.name}</td>
                    <td className="py-2 text-gray-500">{item.sub_category || item.category || '—'}</td>
                    <td className="py-2 text-gray-600">{item.uom}</td>
                    <td className="py-2 text-right text-gray-400">{viewMode === 'qty' ? fmtN(item.begin_qty, 2) : fmt(item.begin_amt)}</td>
                    <td className="py-2 text-right text-blue-400">{viewMode === 'qty' ? fmtN(item.purchase_qty, 2) : fmt(item.purchase_amt)}</td>
                    <td className="py-2 text-right text-gray-600">{viewMode === 'qty' ? fmtN(item.transfer_qty, 2) : fmt(item.transfer_amt)}</td>
                    <td className="py-2 text-right text-gray-400">{viewMode === 'qty' ? fmtN(item.end_qty, 2) : fmt(item.end_amt)}</td>
                    <td className="py-2 text-right text-purple-400">{viewMode === 'qty' ? fmtN(item.actual_qty, 2) : fmt(item.actual_amt)}</td>
                    <td className="py-2 text-right text-yellow-400">{viewMode === 'qty' ? fmtN(item.theo_qty, 2) : fmt(item.theo_amt)}</td>
                    <td className="py-2 text-right text-orange-400">{viewMode === 'qty' ? fmtN(item.waste_qty, 2) : fmt(item.waste_amt)}</td>
                    <td className={`py-2 text-right pr-4 font-bold ${unexp > 0 ? 'text-red-400' : unexp < 0 ? 'text-green-400' : 'text-gray-600'}`}>
                      {unexp === 0 ? '—' : viewMode === 'qty'
                        ? fmtN(unexp, 3)
                        : unexp > 0 ? fmt(unexp) : '(' + fmt(Math.abs(unexp)) + ')'}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={12} className="py-10 text-center text-gray-600">No hay items que coincidan</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── DetalleTab ─────────────────────────────────────────────────────────────
function DetalleTab({ weeks, selectedWeek, allShortages, allOverages, fmt }: any) {
  const [search, setSearch] = useState('')
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [catFilter, setCatFilter] = useState('Todas')
  const [typeFilter, setTypeFilter] = useState<'all' | 'shortage' | 'overage'>('all')
  const [detalleView, setDetalleView] = useState<'dollar' | 'qty'>('dollar')

  const allItems = [
    ...allShortages.map((i: any) => ({ ...i, tipo: 'shortage' })),
    ...allOverages.map((i: any) => ({ ...i, tipo: 'overage' })),
  ].sort((a, b) => Math.abs(Number(b.variance_dollar)) - Math.abs(Number(a.variance_dollar)))

  const categories = ['Todas', ...Array.from(new Set(allItems.map((i: any) => i.category).filter(Boolean)))]

  const filtered = allItems.filter((i: any) => {
    const matchSearch = !search || i.name?.toLowerCase().includes(search.toLowerCase())
    const matchCat = catFilter === 'Todas' || i.category === catFilter
    const matchType = typeFilter === 'all' || i.tipo === typeFilter
    return matchSearch && matchCat && matchType
  })

  function getItemWeekHistory(itemName: string) {
    return weeks.map((w: any) => {
      const s = (w.avt?.shortages || []).find((i: any) => i.name === itemName)
      const o = (w.avt?.overages || []).find((i: any) => i.name === itemName)
      const item = s || o
      if (!item) return null
      return {
        week: w.report.week.replace('2026-', ''),
        fullWeek: w.report.week,
        variance_dollar: s ? Math.abs(Number(item.variance_dollar)) : -Math.abs(Number(item.variance_dollar)),
        variance_qty: s ? Math.abs(Number(item.variance_qty)) : -Math.abs(Number(item.variance_qty)),
        tipo: s ? 'shortage' : 'overage',
        uom: item.uom,
      }
    }).filter(Boolean).reverse()
  }

  const itemHistory = selectedItem ? getItemWeekHistory(selectedItem) : []

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
            <input type="text" placeholder="Buscar item..."
              value={search} onChange={e => { setSearch(e.target.value); setSelectedItem(null) }}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500" />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none">
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div className="flex gap-1">
            {([['all', 'Todos'], ['shortage', '🔴 Faltantes'], ['overage', '🟢 Sobrantes']] as [string, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setTypeFilter(v as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${typeFilter === v ? 'bg-blue-600 border-blue-500 text-white' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex gap-1 ml-auto">
            {(['dollar', 'qty'] as const).map(m => (
              <button key={m} onClick={() => setDetalleView(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${detalleView === m ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-700 text-gray-500'}`}>
                {m === 'dollar' ? '$ Dinero' : 'Qty'}
              </button>
            ))}
          </div>
        </div>
        <p className="text-gray-600 text-xs mt-2">{filtered.length} items · {selectedWeek}</p>
      </div>

      {selectedItem && itemHistory.length > 0 && (
        <div className="bg-gray-900 border border-blue-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-white font-semibold">{selectedItem}</h3>
              <p className="text-gray-500 text-xs mt-0.5">Variación en {itemHistory.length} semana{itemHistory.length !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={() => setSelectedItem(null)} className="text-gray-500 hover:text-white text-sm">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-gray-500 text-xs mb-2">Tendencia varianza {detalleView === 'dollar' ? '$' : 'Qty'}</p>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={itemHistory}>
                  <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={v => detalleView === 'dollar' ? '$' + Math.abs(v) : Math.abs(v).toFixed(1)} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(v: any) => [detalleView === 'dollar' ? fmt(Math.abs(v)) : Math.abs(Number(v)).toFixed(3), v > 0 ? 'Faltante' : 'Sobrante']} />
                  <ReferenceLine y={0} stroke="#374151" />
                  <Bar dataKey={detalleView === 'dollar' ? 'variance_dollar' : 'variance_qty'} radius={[3, 3, 0, 0]}>
                    {itemHistory.map((h: any, i: number) => <Cell key={i} fill={h.tipo === 'shortage' ? '#ef4444' : '#22c55e'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-2">Detalle por semana</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {itemHistory.map((h: any, i: number) => (
                  <div key={i} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs ${h.fullWeek === selectedWeek ? 'bg-blue-950 border border-blue-800' : 'bg-gray-800'}`}>
                    <span className="text-gray-400">{h.week}</span>
                    <span className={`font-bold ${h.tipo === 'shortage' ? 'text-red-400' : 'text-green-400'}`}>
                      {h.tipo === 'shortage' ? '' : '('}
                      {detalleView === 'dollar' ? fmt(Math.abs(h.variance_dollar)) : Math.abs(h.variance_qty).toFixed(3) + ' ' + h.uom}
                      {h.tipo === 'shortage' ? '' : ')'}
                    </span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${h.tipo === 'shortage' ? 'bg-red-950 text-red-400' : 'bg-green-950 text-green-400'}`}>
                      {h.tipo === 'shortage' ? 'falt.' : 'sobr.'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800">
              <tr>
                <th className="text-left text-gray-500 text-xs py-3 px-4 font-medium">#</th>
                <th className="text-left text-gray-500 text-xs py-3 font-medium">Item</th>
                <th className="text-left text-gray-500 text-xs py-3 font-medium">Cat.</th>
                <th className="text-left text-gray-500 text-xs py-3 font-medium">Sub-cat.</th>
                <th className="text-right text-gray-500 text-xs py-3 font-medium">UOM</th>
                <th className="text-right text-gray-500 text-xs py-3 font-medium">Costo Unit.</th>
                <th className="text-right text-gray-500 text-xs py-3 font-medium">Varianza Qty</th>
                <th className="text-right text-gray-500 text-xs py-3 pr-4 font-medium">Varianza $</th>
                <th className="text-left text-gray-500 text-xs py-3 font-medium">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item: any, i: number) => {
                const isShortage = item.tipo === 'shortage'
                const varDollar = Math.abs(Number(item.variance_dollar || 0))
                const varQty = Math.abs(Number(item.variance_qty || 0))
                const isSelected = selectedItem === item.name
                const weekCount = weeks.filter((w: any) => {
                  const s = w.avt?.shortages || []
                  const o = w.avt?.overages || []
                  return [...s, ...o].some((x: any) => x.name === item.name)
                }).length
                return (
                  <tr key={i} onClick={() => setSelectedItem(isSelected ? null : item.name)}
                    className={`border-b border-gray-800 cursor-pointer transition ${isSelected ? 'bg-blue-950/40' : 'hover:bg-gray-800/50'}`}>
                    <td className="py-2.5 px-4 text-gray-600 text-xs">{i + 1}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${isShortage ? 'text-red-300' : 'text-green-300'}`}>{item.name}</span>
                        {weekCount > 1 && <span className="text-orange-400 text-xs bg-orange-950 px-1.5 py-0.5 rounded">⚠️ {weekCount} sem.</span>}
                      </div>
                    </td>
                    <td className="py-2.5 text-gray-500 text-xs">{item.category || '—'}</td>
                    <td className="py-2.5 text-gray-600 text-xs">{item.sub_category || '—'}</td>
                    <td className="py-2.5 text-right text-gray-500 text-xs">{item.uom}</td>
                    <td className="py-2.5 text-right text-gray-400 text-xs">{item.unit_cost ? fmt(item.unit_cost) : '—'}</td>
                    <td className="py-2.5 text-right text-xs">
                      <span className={isShortage ? 'text-red-400' : 'text-green-400'}>
                        {isShortage ? '+' : '('}{varQty.toFixed(3)}{isShortage ? '' : ')'} {item.uom}
                      </span>
                    </td>
                    <td className="py-2.5 text-right pr-4 font-bold text-sm">
                      <span className={isShortage ? 'text-red-400' : 'text-green-400'}>
                        {isShortage ? fmt(varDollar) : '(' + fmt(varDollar) + ')'}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${isShortage ? 'bg-red-950 text-red-400' : 'bg-green-950 text-green-400'}`}>
                        {isShortage ? 'Faltante' : 'Sobrante'}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="py-10 text-center text-gray-600">No hay items que coincidan con el filtro</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── SimpleTable ─────────────────────────────────────────────────────────────
function SimpleTable({ items, type, viewMode, allTracking, selectedWeek, fmt, getRecurrenceInfo }: any) {
  const isShortage = type === 'shortage'
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left text-gray-500 text-xs pb-3 font-medium">#</th>
            <th className="text-left text-gray-500 text-xs pb-3 font-medium">Item</th>
            <th className="text-left text-gray-500 text-xs pb-3 font-medium">Cat.</th>
            <th className="text-right text-gray-500 text-xs pb-3 font-medium">UOM</th>
            <th className="text-right text-gray-500 text-xs pb-3 font-medium">Costo Unit.</th>
            <th className="text-right text-gray-500 text-xs pb-3 font-medium">{viewMode === 'dollar' ? 'Varianza $' : 'Varianza Qty'}</th>
            <th className="text-left text-gray-500 text-xs pb-3 font-medium">Historial</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, i: number) => {
            const varDollar = Math.abs(Number(item.variance_dollar || 0))
            const varQty = Math.abs(Number(item.variance_qty || 0))
            const info = getRecurrenceInfo(item.name)
            return (
              <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50 transition">
                <td className="py-2.5 text-gray-600 text-xs">{i + 1}</td>
                <td className="py-2.5"><span className={`text-sm font-medium ${isShortage ? 'text-red-300' : 'text-green-300'}`}>{item.name}</span></td>
                <td className="py-2.5 text-gray-500 text-xs">{item.category || '—'}</td>
                <td className="py-2.5 text-right text-gray-500 text-xs">{item.uom}</td>
                <td className="py-2.5 text-right text-gray-400 text-xs">{fmt(item.unit_cost)}</td>
                <td className="py-2.5 text-right font-bold">
                  {viewMode === 'dollar' ? (
                    <span className={isShortage ? 'text-red-400' : 'text-green-400'}>
                      {isShortage ? fmt(varDollar) : '(' + fmt(varDollar) + ')'}
                    </span>
                  ) : (
                    <span className={isShortage ? 'text-red-400' : 'text-green-400'}>
                      {isShortage ? '+' : '(-'}{varQty.toFixed(3)}{isShortage ? '' : ')'} {item.uom}
                    </span>
                  )}
                </td>
                <td className="py-2.5">
                  {info.weekCount > 1 ? (
                    <div className="flex items-center gap-1.5">
                      {info.recurred && <span className="text-red-400 text-xs">🔄 Recayó</span>}
                      {!info.recurred && <span className="text-orange-400 text-xs">⚠️ {info.weekCount} sem.</span>}
                      {info.lastStatus && <span className={`text-xs ${STATUS_LABELS[info.lastStatus]?.color}`}>· {STATUS_LABELS[info.lastStatus]?.label}</span>}
                      {info.lastResponsible && <span className="text-gray-500 text-xs">· {info.lastResponsible}</span>}
                    </div>
                  ) : (
                    <span className="text-gray-700 text-xs">Nuevo</span>
                  )}
                </td>
              </tr>
            )
          })}
          {items.length === 0 && (
            <tr><td colSpan={7} className="py-6 text-center text-gray-600 text-sm">Sin datos para esta categoría</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── SeguimientoTab ──────────────────────────────────────────────────────────
function SeguimientoTab({ weeks, selectedWeek, allShortages, allOverages, tracking, savingId,
  restaurantId, allTracking, onSave, getPrefillData, getItemHistory, fmt, top10ByCat, expandedItem, setExpandedItem }: any) {
  const [seguimientoTab, setSeguimientoTab] = useState<'items' | 'responsables'>('items')

  const statusCounts = { pending: 0, in_progress: 0, resolved: 0 }
  Object.values(tracking).forEach((t: any) => {
    const s = t.status || 'pending'
    if (s in statusCounts) statusCounts[s as keyof typeof statusCounts]++
  })

  const KNOWN_UOMS = new Set(['LB', 'Liter', 'Bottle', 'Each', 'Gallon', 'BIB', 'Pack', 'Case', 'Can', 'OZ', 'oz', 'Bag', 'Box', 'Keg', 'Pint', 'Quart'])
  const itemWeekCount: Record<string, number> = {}
  weeks.forEach((w: any) => {
    const s = w.avt?.shortages || []
    const o = w.avt?.overages || []
    ;[...s, ...o].forEach((item: any) => {
      if (!item.name) return
      const firstWord = item.name.split(/[\s(]/)[0]
      if (KNOWN_UOMS.has(firstWord)) return
      itemWeekCount[item.name] = (itemWeekCount[item.name] || 0) + 1
    })
  })
  const recurrentes = Object.entries(itemWeekCount).filter(([_, c]) => c > 1).sort((a, b) => b[1] - a[1])

  const byResponsible: Record<string, any[]> = {}
  allTracking.filter((t: any) => t.responsible && t.status !== 'resolved').forEach((t: any) => {
    if (!byResponsible[t.responsible]) byResponsible[t.responsible] = []
    byResponsible[t.responsible].push(t)
  })

  async function updateTrackingStatus(id: string, status: string, itemName: string) {
    await supabase.from('avt_tracking').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    const { data: allT } = await supabase.from('avt_tracking').select('*').eq('restaurant_id', restaurantId).order('week', { ascending: false })
    if (allT) {
      const item = allT.find((t: any) => t.id === id)
      if (item) onSave({ name: itemName, variance_dollar: item.variance_dollar, category: item.category, uom: item.uom, unit_cost: item.unit_cost }, { status })
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-gray-500 text-xs mb-1">Semana actual</p>
          <p className="text-white font-bold text-lg">{selectedWeek}</p>
        </div>
        <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-5">
          <p className="text-yellow-500 text-xs mb-1">Pendientes</p>
          <p className="text-yellow-400 text-2xl font-bold">{statusCounts.pending}</p>
        </div>
        <div className="bg-blue-950 border border-blue-800 rounded-xl p-5">
          <p className="text-blue-500 text-xs mb-1">En proceso</p>
          <p className="text-blue-400 text-2xl font-bold">{statusCounts.in_progress}</p>
        </div>
        <div className="bg-green-950 border border-green-800 rounded-xl p-5">
          <p className="text-green-500 text-xs mb-1">Resueltos</p>
          <p className="text-green-400 text-2xl font-bold">{statusCounts.resolved}</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-800">
        <button onClick={() => setSeguimientoTab('items')}
          className={`px-4 py-2 text-sm font-medium transition border-b-2 ${seguimientoTab === 'items' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
          📋 Top 10 por categoría
        </button>
        <button onClick={() => setSeguimientoTab('responsables')}
          className={`px-4 py-2 text-sm font-medium transition border-b-2 ${seguimientoTab === 'responsables' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
          👤 To-Do por responsable ({Object.keys(byResponsible).length})
        </button>
      </div>

      {seguimientoTab === 'items' ? (
        <>
          {recurrentes.length > 0 && (
            <div className="bg-orange-950 border border-orange-800 rounded-xl p-5">
              <h3 className="text-orange-300 font-semibold mb-3">⚠️ Items recurrentes ({recurrentes.length})</h3>
              <div className="flex flex-wrap gap-2">
                {recurrentes.slice(0, 20).map(([name, count]) => {
                  const lastT = allTracking.find((t: any) => t.item_name === name)
                  const wasResolved = allTracking.some((t: any) => t.item_name === name && t.status === 'resolved')
                  const currentT = tracking[name]
                  const recurred = wasResolved && !currentT?.id
                  return (
                    <span key={name} className={`text-xs px-3 py-1 rounded-full ${recurred ? 'bg-red-900 text-red-300' : 'bg-orange-900 text-orange-300'}`}>
                      {recurred ? '🔄 ' : ''}{name} · {count} semanas{lastT?.reason ? ` · ${lastT.reason}` : ''}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
          {top10ByCat.map(({ cat, shortages, overages }: any) => (
            <div key={cat} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-bold text-base mb-4">{cat}<span className="text-gray-500 font-normal text-sm ml-2">Top 10 de mayor impacto $</span></h2>
              <div className="space-y-4">
                {shortages.length > 0 && (
                  <div>
                    <p className="text-red-400 text-xs font-semibold uppercase tracking-wider mb-2">🔴 Faltantes</p>
                    <TrackingTable items={shortages} type="shortage" tracking={tracking} onSave={onSave}
                      allTracking={allTracking} getPrefillData={getPrefillData} getItemHistory={getItemHistory}
                      fmt={fmt} savingId={savingId} itemWeekCount={itemWeekCount}
                      expandedItem={expandedItem} setExpandedItem={setExpandedItem} />
                  </div>
                )}
                {overages.length > 0 && (
                  <div>
                    <p className="text-green-400 text-xs font-semibold uppercase tracking-wider mb-2 mt-4">🟢 Sobrantes</p>
                    <TrackingTable items={overages} type="overage" tracking={tracking} onSave={onSave}
                      allTracking={allTracking} getPrefillData={getPrefillData} getItemHistory={getItemHistory}
                      fmt={fmt} savingId={savingId} itemWeekCount={itemWeekCount}
                      expandedItem={expandedItem} setExpandedItem={setExpandedItem} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className="space-y-4">
          {Object.keys(byResponsible).length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
              <p className="text-gray-500">No hay tareas asignadas a responsables aún.</p>
            </div>
          ) : (
            Object.entries(byResponsible).map(([responsible, tasks]) => (
              <div key={responsible} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-semibold">👤 {responsible}<span className="text-gray-500 font-normal text-sm ml-2">{tasks.length} tarea{tasks.length !== 1 ? 's' : ''} pendiente{tasks.length !== 1 ? 's' : ''}</span></h3>
                  <div className="flex gap-2">
                    <span className="text-yellow-400 text-xs">{tasks.filter((t: any) => t.status === 'pending').length} pend.</span>
                    <span className="text-blue-400 text-xs">{tasks.filter((t: any) => t.status === 'in_progress').length} proc.</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {tasks.map((task: any) => (
                    <div key={task.id} className={`flex items-start gap-4 p-3 rounded-lg border ${task.status === 'in_progress' ? 'bg-blue-950 border-blue-800' : 'bg-gray-800 border-gray-700'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium ${Number(task.variance_dollar) > 0 ? 'text-red-300' : 'text-green-300'}`}>{task.item_name}</p>
                          <span className="text-gray-500 text-xs">{task.week}</span>
                          <span className={`text-xs font-bold ${Number(task.variance_dollar) > 0 ? 'text-red-400' : 'text-green-400'}`}>
                            {Number(task.variance_dollar) > 0 ? fmt(task.variance_dollar) : '(' + fmt(task.variance_dollar) + ')'}
                          </span>
                        </div>
                        {task.action_required && <p className="text-gray-400 text-xs mt-1">📋 {task.action_required}</p>}
                        {task.reason && <p className="text-gray-500 text-xs">Razón: {task.reason}</p>}
                        {task.note && <p className="text-gray-500 text-xs italic">"{task.note}"</p>}
                      </div>
                      <select value={task.status} onChange={async e => { await updateTrackingStatus(task.id, e.target.value, task.item_name); task.status = e.target.value }}
                        className={`bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs focus:outline-none shrink-0 ${STATUS_LABELS[task.status]?.color}`}>
                        {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function TrackingTable({ items, type, tracking, onSave, allTracking, getPrefillData, getItemHistory,
  fmt, savingId, itemWeekCount, expandedItem, setExpandedItem }: any) {
  const isShortage = type === 'shortage'
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left text-gray-500 text-xs pb-2 font-medium">Item</th>
            <th className="text-right text-gray-500 text-xs pb-2 font-medium">Varianza $</th>
            <th className="text-left text-gray-500 text-xs pb-2 font-medium w-36">Razón</th>
            <th className="text-left text-gray-500 text-xs pb-2 font-medium w-36">Acción</th>
            <th className="text-left text-gray-500 text-xs pb-2 font-medium w-28">Responsable</th>
            <th className="text-left text-gray-500 text-xs pb-2 font-medium w-28">Estado</th>
            <th className="text-left text-gray-500 text-xs pb-2 font-medium">Nota</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item: any, i: number) => {
            const varDollar = Math.abs(Number(item.variance_dollar || 0))
            const existingT = tracking[item.name]
            const prefill = !existingT?.id ? getPrefillData(item.name) : null
            const t = existingT || prefill || {}
            const isPrefilled = !existingT?.id && !!prefill
            const isSaving = savingId === item.name
            const weekCount = itemWeekCount[item.name] || 0
            const wasResolved = allTracking.some((tr: any) => tr.item_name === item.name && tr.status === 'resolved')
            const recurred = wasResolved && !existingT?.id
            const history = getItemHistory(item.name)
            const isExpanded = expandedItem === item.name
            return (
              <>
                <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/30 transition">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${isShortage ? 'text-red-300' : 'text-green-300'}`}>{item.name}</span>
                      {recurred && <span className="text-red-400 text-xs bg-red-950 px-1.5 py-0.5 rounded">🔄 Recayó</span>}
                      {!recurred && weekCount > 1 && <span className="text-orange-400 text-xs bg-orange-950 px-1.5 py-0.5 rounded">⚠️ {weekCount} sem.</span>}
                      {isPrefilled && <span className="text-gray-500 text-xs bg-gray-800 px-1.5 py-0.5 rounded">↩️ prefill</span>}
                      {isSaving && <span className="text-gray-600 text-xs">💾</span>}
                      {history.length > 0 && (
                        <button onClick={() => setExpandedItem(isExpanded ? null : item.name)} className="text-blue-400 text-xs hover:text-blue-300 ml-1">
                          {isExpanded ? '▲' : '▼'} {history.length} sem. prev.
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 text-right"><span className={`font-bold text-sm ${isShortage ? 'text-red-400' : 'text-green-400'}`}>{isShortage ? fmt(varDollar) : '(' + fmt(varDollar) + ')'}</span></td>
                  <td className="py-2.5 pr-2">
                    <select value={t.reason || ''} onChange={e => onSave(item, { reason: e.target.value })}
                      className={`w-full bg-gray-800 border rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500 ${t.reason ? 'border-gray-600 text-white' : 'border-gray-700 text-gray-500'}`}>
                      <option value="">Sin razón</option>
                      {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5 pr-2">
                    <select value={t.action_required || ''} onChange={e => onSave(item, { action_required: e.target.value })}
                      className={`w-full bg-gray-800 border rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500 ${t.action_required ? 'border-gray-600 text-white' : 'border-gray-700 text-gray-500'}`}>
                      <option value="">Sin acción</option>
                      {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5 pr-2">
                    <input type="text" value={t.responsible || ''} placeholder="Nombre..."
                      onChange={e => onSave(item, { responsible: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
                  </td>
                  <td className="py-2.5 pr-2">
                    <select value={t.status || 'pending'} onChange={e => onSave(item, { status: e.target.value })}
                      className={`w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none ${STATUS_LABELS[t.status || 'pending']?.color}`}>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </td>
                  <td className="py-2.5">
                    <input type="text" value={t.note || ''} placeholder="Nota..."
                      onChange={e => onSave(item, { note: e.target.value })}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500" />
                  </td>
                </tr>
                {isExpanded && history.length > 0 && (
                  <tr key={`${i}-history`} className="border-b border-gray-800 bg-gray-900">
                    <td colSpan={7} className="py-3 px-4">
                      <p className="text-gray-500 text-xs font-semibold mb-2">Historial de semanas anteriores:</p>
                      <div className="space-y-2">
                        {history.map((h: any) => (
                          <div key={h.id} className={`flex items-center gap-4 p-2 rounded-lg border ${h.status === 'resolved' ? 'bg-green-950 border-green-900' : 'bg-gray-800 border-gray-700'}`}>
                            <span className="text-gray-400 text-xs w-16 shrink-0">{h.week}</span>
                            <span className={`text-xs font-bold shrink-0 ${isShortage ? 'text-red-400' : 'text-green-400'}`}>{isShortage ? fmt(h.variance_dollar) : '(' + fmt(h.variance_dollar) + ')'}</span>
                            {h.reason && <span className="text-gray-400 text-xs">{h.reason}</span>}
                            {h.action_required && <span className="text-gray-500 text-xs">· {h.action_required}</span>}
                            {h.responsible && <span className="text-gray-500 text-xs">· {h.responsible}</span>}
                            {h.status && <span className={`text-xs ml-auto shrink-0 ${STATUS_LABELS[h.status]?.color}`}>{STATUS_LABELS[h.status]?.label}</span>}
                            {h.note && <span className="text-gray-600 text-xs italic">"{h.note}"</span>}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}