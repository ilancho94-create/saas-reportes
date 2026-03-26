'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurantId } from '@/lib/use-restaurant'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line, ReferenceLine, Cell
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
          const { data: kp } = await supabase.from('kitchen_performance_data')
            .select('*').eq('report_id', r.id).single()
          return { report: r, kp }
        }))
      : []

    const withData = weeksData.filter(w => w.kp)
    setWeeks(withData)
    if (withData.length > 0) setSelectedWeek(withData[0].report.week)

    // Load station config
    const { data: configs } = await supabase.from('kitchen_station_config')
      .select('*').eq('restaurant_id', restaurantId).order('station_name')
    setStationConfig(configs || [])

    setLoading(false)
  }

  async function saveStationConfig(stationName: string, updates: Partial<any>) {
    setSavingConfig(true)
    const existing = stationConfig.find(c => c.station_name === stationName)
    if (existing) {
      await supabase.from('kitchen_station_config')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      await supabase.from('kitchen_station_config')
        .insert({ restaurant_id: restaurantId, station_name: stationName, ...updates })
    }
    const { data: configs } = await supabase.from('kitchen_station_config')
      .select('*').eq('restaurant_id', restaurantId).order('station_name')
    setStationConfig(configs || [])
    setSavingConfig(false)
    setConfigSaved(true)
    setTimeout(() => setConfigSaved(false), 2000)
  }

  function getConfig(stationName: string): any {
    return stationConfig.find(c => c.station_name === stationName) || {
      station_type: 'ignored',
      time_target_seconds: 600,
      display_name: stationName,
    }
  }

  // Compute stats from tickets using config
  const selected = weeks.find(w => w.report.week === selectedWeek)
  const tickets: any[] = selected?.kp?.tickets || []

  function computeStats(tickets: any[]) {
    // Expediter = tickets con expediter_level === '1'
    const expTickets = tickets.filter(t => t.expediter_level === '1' && t.fulfillment_seconds)

    // Bar = tickets con station matching bar config
    const barStations = stationConfig.filter(c => c.station_type === 'bar').map(c => c.station_name)
    const barTickets = tickets.filter(t => barStations.includes(t.station) && t.fulfillment_seconds)

    // Sub-stations
    const subStations = stationConfig.filter(c => c.station_type === 'kitchen_sub')
    const subStats = subStations.map(s => {
      const st = tickets.filter(t => t.station === s.station_name && t.fulfillment_seconds)
      return {
        name: s.display_name || s.station_name,
        station_name: s.station_name,
        avg: st.length ? st.reduce((a, b) => a + b.fulfillment_seconds, 0) / st.length : 0,
        count: st.length,
        target: s.time_target_seconds || 600,
      }
    })

    // Kitchen config for target
    const kitchenConfig = stationConfig.find(c => c.station_type === 'kitchen_expediter')
    const barConfig = stationConfig.find(c => c.station_type === 'bar')

    return {
      kitchen: {
        avg: expTickets.length ? expTickets.reduce((a, b) => a + b.fulfillment_seconds, 0) / expTickets.length : 0,
        count: expTickets.length,
        target: kitchenConfig?.time_target_seconds || 720,
        tickets: expTickets,
      },
      bar: {
        avg: barTickets.length ? barTickets.reduce((a, b) => a + b.fulfillment_seconds, 0) / barTickets.length : 0,
        count: barTickets.length,
        target: barConfig?.time_target_seconds || 240,
        tickets: barTickets,
      },
      subStations,
    }
  }

  const stats = computeStats(tickets)

  // By day of week
  function byDayData(ticketList: any[]) {
    const map: Record<string, number[]> = {}
    for (const t of ticketList) {
      if (!t.day_of_week || !t.fulfillment_seconds) continue
      if (!map[t.day_of_week]) map[t.day_of_week] = []
      map[t.day_of_week].push(t.fulfillment_seconds)
    }
    return DAY_ORDER.filter(d => map[d]).map(d => ({
      day: d.substring(0, 3),
      fullDay: d,
      avg: map[d].reduce((a, b) => a + b, 0) / map[d].length,
      count: map[d].length,
    }))
  }

  // By hour
  function byHourData(ticketList: any[]) {
    const map: Record<number, number[]> = {}
    for (const t of ticketList) {
      if (t.hour === undefined || !t.fulfillment_seconds) continue
      if (!map[t.hour]) map[t.hour] = []
      map[t.hour].push(t.fulfillment_seconds)
    }
    return Object.entries(map).sort((a, b) => Number(a[0]) - Number(b[0])).map(([h, times]) => ({
      hour: Number(h) + ':00',
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      count: times.length,
    }))
  }

  function fmtTime(seconds: number) {
    if (!seconds) return '—'
    const m = Math.floor(seconds / 60)
    const s = Math.round(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')} min`
  }

  function fmtTimeShort(seconds: number) {
    if (!seconds) return '—'
    return (seconds / 60).toFixed(1) + ' min'
  }

  // Detected stations from latest week
  const detectedStations: string[] = selected?.kp?.detected_stations || []
  // Add expediter as virtual station
  const hasExpediter = tickets.some(t => t.expediter_level === '1')

  // Trend data across weeks
  const trendData = [...weeks].reverse().map(w => {
    const wTickets: any[] = w.kp?.tickets || []
    const expT = wTickets.filter(t => t.expediter_level === '1' && t.fulfillment_seconds)
    const barStations = stationConfig.filter(c => c.station_type === 'bar').map(c => c.station_name)
    const barT = wTickets.filter(t => barStations.includes(t.station) && t.fulfillment_seconds)
    return {
      week: w.report.week.replace('2026-', ''),
      cocina: expT.length ? expT.reduce((a, b) => a + b.fulfillment_seconds, 0) / expT.length / 60 : null,
      bar: barT.length ? barT.reduce((a, b) => a + b.fulfillment_seconds, 0) / barT.length / 60 : null,
    }
  })

  const kitchenDayData = byDayData(stats.kitchen.tickets)
  const barDayData = byDayData(stats.bar.tickets)
  const kitchenHourData = byHourData(stats.kitchen.tickets)

  const isConfigured = stationConfig.length > 0

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando Kitchen Productivity...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">🍳 Kitchen Productivity</h1>
          <p className="text-gray-500 text-xs mt-0.5">{restaurantName} · Tiempos de cocina y bar por semana</p>
        </div>
        {weeks.length > 0 && (
          <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500">
            {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 bg-gray-900 px-6">
        <div className="flex gap-1">
          {([
            { id: 'dashboard', label: '📊 Dashboard' },
            { id: 'config', label: '⚙️ Configuración' },
          ] as { id: ActiveTab; label: string }[]).map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 ${activeTab === tab.id ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {activeTab === 'config' ? (
          <ConfigTab
            restaurantId={restaurantId || ''}
            detectedStations={detectedStations}
            hasExpediter={hasExpediter}
            stationConfig={stationConfig}
            onSave={saveStationConfig}
            saving={savingConfig}
            saved={configSaved}
          />
        ) : weeks.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-10 text-center">
            <div className="text-5xl mb-4">🍳</div>
            <h2 className="text-white font-semibold text-lg mb-2">No hay datos de Kitchen Productivity</h2>
            <p className="text-gray-500 mb-6">Sube el <strong>Kitchen Details</strong> de Toast.</p>
            <button onClick={() => window.location.href = '/upload'}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg">
              Subir reporte
            </button>
          </div>
        ) : !isConfigured ? (
          <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-6 text-center">
            <div className="text-4xl mb-3">⚙️</div>
            <h2 className="text-yellow-300 font-semibold text-base mb-2">Configura tus estaciones primero</h2>
            <p className="text-yellow-500 text-sm mb-4">Ve a la pestaña Configuración para mapear cada estación (cocina, bar, sub-estaciones).</p>
            <button onClick={() => setActiveTab('config')}
              className="bg-yellow-700 hover:bg-yellow-600 text-white px-5 py-2 rounded-lg text-sm font-medium transition">
              Ir a Configuración →
            </button>
          </div>
        ) : (
          <>
            {/* KPIs principales */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className={`border rounded-xl p-5 ${stats.kitchen.avg > stats.kitchen.target ? 'bg-red-950 border-red-800' : 'bg-gray-900 border-gray-800'}`}>
                <p className="text-gray-500 text-xs mb-1">⏱ Tiempo Cocina</p>
                <p className={`text-2xl font-bold ${stats.kitchen.avg > stats.kitchen.target ? 'text-red-400' : 'text-green-400'}`}>
                  {fmtTime(stats.kitchen.avg)}
                </p>
                <p className="text-gray-600 text-xs mt-1">Meta: {fmtTimeShort(stats.kitchen.target)} · {stats.kitchen.count} tickets</p>
              </div>
              <div className={`border rounded-xl p-5 ${stats.bar.avg > stats.bar.target ? 'bg-red-950 border-red-800' : 'bg-gray-900 border-gray-800'}`}>
                <p className="text-gray-500 text-xs mb-1">🍹 Tiempo Bar</p>
                <p className={`text-2xl font-bold ${stats.bar.avg > stats.bar.target ? 'text-red-400' : 'text-green-400'}`}>
                  {fmtTime(stats.bar.avg)}
                </p>
                <p className="text-gray-600 text-xs mt-1">Meta: {fmtTimeShort(stats.bar.target)} · {stats.bar.count} tickets</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">📋 Total Tickets</p>
                <p className="text-2xl font-bold text-white">{stats.kitchen.count + stats.bar.count}</p>
                <p className="text-gray-600 text-xs mt-1">cocina + bar</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-xs mb-1">✅ Cocina en meta</p>
                <p className="text-2xl font-bold text-blue-400">
                  {stats.kitchen.tickets.length > 0
                    ? Math.round(stats.kitchen.tickets.filter((t: any) => t.fulfillment_seconds <= stats.kitchen.target).length / stats.kitchen.tickets.length * 100)
                    : 0}%
                </p>
                <p className="text-gray-600 text-xs mt-1">dentro de {fmtTimeShort(stats.kitchen.target)}</p>
              </div>
            </div>

            {/* Sub-estaciones */}
            {stats.subStations.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {stats.subStations.map(s => (
                  <div key={s.station_name} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <p className="text-gray-500 text-xs mb-1">🔧 {s.name}</p>
                    <p className={`text-xl font-bold ${s.avg > s.target ? 'text-red-400' : 'text-purple-400'}`}>
                      {fmtTime(s.avg)}
                    </p>
                    <p className="text-gray-600 text-xs mt-1">Meta: {fmtTimeShort(s.target)} · {s.count} tickets</p>
                  </div>
                ))}
              </div>
            )}

            {/* Gráficas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Por día - Cocina */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Cocina por día</h2>
                <p className="text-gray-500 text-xs mb-4">{selectedWeek} · minutos promedio</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={kitchenDayData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v.toFixed(0) + 'm'} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any, _, props: any) => [`${(Number(v)/60).toFixed(1)} min (${props.payload.count} tickets)`, props.payload.fullDay]} />
                    <ReferenceLine y={stats.kitchen.target / 60} stroke="#f59e0b" strokeDasharray="4 4" />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                      {kitchenDayData.map((d, i) => (
                        <Cell key={i} fill={d.avg > stats.kitchen.target ? '#ef4444' : '#22c55e'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Por día - Bar */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-1">Bar por día</h2>
                <p className="text-gray-500 text-xs mb-4">{selectedWeek} · minutos promedio</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={barDayData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v.toFixed(0) + 'm'} />
                    <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      formatter={(v: any, _, props: any) => [`${(Number(v)/60).toFixed(1)} min (${props.payload.count} tickets)`, props.payload.fullDay]} />
                    <ReferenceLine y={stats.bar.target / 60} stroke="#f59e0b" strokeDasharray="4 4" />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                      {barDayData.map((d, i) => (
                        <Cell key={i} fill={d.avg > stats.bar.target ? '#ef4444' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Por hora */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-1">Cocina por hora del día</h2>
              <p className="text-gray-500 text-xs mb-4">{selectedWeek} · identificar rush hours</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={kitchenHourData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="hour" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => (v/60).toFixed(0) + 'm'} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                    formatter={(v: any, _, props: any) => [`${(Number(v)/60).toFixed(1)} min (${props.payload.count} tickets)`, 'Cocina']} />
                  <ReferenceLine y={stats.kitchen.target} stroke="#f59e0b" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="avg" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
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

// ── CONFIG TAB ─────────────────────────────────────────────────────────────
function ConfigTab({ restaurantId, detectedStations, hasExpediter, stationConfig, onSave, saving, saved }: any) {
  const [localConfig, setLocalConfig] = useState<Record<string, any>>({})

  useEffect(() => {
    const map: Record<string, any> = {}
    for (const c of stationConfig) {
      map[c.station_name] = { ...c }
    }
    // Add expediter if detected
    if (hasExpediter && !map['__expediter__']) {
      map['__expediter__'] = { station_name: '__expediter__', station_type: 'kitchen_expediter', time_target_seconds: 720, display_name: 'Cocina (Expediter)' }
    }
    setLocalConfig(map)
  }, [stationConfig, hasExpediter])

  function updateLocal(stationName: string, key: string, value: any) {
    setLocalConfig(prev => ({ ...prev, [stationName]: { ...prev[stationName], [key]: value } }))
  }

  async function saveAll() {
    for (const [name, cfg] of Object.entries(localConfig)) {
      await onSave(name, {
        station_type: cfg.station_type,
        time_target_seconds: cfg.time_target_seconds,
        display_name: cfg.display_name || name,
      })
    }
  }

  const allStations = [
    ...(hasExpediter ? ['__expediter__'] : []),
    ...detectedStations.filter((s: string) => s !== '__expediter__'),
  ]

  return (
    <div className="space-y-4">
      <div className="bg-blue-950 border border-blue-900 rounded-xl px-5 py-3">
        <p className="text-blue-300 text-sm font-medium">⚙️ Configuración de estaciones</p>
        <p className="text-blue-400 text-xs mt-0.5">
          Mapea cada estación que detectó el sistema. Esto permite que el dashboard funcione correctamente para cualquier restaurante.
        </p>
      </div>

      {allStations.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500">No hay estaciones detectadas. Sube primero un reporte de Kitchen Details.</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800">
            <h3 className="text-white font-semibold">Estaciones detectadas</h3>
            <p className="text-gray-500 text-xs mt-0.5">Semana más reciente · {allStations.length} estaciones</p>
          </div>
          <div className="divide-y divide-gray-800">
            {allStations.map((stationName: string) => {
              const cfg = localConfig[stationName] || { station_type: 'ignored', time_target_seconds: 600, display_name: stationName }
              const isExpediter = stationName === '__expediter__'
              return (
                <div key={stationName} className="px-6 py-4">
                  <div className="flex items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-48">
                      <p className="text-gray-400 text-xs mb-1">Estación (nombre en Toast)</p>
                      <p className="text-white font-medium text-sm">
                        {isExpediter ? '🍳 Expediter Level 1' : stationName}
                      </p>
                      {isExpediter && <p className="text-gray-600 text-xs">Tiempo total de cocina</p>}
                    </div>
                    <div className="flex-1 min-w-40">
                      <p className="text-gray-400 text-xs mb-1">Nombre para mostrar</p>
                      <input type="text" value={cfg.display_name || stationName}
                        onChange={e => updateLocal(stationName, 'display_name', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" />
                    </div>
                    <div className="flex-1 min-w-48">
                      <p className="text-gray-400 text-xs mb-1">Tipo de estación</p>
                      <select value={cfg.station_type || 'ignored'}
                        onChange={e => updateLocal(stationName, 'station_type', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500">
                        {Object.entries(STATION_TYPE_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                      <p className="text-gray-600 text-xs mt-1">{STATION_TYPE_LABELS[cfg.station_type as StationType]?.desc || ''}</p>
                    </div>
                    <div className="min-w-32">
                      <p className="text-gray-400 text-xs mb-1">Meta (minutos)</p>
                      <input type="number" min="0" max="120"
                        value={Math.round((cfg.time_target_seconds || 600) / 60)}
                        onChange={e => updateLocal(stationName, 'time_target_seconds', parseInt(e.target.value) * 60)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" />
                      <p className="text-gray-600 text-xs mt-1">{cfg.time_target_seconds || 600}s</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="px-6 py-4 border-t border-gray-800 flex items-center justify-between">
            {saved && <p className="text-green-400 text-sm">✓ Configuración guardada</p>}
            {!saved && <p className="text-gray-600 text-xs">Los cambios se aplican al dashboard inmediatamente</p>}
            <button onClick={saveAll} disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition">
              {saving ? 'Guardando...' : 'Guardar configuración'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}