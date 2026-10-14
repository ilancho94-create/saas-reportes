'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useRestaurantId } from '@/lib/use-restaurant'
import { useAuth } from '@/lib/auth-context'
import { can } from '@/lib/permissions'

export default function HistoryPage() {
  const restaurantId = useRestaurantId()
  const { user, isSuperAdmin } = useAuth()
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string>('')
  const [userCustomPerms, setUserCustomPerms] = useState<any>(null)
  const [confirmTarget, setConfirmTarget] = useState<any | null>(null)
  const [confirmInput, setConfirmInput] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (restaurantId) loadReports()
  }, [restaurantId])

  useEffect(() => {
    if (restaurantId && user) loadRole()
  }, [restaurantId, user])

  async function loadRole() {
    if (!restaurantId || !user) return
    const { data } = await supabase.from('user_restaurants')
      .select('role, custom_permissions')
      .eq('user_id', user.id).eq('restaurant_id', restaurantId)
      .maybeSingle()
    setUserRole((data as any)?.role || '')
    setUserCustomPerms((data as any)?.custom_permissions || null)
  }

  async function loadReports() {
    if (!restaurantId) return
    setLoading(true)
    setReports([])

    const { data } = await supabase
      .from('reports')
      .select(`*, sales_data (net_sales, orders, guests), labor_data (total_pay, total_hours, total_ot_hours), waste_data (total_cost)`)
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })

    setReports(data || [])
    setLoading(false)
  }

  function fmt(n: any) {
    if (!n) return '—'
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  const canDelete = isSuperAdmin || can(userRole, 'historial', 'delete', userCustomPerms)

  function openDeletePanel(report: any) {
    setConfirmTarget(report); setConfirmInput(''); setDeleteError('')
  }

  async function confirmDelete() {
    if (!confirmTarget) return
    if (confirmInput.trim() !== confirmTarget.week) {
      setDeleteError('Escribe exactamente ' + confirmTarget.week + ' para confirmar')
      return
    }
    setDeleting(true); setDeleteError('')
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/process-delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { 'Authorization': 'Bearer ' + session.access_token } : {}),
      },
      body: JSON.stringify({ reportId: confirmTarget.id }),
    })
    const payload = await res.json().catch(() => ({ error: 'Respuesta inválida' }))
    if (!res.ok || !payload.success) {
      setDeleteError(payload.error || 'No se pudo dar de baja')
      setDeleting(false)
      return
    }
    const removedWeek = confirmTarget.week
    setReports(prev => prev.filter(r => r.id !== confirmTarget.id))
    setConfirmTarget(null); setConfirmInput(''); setDeleting(false)
    setNotice('Reporte ' + removedWeek + ' dado de baja. Puedes volver a subirlo desde "+ Nueva semana".')
    setTimeout(() => setNotice(''), 8000)
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center gap-4">
        <Link href="/dashboard" prefetch className="text-gray-400 hover:text-white text-sm">
          ← Dashboard
        </Link>
        <span className="text-white font-semibold">Historial de reportes</span>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-white">Todas las semanas</h1>
          <button onClick={() => window.location.href = '/upload'}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
            + Nueva semana
          </button>
        </div>

        {notice && (
          <div className="bg-green-950 border border-green-800 text-green-300 rounded-xl px-5 py-3 mb-6 text-sm">
            ✓ {notice}
          </div>
        )}

        {reports.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 text-center">
            <p className="text-gray-500">No hay reportes aún para este restaurante</p>
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
                <div key={report.id}
                  className="w-full bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-5 cursor-pointer transition"
                  onClick={() => window.location.href = `/dashboard/week/${report.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-white font-semibold">{report.week}</p>
                        <p className="text-gray-500 text-sm">{report.week_start} al {report.week_end}</p>
                      </div>
                      {index === 0 && (
                        <span className="bg-blue-900 text-blue-300 text-xs px-2 py-0.5 rounded-full">Más reciente</span>
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
                      <div className="flex items-center gap-3">
                        <button onClick={e => { e.stopPropagation(); window.location.href = `/upload/edit/${report.id}` }}
                          className="text-xs text-gray-500 hover:text-blue-400 border border-gray-700 hover:border-blue-600 px-2 py-1 rounded transition">
                          Editar
                        </button>
                        {canDelete && (
                          <button onClick={e => { e.stopPropagation(); openDeletePanel(report) }}
                            className="text-xs text-gray-500 hover:text-red-400 border border-gray-700 hover:border-red-700 px-2 py-1 rounded transition"
                            title="Dar de baja esta semana (borra ventas, labor, cogs, inventario, etc.)">
                            Dar de baja
                          </button>
                        )}
                        <span className="text-gray-600">→</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Modal: confirmación de baja */}
      {confirmTarget && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-red-800 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-white font-bold text-base">🗑️ Dar de baja la semana</h3>
                <p className="text-gray-500 text-xs mt-0.5">{confirmTarget.week}</p>
              </div>
              <button onClick={() => { setConfirmTarget(null); setConfirmInput(''); setDeleteError('') }}
                disabled={deleting}
                className="text-gray-500 hover:text-white disabled:opacity-50">✕</button>
            </div>
            <div className="space-y-4">
              <div className="bg-red-950 border border-red-900 rounded-lg px-4 py-3">
                <p className="text-red-300 text-xs leading-relaxed">
                  Esto borra el reporte y TODO lo cargado para esa semana:
                  ventas, labor, COGS, inventario, product mix, waste, voids,
                  discounts, AvT, employee performance, kitchen details,
                  receiving y ajustes manuales. Esta acción NO se puede
                  deshacer; después puedes volver a subir los archivos
                  originales como "+ Nueva semana".
                </p>
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">
                  Para confirmar escribe <span className="text-red-400 font-mono">{confirmTarget.week}</span>
                </label>
                <input value={confirmInput} onChange={e => setConfirmInput(e.target.value)}
                  disabled={deleting}
                  placeholder={confirmTarget.week}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500 font-mono" />
              </div>
              {deleteError && <p className="text-red-400 text-xs">{deleteError}</p>}
              <div className="flex gap-3">
                <button onClick={() => { setConfirmTarget(null); setConfirmInput(''); setDeleteError('') }}
                  disabled={deleting}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 py-2 rounded-lg text-sm transition">
                  Cancelar
                </button>
                <button onClick={confirmDelete} disabled={deleting || confirmInput.trim() !== confirmTarget.week}
                  className="flex-1 bg-red-700 hover:bg-red-800 disabled:bg-gray-700 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm font-medium transition">
                  {deleting ? 'Borrando...' : 'Dar de baja'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
