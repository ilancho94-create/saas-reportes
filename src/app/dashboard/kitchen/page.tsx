'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurantId } from '@/lib/use-restaurant'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line, ReferenceLine, Cell, PieChart, Pie, Legend
} from 'recharts'

type ActiveTab = 'dashboard' | 'config'
type StationType = 'kitchen_expediter' | 'bar' | 'kitchen_sub' | 'ignored'

const STATION_TYPE_LABELS: Record<StationType, { label: string; color: string; desc: string }> = {
  kitchen_expediter: { label: '🍳 Cocina (Expediter)', color: 'text-orange-400', desc: 'Tiempo total de cocina' },
  bar: { label: '🍹 Bar', color: 'text-blue-400', desc: 'Tiempo total de bar' },
  kitchen_sub: { label: '🔧 Sub-estación', color: 'text-purple-400', desc: 'Estación dentro de cocina' },
  ignored: { label: '⏭️ Ignorar', color: 'text-gray-500', desc: 'No incluir en análisis' },
}

const DAY_ORDER = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DAY_SHORT: Record<string, string> = { Lunes: 'Lun', Martes: 'Mar', Miércoles: 'Mié', Jueves: 'Jue', Viernes: 'Vie', Sábado: 'Sáb', Domingo: 'Dom' }

type Shortcut = 'week' | 'last4' | 'month' | 'custom'

export default function KitchenPage() {
  const restaurantId = useRestaurantId()
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])
  const [selectedWeek, setSelectedWeek] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard')
  const [stationConfig, setStationConfig] = useState<any[]>([])
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)
  const [shortcut, setShortcut] = useState<Shortcut>('week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [filterStation, setFilterStation] = useState<'all' | 'kitchen' | 'bar'>('all')
  const [filterDay, setFilterDay] = useState<string[]>([])
  const [filterHourFrom, setFilterHourFrom] = useState(0)
  const [filterHourTo, setFilterHourTo] = useState(23)

  useEffect(() => { if (restaurantId) loadData() }, [restaurantId])

  async function loadData() {
    if (!restaurantId) return
    setLoading(true)
    const { data: rest } = await supabase.from('restaurants').select('name').eq('id', restaurantId).single()
    setRestaurantName(rest?.name || '')
    const { data: reports } = await supabase.from('reports').select('*')
      .eq('restaurant_id', restaurantId).order('week', { ascending: false }).limit(12)
    const weeksData = reports?.length
      ? await Promise.all(reports.map(async r => {
          const { data: kp } = await supabase.from('kitchen_performance_data').select('*').eq('report_id', r.id).single()
          return { report: r, kp }
        }))
      : []
    const withData = weeksData.filter(w => w.kp)
    setWeeks(withData)
    if (withData.length > 0) {
      setSelectedWeek(withData[0].report.week)
      setCustomFrom(withData[withData.length - 1]?.report.week || '')
      setCustomTo(withData[0]?.report.week || '')
    }
    const { data: configs } = await supabase.from('kitchen_station_config').select('*').eq('restaurant_id', restaurantId).order('station_name')
    setStationConfig(configs || [])
    setLoading(false)
  }

  async function saveStationConfig(stationName: string, updates: Partial<any>) {
    setSavingConfig(true)
    const existing = stationConfig.find(c => c.station_name === stationName)
    if (existing) {
      await supabase.from('kitchen_station_config').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('kitchen_station_config').insert({ restaurant_id: restaurantId, station_name: stationName, ...updates })
    }
    const { data: configs } = await supabase.from('kitchen_station_config').select('*').eq('restaurant_id', restaurantId).order('station_name')
    setStationConfig(configs || [])
    setSavingConfig(false); setConfigSaved(true)
    setTimeout(() => setConfigSaved(false), 2000)
  }

  // Filtered weeks
  const filteredWeeks = (() => {
    if (shortcut === 'week') return weeks.filter(w => w.report.week === selectedWeek)
    if (shortcut === 'last4') return weeks.slice(0, 4)
    if (shortcut === 'month') {
      const now = new Date(); const y = now.getFullYear(), m = now.getMonth()
      return weeks.filter(w => { const d = new Date(w.report.week_start || w.report.week); return d.getFullYear() === y && d.getMonth() === m })
    }
    if (shortcut === 'custom' && customFrom && customTo) {
      const from = customFrom <= customTo ? customFrom : customTo
      const to = customFrom <= customTo ? customTo : customFrom
      return weeks.filter(w => w.report.week >= from && w.report.week <= to)
    }
    return weeks.filter(w => w.report.week === selectedWeek)
  })()

  const allTickets: any[] = filteredWeeks.flatMap(w => w.kp?.tickets || [])
  const filteredTickets = allTickets.filter(t => {
    if (filterDay.length > 0 && !filterDay.includes(t.day_of_week)) return false
    if (t.hour < filterHourFrom || t.hour > filterHourTo) return false
    return true
  })

  const barStations = stationConfig.filter(c => c.station_type === 'bar').map(c => c.station_name)
  const subStations = stationConfig.filter(c => c.station_type === 'kitchen_sub')
  const kitchenConfig = stationConfig.find(c => c.station_type === 'kitchen_expediter')
  const barConfig = stationConfig.find(c => c.station_type === 'bar')
  const kitchenTarget = kitchenConfig?.time_target_seconds || 720
  const barTarget = barConfig?.time_target_seconds || 240

  const kitchenTickets = filteredTickets.filter(t => t.expediter_level === '1' && t.fulfillment_seconds)
  const barTickets = filteredTickets.filter(t => barStations.includes(t.station) && t.fulfillment_seconds)

  function avg(arr: any[]) { return arr.length ? arr.reduce((a, b) => a + b.fulfillment_seconds, 0) / arr.length : 0 }
  function pctInMeta(arr: any[], target: number) { return arr.length ? Math.round(arr.filter(t => t.fulfillment_seconds <= target).length / arr.length * 100) : 0 }
  function fmtTime(s: number) { if (!s) return '—'; return `${Math.floor(s / 60)}:${Math.round(s % 60).toString().padStart(2, '0')} min` }
  function fmtTimeShort(s: number) { return (s / 60).toFixed(1) + ' min' }
  function barColor(a: number, target: number) { const r = a / target; return r <= 0.85 ? '#22c55e' : r <= 1.0 ? '#f59e0b' : '#ef4444' }

  function byDay(ticketList: any[], target: number) {
    const map: Record<string, number[]> = {}
    for (const t of ticketList) { if (!t.day_of_week || !t.fulfillment_seconds) continue; if (!map[t.day_of_week]) map[t.day_of_week] = []; map[t.day_of_week].push(t.fulfillment_seconds) }
    return DAY_ORDER.filter(d => map[d]).map(d => ({ day: DAY_SHORT[d] || d, fullDay: d, avg: map[d].reduce((a, b) => a + b, 0) / map[d].length, count: map[d].length, target }))
  }

  function byHour(ticketList: any[]) {
    const timeMap: Record<number, number[]> = {}; const countMap: Record<number, number> = {}
    for (const t of ticketList) {
      if (t.hour === undefined || !t.fulfillment_seconds) continue
      if (!timeMap[t.hour]) { timeMap[t.hour] = []; countMap[t.hour] = 0 }
      timeMap[t.hour].push(t.fulfillment_seconds); countMap[t.hour]++
    }
    return Object.entries(timeMap).sort((a, b) => Number(a[0]) - Number(b[0])).map(([h, times]) => ({
      hour: h + ':00', avgTime: times.reduce((a, b) => a + b, 0) / times.length, orders: countMap[Number(h)],
    }))
  }

  const subByDay = subStations.map(s => {
    const st = filteredTickets.filter(t => t.station === s.station_name && t.fulfillment_seconds)
    const map: Record<string, number[]> = {}
    for (const t of st) { if (!map[t.day_of_week]) map[t.day_of_week] = []; map[t.day_of_week].push(t.fulfillment_seconds) }
    return {
      name: s.display_name || s.station_name, target: s.time_target_seconds || 600,
      avg: st.length ? avg(st) : 0, count: st.length,
      byDay: DAY_ORDER.filter(d => map[d]).map(d => ({ day: DAY_SHORT[d] || d, fullDay: d, avg: map[d].reduce((a, b) => a + b, 0) / map[d].length, count: map[d].length }))
    }
  }).filter(s => s.count > 0)

  const trendData = [...weeks].reverse().map(w => {
    const wT: any[] = w.kp?.tickets || []
    const expT = wT.filter(t => t.expediter_level === '1' && t.fulfillment_seconds)
    const barT = wT.filter(t => barStations.includes(t.station) && t.fulfillment_seconds)
    return { week: w.report.week.replace('2026-', ''), cocina: expT.length ? avg(expT) / 60 : null, bar: barT.length ? avg(barT) / 60 : null }
  })

  const kitchenDayData = byDay(kitchenTickets, kitchenTarget)
  const barDayData = byDay(barTickets, barTarget)
  const hourData = byHour(filterStation === 'bar' ? barTickets : kitchenTickets)
  const kitchenInMeta = kitchenTickets.filter(t => t.fulfillment_seconds <= kitchenTarget).length
  const barInMeta = barTickets.filter(t => t.fulfillment_seconds <= barTarget).length
  const isConfigured = stationConfig.length > 0

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Cargando Kitchen...</p></div>

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-white font-bold text-lg">🍳 Kitchen Productivity</h1>
          <p className="text-gray-500 text-xs mt-0.5">{restaurantName} · Tiempos de cocina y bar</p>
        </div>
        {shortcut === 'week' && weeks.length > 0 && (
          <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500">
            {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
          </select>
        )}
      </div>

      <div className="border-b border-gray-800 bg-gray-900 px-6">
        <div className="flex gap-1">
          {([{ id: 'dashboard', label: '📊 Dashboard' }, { id: 'config', label: '⚙️ Configuración' }] as { id: ActiveTab; label: string }[]).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 ${activeTab === tab.id ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {activeTab === 'config' ? (
          <ConfigTab restaurantId={restaurantId || ''} detectedStations={weeks[0]?.kp?.detected_stations || []}
            hasExpediter={(weeks[0]?.kp?.tickets || []).some((t: any) => t.expediter_level === '1')}
            stationConfig={stationConfig} onSave={saveStationConfig} saving={savingConfig} saved={configSaved} />
        ) : weeks.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-10 text-center">
            <div className="text-5xl mb-4">🍳</div>
            <h2 className="text-white font-semibold text-lg mb-2">No hay datos de Kitchen</h2>
            <p className="text-gray-500 mb-6">Sube el <strong>Kitchen Details</strong> de Toast.</p>
            <button onClick={() => window.location.href = '/upload'} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg">Subir reporte</button>
          </div>
        ) : !isConfigured ? (
          <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-6 text-center">
            <div className="text-4xl mb-3">⚙️</div>
            <h2 className="text-yellow-300 font-semibold mb-2">Configura tus estaciones primero</h2>
            <p className="text-yellow-500 text-sm mb-4">Ve a Configuración para mapear cada estación.</p>
            <button onClick={() => setActiveTab('config')} className="bg-yellow-700 hover:bg-yellow-600 text-white px-5 py-2 rounded-lg text-sm">Ir a Configuración →</button>
          </div>
        ) : (
          <>
            {/* Filtros */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-500 text-xs">Período:</span>
                {([['week', 'Esta semana'], ['last4', 'Últimas 4 sem'], ['month', 'Este mes'], ['custom', 'Custom']] as [Shortcut, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => setShortcut(k)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${shortcut === k ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>{l}</button>
                ))}
                {shortcut === 'custom' && (
                  <div className="flex items-center gap-2 ml-1">
                    <select value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none">
                      {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
                    </select>
                    <span className="text-gray-500 text-xs">→</span>
                    <select value={customTo} onChange={e => setCustomTo(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none">
                      {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
                    </select>
                  </div>
                )}
                <span className="text-gray-600 text-xs ml-2">{filteredTickets.length} tickets</span>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-gray-500 text-xs mr-1">Día:</span>
                  {DAY_ORDER.map(d => (
                    <button key={d} onClick={() => setFilterDay(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
                      className={`px-2 py-1 rounded text-xs transition ${filterDay.includes(d) ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                      {DAY_SHORT[d]}
                    </button>
                  ))}
                  {filterDay.length > 0 && <button onClick={() => setFilterDay([])} className="text-gray-500 hover:text-white text-xs ml-1">✕</button>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-xs">Hora:</span>
                  <select value={filterHourFrom} onChange={e => setFilterHourFrom(Number(e.target.value))} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs focus:outline-none">
                    {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i}:00</option>)}
                  </select>
                  <span className="text-gray-500 text-xs">—</span>
                  <select value={filterHourTo} onChange={e => setFilterHourTo(Number(e.target.value))} className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs focus:outline-none">
                    {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i}:00</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className={`border rounded-xl p-5 ${avg(kitchenTickets) > kitchenTarget ? 'bg-red-950 border-red-800' : 'bg-gray-900 border-gray-800'}`}>
                <p className="text-gray-500 text-xs mb-1">⏱ Tiempo Cocina</p>
                <p className={`text-2xl font-bold ${avg(kitchenTickets) > kitchenTarget ? 'text-red-400' : 'text-green-400'}`}>{fmtTime(avg(kitchenTickets))}</p>
                <p className="text-gray-600 text-xs mt-1">Meta: {fmtTimeShort(kitchenTarget)} · {kitchenTickets.length} tickets</p>
              </div>
              <div className={`border rounded-xl p-5 ${avg(barTickets) > barTarget ? 'bg-red-950 border-red-800' : 'bg-gray-900 border-gray-800'}`}>
                <p className="text-gray-500 text-xs mb-1">🍹 Tiempo Bar</p>
                <p className={`text-2xl font-bold ${avg(barTickets) > barTarget ? 'text-red-400' : 'text-green-400'}`}>{fmtTime(avg(barTickets))}</p>
                <p className="text-gray-600 text-xs mt-1">Meta: {fmtTimeShort(barTarget)} · {barTickets.length} tickets</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">✅ En meta</p>
                <p className="text-2xl font-bold text-blue-400">{pctInMeta(kitchenTickets, kitchenTarget)}%</p>
                <p className="text-gray-600 text-xs mt-1">Cocina · Bar: {pctInMeta(barTickets, barTarget)}%</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">📋 Total Tickets</p>
                <p className="text-2xl font-bold text-white">{kitchenTickets.length + barTickets.length}</p>
                <p className="text-gray-600 text-xs mt-1">{filteredWeeks.length} semana{filteredWeeks.length !== 1 ? 's' : ''}</p>
              </div>
            </div>

            {/* Sub-estaciones KPIs */}
            {subByDay.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {subByDay.map(s => (
                  <div key={s.name} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-gray-500 text-xs mb-1">🔧 {s.name}</p>
                    <p className={`text-xl font-bold ${s.avg > s.target ? 'text-red-400' : 'text-purple-400'}`}>{fmtTime(s.avg)}</p>
                    <p className="text-gray-600 text-xs mt-1">Meta: {fmtTimeShort(s.target)} · {s.count} tickets</p>
                  </div>
                ))}
              </div>
            )}

            {/* Por día — Cocina y Bar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">🍳 Cocina por día</h2>
                <p className="text-gray-500 text-xs mb-4">Minutos promedio · 🟢 en meta · 🟡 cerca · 🔴 fuera</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={kitchenDayData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => (v / 60).toFixed(0) + 'm'} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any, _, p: any) => [`${(Number(v) / 60).toFixed(1)} min (${p.payload.count} tickets)`, p.payload.fullDay]} />
                    <ReferenceLine y={kitchenTarget} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'meta', fill: '#f59e0b', fontSize: 10 }} />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                      {kitchenDayData.map((d, i) => <Cell key={i} fill={barColor(d.avg, kitchenTarget)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">🍹 Bar por día</h2>
                <p className="text-gray-500 text-xs mb-4">Minutos promedio · 🟢 en meta · 🟡 cerca · 🔴 fuera</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={barDayData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => (v / 60).toFixed(0) + 'm'} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any, _, p: any) => [`${(Number(v) / 60).toFixed(1)} min (${p.payload.count} tickets)`, p.payload.fullDay]} />
                    <ReferenceLine y={barTarget} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'meta', fill: '#f59e0b', fontSize: 10 }} />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                      {barDayData.map((d, i) => <Cell key={i} fill={barColor(d.avg, barTarget)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Sub-estaciones por día */}
            {subByDay.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">🔧 Sub-estaciones por día</h2>
                <p className="text-gray-500 text-xs mb-4">Tiempo promedio por estación de cocina</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={DAY_ORDER.filter(d => subByDay.some(s => s.byDay.find(b => b.fullDay === d))).map(d => {
                    const row: any = { day: DAY_SHORT[d] || d }
                    subByDay.forEach(s => { const b = s.byDay.find(b => b.fullDay === d); row[s.name] = b ? b.avg : null })
                    return row
                  })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => (v / 60).toFixed(0) + 'm'} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any, name: any) => [`${(Number(v) / 60).toFixed(1)} min`, name]} />
                    <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                    {subByDay.map((s, i) => {
                      const colors = ['#a855f7', '#ec4899', '#f97316', '#06b6d4']
                      return <Bar key={s.name} dataKey={s.name} fill={colors[i % colors.length]} radius={[3, 3, 0, 0]} />
                    })}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Tiempo por hora y Órdenes por hora */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-white font-semibold mb-1">Tiempo por hora</h2>
                    <p className="text-gray-500 text-xs">Rush hours · línea = meta</p>
                  </div>
                  <div className="flex gap-1">
                    {(['kitchen', 'bar'] as const).map(s => (
                      <button key={s} onClick={() => setFilterStation(filterStation === s ? 'all' : s)}
                        className={`px-2 py-1 rounded text-xs transition ${filterStation === s ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>
                        {s === 'kitchen' ? '🍳 Cocina' : '🍹 Bar'}
                      </button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={hourData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => (v / 60).toFixed(0) + 'm'} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any) => [`${(Number(v) / 60).toFixed(1)} min`, 'Tiempo prom.']} />
                    <ReferenceLine y={filterStation === 'bar' ? barTarget : kitchenTarget} stroke="#f59e0b" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="avgTime" stroke={filterStation === 'bar' ? '#3b82f6' : '#f97316'} strokeWidth={2} dot={{ fill: filterStation === 'bar' ? '#3b82f6' : '#f97316', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Órdenes por hora</h2>
                <p className="text-gray-500 text-xs mb-4">Volumen de tickets de cocina</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={byHour(kitchenTickets)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => [v, 'Órdenes']} />
                    <Bar dataKey="orders" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Órdenes por día y distribución */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Órdenes por día</h2>
                <p className="text-gray-500 text-xs mb-4">Volumen de tickets cocina + bar</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={DAY_ORDER.map(d => {
                    const kC = kitchenTickets.filter(t => t.day_of_week === d).length
                    const bC = barTickets.filter(t => t.day_of_week === d).length
                    return kC + bC > 0 ? { day: DAY_SHORT[d], cocina: kC, bar: bC } : null
                  }).filter(Boolean)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} />
                    <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                    <Bar dataKey="cocina" name="Cocina" fill="#f97316" radius={[3, 3, 0, 0]} stackId="a" />
                    <Bar dataKey="bar" name="Bar" fill="#3b82f6" radius={[0, 0, 0, 0]} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Distribución de tiempos</h2>
                <p className="text-gray-500 text-xs mb-4">% dentro y fuera de meta</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-orange-400 text-xs font-medium mb-2 text-center">🍳 Cocina</p>
                    <ResponsiveContainer width="100%" height={120}>
                      <PieChart>
                        <Pie data={[{ name: 'En meta', value: kitchenInMeta }, { name: 'Fuera', value: kitchenTickets.length - kitchenInMeta }]}
                          cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={2} dataKey="value">
                          <Cell fill="#22c55e" /><Cell fill="#ef4444" />
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <p className="text-center text-xs text-gray-400 mt-1">{pctInMeta(kitchenTickets, kitchenTarget)}% en meta</p>
                  </div>
                  <div>
                    <p className="text-blue-400 text-xs font-medium mb-2 text-center">🍹 Bar</p>
                    <ResponsiveContainer width="100%" height={120}>
                      <PieChart>
                        <Pie data={[{ name: 'En meta', value: barInMeta }, { name: 'Fuera', value: barTickets.length - barInMeta }]}
                          cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={2} dataKey="value">
                          <Cell fill="#22c55e" /><Cell fill="#ef4444" />
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <p className="text-center text-xs text-gray-400 mt-1">{pctInMeta(barTickets, barTarget)}% en meta</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tendencia semanal */}
            {trendData.length > 1 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Tendencia semanal</h2>
                <p className="text-gray-500 text-xs mb-4">Tiempo promedio cocina vs bar en minutos</p>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v?.toFixed(0) + 'm'} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any) => [v ? v.toFixed(1) + ' min' : '—']} />
                    <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                    <Line type="monotone" dataKey="cocina" name="Cocina" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="bar" name="Bar" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function ConfigTab({ restaurantId, detectedStations, hasExpediter, stationConfig, onSave, saving, saved }: any) {
  const [localConfig, setLocalConfig] = useState<Record<string, any>>({})

  useEffect(() => {
    const map: Record<string, any> = {}
    for (const c of stationConfig) map[c.station_name] = { ...c }
    if (hasExpediter && !map['__expediter__']) {
      map['__expediter__'] = { station_name: '__expediter__', station_type: 'kitchen_expediter', time_target_seconds: 720, display_name: 'Cocina (Expediter)' }
    }
    setLocalConfig(map)
  }, [stationConfig, hasExpediter])

  function updateLocal(name: string, key: string, value: any) {
    setLocalConfig(prev => ({ ...prev, [name]: { ...prev[name], [key]: value } }))
  }

  async function saveAll() {
    for (const [name, cfg] of Object.entries(localConfig)) {
      await onSave(name, { station_type: cfg.station_type, time_target_seconds: cfg.time_target_seconds, display_name: cfg.display_name || name })
    }
  }

  const allStations = [...(hasExpediter ? ['__expediter__'] : []), ...detectedStations.filter((s: string) => s !== '__expediter__')]

  return (
    <div className="space-y-4">
      <div className="bg-blue-950 border border-blue-900 rounded-xl px-5 py-3">
        <p className="text-blue-300 text-sm font-medium">⚙️ Configuración de estaciones</p>
        <p className="text-blue-400 text-xs mt-0.5">Mapea cada estación y define los tiempos meta en minutos.</p>
      </div>
      {allStations.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500">No hay estaciones detectadas. Sube primero un reporte de Kitchen Details.</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800"><h3 className="text-white font-semibold">Estaciones detectadas</h3></div>
          <div className="divide-y divide-gray-800">
            {allStations.map((stationName: string) => {
              const cfg = localConfig[stationName] || { station_type: 'ignored', time_target_seconds: 600, display_name: stationName }
              const isExpediter = stationName === '__expediter__'
              return (
                <div key={stationName} className="px-6 py-4">
                  <div className="flex items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-48">
                      <p className="text-gray-400 text-xs mb-1">Estación en Toast</p>
                      <p className="text-white font-medium text-sm">{isExpediter ? '🍳 Expediter Level 1' : stationName}</p>
                    </div>
                    <div className="flex-1 min-w-40">
                      <p className="text-gray-400 text-xs mb-1">Nombre para mostrar</p>
                      <input type="text" value={cfg.display_name || stationName} onChange={e => updateLocal(stationName, 'display_name', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" />
                    </div>
                    <div className="flex-1 min-w-48">
                      <p className="text-gray-400 text-xs mb-1">Tipo</p>
                      <select value={cfg.station_type || 'ignored'} onChange={e => updateLocal(stationName, 'station_type', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500">
                        {Object.entries(STATION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div className="min-w-32">
                      <p className="text-gray-400 text-xs mb-1">Meta (min)</p>
                      <input type="number" min="0" max="120" value={Math.round((cfg.time_target_seconds || 600) / 60)}
                        onChange={e => updateLocal(stationName, 'time_target_seconds', parseInt(e.target.value) * 60)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between">
            {saved ? <p className="text-green-400 text-sm">✓ Guardado</p> : <p className="text-gray-600 text-xs">Los cambios se aplican al dashboard inmediatamente</p>}
            <button onClick={saveAll} disabled={saving} className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition">
              {saving ? 'Guardando...' : 'Guardar configuración'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}