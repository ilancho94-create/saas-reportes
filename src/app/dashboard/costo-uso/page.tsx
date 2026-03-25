'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurantId } from '@/lib/use-restaurant'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

const ACCOUNT_MAP: Record<string, string> = {
  'Food Inventory': 'food',
  'Food bar Inventory': 'food',
  'Beer': 'beer',
  'Alcoholic Inventory': 'liquor',
  'Beverage Inventory': 'na_beverage',
  'Wine Inventory': 'wine',
}

const CATEGORIES_BASE = [
  { key: 'food', label: 'Food', color: '#f97316', defaultMeta: 28 },
  { key: 'na_beverage', label: 'NA Beverage', color: '#06b6d4', defaultMeta: 8 },
  { key: 'liquor', label: 'Liquor', color: '#a855f7', defaultMeta: 20 },
  { key: 'beer', label: 'Beer', color: '#eab308', defaultMeta: 20 },
  { key: 'wine', label: 'Wine', color: '#ec4899', defaultMeta: 20 },
]

type Shortcut = 'last1' | 'last4' | 'last8' | 'month' | 'custom'

export default function CostoUsoPage() {
  const restaurantId = useRestaurantId()
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])   // sorted ASC (oldest first)
  const [restaurantName, setRestaurantName] = useState('')
  const [mappings, setMappings] = useState<any[]>([])
  const [alerts, setAlerts] = useState<string[]>([])
  const [shortcut, setShortcut] = useState<Shortcut>('last4')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [operatingDays, setOperatingDays] = useState(6)
  const [costTargets, setCostTargets] = useState<Record<string, number>>({})

  const CATEGORIES = CATEGORIES_BASE.map(cat => ({
    ...cat,
    meta: costTargets[cat.key] !== undefined ? costTargets[cat.key] : cat.defaultMeta,
  }))

  useEffect(() => { if (restaurantId) loadData() }, [restaurantId])

  async function loadData() {
    if (!restaurantId) return
    setLoading(true)
    setWeeks([])

    const { data: rest } = await supabase
      .from('restaurants').select('name, operating_days').eq('id', restaurantId).single()
    setRestaurantName(rest?.name || '')
    setOperatingDays(rest?.operating_days || 6)

    const { data: maps } = await supabase
      .from('category_mappings').select('*').eq('restaurant_id', restaurantId)
    setMappings(maps || [])

    const { data: tgts } = await supabase
      .from('cost_targets').select('category, target_pct').eq('restaurant_id', restaurantId)
    if (tgts?.length) {
      const m: Record<string, number> = {}
      tgts.forEach((t: any) => { m[t.category] = Number(t.target_pct) })
      setCostTargets(m)
    }

    const { data: reports } = await supabase
      .from('reports').select('*')
      .eq('restaurant_id', restaurantId)
      .order('week', { ascending: true })   // ← ASC: oldest first
      .limit(52)

    if (!reports || reports.length === 0) { setLoading(false); return }

    const weeksData = await Promise.all(reports.map(async (r) => {
      const [s, c, inv, pm] = await Promise.all([
        supabase.from('sales_data').select('*').eq('report_id', r.id).single(),
        supabase.from('cogs_data').select('*').eq('report_id', r.id).single(),
        supabase.from('inventory_data').select('*').eq('report_id', r.id).single(),
        supabase.from('product_mix_data').select('*').eq('report_id', r.id).single(),
      ])
      return { report: r, sales: s.data, cogs: c.data, inventory: inv.data, productMix: pm.data }
    }))

    setWeeks(weeksData)

    const last = weeksData[weeksData.length - 1]
    setCustomFrom(weeksData.length >= 4 ? weeksData[weeksData.length - 4].report.week : weeksData[0].report.week)
    setCustomTo(last?.report.week || '')

    // Alerts de ajuste de inventario
    const newAlerts: string[] = []
    for (let i = 1; i < weeksData.length; i++) {
      const prev = weeksData[i - 1]
      const curr = weeksData[i]
      if (prev.inventory && curr.inventory) {
        const diff = Math.abs(Number(prev.inventory.grand_total_current) - Number(curr.inventory.grand_total_previous))
        if (diff > 10) {
          newAlerts.push(`⚠️ Ajuste detectado entre ${prev.report.week} y ${curr.report.week}: diferencia de $${diff.toFixed(0)} en inventario`)
        }
      }
    }
    setAlerts(newAlerts)
    setLoading(false)
  }

  // ── Filtered by shortcut ─────────────────────────────────────────────────
  const filtered = (() => {
    if (weeks.length === 0) return []
    if (shortcut === 'last1') return weeks.slice(-1)
    if (shortcut === 'last4') return weeks.slice(-4)
    if (shortcut === 'last8') return weeks.slice(-8)
    if (shortcut === 'month') {
      const now = new Date()
      const y = now.getFullYear(), m = now.getMonth()
      return weeks.filter(w => {
        const d = new Date(w.report.week_start)
        return d.getFullYear() === y && d.getMonth() === m
      })
    }
    if (shortcut === 'custom' && customFrom && customTo) {
      const from = customFrom <= customTo ? customFrom : customTo
      const to = customFrom <= customTo ? customTo : customFrom
      return weeks.filter(w => w.report.week >= from && w.report.week <= to)
    }
    return weeks.slice(-4)
  })()

  function fmt(n: any) {
    if (n === null || n === undefined) return '—'
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
  }

  function fmtPct(n: any) {
    if (n === null || n === undefined) return '—'
    return Number(n).toFixed(1) + '%'
  }

  function pct(part: any, total: any) {
    if (!part || !total) return null
    return parseFloat((Number(part) / Number(total) * 100).toFixed(1))
  }

  function getMappedSales(categories: any[], targetType: string) {
    if (!categories || !mappings.length) return 0
    return categories
      .filter((cat: any) => {
        const mapping = mappings.find(m => m.source_category.toLowerCase() === cat.name.toLowerCase())
        return mapping?.mapped_to === targetType
      })
      .reduce((sum: number, cat: any) => sum + Number(cat.net || 0), 0)
  }

  function getInventoryByCategory(invAccounts: any[], categoryKey: string) {
    if (!invAccounts) return { current: 0, previous: 0 }
    const accounts = Object.entries(ACCOUNT_MAP).filter(([_, cat]) => cat === categoryKey).map(([acc]) => acc)
    return {
      current: invAccounts.filter(a => accounts.includes(a.account)).reduce((s, a) => s + Number(a.current_value || 0), 0),
      previous: invAccounts.filter(a => accounts.includes(a.account)).reduce((s, a) => s + Number(a.previous_value || 0), 0),
    }
  }

  function buildWeekData(w: any) {
    const netSales = w.sales?.net_sales || 0
    const cogsCat = w.cogs?.by_category || {}
    const invAccounts = w.inventory?.by_account || []
    const salesCategories = w.sales?.categories || []
    const theoCostByCat = w.productMix?.theo_cost_by_category || {}
    const hasInventory = invAccounts.length > 0
    const result: any = { week: w.report.week.replace('2026-', ''), netSales, hasInventory, hasProductMix: !!w.productMix }
    let totalUsoCost = 0, totalTheoCost = 0, totalABSales = 0

    CATEGORIES.forEach(cat => {
      const inv = getInventoryByCategory(invAccounts, cat.key)
      const purchases = cogsCat[cat.key] || 0
      const uso = hasInventory ? Math.max((inv.previous + purchases - inv.current), 0) : 0
      const catSales = getMappedSales(salesCategories, cat.key) || 0
      const theoCost = theoCostByCat[cat.key] || 0
      const realPct = catSales > 0 ? pct(uso, catSales) : null
      const mixPct = catSales > 0 ? pct(theoCost, catSales) : null
      const variacionDolares = realPct !== null && mixPct !== null && catSales > 0
        ? parseFloat(((realPct - mixPct) / 100 * catSales).toFixed(2)) : null
      const diasInv = uso > 0 ? parseFloat((((inv.current + inv.previous) / 2) / uso * operatingDays).toFixed(1)) : null
      result[cat.key + '_uso'] = uso
      result[cat.key + '_uso_pct'] = realPct || 0
      result[cat.key + '_theo_pct'] = mixPct || 0
      result[cat.key + '_variacion'] = variacionDolares
      result[cat.key + '_dias_inv'] = diasInv
      result[cat.key + '_inv_current'] = inv.current
      result[cat.key + '_inv_previous'] = inv.previous
      result[cat.key + '_purchases'] = purchases
      result[cat.key + '_sales'] = catSales
      if (uso > 0) totalUsoCost += uso
      if (theoCost > 0) totalTheoCost += theoCost
      if (catSales > 0) totalABSales += catSales
    })

    result.totalUsoCost = totalUsoCost
    result.totalTheoCost = totalTheoCost
    result.totalABSales = totalABSales
    result.totalRealPct = totalABSales > 0 ? pct(totalUsoCost, totalABSales) : null
    result.totalMixPct = totalABSales > 0 ? pct(totalTheoCost, totalABSales) : null
    result.totalVariacion = result.totalRealPct !== null && result.totalMixPct !== null
      ? parseFloat(((result.totalRealPct - result.totalMixPct) / 100 * totalABSales).toFixed(2)) : null
    return result
  }

  const chartData = filtered.map(buildWeekData)
  const latest = filtered[filtered.length - 1]
  const latestData = latest ? buildWeekData(latest) : null
  const hasInventory = weeks.some(w => w.inventory?.by_account?.length > 0)
  const isMultiWeek = filtered.length > 1

  // ── Promedio ponderado del rango (Σuso / Σventas) ─────────────────────────
  const rangeSummary = (() => {
    let totalUso = 0, totalTheo = 0, totalABSales = 0, totalVariacion = 0
    const catTotals: Record<string, { uso: number; theo: number; sales: number; variacion: number }> = {}
    CATEGORIES.forEach(cat => { catTotals[cat.key] = { uso: 0, theo: 0, sales: 0, variacion: 0 } })
    filtered.forEach(w => {
      const d = buildWeekData(w)
      if (!d.hasInventory) return
      totalUso += d.totalUsoCost; totalTheo += d.totalTheoCost
      totalABSales += d.totalABSales
      if (d.totalVariacion !== null) totalVariacion += d.totalVariacion
      CATEGORIES.forEach(cat => {
        catTotals[cat.key].uso += d[cat.key + '_uso'] || 0
        catTotals[cat.key].theo += 0
        catTotals[cat.key].sales += d[cat.key + '_sales'] || 0
        if (d[cat.key + '_variacion'] !== null) catTotals[cat.key].variacion += d[cat.key + '_variacion'] || 0
      })
    })
    const totalRealPct = totalABSales > 0 ? parseFloat((totalUso / totalABSales * 100).toFixed(1)) : null
    const totalMixPct = totalABSales > 0 ? parseFloat((totalTheo / totalABSales * 100).toFixed(1)) : null
    return { totalUso, totalTheo, totalABSales, totalVariacion, totalRealPct, totalMixPct, catTotals }
  })()

  const SHORTCUTS: { key: Shortcut; label: string }[] = [
    { key: 'last1', label: 'Última semana' },
    { key: 'last4', label: 'Últimas 4 sem' },
    { key: 'last8', label: 'Últimas 8 sem' },
    { key: 'month', label: 'Este mes' },
    { key: 'custom', label: 'Custom' },
  ]

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando costo de uso...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      {/* ── Header + Selectores ── */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-white font-bold text-lg">📦 Costo de Uso</h1>
            <span className="bg-blue-900 text-blue-400 text-xs px-2 py-0.5 rounded-full font-medium">Inventario Real</span>
            <span className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full">{operatingDays} días/semana</span>
          </div>
          <p className="text-gray-500 text-xs mt-0.5">{restaurantName} · (Inv. Anterior + Compras − Inv. Actual) / Ventas</p>
        </div>
      </div>

      {/* ── Shortcuts ── */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {SHORTCUTS.map(s => (
            <button key={s.key} onClick={() => setShortcut(s.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${shortcut === s.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              {s.label}
            </button>
          ))}
          {shortcut === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <select value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500">
                {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
              </select>
              <span className="text-gray-500 text-xs">→</span>
              <select value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500">
                {weeks.map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
              </select>
            </div>
          )}
          <span className="text-gray-600 text-xs ml-2">{filtered.length} semanas</span>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="bg-blue-950 border border-blue-900 rounded-xl px-5 py-3 flex items-start gap-3">
          <span className="text-blue-400 text-lg">ℹ️</span>
          <div>
            <p className="text-blue-300 text-sm font-medium">Costo de Uso de Inventario</p>
            <p className="text-blue-400 text-xs mt-0.5">
              <strong>% Real</strong> = (Inv. Anterior + Compras − Inv. Actual) / Ventas ·
              <strong> % P.Mix</strong> = Costo teórico según lo vendido ·
              <strong> Variación $</strong> = (% Real − % P.Mix) × Ventas ·
              <strong> Días Inv</strong> = ((Inv. Final + Inv. Inicial) / 2) / Uso × {operatingDays} días
            </p>
          </div>
        </div>

        {alerts.map((alert, i) => (
          <div key={i} className="bg-yellow-950 border border-yellow-800 rounded-xl px-5 py-3 flex items-start gap-3">
            <span className="text-yellow-400 shrink-0">⚠️</span>
            <p className="text-yellow-300 text-sm">{alert}</p>
          </div>
        ))}

        {!hasInventory ? (
          <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-10 text-center">
            <div className="text-5xl mb-4">📦</div>
            <h2 className="text-white font-semibold text-lg mb-2">No hay datos de inventario</h2>
            <p className="text-gray-500 mb-6">Sube el <strong>Inventory Count Review</strong> de R365 para ver el costo de uso real.</p>
            <button onClick={() => window.location.href = '/upload'}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg">
              Subir reporte
            </button>
          </div>
        ) : (
          <>
            {latestData && (
              <div>
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
                  {isMultiWeek
                    ? `Promedio ponderado del período — ${filtered[0]?.report?.week} → ${latest?.report?.week} (${filtered.length} semanas)`
                    : `Semana — ${latest?.report?.week} (${latest?.report?.week_start} al ${latest?.report?.week_end})`
                  }
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-gray-500 text-xs mb-1">% Costo Real A&B {isMultiWeek ? '(pond.)' : ''}</p>
                    <p className="text-3xl font-bold text-blue-400">
                      {rangeSummary.totalRealPct !== null ? rangeSummary.totalRealPct + '%' : '—'}
                    </p>
                    <p className="text-gray-600 text-xs mt-1">{fmt(rangeSummary.totalUso)} uso {isMultiWeek ? 'acumulado' : 'real'}</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-gray-500 text-xs mb-1">% Costo P.Mix {isMultiWeek ? '(pond.)' : ''}</p>
                    <p className="text-3xl font-bold text-green-400">
                      {rangeSummary.totalMixPct !== null ? rangeSummary.totalMixPct + '%' : '—'}
                    </p>
                    <p className="text-gray-600 text-xs mt-1">{fmt(rangeSummary.totalTheo)} teórico</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-gray-500 text-xs mb-1">Variación $ {isMultiWeek ? 'acumulada' : ''}</p>
                    <p className={`text-3xl font-bold ${rangeSummary.totalVariacion > 0 ? 'text-red-400' : rangeSummary.totalVariacion < 0 ? 'text-green-400' : 'text-gray-400'}`}>
                      {rangeSummary.totalVariacion !== null ? (rangeSummary.totalVariacion > 0 ? '+' : '') + fmt(rangeSummary.totalVariacion) : '—'}
                    </p>
                    <p className="text-gray-600 text-xs mt-1">
                      {rangeSummary.totalVariacion > 0 ? 'sobre lo teórico' : rangeSummary.totalVariacion < 0 ? 'bajo lo teórico' : ''}
                    </p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-gray-500 text-xs mb-1">Inv. Actual Total</p>
                    <p className="text-2xl font-bold text-white">{fmt(latest?.inventory?.grand_total_current)}</p>
                    <p className="text-gray-600 text-xs mt-1">cierre de semana más reciente</p>
                  </div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h2 className="text-white font-semibold mb-4">Detalle por categoría — {latest?.report?.week}</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left text-gray-500 text-xs pb-3 font-medium">Categoría</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Inv. Ant.</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Compras</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Inv. Act.</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Uso $</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Ventas</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">% Real</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">% P.Mix</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Variación $</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Días Inv</th>
                        </tr>
                      </thead>
                      <tbody>
                        {CATEGORIES.map(cat => {
                          const realPct = latestData[cat.key + '_uso_pct']
                          const mixPct = latestData[cat.key + '_theo_pct']
                          const variacion = latestData[cat.key + '_variacion']
                          const dias = latestData[cat.key + '_dias_inv']
                          const overMeta = cat.meta && realPct && realPct > cat.meta
                          return (
                            <tr key={cat.key} className="border-b border-gray-800 hover:bg-gray-800 transition">
                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                                  <span className="text-gray-300 text-sm">{cat.label}</span>
                                </div>
                              </td>
                              <td className="py-3 text-right text-gray-500 text-xs">{fmt(latestData[cat.key + '_inv_previous'])}</td>
                              <td className="py-3 text-right text-gray-500 text-xs">{fmt(latestData[cat.key + '_purchases'])}</td>
                              <td className="py-3 text-right text-gray-500 text-xs">{fmt(latestData[cat.key + '_inv_current'])}</td>
                              <td className="py-3 text-right text-white text-sm font-medium">{fmt(latestData[cat.key + '_uso'])}</td>
                              <td className="py-3 text-right text-gray-400 text-sm">{fmt(latestData[cat.key + '_sales'])}</td>
                              <td className="py-3 text-right">
                                <span className={`font-bold text-sm ${overMeta ? 'text-red-400' : 'text-green-400'}`}>{fmtPct(realPct)}</span>
                              </td>
                              <td className="py-3 text-right text-blue-400 text-sm">{fmtPct(mixPct)}</td>
                              <td className="py-3 text-right">
                                {variacion !== null ? (
                                  <span className={`text-sm font-medium ${variacion > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                    {variacion > 0 ? '+' : ''}{fmt(variacion)}
                                  </span>
                                ) : <span className="text-gray-600">—</span>}
                              </td>
                              <td className="py-3 text-right text-gray-400 text-sm">{dias !== null ? dias + 'd' : '—'}</td>
                            </tr>
                          )
                        })}
                        <tr className="border-t-2 border-gray-700">
                          <td className="py-3 text-white font-bold">Total A&B</td>
                          <td colSpan={3} />
                          <td className="py-3 text-right text-white font-bold">{fmt(latestData.totalUsoCost)}</td>
                          <td className="py-3 text-right text-white font-bold">{fmt(latestData.totalABSales)}</td>
                          <td className="py-3 text-right">
                            <span className={`font-bold ${latestData.totalRealPct && latestData.totalRealPct > 35 ? 'text-red-400' : 'text-green-400'}`}>
                              {fmtPct(latestData.totalRealPct)}
                            </span>
                          </td>
                          <td className="py-3 text-right text-blue-400 font-bold">{fmtPct(latestData.totalMixPct)}</td>
                          <td className="py-3 text-right">
                            {latestData.totalVariacion !== null ? (
                              <span className={`font-bold ${latestData.totalVariacion > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {latestData.totalVariacion > 0 ? '+' : ''}{fmt(latestData.totalVariacion)}
                              </span>
                            ) : '—'}
                          </td>
                          <td />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {chartData.filter(d => d.hasInventory).length > 1 && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h2 className="text-white font-semibold mb-1">% Real vs % P.Mix por semana</h2>
                    <p className="text-gray-500 text-xs mb-4">Total A&B</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={chartData.filter(d => d.hasInventory)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                        <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                          formatter={(v: any, name: any) => [v + '%', name]} />
                        <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                        <Line type="monotone" dataKey="totalRealPct" name="% Real" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
                        <Line type="monotone" dataKey="totalMixPct" name="% P.Mix" stroke="#22c55e" strokeWidth={2} strokeDasharray="5 5" dot={{ fill: '#22c55e', r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h2 className="text-white font-semibold mb-1">Variación $ por semana</h2>
                    <p className="text-gray-500 text-xs mb-4">Positivo = sobre teórico (malo) · Negativo = bajo teórico (bueno)</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={chartData.filter(d => d.hasInventory)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '$' + v} />
                        <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                          formatter={(v: any) => [fmt(v), 'Variación']} />
                        <Bar dataKey="totalVariacion" name="Variación $" radius={[4, 4, 0, 0]} fill="#ef4444" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h2 className="text-white font-semibold mb-1">% Costo Real por categoría</h2>
                  <p className="text-gray-500 text-xs mb-4">Tendencia semanal</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData.filter(d => d.hasInventory)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="week" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => v + '%'} />
                      <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
                        formatter={(v: any, name: any) => [v + '%', name]} />
                      <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                      {CATEGORIES.map(cat => (
                        <Line key={cat.key} type="monotone" dataKey={cat.key + '_uso_pct'} name={cat.label}
                          stroke={cat.color} strokeWidth={2} dot={{ fill: cat.color, r: 3 }} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Histórico por semana</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 text-xs pb-3 font-medium">Semana</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">% Real</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">% P.Mix</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Variación $</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Uso $</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Ventas A&B</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">Inventario</th>
                      <th className="text-right text-gray-500 text-xs pb-3 font-medium">P.Mix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...filtered].reverse().map((w) => {
                      const d = buildWeekData(w)
                      return (
                        <tr key={w.report.id} className="border-b border-gray-800 hover:bg-gray-800 transition">
                          <td className="py-3">
                            <p className="text-gray-300">{w.report.week}</p>
                            <p className="text-gray-600 text-xs">{w.report.week_start} → {w.report.week_end}</p>
                          </td>
                          <td className="py-3 text-right">
                            <span className={`font-medium ${d.totalRealPct && d.totalRealPct > 35 ? 'text-red-400' : 'text-green-400'}`}>
                              {fmtPct(d.totalRealPct)}
                            </span>
                          </td>
                          <td className="py-3 text-right text-blue-400">{fmtPct(d.totalMixPct)}</td>
                          <td className="py-3 text-right">
                            {d.totalVariacion !== null ? (
                              <span className={`font-medium ${d.totalVariacion > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {d.totalVariacion > 0 ? '+' : ''}{fmt(d.totalVariacion)}
                              </span>
                            ) : <span className="text-gray-600">—</span>}
                          </td>
                          <td className="py-3 text-right text-white">{fmt(d.totalUsoCost)}</td>
                          <td className="py-3 text-right text-gray-400">{fmt(d.totalABSales)}</td>
                          <td className="py-3 text-right">{d.hasInventory ? <span className="text-green-400 text-xs">✓</span> : <span className="text-gray-600 text-xs">—</span>}</td>
                          <td className="py-3 text-right">{d.hasProductMix ? <span className="text-green-400 text-xs">✓</span> : <span className="text-gray-600 text-xs">—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}