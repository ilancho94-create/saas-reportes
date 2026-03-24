'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function WeekDetail() {
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<any>(null)
  const [sales, setSales] = useState<any>(null)
  const [labor, setLabor] = useState<any>(null)
  const [cogs, setCogs] = useState<any>(null)
  const [waste, setWaste] = useState<any>(null)
  const [voids, setVoids] = useState<any>(null)
  const [discounts, setDiscounts] = useState<any>(null)
  const [avt, setAvt] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) window.location.href = '/'
      else loadData()
    })
  }, [id])

  async function loadData() {
    const { data: rep } = await supabase
      .from('reports')
      .select('*')
      .eq('id', id)
      .single()

    if (!rep) { window.location.href = '/dashboard/history'; return }
    setReport(rep)

    const [s, l, c, w, v, d, a] = await Promise.all([
      supabase.from('sales_data').select('*').eq('report_id', id).single(),
      supabase.from('labor_data').select('*').eq('report_id', id).single(),
      supabase.from('cogs_data').select('*').eq('report_id', id).single(),
      supabase.from('waste_data').select('*').eq('report_id', id).single(),
      supabase.from('voids_data').select('*').eq('report_id', id).single(),
      supabase.from('discounts_data').select('*').eq('report_id', id).single(),
      supabase.from('avt_data').select('*').eq('report_id', id).single(),
    ])

    if (s.data) setSales(s.data)
    if (l.data) setLabor(l.data)
    if (c.data) setCogs(c.data)
    if (w.data) setWaste(w.data)
    if (v.data) setVoids(v.data)
    if (d.data) setDiscounts(d.data)
    if (a.data) setAvt(a.data)

    setLoading(false)
  }

  function fmt(n: any) {
    if (n === null || n === undefined || n === 0) return '—'
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  function fmtDec(n: any) {
    if (n === null || n === undefined) return '—'
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
          onClick={() => window.location.href = '/dashboard/history'}
          className="text-gray-400 hover:text-white text-sm"
        >
          ← Historial
        </button>
        <span className="text-white font-semibold">Semana {report?.week}</span>
        <span className="text-gray-500 text-sm">{report?.week_start} al {report?.week_end}</span>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 text-sm mb-1">Ventas Netas</p>
            <p className="text-2xl font-bold text-blue-400">{fmt(sales?.net_sales)}</p>
            {sales && <p className="text-gray-600 text-xs mt-1">{sales.orders} órdenes · {sales.guests} guests</p>}
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 text-sm mb-1">Labor</p>
            <p className="text-2xl font-bold text-purple-400">{fmt(labor?.total_pay)}</p>
            {labor && <p className="text-gray-600 text-xs mt-1">{labor.total_hours?.toFixed(0)}h reg · {labor.total_ot_hours?.toFixed(1)}h OT</p>}
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 text-sm mb-1">Avg / Guest</p>
            <p className="text-2xl font-bold text-yellow-400">
              {sales?.avg_per_guest ? '$' + Number(sales.avg_per_guest).toFixed(2) : '—'}
            </p>
            {sales && <p className="text-gray-600 text-xs mt-1">Avg orden: ${Number(sales.avg_per_order).toFixed(2)}</p>}
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <p className="text-gray-500 text-sm mb-1">Waste</p>
            <p className="text-2xl font-bold text-green-400">{fmt(waste?.total_cost)}</p>
            {waste && <p className="text-gray-600 text-xs mt-1">{waste.items?.length || 0} items</p>}
          </div>
        </div>

        {/* Ventas por categoría + Revenue Centers */}
        {sales && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sales.categories && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Ventas por categoría</h2>
                <div className="space-y-3">
                  {sales.categories.map((cat: any) => (
                    <div key={cat.name} className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm">{cat.name}</span>
                      <div className="flex items-center gap-3">
                        <div className="w-24 bg-gray-800 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(Number(cat.pct), 100)}%` }} />
                        </div>
                        <span className="text-white text-sm font-medium w-16 text-right">{fmt(cat.net)}</span>
                        <span className="text-gray-600 text-xs w-10 text-right">{Number(cat.pct).toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sales.revenue_centers && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Revenue Centers</h2>
                <div className="space-y-3">
                  {sales.revenue_centers.map((rc: any) => (
                    <div key={rc.name} className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm">{rc.name}</span>
                      <div className="flex items-center gap-3">
                        <div className="w-24 bg-gray-800 rounded-full h-1.5">
                          <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${Math.min(Number(rc.pct), 100)}%` }} />
                        </div>
                        <span className="text-white text-sm font-medium w-16 text-right">{fmt(rc.net)}</span>
                        <span className="text-gray-600 text-xs w-10 text-right">{Number(rc.pct).toFixed(1)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Labor por puesto + por empleado */}
        {labor && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {labor.by_position && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Labor por puesto</h2>
                <div className="space-y-3">
                  {labor.by_position.map((pos: any) => (
                    <div key={pos.position} className="flex items-center justify-between">
                      <span className="text-gray-400 text-sm">{pos.position}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-600 text-xs">{Number(pos.regular_hours).toFixed(0)}h</span>
                        {pos.ot_hours > 0 && <span className="text-amber-400 text-xs">{Number(pos.ot_hours).toFixed(1)}h OT</span>}
                        <span className="text-white text-sm font-medium">{fmt(pos.total_pay)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {labor.by_employee && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Labor por empleado</h2>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {labor.by_employee.map((emp: any) => (
                    <div key={emp.name} className="flex items-center justify-between py-1 border-b border-gray-800">
                      <div>
                        <p className="text-gray-300 text-sm">{emp.name}</p>
                        <p className="text-gray-600 text-xs">{emp.position} · ${Number(emp.hourly_rate).toFixed(2)}/h</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white text-sm font-medium">{fmt(emp.total_pay)}</p>
                        <p className="text-gray-600 text-xs">
                          {Number(emp.regular_hours).toFixed(1)}h
                          {emp.ot_hours > 0 && <span className="text-amber-400"> +{Number(emp.ot_hours).toFixed(1)}OT</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* COGS */}
        {cogs && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">COGS / Compras</h2>
              <span className="text-white font-bold">{fmt(cogs.total)}</span>
            </div>
            {cogs.by_category && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                {Object.entries(cogs.by_category).map(([key, val]: any) => (
                  <div key={key} className="bg-gray-800 rounded-lg p-3 text-center">
                    <p className="text-gray-500 text-xs capitalize mb-1">{key.replace('_', ' ')}</p>
                    <p className="text-white text-sm font-semibold">{fmt(val)}</p>
                  </div>
                ))}
              </div>
            )}
            {cogs.by_vendor && (
              <div className="space-y-2">
                <p className="text-gray-500 text-xs mb-2">Por proveedor</p>
                {cogs.by_vendor.map((v: any) => (
                  <div key={v.name} className="flex items-center justify-between py-2 border-b border-gray-800">
                    <span className="text-gray-400 text-sm">{v.name}</span>
                    <span className="text-white text-sm font-medium">{fmt(v.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Voids + Descuentos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {voids && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Voids</h2>
                <span className="text-red-400 font-bold">{fmt(voids.total)}</span>
              </div>
              {voids.items && (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {voids.items.slice(0, 15).map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-1 border-b border-gray-800">
                      <div>
                        <p className="text-gray-300 text-sm">{item.item_name}</p>
                        <p className="text-gray-600 text-xs">{item.reason} · {item.server}</p>
                      </div>
                      <span className="text-red-400 text-sm">{fmtDec(item.price)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {discounts && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Descuentos</h2>
                <span className="text-orange-400 font-bold">{fmt(discounts.total)}</span>
              </div>
              {discounts.items && (
                <div className="space-y-2">
                  {discounts.items.map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800">
                      <div>
                        <p className="text-gray-300 text-sm">{item.name}</p>
                        <p className="text-gray-600 text-xs">{item.applications} aplicaciones · {item.orders} órdenes</p>
                      </div>
                      <span className="text-orange-400 text-sm font-medium">{fmt(item.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Waste */}
        {waste && waste.items && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Waste / Merma</h2>
              <span className="text-green-400 font-bold">{fmt(waste.total_cost)}</span>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {waste.items.map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800">
                  <div>
                    <p className="text-gray-300 text-sm">{item.name}</p>
                    <p className="text-gray-600 text-xs">{item.qty} {item.uom} · {item.category}</p>
                  </div>
                  <span className="text-white text-sm font-medium">{fmtDec(item.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AvT */}
        {avt && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-semibold">Actual vs Teórico</h2>
              <div className="flex items-center gap-4">
                <span className="text-red-400 text-sm">Faltantes: {fmt(avt.total_shortages)}</span>
                <span className="text-green-400 text-sm">Sobrantes: {fmt(avt.total_overages)}</span>
                <span className={`font-bold ${avt.net_variance >= 0 ? 'text-red-400' : 'text-green-400'}`}>
                  Neto: {fmt(avt.net_variance)}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {avt.shortages && avt.shortages.length > 0 && (
                <div>
                  <p className="text-red-400 text-xs font-medium mb-2">FALTANTES (usado más de lo teórico)</p>
                  <div className="space-y-2">
                    {avt.shortages.map((item: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-1 border-b border-gray-800">
                        <div>
                          <p className="text-gray-300 text-sm">{item.name}</p>
                          <p className="text-gray-600 text-xs">{item.variance_qty} {item.uom}</p>
                        </div>
                        <span className="text-red-400 text-sm font-medium">{fmtDec(item.variance_dollar)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {avt.overages && avt.overages.length > 0 && (
                <div>
                  <p className="text-green-400 text-xs font-medium mb-2">SOBRANTES (usado menos de lo teórico)</p>
                  <div className="space-y-2">
                    {avt.overages.map((item: any, i: number) => (
                      <div key={i} className="flex items-center justify-between py-1 border-b border-gray-800">
                        <div>
                          <p className="text-gray-300 text-sm">{item.name}</p>
                          <p className="text-gray-600 text-xs">{item.variance_qty} {item.uom}</p>
                        </div>
                        <span className="text-green-400 text-sm font-medium">{fmtDec(item.variance_dollar)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}