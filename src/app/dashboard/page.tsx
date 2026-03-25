'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [restaurant, setRestaurant] = useState<any>(null)
  const [reports, setReports] = useState<any[]>([])
  const [latestSales, setLatestSales] = useState<any>(null)
  const [latestLabor, setLatestLabor] = useState<any>(null)
  const [latestWaste, setLatestWaste] = useState<any>(null)
  const [trendData, setTrendData] = useState<any[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else {
        setUser(data.user)
        loadData()
      }
    })
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('restaurant_id')
      .eq('id', user.id)
      .single()

    if (!profile?.restaurant_id) { setLoading(false); return }

    // Cargar info del restaurante
    const { data: rest } = await supabase
      .from('restaurants')
      .select('*, organizations(name)')
      .eq('id', profile.restaurant_id)
      .single()
    setRestaurant(rest)

    // Cargar últimos 8 reportes para tendencia
    const { data: reps } = await supabase
      .from('reports')
      .select('*')
      .eq('restaurant_id', profile.restaurant_id)
      .order('created_at', { ascending: false })
      .limit(8)

    if (!reps || reps.length === 0) { setLoading(false); return }
    setReports(reps)

    // Cargar datos del reporte más reciente
    const latest = reps[0]
    const [s, l, w] = await Promise.all([
      supabase.from('sales_data').select('*').eq('report_id', latest.id).single(),
      supabase.from('labor_data').select('*').eq('report_id', latest.id).single(),
      supabase.from('waste_data').select('*').eq('report_id', latest.id).single(),
    ])
    if (s.data) setLatestSales(s.data)
    if (l.data) setLatestLabor(l.data)
    if (w.data) setLatestWaste(w.data)

    // Cargar ventas de todas las semanas para tendencia
    const trendPromises = reps.map(r =>
      supabase.from('sales_data').select('net_sales').eq('report_id', r.id).single()
    )
    const trendResults = await Promise.all(trendPromises)
    const trend = reps.map((r, i) => ({
      week: r.week.replace('2026-', ''),
      ventas: trendResults[i].data?.net_sales || 0,
    })).reverse()
    setTrendData(trend)

    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  function fmt(n: any) {
    if (!n) return '—'
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  function pct(part: any, total: any) {
    if (!part || !total) return '—'
    return (Number(part) / Number(total) * 100).toFixed(1) + '%'
  }

  const prevReport = reports[1]

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  )

  const hasData = latestSales || latestLabor
  const latestReport = reports[0]

  const menuItems = [
    { label: 'Dashboard CEO', icon: '👑', desc: 'Vista ejecutiva completa', href: '/dashboard/ceo', color: 'from-yellow-900 to-yellow-950 border-yellow-800' },
    { label: 'Ventas', icon: '💰', desc: 'Categorías, revenue centers, tendencias', href: '/dashboard/ventas', color: 'from-blue-900 to-blue-950 border-blue-800' },
    { label: 'Labor', icon: '👥', desc: 'Horas, costo, overtime por puesto', href: '/dashboard/labor', color: 'from-purple-900 to-purple-950 border-purple-800' },
    { label: 'Food Cost', icon: '🛒', desc: 'COGS por proveedor y categoría', href: '/dashboard/food-cost', color: 'from-orange-900 to-orange-950 border-orange-800' },
    { label: 'Waste & AvT', icon: '📊', desc: 'Merma y varianza actual vs teórico', href: '/dashboard/waste', color: 'from-green-900 to-green-950 border-green-800' },
    { label: 'Historial', icon: '📅', desc: 'Todos los reportes semanales', href: '/dashboard/history', color: 'from-gray-800 to-gray-900 border-gray-700' },
  ]

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold text-white">Restaurant X-Ray 🔬</span>
          {restaurant && (
            <>
              <span className="text-gray-600">·</span>
              <span className="text-gray-300 text-sm">{restaurant.name}</span>
              <span className="text-gray-600 text-xs">({restaurant.organizations?.name})</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 border border-gray-700 px-3 py-1.5 rounded-lg hover:border-gray-500 transition"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">

        {/* Header con semana actual */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">
              {restaurant?.name || 'Mi Restaurante'}
            </h1>
            {hasData && (
              <p className="text-gray-400 mt-1">
                Última semana: <span className="text-white font-medium">{latestReport?.week}</span>
                <span className="text-gray-600"> · {latestReport?.week_start} al {latestReport?.week_end}</span>
              </p>
            )}
          </div>
          <button
            onClick={() => window.location.href = '/upload'}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            + Nuevo reporte
          </button>
        </div>

        {hasData ? (
          <>
            {/* KPIs rápidos */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-sm mb-1">Ventas Netas</p>
                <p className="text-2xl font-bold text-blue-400">{fmt(latestSales?.net_sales)}</p>
                <p className="text-gray-600 text-xs mt-1">{latestSales?.orders} órdenes · {latestSales?.guests} guests</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-sm mb-1">% Labor</p>
                <p className="text-2xl font-bold text-purple-400">
                  {pct(latestLabor?.total_pay, latestSales?.net_sales)}
                </p>
                <p className="text-gray-600 text-xs mt-1">{fmt(latestLabor?.total_pay)} total</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-sm mb-1">Avg / Guest</p>
                <p className="text-2xl font-bold text-yellow-400">
                  {latestSales?.avg_per_guest ? '$' + Number(latestSales.avg_per_guest).toFixed(2) : '—'}
                </p>
                <p className="text-gray-600 text-xs mt-1">Avg orden: ${Number(latestSales?.avg_per_order || 0).toFixed(2)}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-gray-500 text-sm mb-1">Waste</p>
                <p className="text-2xl font-bold text-green-400">{fmt(latestWaste?.total_cost)}</p>
                <p className="text-gray-600 text-xs mt-1">{latestWaste?.items?.length || 0} items</p>
              </div>
            </div>

            {/* Gráfica de tendencia */}
            {trendData.length > 1 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
                <h2 className="text-white font-semibold mb-4">Tendencia de ventas</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trendData}>
                    <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + (v/1000).toFixed(0) + 'k'} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                      labelStyle={{ color: '#9ca3af' }}
                      formatter={(v: any) => ['$' + Number(v).toLocaleString(), 'Ventas']}
                    />
                    <Line type="monotone" dataKey="ventas" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        ) : (
          <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-10 text-center mb-8">
            <div className="text-5xl mb-4">📂</div>
            <h2 className="text-white font-semibold text-lg mb-2">No hay reportes aún</h2>
            <p className="text-gray-500 mb-6">Sube tus archivos de Toast y R365 para empezar</p>
            <button
              onClick={() => window.location.href = '/upload'}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg"
            >
              Subir primer reporte
            </button>
          </div>
        )}

        {/* Menú de secciones */}
        <h2 className="text-white font-semibold mb-4">Explorar por sección</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {menuItems.map(item => (
            <button
              key={item.href}
              onClick={() => window.location.href = item.href}
              className={`bg-gradient-to-br ${item.color} border rounded-xl p-5 text-left hover:scale-[1.02] transition-all`}
            >
              <div className="text-2xl mb-2">{item.icon}</div>
              <p className="text-white font-semibold">{item.label}</p>
              <p className="text-gray-400 text-xs mt-1">{item.desc}</p>
            </button>
          ))}
        </div>

      </main>
    </div>
  )
}