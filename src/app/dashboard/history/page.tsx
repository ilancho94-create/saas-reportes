'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function HistoryPage() {
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else loadReports()
    })
  }, [])

  async function loadReports() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('restaurant_id')
      .eq('id', user.id)
      .single()

    if (!profile?.restaurant_id) {
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('reports')
      .select(`*, sales_data (net_sales, orders, guests), labor_data (total_pay, total_hours, total_ot_hours), waste_data (total_cost)`)
      .eq('restaurant_id', profile.restaurant_id)
      .order('created_at', { ascending: false })

    setReports(data || [])
    setLoading(false)
  }

  function fmt(n: any) {
    if (!n) return '—'
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => window.location.href = '/dashboard'}
          className="text-gray-400 hover:text-white text-sm"
        >
          ← Dashboard
        </button>
        <span className="text-white font-semibold">Historial de reportes</span>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Todas las semanas</h1>
          <button
            onClick={() => window.location.href = '/upload'}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            + Nueva semana
          </button>
        </div>

        {reports.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
            <p className="text-gray-500">No hay reportes aún</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report, index) => {
              const sales = report.sales_data?.[0]
              const labor = report.labor_data?.[0]
              const waste = report.waste_data?.[0]
              const prevSales = reports[index + 1]?.sales_data?.[0]
              const salesDiff = sales && prevSales ? sales.net_sales - prevSales.net_sales : null

              return (
                <div
                  key={report.id}
                  className="w-full bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-5 cursor-pointer transition"
                  onClick={() => window.location.href = `/dashboard/week/${report.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-white font-semibold">{report.week}</p>
                        <p className="text-gray-500 text-sm">{report.week_start} al {report.week_end}</p>
                      </div>
                      {index === 0 && (
                        <span className="bg-blue-900 text-blue-300 text-xs px-2 py-0.5 rounded-full">
                          Más reciente
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-8">
                      <div className="text-right">
                        <p className="text-gray-500 text-xs">Ventas</p>
                        <p className="text-white font-semibold">{fmt(sales?.net_sales)}</p>
                        {salesDiff !== null && (
                          <p className={`text-xs ${salesDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {salesDiff >= 0 ? '+' : ''}{fmt(salesDiff)}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-gray-500 text-xs">Labor</p>
                        <p className="text-white font-semibold">{fmt(labor?.total_pay)}</p>
                        {labor?.total_ot_hours > 0 && (
                          <p className="text-amber-400 text-xs">{Number(labor.total_ot_hours).toFixed(1)}h OT</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-gray-500 text-xs">Waste</p>
                        <p className="text-white font-semibold">{fmt(waste?.total_cost)}</p>
                      </div>
                      <span className="text-gray-600">→</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}