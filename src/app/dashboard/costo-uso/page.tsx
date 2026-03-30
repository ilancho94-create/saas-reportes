'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurantId } from '@/lib/use-restaurant'
import { can } from '@/lib/permissions'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, Cell
} from 'recharts'

const ACCOUNT_MAP: Record<string, string> = {
  'Food Inventory': 'food',
  'Food bar Inventory': 'liquor',
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

const ADJUSTMENT_FIELDS = [
  { key: 'inv_previous', label: 'Inv. Anterior' },
  { key: 'purchases', label: 'Compras' },
  { key: 'inv_current', label: 'Inv. Final' },
  { key: 'theo_cost', label: 'Costo Teórico adicional' },
]

type Shortcut = 'week' | 'last4' | 'last8' | 'month' | 'custom'

export default function CostoUsoPage() {
  const restaurantId = useRestaurantId()
  const [loading, setLoading] = useState(true)
  const [weeks, setWeeks] = useState<any[]>([])
  const [restaurantName, setRestaurantName] = useState('')
  const [mappings, setMappings] = useState<any[]>([])
  const [alerts, setAlerts] = useState<string[]>([])
  const [shortcut, setShortcut] = useState<Shortcut>('week')
  const [selectedWeek, setSelectedWeek] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [operatingDays, setOperatingDays] = useState(6)
  const [costTargets, setCostTargets] = useState<Record<string, number>>({})
  const [userRole, setUserRole] = useState<string>('')
  const [userCustomPerms, setUserCustomPerms] = useState<any>(null)
  const [adjustments, setAdjustments] = useState<any[]>([])
  const [showAdjPanel, setShowAdjPanel] = useState(false)
  const [adjWeek, setAdjWeek] = useState('')
  const [adjReportId, setAdjReportId] = useState('')
  const [adjCategory, setAdjCategory] = useState('')
  const [adjField, setAdjField] = useState('inv_previous')
  const [adjValue, setAdjValue] = useState('')
  const [adjNote, setAdjNote] = useState('')
  const [adjSaving, setAdjSaving] = useState(false)
  const [adjError, setAdjError] = useState('')
  const [showAdjLog, setShowAdjLog] = useState(false)

  // ── NUEVO: descuentos operativos ──────────────────────────────────────────
  const [includeOpDiscounts, setIncludeOpDiscounts] = useState(false)
  const [opDiscountMappings, setOpDiscountMappings] = useState<string[]>([]) // nombres operativos
  const [discountsDataByWeek, setDiscountsDataByWeek] = useState<Record<string, number>>({}) // semana → total operativos

  const CATEGORIES = CATEGORIES_BASE.map(cat => ({
    ...cat,
    meta: costTargets[cat.key] !== undefined ? costTargets[cat.key] : cat.defaultMeta,
  }))

  const canEdit = can(userRole, 'costo_uso', 'edit', userCustomPerms)

  useEffect(() => { if (restaurantId) loadData() }, [restaurantId])

  async function loadData() {
    if (!restaurantId) return
    setLoading(true)
    setWeeks([])

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: ur } = await supabase.from('user_restaurants')
        .select('role, custom_permissions').eq('user_id', user.id).eq('restaurant_id', restaurantId).single()
      if (ur) { setUserRole(ur.role || ''); setUserCustomPerms(ur.custom_permissions || null) }
    }

    const { data: rest } = await supabase.from('restaurants').select('name, operating_days').eq('id', restaurantId).single()
    setRestaurantName(rest?.name || '')
    setOperatingDays(rest?.operating_days || 6)

    const { data: maps } = await supabase.from('category_mappings').select('*').eq('restaurant_id', restaurantId)
    setMappings(maps || [])

    const { data: tgts } = await supabase.from('cost_targets').select('category, target_pct').eq('restaurant_id', restaurantId)
    if (tgts?.length) {
      const m: Record<string, number> = {}
      tgts.forEach((t: any) => { m[t.category] = Number(t.target_pct) })
      setCostTargets(m)
    }

    // ── NUEVO: cargar nombres de descuentos operativos ─────────────────────
    const { data: discMaps } = await supabase
      .from('discount_mappings')
      .select('discount_name')
      .eq('restaurant_id', restaurantId)
      .eq('is_operational', true)
    setOpDiscountMappings((discMaps || []).map((d: any) => d.discount_name))

    const { data: reports } = await supabase.from('reports').select('*')
      .eq('restaurant_id', restaurantId).order('week', { ascending: true }).limit(52)

    if (!reports || reports.length === 0) { setLoading(false); return }

    const weeksData = await Promise.all(reports.map(async (r) => {
      const [s, c, inv, pm, disc] = await Promise.all([
        supabase.from('sales_data').select('*').eq('report_id', r.id).single(),
        supabase.from('cogs_data').select('*').eq('report_id', r.id).single(),
        supabase.from('inventory_data').select('*').eq('report_id', r.id).single(),
        supabase.from('product_mix_data').select('*').eq('report_id', r.id).single(),
        supabase.from('discounts_data').select('total, items').eq('report_id', r.id).single(),
      ])
      return { report: r, sales: s.data, cogs: c.data, inventory: inv.data, productMix: pm.data, discounts: disc.data }
    }))

    setWeeks(weeksData)

    // ── NUEVO: calcular total de descuentos operativos por semana ──────────
    // Se recalcula dinámicamente en getOpDiscountTotal() usando opDiscountMappings
    const last = weeksData[weeksData.length - 1]
    setSelectedWeek(last?.report.week || '')
    setCustomFrom(weeksData.length >= 4 ? weeksData[weeksData.length - 4].report.week : weeksData[0].report.week)
    setCustomTo(last?.report.week || '')

    const { data: adjs } = await supabase.from('costo_uso_adjustments')
      .select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false })
    setAdjustments(adjs || [])

    const newAlerts: string[] = []
    for (let i = 1; i < weeksData.length; i++) {
      const prev = weeksData[i - 1]; const curr = weeksData[i]
      if (prev.inventory && curr.inventory) {
        const diff = Math.abs(Number(prev.inventory.grand_total_current) - Number(curr.inventory.grand_total_previous))
        if (diff > 10) newAlerts.push(`⚠️ Ajuste detectado entre ${prev.report.week} y ${curr.report.week}: diferencia de $${diff.toFixed(0)} en inventario`)
      }
    }
    setAlerts(newAlerts)
    setLoading(false)
  }

  // ── NUEVO: calcular total descuentos operativos de una semana ─────────────
  function getOpDiscountTotal(w: any): number {
    if (!includeOpDiscounts || !opDiscountMappings.length) return 0
    const items: any[] = w.discounts?.items || []
    return items
      .filter((item: any) => opDiscountMappings.includes(item.name))
      .reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0)
  }

  function getAdj(week: string, category: string, field: string): number {
    return adjustments.filter(a => a.week === week && a.category === category && a.field === field)
      .reduce((sum, a) => sum + Number(a.adjustment_value), 0)
  }
  function hasAdjustments(week: string): boolean { return adjustments.some(a => a.week === week) }
  function getWeekAdjustments(week: string): any[] { return adjustments.filter(a => a.week === week) }

  async function saveAdjustment() {
    if (!adjValue || !adjNote.trim()) { setAdjError('Debes ingresar un valor y una nota explicativa'); return }
    const numVal = parseFloat(adjValue)
    if (isNaN(numVal)) { setAdjError('El valor debe ser un número'); return }
    setAdjSaving(true); setAdjError('')
    const w = weeks.find(w => w.report.week === adjWeek)
    let originalValue = 0
    if (w) {
      const d = buildWeekData(w)
      if (adjField === 'inv_previous') originalValue = d[adjCategory + '_inv_previous'] || 0
      else if (adjField === 'purchases') originalValue = d[adjCategory + '_purchases'] || 0
      else if (adjField === 'inv_current') originalValue = d[adjCategory + '_inv_current'] || 0
      else if (adjField === 'theo_cost') originalValue = d[adjCategory + '_theo_cost'] || 0
    }
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('costo_uso_adjustments').insert({
      restaurant_id: restaurantId, report_id: adjReportId, week: adjWeek,
      category: adjCategory, field: adjField, original_value: originalValue,
      adjustment_value: numVal, note: adjNote.trim(),
      created_by: user?.email || user?.id || 'unknown',
    })
    if (error) { setAdjError('Error al guardar: ' + error.message); setAdjSaving(false); return }
    const { data: adjs } = await supabase.from('costo_uso_adjustments')
      .select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false })
    setAdjustments(adjs || [])
    setAdjValue(''); setAdjNote(''); setShowAdjPanel(false); setAdjSaving(false)
  }

  async function deleteAdjustment(id: string) {
    if (!confirm('¿Eliminar este ajuste? Esta acción no se puede deshacer.')) return
    await supabase.from('costo_uso_adjustments').delete().eq('id', id)
    setAdjustments(prev => prev.filter(a => a.id !== id))
  }

  function openAdjPanel(week: string, reportId: string, category: string) {
    setAdjWeek(week); setAdjReportId(reportId); setAdjCategory(category)
    setAdjField('inv_previous'); setAdjValue(''); setAdjNote(''); setAdjError('')
    setShowAdjPanel(true)
  }

  const filtered = (() => {
    if (weeks.length === 0) return []
    if (shortcut === 'week') return weeks.filter(w => w.report.week === selectedWeek)
    if (shortcut === 'last4') return weeks.slice(-4)
    if (shortcut === 'last8') return weeks.slice(-8)
    if (shortcut === 'month') {
      const now = new Date(); const y = now.getFullYear(), m = now.getMonth()
      return weeks.filter(w => { const d = new Date(w.report.week_start); return d.getFullYear() === y && d.getMonth() === m })
    }
    if (shortcut === 'custom' && customFrom && customTo) {
      const from = customFrom <= customTo ? customFrom : customTo
      const to = customFrom <= customTo ? customTo : customFrom
      return weeks.filter(w => w.report.week >= from && w.report.week <= to)
    }
    return weeks.slice(-4)
  })()

  function fmt(n: any) { if (n === null || n === undefined) return '—'; return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }) }
  function fmtPct(n: any) { if (n === null || n === undefined) return '—'; return Number(n).toFixed(1) + '%' }
  function pct(part: any, total: any) { if (!part || !total) return null; return parseFloat((Number(part) / Number(total) * 100).toFixed(1)) }

  function getMappedSales(categories: any[], targetType: string) {
    if (!categories || !mappings.length) return 0
    return categories.filter((cat: any) => {
      const mapping = mappings.find(m => m.source_category.toLowerCase() === cat.name.toLowerCase())
      return mapping?.mapped_to === targetType
    }).reduce((sum: number, cat: any) => sum + Number(cat.net || 0), 0)
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
    const week = w.report.week

    // ── NUEVO: total descuentos operativos de la semana ───────────────────
    const opDiscTotal = getOpDiscountTotal(w)

    const result: any = { week: week.replace('2026-', ''), fullWeek: week, reportId: w.report.id, netSales, hasInventory, hasProductMix: !!w.productMix, opDiscTotal }
    let totalUsoCost = 0, totalTheoCost = 0, totalABSales = 0

    CATEGORIES.forEach(cat => {
      const inv = getInventoryByCategory(invAccounts, cat.key)
      const adjInvPrev = getAdj(week, cat.key, 'inv_previous')
      const adjPurchases = getAdj(week, cat.key, 'purchases')
      const adjInvCurr = getAdj(week, cat.key, 'inv_current')
      const adjTheo = getAdj(week, cat.key, 'theo_cost')
      const invPrevious = inv.previous + adjInvPrev
      const purchases = (cogsCat[cat.key] || 0) + adjPurchases
      const invCurrent = inv.current + adjInvCurr
      const uso = hasInventory ? Math.max((invPrevious + purchases - invCurrent), 0) : 0
      const catSalesBase = getMappedSales(salesCategories, cat.key) || 0

      // ── NUEVO: sumar descuentos operativos prorrateados por categoría ──
      // Se prorratean proporcionalmente al peso de cada categoría en ventas totales
      const totalMappedSales = CATEGORIES_BASE.reduce((s, c) => s + (getMappedSales(salesCategories, c.key) || 0), 0)
      const catShare = totalMappedSales > 0 ? catSalesBase / totalMappedSales : 0
      const catOpDisc = includeOpDiscounts ? opDiscTotal * catShare : 0
      const catSales = catSalesBase + catOpDisc

      const theoCost = (theoCostByCat[cat.key] || 0) + adjTheo
      const realPct = catSales > 0 ? pct(uso, catSales) : null
      const mixPct = catSales > 0 ? pct(theoCost, catSales) : null
      const variacionDolares = realPct !== null && mixPct !== null && catSales > 0
        ? parseFloat(((realPct - mixPct) / 100 * catSales).toFixed(2)) : null
      const diasInv = uso > 0 ? parseFloat((((invCurrent + invPrevious) / 2) / uso * operatingDays).toFixed(1)) : null
      const hasAdj = adjInvPrev !== 0 || adjPurchases !== 0 || adjInvCurr !== 0 || adjTheo !== 0
      result[cat.key + '_uso'] = uso
      result[cat.key + '_uso_pct'] = realPct || 0
      result[cat.key + '_theo_pct'] = mixPct || 0
      result[cat.key + '_variacion'] = variacionDolares
      result[cat.key + '_dias_inv'] = diasInv
      result[cat.key + '_inv_current'] = invCurrent
      result[cat.key + '_inv_previous'] = invPrevious
      result[cat.key + '_purchases'] = purchases
      result[cat.key + '_sales'] = catSales
      result[cat.key + '_has_adj'] = hasAdj
      result[cat.key + '_theo_cost'] = theoCost
      if (uso > 0) totalUsoCost += uso
      if (theoCost > 0) totalTheoCost += theoCost
      if (catSales > 0) totalABSales += catSales
    })

    result.totalUsoCost = totalUsoCost; result.totalTheoCost = totalTheoCost; result.totalABSales = totalABSales
    result.totalRealPct = totalABSales > 0 ? pct(totalUsoCost, totalABSales) : null
    result.totalMixPct = totalABSales > 0 ? pct(totalTheoCost, totalABSales) : null
    result.totalVariacion = result.totalRealPct !== null && result.totalMixPct !== null
      ? parseFloat(((result.totalRealPct - result.totalMixPct) / 100 * totalABSales).toFixed(2)) : null
    result.hasAnyAdj = hasAdjustments(week)
    return result
  }

  const chartData = filtered.map(buildWeekData)
  const latest = filtered[filtered.length - 1]
  const isMultiWeek = filtered.length > 1
  const detailWeek = shortcut === 'week' ? filtered[0] || latest : latest

  function buildRangeData() {
    if (!filtered.length) return null
    const weeklyData = filtered.map(w => ({ raw: w, data: buildWeekData(w) }))
    const withInv = weeklyData.filter(wd => wd.data.hasInventory)
    if (!withInv.length) return null
    const firstWD = withInv[0]
    const lastWD = withInv[withInv.length - 1]
    const nSemanas = filtered.length
    const diasRango = nSemanas * operatingDays
    const result: any = {
      fullWeek: latest?.report?.week, reportId: latest?.report?.id,
      hasInventory: true, hasAnyAdj: filtered.some(w => hasAdjustments(w.report.week)), diasRango,
    }
    CATEGORIES.forEach(cat => {
      const invPrevious = firstWD.data[cat.key + '_inv_previous'] ?? 0
      const invCurrent = lastWD.data[cat.key + '_inv_current'] ?? 0
      const purchases = weeklyData.reduce((sum, wd) => sum + (wd.data[cat.key + '_purchases'] ?? 0), 0)
      const uso = Math.max(invPrevious + purchases - invCurrent, 0)
      const catSales = weeklyData.reduce((sum, wd) => sum + (wd.data[cat.key + '_sales'] ?? 0), 0)
      const theoCost = weeklyData.reduce((sum, wd) => sum + (wd.data[cat.key + '_theo_cost'] ?? 0), 0)
      const realPct = catSales > 0 ? pct(uso, catSales) : null
      const mixPct = catSales > 0 ? pct(theoCost, catSales) : null
      const variacion = realPct !== null && mixPct !== null && catSales > 0
        ? parseFloat(((realPct - mixPct) / 100 * catSales).toFixed(2)) : null
      const diasInv = uso > 0 ? parseFloat((((invCurrent + invPrevious) / 2) / (uso / diasRango)).toFixed(1)) : null
      const hasAdj = weeklyData.some(wd => wd.data[cat.key + '_has_adj'])
      result[cat.key + '_uso'] = uso; result[cat.key + '_uso_pct'] = realPct || 0
      result[cat.key + '_theo_pct'] = mixPct || 0; result[cat.key + '_variacion'] = variacion
      result[cat.key + '_dias_inv'] = diasInv; result[cat.key + '_inv_current'] = invCurrent
      result[cat.key + '_inv_previous'] = invPrevious; result[cat.key + '_purchases'] = purchases
      result[cat.key + '_sales'] = catSales; result[cat.key + '_has_adj'] = hasAdj
      result[cat.key + '_theo_cost'] = theoCost
    })
    let totalUso = 0, totalTheo = 0, totalSales = 0
    CATEGORIES.forEach(cat => {
      totalUso += result[cat.key + '_uso'] || 0
      totalTheo += result[cat.key + '_theo_cost'] || 0
      totalSales += result[cat.key + '_sales'] || 0
    })
    result.totalUsoCost = totalUso; result.totalTheoCost = totalTheo; result.totalABSales = totalSales
    result.totalRealPct = totalSales > 0 ? pct(totalUso, totalSales) : null
    result.totalMixPct = totalSales > 0 ? pct(totalTheo, totalSales) : null
    result.totalVariacion = result.totalRealPct !== null && result.totalMixPct !== null
      ? parseFloat(((result.totalRealPct - result.totalMixPct) / 100 * totalSales).toFixed(2)) : null
    return result
  }

  const detailData = isMultiWeek ? buildRangeData() : (detailWeek ? buildWeekData(detailWeek) : null)
  const hasInventory = weeks.some(w => w.inventory?.by_account?.length > 0)

  const rangeSummary = (() => {
    let totalUso = 0, totalTheo = 0, totalABSales = 0, totalVariacion = 0
    filtered.forEach(w => {
      const d = buildWeekData(w)
      if (!d.hasInventory) return
      totalUso += d.totalUsoCost; totalTheo += d.totalTheoCost
      totalABSales += d.totalABSales
      if (d.totalVariacion !== null) totalVariacion += d.totalVariacion
    })
    return {
      totalUso, totalTheo, totalABSales, totalVariacion,
      totalRealPct: totalABSales > 0 ? parseFloat((totalUso / totalABSales * 100).toFixed(1)) : null,
      totalMixPct: totalABSales > 0 ? parseFloat((totalTheo / totalABSales * 100).toFixed(1)) : null,
    }
  })()

  const SHORTCUTS: { key: Shortcut; label: string }[] = [
    { key: 'week', label: 'Semana' }, { key: 'last4', label: 'Últimas 4 sem' },
    { key: 'last8', label: 'Últimas 8 sem' }, { key: 'month', label: 'Este mes' }, { key: 'custom', label: 'Custom' },
  ]

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Cargando costo de uso...</p></div>

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-white font-bold text-lg">📦 Costo de Uso</h1>
            <span className="bg-blue-900 text-blue-400 text-xs px-2 py-0.5 rounded-full font-medium">Inventario Real</span>
            <span className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full">{operatingDays} días/semana</span>
            {adjustments.length > 0 && (
              <button onClick={() => setShowAdjLog(!showAdjLog)}
                className="bg-yellow-900 text-yellow-400 text-xs px-2 py-0.5 rounded-full font-medium hover:bg-yellow-800 transition">
                ✏️ {adjustments.length} ajuste{adjustments.length !== 1 ? 's' : ''} manual{adjustments.length !== 1 ? 'es' : ''}
              </button>
            )}
          </div>
          <p className="text-gray-500 text-xs mt-0.5">{restaurantName} · (Inv. Anterior + Compras − Inv. Actual) / Ventas</p>
        </div>

        {/* ── NUEVO: Toggle descuentos operativos ── */}
        <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5">
          <div className="text-right">
            <p className="text-gray-400 text-xs font-medium">Ventas base</p>
            <p className="text-gray-600 text-xs">% Real estándar</p>
          </div>
          <button
            onClick={() => setIncludeOpDiscounts(!includeOpDiscounts)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              includeOpDiscounts ? 'bg-green-600' : 'bg-gray-600'
            }`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              includeOpDiscounts ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
          <div className="text-left">
            <p className={`text-xs font-medium ${includeOpDiscounts ? 'text-green-400' : 'text-gray-400'}`}>
              + Desc. Operativos
            </p>
            <p className="text-gray-600 text-xs">
              {opDiscountMappings.length > 0
                ? opDiscountMappings.length + ' tipo' + (opDiscountMappings.length !== 1 ? 's' : '') + ' configurado' + (opDiscountMappings.length !== 1 ? 's' : '')
                : 'Sin configurar en Settings'}
            </p>
          </div>
        </div>
      </div>

      {/* Shortcuts */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {SHORTCUTS.map(s => (
            <button key={s.key} onClick={() => setShortcut(s.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${shortcut === s.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
              {s.label}
            </button>
          ))}
          {shortcut === 'week' && weeks.length > 0 && (
            <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500">
              {[...weeks].reverse().map(w => <option key={w.report.week} value={w.report.week}>{w.report.week}</option>)}
            </select>
          )}
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
          <span className="text-gray-600 text-xs ml-2">{filtered.length} semana{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Modal ajuste */}
        {showAdjPanel && canEdit && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-white font-bold text-base">✏️ Ajuste manual</h3>
                  <p className="text-gray-500 text-xs mt-0.5">{adjWeek} · {CATEGORIES.find(c => c.key === adjCategory)?.label}</p>
                </div>
                <button onClick={() => setShowAdjPanel(false)} className="text-gray-500 hover:text-white">✕</button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Campo a ajustar</label>
                  <select value={adjField} onChange={e => setAdjField(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                    {ADJUSTMENT_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Valor a <strong>sumar</strong> al actual (negativo para restar)</label>
                  <input type="number" value={adjValue} onChange={e => setAdjValue(e.target.value)}
                    placeholder="Ej: 500 o -200"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                  <p className="text-gray-600 text-xs mt-1">Positivo = incrementar · Negativo = reducir</p>
                </div>
                <div>
                  <label className="text-gray-400 text-xs block mb-1">Nota explicativa <span className="text-red-400">*</span></label>
                  <textarea value={adjNote} onChange={e => setAdjNote(e.target.value)}
                    placeholder="Explica la razón del ajuste..."
                    rows={3}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
                </div>
                {adjError && <p className="text-red-400 text-xs">{adjError}</p>}
                <div className="bg-gray-800 rounded-lg px-4 py-3">
                  <p className="text-gray-500 text-xs">⚠️ Este ajuste quedará registrado con tu usuario y fecha.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowAdjPanel(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-sm transition">Cancelar</button>
                  <button onClick={saveAdjustment} disabled={adjSaving}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white py-2 rounded-lg text-sm font-medium transition">
                    {adjSaving ? 'Guardando...' : 'Guardar ajuste'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Log de ajustes */}
        {showAdjLog && (
          <div className="bg-gray-900 border border-yellow-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-yellow-400 font-semibold">✏️ Registro completo de ajustes manuales</h3>
              <button onClick={() => setShowAdjLog(false)} className="text-gray-500 hover:text-white text-sm">✕</button>
            </div>
            {adjustments.length === 0 ? (
              <p className="text-gray-500 text-sm">No hay ajustes registrados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 pb-2 font-medium">Semana</th>
                      <th className="text-left text-gray-500 pb-2 font-medium">Categoría</th>
                      <th className="text-left text-gray-500 pb-2 font-medium">Campo</th>
                      <th className="text-right text-gray-500 pb-2 font-medium">Valor original</th>
                      <th className="text-right text-gray-500 pb-2 font-medium">Ajuste</th>
                      <th className="text-left text-gray-500 pb-2 font-medium">Nota</th>
                      <th className="text-left text-gray-500 pb-2 font-medium">Por</th>
                      <th className="text-left text-gray-500 pb-2 font-medium">Fecha</th>
                      {canEdit && <th className="pb-2" />}
                    </tr>
                  </thead>
                  <tbody>
                    {adjustments.map(a => (
                      <tr key={a.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="py-2 text-gray-300">{a.week}</td>
                        <td className="py-2 text-gray-300">{CATEGORIES.find(c => c.key === a.category)?.label || a.category}</td>
                        <td className="py-2 text-gray-400">{ADJUSTMENT_FIELDS.find(f => f.key === a.field)?.label || a.field}</td>
                        <td className="py-2 text-right text-gray-500">{fmt(a.original_value)}</td>
                        <td className={`py-2 text-right font-bold ${Number(a.adjustment_value) > 0 ? 'text-yellow-400' : 'text-blue-400'}`}>
                          {Number(a.adjustment_value) > 0 ? '+' : ''}{fmt(a.adjustment_value)}
                        </td>
                        <td className="py-2 text-gray-400 max-w-xs"><span title={a.note} className="truncate block">{a.note}</span></td>
                        <td className="py-2 text-gray-500">{a.created_by?.split('@')[0] || '—'}</td>
                        <td className="py-2 text-gray-600">{new Date(a.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                        {canEdit && (
                          <td className="py-2">
                            <button onClick={() => deleteAdjustment(a.id)}
                              className="text-red-500 hover:text-red-400 text-xs px-2 py-0.5 rounded hover:bg-red-950 transition">Eliminar</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── NUEVO: banner cuando toggle activo ── */}
        {includeOpDiscounts && (
          <div className="bg-green-950 border border-green-800 rounded-xl px-5 py-3 flex items-center gap-3">
            <span className="text-green-400 text-lg">✅</span>
            <div>
              <p className="text-green-300 text-sm font-medium">Modo: Ventas + Descuentos Operativos</p>
              <p className="text-green-600 text-xs mt-0.5">
                Los descuentos operativos ({opDiscountMappings.join(', ') || 'ninguno configurado'}) se suman a las ventas antes de calcular el % de costo.
              </p>
            </div>
          </div>
        )}

        <div className="bg-blue-950 border border-blue-900 rounded-xl px-5 py-3 flex items-start gap-3">
          <span className="text-blue-400 text-lg">ℹ️</span>
          <div>
            <p className="text-blue-300 text-sm font-medium">Costo de Uso de Inventario</p>
            <p className="text-blue-400 text-xs mt-0.5">
              <strong>% Real</strong> = (Inv. Anterior + Compras − Inv. Actual) / Ventas{includeOpDiscounts ? ' (+Desc. Op.)' : ''} ·
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
            <button onClick={() => window.location.href = '/upload'} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg">Subir reporte</button>
          </div>
        ) : (
          <>
            {detailData && (
              <div>
                <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">
                  {isMultiWeek
                    ? `Promedio ponderado del período — ${filtered[0]?.report?.week} → ${latest?.report?.week} (${filtered.length} semanas)`
                    : `Semana — ${detailWeek?.report?.week} (${detailWeek?.report?.week_start} al ${detailWeek?.report?.week_end})`}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-gray-500 text-xs mb-1">% Costo Real A&B {isMultiWeek ? '(pond.)' : ''}</p>
                    <p className="text-3xl font-bold text-blue-400">{rangeSummary.totalRealPct !== null ? rangeSummary.totalRealPct + '%' : '—'}</p>
                    <p className="text-gray-600 text-xs mt-1">{fmt(rangeSummary.totalUso)} uso {isMultiWeek ? 'acumulado' : 'real'}</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-gray-500 text-xs mb-1">% Costo P.Mix {isMultiWeek ? '(pond.)' : ''}</p>
                    <p className="text-3xl font-bold text-green-400">{rangeSummary.totalMixPct !== null ? rangeSummary.totalMixPct + '%' : '—'}</p>
                    <p className="text-gray-600 text-xs mt-1">{fmt(rangeSummary.totalTheo)} teórico</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-gray-500 text-xs mb-1">Variación $ {isMultiWeek ? 'acumulada' : ''}</p>
                    <p className={`text-3xl font-bold ${rangeSummary.totalVariacion > 0 ? 'text-red-400' : rangeSummary.totalVariacion < 0 ? 'text-green-400' : 'text-gray-400'}`}>
                      {rangeSummary.totalVariacion !== null ? (rangeSummary.totalVariacion > 0 ? '+' : '') + fmt(rangeSummary.totalVariacion) : '—'}
                    </p>
                    <p className="text-gray-600 text-xs mt-1">{rangeSummary.totalVariacion > 0 ? 'sobre lo teórico' : rangeSummary.totalVariacion < 0 ? 'bajo lo teórico' : ''}</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <p className="text-gray-500 text-xs mb-1">Inv. Actual Total</p>
                    <p className="text-2xl font-bold text-white">{fmt(detailWeek?.inventory?.grand_total_current)}</p>
                    <p className="text-gray-600 text-xs mt-1">cierre de semana más reciente</p>
                  </div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white font-semibold">Detalle por categoría — {detailWeek?.report?.week}</h2>
                    <div className="flex items-center gap-2">
                      {includeOpDiscounts && detailData.opDiscTotal > 0 && (
                        <span className="text-green-400 text-xs bg-green-950 px-2 py-1 rounded-full">
                          +{fmt(detailData.opDiscTotal)} desc. op. incluidos
                        </span>
                      )}
                      {detailData.hasAnyAdj && <span className="text-yellow-400 text-xs bg-yellow-950 px-2 py-1 rounded-full">✏️ Contiene ajustes manuales</span>}
                    </div>
                  </div>

                  {/* ── MOBILE: cards por categoría ── */}
                  <div className="md:hidden space-y-3">
                    {CATEGORIES.map(cat => {
                      const realPct = detailData[cat.key + '_uso_pct']
                      const variacion = detailData[cat.key + '_variacion']
                      const overMeta = cat.meta && realPct && realPct > cat.meta
                      if (!detailData[cat.key + '_uso']) return null
                      return (
                        <div key={cat.key} className="bg-gray-800 rounded-xl px-4 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                            <span className="text-gray-300 text-sm font-medium">{cat.label}</span>
                          </div>
                          <div className="text-right">
                            <p className={`text-sm font-bold ${overMeta ? 'text-red-400' : 'text-green-400'}`}>{fmtPct(realPct)}</p>
                            <p className="text-gray-500 text-xs">{fmt(detailData[cat.key + '_uso'])} uso</p>
                            {variacion !== null && (
                              <p className={`text-xs font-medium ${variacion > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {variacion > 0 ? '+' : ''}{fmt(variacion)}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    <div className="bg-gray-700 rounded-xl px-4 py-3 flex items-center justify-between">
                      <span className="text-white font-bold text-sm">Total A&B</span>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${detailData.totalRealPct && detailData.totalRealPct > 35 ? 'text-red-400' : 'text-green-400'}`}>{fmtPct(detailData.totalRealPct)}</p>
                        <p className="text-gray-400 text-xs">{fmt(detailData.totalUsoCost)} uso</p>
                        {detailData.totalVariacion !== null && (
                          <p className={`text-xs font-bold ${detailData.totalVariacion > 0 ? 'text-red-400' : 'text-green-400'}`}>
                            {detailData.totalVariacion > 0 ? '+' : ''}{fmt(detailData.totalVariacion)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── DESKTOP: tabla completa ── */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left text-gray-500 text-xs pb-3 font-medium">Categoría</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Inv. Ant.</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Compras</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Inv. Act.</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Uso $</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">
                            Ventas{includeOpDiscounts ? ' (+D.Op)' : ''}
                          </th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">% Real</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">% P.Mix</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Variación $</th>
                          <th className="text-right text-gray-500 text-xs pb-3 font-medium">Días Inv</th>
                          {canEdit && shortcut === 'week' && <th className="text-center text-gray-500 text-xs pb-3 font-medium">Ajuste</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {CATEGORIES.map(cat => {
                          const realPct = detailData[cat.key + '_uso_pct']
                          const mixPct = detailData[cat.key + '_theo_pct']
                          const variacion = detailData[cat.key + '_variacion']
                          const dias = detailData[cat.key + '_dias_inv']
                          const hasAdj = detailData[cat.key + '_has_adj']
                          const overMeta = cat.meta && realPct && realPct > cat.meta
                          return (
                            <tr key={cat.key} className="border-b border-gray-800 hover:bg-gray-800 transition">
                              <td className="py-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                                  <span className="text-gray-300 text-sm">{cat.label}</span>
                                  {hasAdj && <span className="text-yellow-400 text-xs" title="Tiene ajuste manual aplicado">✏️</span>}
                                </div>
                              </td>
                              <td className="py-3 text-right text-gray-500 text-xs">{fmt(detailData[cat.key + '_inv_previous'])}</td>
                              <td className="py-3 text-right text-gray-500 text-xs">{fmt(detailData[cat.key + '_purchases'])}</td>
                              <td className="py-3 text-right text-gray-500 text-xs">{fmt(detailData[cat.key + '_inv_current'])}</td>
                              <td className="py-3 text-right text-white text-sm font-medium">{fmt(detailData[cat.key + '_uso'])}</td>
                              <td className="py-3 text-right text-gray-400 text-sm">{fmt(detailData[cat.key + '_sales'])}</td>
                              <td className="py-3 text-right"><span className={`font-bold text-sm ${overMeta ? 'text-red-400' : 'text-green-400'}`}>{fmtPct(realPct)}</span></td>
                              <td className="py-3 text-right text-blue-400 text-sm">{fmtPct(mixPct)}</td>
                              <td className="py-3 text-right">
                                {variacion !== null ? (
                                  <span className={`text-sm font-medium ${variacion > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                    {variacion > 0 ? '+' : ''}{fmt(variacion)}
                                  </span>
                                ) : <span className="text-gray-600">—</span>}
                              </td>
                              <td className="py-3 text-right text-gray-400 text-sm">{dias !== null ? dias + 'd' : '—'}</td>
                              {canEdit && shortcut === 'week' && (
                                <td className="py-3 text-center">
                                  <button onClick={() => openAdjPanel(detailWeek.report.week, detailWeek.report.id, cat.key)}
                                    className="text-xs px-2 py-1 rounded-lg bg-gray-800 hover:bg-yellow-900 text-gray-400 hover:text-yellow-400 transition">
                                    + Ajuste
                                  </button>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                        <tr className="border-t-2 border-gray-700">
                          <td className="py-3 text-white font-bold">Total A&B</td>
                          <td colSpan={3} />
                          <td className="py-3 text-right text-white font-bold">{fmt(detailData.totalUsoCost)}</td>
                          <td className="py-3 text-right text-white font-bold">{fmt(detailData.totalABSales)}</td>
                          <td className="py-3 text-right"><span className={`font-bold ${detailData.totalRealPct && detailData.totalRealPct > 35 ? 'text-red-400' : 'text-green-400'}`}>{fmtPct(detailData.totalRealPct)}</span></td>
                          <td className="py-3 text-right text-blue-400 font-bold">{fmtPct(detailData.totalMixPct)}</td>
                          <td className="py-3 text-right">
                            {detailData.totalVariacion !== null ? (
                              <span className={`font-bold ${detailData.totalVariacion > 0 ? 'text-red-400' : 'text-green-400'}`}>
                                {detailData.totalVariacion > 0 ? '+' : ''}{fmt(detailData.totalVariacion)}
                              </span>
                            ) : '—'}
                          </td>
                          <td />{canEdit && shortcut === 'week' && <td />}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {detailData.hasAnyAdj && (
                    <div className="mt-4 pt-4 border-t border-gray-800">
                      <p className="text-yellow-400 text-xs font-semibold mb-2">✏️ Ajustes aplicados esta semana:</p>
                      <div className="space-y-1">
                        {getWeekAdjustments(detailWeek?.report?.week).map(a => (
                          <div key={a.id} className="flex items-center gap-3 text-xs bg-yellow-950/40 rounded-lg px-3 py-2">
                            <span className="text-yellow-300 font-medium shrink-0">{CATEGORIES.find(c => c.key === a.category)?.label}</span>
                            <span className="text-gray-600">·</span>
                            <span className="text-gray-400 shrink-0">{ADJUSTMENT_FIELDS.find(f => f.key === a.field)?.label}</span>
                            <span className={`font-bold shrink-0 ${Number(a.adjustment_value) > 0 ? 'text-yellow-400' : 'text-blue-400'}`}>
                              {Number(a.adjustment_value) > 0 ? '+' : ''}{fmt(a.adjustment_value)}
                            </span>
                            <span className="text-gray-600">·</span>
                            <span className="text-gray-400 flex-1 truncate">{a.note}</span>
                            <span className="text-gray-600 shrink-0">{a.created_by?.split('@')[0]}</span>
                            {canEdit && (
                              <button onClick={() => deleteAdjustment(a.id)}
                                className="text-red-500 hover:text-red-400 hover:bg-red-950 px-1.5 py-0.5 rounded transition shrink-0">✕</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {chartData.filter(d => d.hasInventory).length >= 1 && (
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
                        <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any, name: any) => [v + '%', name]} />
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
                        <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any) => [fmt(v), 'Variación']} />
                        <Bar dataKey="totalVariacion" name="Variación $" radius={[4, 4, 0, 0]} fill="#ef4444" label={false}>
                          {chartData.filter(d => d.hasInventory).map((entry, index) => (
                            <Cell key={index} fill={entry.totalVariacion <= 0 ? '#22c55e' : '#ef4444'} />
                          ))}
                        </Bar>
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
                      <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px' }} formatter={(v: any, name: any) => [v + '%', name]} />
                      <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                      {CATEGORIES.map(cat => (
                        <Line key={cat.key} type="monotone" dataKey={cat.key + '_uso_pct'} name={cat.label} stroke={cat.color} strokeWidth={2} dot={{ fill: cat.color, r: 3 }} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

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
                                <div className="flex items-center gap-2">
                                  <div>
                                    <p className="text-gray-300">{w.report.week}</p>
                                    <p className="text-gray-600 text-xs">{w.report.week_start} → {w.report.week_end}</p>
                                  </div>
                                  {d.hasAnyAdj && <span className="text-yellow-400 text-xs" title="Semana con ajustes manuales">✏️</span>}
                                </div>
                              </td>
                              <td className="py-3 text-right"><span className={`font-medium ${d.totalRealPct && d.totalRealPct > 35 ? 'text-red-400' : 'text-green-400'}`}>{fmtPct(d.totalRealPct)}</span></td>
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
          </>
        )}
      </main>
    </div>
  )
}