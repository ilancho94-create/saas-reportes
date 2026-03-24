'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function Dashboard() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<any>(null)
  const [sales, setSales] = useState<any>(null)
  const [labor, setLabor] = useState<any>(null)
  const [waste, setWaste] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else {
        setUser(data.user)
        loadLatestReport()
      }
    })
  }, [])

  async function loadLatestReport() {
    const { data: reports } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)

    if (!reports || reports.length === 0) {
      setLoading(false)
      return
    }

    const latestReport = reports[0]
    setReport(latestReport)

    const [salesRes, laborRes, wasteRes] = await Promise.all([
      supabase.from('sales_data').select('*').eq('report_id', latestReport.id).single(),
      supabase.from('labor_data').select('*').eq('report_id', latestReport.id).single(),
      supabase.from('waste_data').select('*').eq('report_id', latestReport.id).single(),
    ])

    if (salesRes.data) setSales(salesRes.data)
    if (laborRes.data) setLabor(laborRes.data)
    if (wasteRes.data) setWaste(wasteRes.data)

    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  function fmt(n: number | null | undefined) {
    if (!n) return '—'
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  )

  const hasData = sales || labor

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
<div className="flex items-center gap-6">
  <span className="text-xl font-bold text-white">SaaS Reportes 🚀</span>
  <button
    onClick={() => window.location.href = '/dashboard/history'}
    className="text-gray-400 hover:text-white text-sm transition"
  >
    Historial
  </button>
</div>
        <div className="flex items-center gap-4">
          <span className="text-gray-400 text-sm">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-400 border border-gray-700 px-3 py-1.5 rounded-lg"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {hasData ? `Semana ${report?.week}` : 'Bienvenido 👋'}
            </h1>
            <p className="text-gray-400 mt-1">
              {hasData
                ? `${report?.week_start} al ${report?.week_end}`
                : 'Sube tu primer reporte para ver los datos'}
            </p>
          </div>
          <button
            onClick={() => window.location.href = '/upload'}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
          >
            + Nuevo reporte
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 text-sm mb-1">Ventas Netas</p>
            <p className="text-2xl font-bold text-blue-400">{fmt(sales?.net_sales)}</p>
            {sales && (
              <p className="text-gray-600 text-xs mt-1">
                {sales.orders} órdenes · {sales.guests} guests
              </p>
            )}
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 text-sm mb-1">Labor</p>
            <p className="text-2xl font-bold text-purple-400">{fmt(labor?.total_pay)}</p>
            {labor && (
              <p className="text-gray-600 text-xs mt-1">
                {labor.total_hours?.toFixed(0)}h reg · {labor.total_ot_hours?.toFixed(1)}h OT
              </p>
            )}
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 text-sm mb-1">Avg / Guest</p>
            <p className="text-2xl font-bold text-yellow-400">
              {sales?.avg_per_guest ? '$' + Number(sales.avg_per_guest).toFixed(2) : '—'}
            </p>
            {sales && (
              <p className="text-gray-600 text-xs mt-1">
                Avg orden: ${Number(sales.avg_per_order).toFixed(2)}
              </p>
            )}
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 text-sm mb-1">Waste</p>
            <p className="text-2xl font-bold text-green-400">{fmt(waste?.total_cost)}</p>
            {waste && (
              <p className="text-gray-600 text-xs mt-1">
                {waste.items?.length || 0} items
              </p>
            )}
          </div>
        </div>

        {hasData ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {sales?.categories && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Ventas por categoría</h2>
                <div className="space-y-3">
                  {sales.categories.map((cat: any) => (
                    <div key={cat.name} className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm">{cat.name}</span>
                      <div className="flex items-center gap-3">
                        <div className="w-24 bg-gray-800 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full"
                            style={{ width: `${Math.min(Number(cat.pct) * 100, 100)}%` }}
                          />
                        </div>
                        <span className="text-white text-sm font-medium w-16 text-right">
                          {fmt(cat.net)}
                        </span>
                        <span className="text-gray-600 text-xs w-10 text-right">
                          {(Number(cat.pct) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {labor?.by_position && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Labor por puesto</h2>
                <div className="space-y-3">
                  {labor.by_position.map((pos: any) => (
                    <div key={pos.position} className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm">{pos.position}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-600 text-xs">
                          {Number(pos.regular_hours).toFixed(0)}h
                        </span>
                        {pos.ot_hours > 0 && (
                          <span className="text-amber-400 text-xs">
                            {Number(pos.ot_hours).toFixed(1)}h OT
                          </span>
                        )}
                        <span className="text-white text-sm font-medium">
                          {fmt(pos.total_pay)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-10 text-center">
            <div className="text-5xl mb-4">📂</div>
            <h2 className="text-white font-semibold text-lg mb-2">No hay reportes aún</h2>
            <p className="text-gray-500 mb-6">
              Sube tus archivos de Toast, R365 o xtraCHEF para empezar
            </p>
            <button
              onClick={() => window.location.href = '/upload'}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg"
            >
              Subir primer reporte
            </button>
          </div>
        )}

      </main>
    </div>
  )
}