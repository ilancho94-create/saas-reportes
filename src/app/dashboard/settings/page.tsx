'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRestaurantId } from '@/lib/use-restaurant'
import { useAuth } from '@/lib/auth-context'

const MAPPED_TO_OPTIONS = [
  { value: 'food', label: 'Food' },
  { value: 'na_beverage', label: 'NA Beverage' },
  { value: 'liquor', label: 'Liquor' },
  { value: 'beer', label: 'Beer' },
  { value: 'wine', label: 'Wine' },
  { value: 'general', label: 'General' },
  { value: 'ignore', label: 'Ignorar' },
]

export default function SettingsPage() {
  const restaurantId = useRestaurantId()
  const { currentRestaurant, currentOrganization } = useAuth()
  const [loading, setLoading] = useState(true)
  const [targets, setTargets] = useState<Record<string, number>>({
    food: 28, na_beverage: 8, liquor: 20, beer: 20, wine: 20
  })
  const [savingTargets, setSavingTargets] = useState(false)
  const [targetsStatus, setTargetsStatus] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [mappings, setMappings] = useState<any[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [newMappedTo, setNewMappedTo] = useState('food')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [activeTab, setActiveTab] = useState<'categorias' | 'restaurante' | 'mapeo-items' | 'metas' | 'avt-categorias' | 'cogs-mapeo'>('categorias')

  // Restaurant operational config
  const [restConfig, setRestConfig] = useState({
    operating_days: 6,
    week_start_day: 1,
    closed_days: [] as number[],
    fiscal_year_start: '',
  })
  const [savingConfig, setSavingConfig] = useState(false)
  const [configStatus, setConfigStatus] = useState('')

  // COGS account mappings
  const [cogsMappings, setCogsMappings] = useState<any[]>([])
  const [savingCogs, setSavingCogs] = useState(false)
  const [cogsStatus, setCogsStatus] = useState('')

  // AVT categories
  const [avtCategories, setAvtCategories] = useState<any[]>([])
  const [savingAvtCat, setSavingAvtCat] = useState(false)
  const [avtCatStatus, setAvtCatStatus] = useState('')

  useEffect(() => {
    if (restaurantId) loadData()
  }, [restaurantId])

  async function loadData() {
    if (!restaurantId) return
    setLoading(true)

    const { data: rest } = await supabase
      .from('restaurants')
      .select('name, operating_days, week_start_day, closed_days, fiscal_year_start')
      .eq('id', restaurantId).single()
    setRestaurantName(rest?.name || '')
    if (rest) {
      setRestConfig({
        operating_days: rest.operating_days || 6,
        week_start_day: rest.week_start_day ?? 1,
        closed_days: rest.closed_days || [],
        fiscal_year_start: rest.fiscal_year_start || '',
      })
    }

    const { data: maps } = await supabase
      .from('category_mappings')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('source_category')
    setMappings(maps || [])

    const { data: tgts } = await supabase
      .from('cost_targets')
      .select('category, target_pct')
      .eq('restaurant_id', restaurantId)
    if (tgts && tgts.length > 0) {
      const tgtsMap: Record<string, number> = {}
      tgts.forEach((t: any) => { tgtsMap[t.category] = Number(t.target_pct) })
      setTargets(prev => ({ ...prev, ...tgtsMap }))
    }

    // Cargar COGS account mappings
    const { data: cogsMaps } = await supabase
      .from('cogs_account_mappings')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('source_account')
    setCogsMappings(cogsMaps || [])

    // Cargar categorías AvT
    const { data: cats } = await supabase
      .from('avt_categories')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('category')
    setAvtCategories(cats || [])

    setLoading(false)
  }

  async function addMapping() {
    if (!newCategory.trim() || !restaurantId) return
    setSaving(true)
    setStatus('')
    const { error } = await supabase.from('category_mappings').insert({
      restaurant_id: restaurantId,
      source_category: newCategory.trim(),
      source_system: 'toast',
      mapped_to: newMappedTo,
    })
    if (error) {
      setStatus('❌ Error: ' + error.message)
    } else {
      setStatus('✅ Categoría agregada')
      setNewCategory('')
      await loadData()
    }
    setSaving(false)
  }

  async function updateMapping(id: string, mappedTo: string) {
    await supabase.from('category_mappings').update({ mapped_to: mappedTo }).eq('id', id)
    await loadData()
    setStatus('✅ Guardado')
    setTimeout(() => setStatus(''), 2000)
  }

  async function deleteMapping(id: string) {
    await supabase.from('category_mappings').delete().eq('id', id)
    await loadData()
    setStatus('✅ Eliminado')
    setTimeout(() => setStatus(''), 2000)
  }

  async function saveRestConfig() {
    if (!restaurantId) return
    setSavingConfig(true)
    setConfigStatus('')
    const { error } = await supabase
      .from('restaurants')
      .update({
        operating_days: restConfig.operating_days,
        week_start_day: restConfig.week_start_day,
        closed_days: restConfig.closed_days,
        fiscal_year_start: restConfig.fiscal_year_start || null,
      })
      .eq('id', restaurantId)
    setSavingConfig(false)
    if (!error) {
      setConfigStatus('✅ Configuración guardada')
      setTimeout(() => setConfigStatus(''), 3000)
    } else {
      setConfigStatus('❌ Error: ' + error.message)
    }
  }

  async function saveTargets() {
    if (!restaurantId) return
    setSavingTargets(true)
    setTargetsStatus('')
    const upserts = Object.entries(targets).map(([category, target_pct]) => ({
      restaurant_id: restaurantId,
      category,
      target_pct,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase
      .from('cost_targets')
      .upsert(upserts, { onConflict: 'restaurant_id,category' })
    setSavingTargets(false)
    if (!error) {
      setTargetsStatus('✅ Metas guardadas')
      setTimeout(() => setTargetsStatus(''), 3000)
    } else {
      setTargetsStatus('❌ Error: ' + error.message)
    }
  }

  async function toggleAvtCategory(category: string, currentActive: boolean) {
    if (!restaurantId) return
    await supabase.from('avt_categories')
      .update({ active: !currentActive })
      .eq('restaurant_id', restaurantId)
      .eq('category', category)
    setAvtCategories(prev => prev.map(c =>
      c.category === category ? { ...c, active: !currentActive } : c
    ))
  }

  async function deleteAvtCategory(category: string) {
    if (!restaurantId) return
    await supabase.from('avt_categories')
      .delete()
      .eq('restaurant_id', restaurantId)
      .eq('category', category)
    setAvtCategories(prev => prev.filter(c => c.category !== category))
    setAvtCatStatus('✅ Categoría eliminada')
    setTimeout(() => setAvtCatStatus(''), 2000)
  }

  async function activateAll() {
    if (!restaurantId) return
    setSavingAvtCat(true)
    await supabase.from('avt_categories')
      .update({ active: true })
      .eq('restaurant_id', restaurantId)
    setAvtCategories(prev => prev.map(c => ({ ...c, active: true })))
    setSavingAvtCat(false)
    setAvtCatStatus('✅ Todas activadas')
    setTimeout(() => setAvtCatStatus(''), 2000)
  }

  const groupedMappings = MAPPED_TO_OPTIONS.map(opt => ({
    ...opt,
    categories: mappings.filter(m => m.mapped_to === opt.value)
  })).filter(g => g.categories.length > 0)

  const activeAvtCount = avtCategories.filter(c => c.active).length

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando settings...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <h1 className="text-white font-bold text-lg">⚙️ Settings</h1>
        <p className="text-gray-500 text-xs">{restaurantName} · {currentOrganization?.name}</p>
      </div>

      <div className="border-b border-gray-800 bg-gray-900 px-6">
        <div className="flex gap-1 overflow-x-auto">
          {[
            { key: 'categorias', label: 'Mapeo de Categorías' },
            { key: 'restaurante', label: 'Restaurante' },
            { key: 'mapeo-items', label: '🗂 Mapeo de Items R365' },
            { key: 'metas', label: '🎯 Metas de Costo' },
            { key: 'avt-categorias', label: '📊 Categorías AvT' },
            { key: 'cogs-mapeo', label: '🛒 Mapeo COGS' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 whitespace-nowrap ${
                activeTab === tab.key ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              {tab.label}
              {tab.key === 'avt-categorias' && avtCategories.length > 0 && (
                <span className="ml-1.5 text-xs text-gray-600">({activeAvtCount}/{avtCategories.length})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* ── MAPEO DE CATEGORÍAS ── */}
        {activeTab === 'categorias' && (
          <>
            <div className="bg-blue-950 border border-blue-800 rounded-xl p-5">
              <h2 className="text-blue-300 font-semibold mb-1">¿Para qué sirve esto?</h2>
              <p className="text-blue-400 text-sm">
                Cada restaurante categoriza sus ventas diferente en Toast. Aquí defines cómo mapear
                las categorías de Toast a las categorías estándar del sistema para calcular
                correctamente Food Cost, Beverage Cost, etc.
              </p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Agregar categoría</h2>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-gray-500 text-xs mb-1 block">Nombre en Toast (exacto)</label>
                  <input type="text" value={newCategory} onChange={e => setNewCategory(e.target.value)}
                    placeholder="Ej: Ayce, Food, Beer..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                    onKeyDown={e => e.key === 'Enter' && addMapping()} />
                </div>
                <div>
                  <label className="text-gray-500 text-xs mb-1 block">Mapear a</label>
                  <select value={newMappedTo} onChange={e => setNewMappedTo(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500">
                    {MAPPED_TO_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <button onClick={addMapping} disabled={saving || !newCategory.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition">
                    {saving ? 'Guardando...' : '+ Agregar'}
                  </button>
                </div>
              </div>
              {status && (
                <p className={`text-sm mt-3 ${status.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{status}</p>
              )}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Mapeos actuales</h2>
              {mappings.length === 0 ? (
                <p className="text-gray-500 text-sm">No hay mapeos configurados aún.</p>
              ) : (
                <div className="space-y-6">
                  {groupedMappings.map(group => (
                    <div key={group.value}>
                      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">→ {group.label}</p>
                      <div className="space-y-2">
                        {group.categories.map((mapping: any) => (
                          <div key={mapping.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3">
                            <div className="flex-1">
                              <p className="text-white text-sm font-medium">{mapping.source_category}</p>
                              <p className="text-gray-500 text-xs">{mapping.source_system}</p>
                            </div>
                            <span className="text-gray-600 text-sm">→</span>
                            <select value={mapping.mapped_to} onChange={e => updateMapping(mapping.id, e.target.value)}
                              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500">
                              {MAPPED_TO_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                            <button onClick={() => deleteMapping(mapping.id)} className="text-gray-600 hover:text-red-400 transition text-sm">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-3">Vista previa del mapeo</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {MAPPED_TO_OPTIONS.filter(o => o.value !== 'ignore').map(opt => {
                  const cats = mappings.filter(m => m.mapped_to === opt.value)
                  return (
                    <div key={opt.value} className="bg-gray-800 rounded-lg p-3">
                      <p className="text-gray-400 text-xs font-semibold mb-2">{opt.label} Cost</p>
                      {cats.length === 0 ? (
                        <p className="text-gray-600 text-xs">Sin categorías mapeadas</p>
                      ) : (
                        <div className="space-y-1">
                          {cats.map((c: any) => <p key={c.id} className="text-gray-300 text-xs">• {c.source_category}</p>)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* ── RESTAURANTE ── */}
        {activeTab === 'restaurante' && (
          <div className="space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Información del restaurante</h2>
              <div className="space-y-3">
                <div className="flex justify-between py-3 border-b border-gray-800">
                  <span className="text-gray-500 text-sm">Nombre</span>
                  <span className="text-white text-sm font-medium">{restaurantName}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-800">
                  <span className="text-gray-500 text-sm">Organización</span>
                  <span className="text-white text-sm font-medium">{currentOrganization?.name}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-800">
                  <span className="text-gray-500 text-sm">ID Restaurante</span>
                  <span className="text-gray-500 text-xs font-mono">{restaurantId}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-800">
                  <span className="text-gray-500 text-sm">Rol</span>
                  <span className="text-white text-sm font-medium capitalize">{currentRestaurant?.role}</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-1">Configuración operacional</h2>
              <p className="text-gray-500 text-xs mb-6">Define los días de operación para calcular correctamente días de inventario y promedios diarios</p>

              <div className="mb-6">
                <label className="text-gray-300 text-sm font-medium block mb-3">Inicio de semana</label>
                <div className="flex gap-2">
                  {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day, i) => (
                    <button key={i} onClick={() => setRestConfig(prev => ({ ...prev, week_start_day: i }))}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition border ${
                        restConfig.week_start_day === i ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                      }`}>{day}</button>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="text-gray-300 text-sm font-medium block mb-1">Días que cierra el restaurante</label>
                <p className="text-gray-500 text-xs mb-3">Selecciona los días en que NO opera</p>
                <div className="flex gap-2">
                  {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map((day, i) => {
                    const isClosed = restConfig.closed_days.includes(i)
                    return (
                      <button key={i} onClick={() => setRestConfig(prev => ({
                        ...prev,
                        closed_days: isClosed ? prev.closed_days.filter(d => d !== i) : [...prev.closed_days, i],
                        operating_days: isClosed ? prev.operating_days + 1 : prev.operating_days - 1,
                      }))}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition border ${
                          isClosed ? 'bg-red-950 border-red-800 text-red-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                        }`}>{day}</button>
                    )
                  })}
                </div>
                <p className="text-gray-500 text-xs mt-2">
                  Días de operación: <span className="text-white font-medium">{restConfig.operating_days} días/semana</span>
                  {restConfig.closed_days.length > 0 && (
                    <span className="text-gray-600 ml-2">· Cerrado: {restConfig.closed_days.map(d => ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d]).join(', ')}</span>
                  )}
                </p>
              </div>

              <div className="mb-6">
                <label className="text-gray-300 text-sm font-medium block mb-1">Días de operación por semana</label>
                <div className="flex items-center gap-3">
                  <input type="number" min={1} max={7} value={restConfig.operating_days}
                    onChange={e => setRestConfig(prev => ({ ...prev, operating_days: Number(e.target.value) }))}
                    className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm text-center focus:outline-none focus:border-blue-500" />
                  <span className="text-gray-400 text-sm">días por semana</span>
                </div>
              </div>

              <div className="mb-6">
                <label className="text-gray-300 text-sm font-medium block mb-1">Inicio del año fiscal (Semana 1)</label>
                <p className="text-gray-500 text-xs mb-3">Define la fecha exacta en que empieza la Semana 1 de tu año fiscal.</p>
                <div className="flex items-center gap-4">
                  <input type="date" value={restConfig.fiscal_year_start}
                    onChange={e => setRestConfig(prev => ({ ...prev, fiscal_year_start: e.target.value }))}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                  {restConfig.fiscal_year_start && (
                    <div className="text-xs text-gray-400">
                      <p>Semana 1 empieza: <span className="text-white">{restConfig.fiscal_year_start}</span></p>
                    </div>
                  )}
                </div>
                {!restConfig.fiscal_year_start && (
                  <p className="text-yellow-500 text-xs mt-2">⚠️ Sin configurar — el sistema usa la numeración ISO estándar</p>
                )}
              </div>

              {configStatus && (
                <p className={`text-sm mb-4 ${configStatus.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{configStatus}</p>
              )}
              <button onClick={saveRestConfig} disabled={savingConfig}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition">
                {savingConfig ? 'Guardando...' : '💾 Guardar configuración'}
              </button>
            </div>
          </div>
        )}

        {/* ── MAPEO DE ITEMS ── */}
        {activeTab === 'mapeo-items' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-2">Mapeo de Items R365</h2>
            <p className="text-gray-500 text-sm mb-6">
              Asigna categoría a los items de Menu Item Analysis que no tienen match automático con Toast.
            </p>
            <a href="/dashboard/settings/mapeo-items"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition">
              🗂 Ir a Mapeo de Items →
            </a>
          </div>
        )}

        {/* ── METAS ── */}
        {activeTab === 'metas' && (
          <MetasTab
            targets={targets}
            setTargets={setTargets}
            saveTargets={saveTargets}
            savingTargets={savingTargets}
            targetsStatus={targetsStatus}
          />
        )}

        {/* ── MAPEO COGS ── */}
        {activeTab === 'cogs-mapeo' && (
          <CogsMapeoTab
            cogsMappings={cogsMappings}
            restaurantId={restaurantId}
            savingCogs={savingCogs}
            setSavingCogs={setSavingCogs}
            cogsStatus={cogsStatus}
            setCogsStatus={setCogsStatus}
            onReload={loadData}
          />
        )}

        {/* ── CATEGORÍAS AVT ── */}
        {activeTab === 'avt-categorias' && (
          <div className="space-y-6">
            <div className="bg-blue-950 border border-blue-800 rounded-xl p-5">
              <h2 className="text-blue-300 font-semibold mb-1">📊 Categorías de Actual vs Teórico</h2>
              <p className="text-blue-400 text-sm">
                Estas categorías se detectan automáticamente al subir reportes de AvT.
                Activa solo las que quieres ver en los filtros del dashboard — las inactivas
                se ocultan pero sus datos se conservan.
              </p>
            </div>

            {avtCategories.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 border-dashed rounded-xl p-10 text-center">
                <p className="text-gray-500">No hay categorías de AvT detectadas aún.</p>
                <p className="text-gray-600 text-xs mt-2">Se detectan automáticamente al subir un reporte de Actual vs Teórico.</p>
              </div>
            ) : (
              <>
                {/* Acciones masivas */}
                <div className="flex items-center justify-between">
                  <p className="text-gray-400 text-sm">
                    <span className="text-white font-medium">{activeAvtCount}</span> de{' '}
                    <span className="text-white font-medium">{avtCategories.length}</span> categorías activas
                  </p>
                  <div className="flex gap-2">
                    <button onClick={activateAll} disabled={savingAvtCat}
                      className="bg-green-800 hover:bg-green-700 text-green-300 px-4 py-1.5 rounded-lg text-xs font-medium transition">
                      Activar todas
                    </button>
                    <button onClick={async () => {
                      if (!restaurantId) return
                      setSavingAvtCat(true)
                      await supabase.from('avt_categories').update({ active: false }).eq('restaurant_id', restaurantId)
                      setAvtCategories(prev => prev.map(c => ({ ...c, active: false })))
                      setSavingAvtCat(false)
                      setAvtCatStatus('✅ Todas desactivadas')
                      setTimeout(() => setAvtCatStatus(''), 2000)
                    }} disabled={savingAvtCat}
                      className="bg-gray-800 hover:bg-gray-700 text-gray-400 px-4 py-1.5 rounded-lg text-xs font-medium transition">
                      Desactivar todas
                    </button>
                  </div>
                </div>

                {avtCatStatus && (
                  <p className={`text-sm ${avtCatStatus.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{avtCatStatus}</p>
                )}

                {/* Lista de categorías */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 bg-gray-800">
                        <th className="text-left text-gray-500 text-xs py-3 px-5 font-medium">Categoría</th>
                        <th className="text-center text-gray-500 text-xs py-3 px-4 font-medium">Estado</th>
                        <th className="text-center text-gray-500 text-xs py-3 px-4 font-medium">Visible en dashboard</th>
                        <th className="text-right text-gray-500 text-xs py-3 px-5 font-medium">Eliminar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {avtCategories.map((cat, i) => (
                        <tr key={cat.category} className={`border-b border-gray-800 hover:bg-gray-800/50 transition ${!cat.active ? 'opacity-50' : ''}`}>
                          <td className="py-3 px-5">
                            <span className="text-white text-sm font-medium">{cat.category}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                              cat.active ? 'bg-green-900 text-green-400' : 'bg-gray-800 text-gray-500'
                            }`}>
                              {cat.active ? 'Activa' : 'Inactiva'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {/* Toggle switch */}
                            <button onClick={() => toggleAvtCategory(cat.category, cat.active)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                                cat.active ? 'bg-blue-600' : 'bg-gray-700'
                              }`}>
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                cat.active ? 'translate-x-6' : 'translate-x-1'
                              }`} />
                            </button>
                          </td>
                          <td className="py-3 px-5 text-right">
                            <button onClick={() => {
                              if (confirm(`¿Eliminar la categoría "${cat.category}"? Se eliminará permanentemente.`)) {
                                deleteAvtCategory(cat.category)
                              }
                            }}
                              className="text-gray-600 hover:text-red-400 transition text-xs px-2 py-1 rounded hover:bg-red-950">
                              Eliminar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-4">
                  <p className="text-yellow-400 text-xs">
                    <strong>Tip:</strong> Desactiva categorías como <code className="bg-yellow-900 px-1 rounded">CHEMICALS</code>,{' '}
                    <code className="bg-yellow-900 px-1 rounded">None</code> o{' '}
                    <code className="bg-yellow-900 px-1 rounded">RESTAURANT SUPPLIES</code> si no quieres verlas en los filtros del AvT.
                    Sus datos seguirán existiendo pero no aparecerán en el dashboard.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

      </main>
    </div>
  )
}

const COGS_MAPPED_TO_OPTIONS = [
  { value: 'food', label: '🍔 Food' },
  { value: 'na_beverage', label: '🥤 NA Beverage' },
  { value: 'liquor', label: '🥃 Liquor' },
  { value: 'beer', label: '🍺 Beer' },
  { value: 'wine', label: '🍷 Wine' },
  { value: 'general', label: '📦 General' },
  { value: 'exclude', label: '🚫 Excluir' },
]

function CogsMapeoTab({ cogsMappings, restaurantId, savingCogs, setSavingCogs, cogsStatus, setCogsStatus, onReload }: any) {
  async function updateMapping(id: string, mappedTo: string) {
    await import('@/lib/supabase').then(({ supabase }) =>
      supabase.from('cogs_account_mappings').update({ mapped_to: mappedTo }).eq('id', id)
    )
    setCogsStatus('✅ Guardado')
    setTimeout(() => setCogsStatus(''), 2000)
    onReload()
  }

  const grouped = COGS_MAPPED_TO_OPTIONS.map(opt => ({
    ...opt,
    accounts: cogsMappings.filter((m: any) => m.mapped_to === opt.value)
  })).filter(g => g.accounts.length > 0)

  return (
    <div className="space-y-6">
      <div className="bg-blue-950 border border-blue-800 rounded-xl p-5">
        <h2 className="text-blue-300 font-semibold mb-1">🛒 Mapeo de Cuentas COGS</h2>
        <p className="text-blue-400 text-sm">
          Define cómo se mapean las sub-cuentas del reporte COGS Analysis by Vendor de R365
          a las categorías del sistema. Esto permite calcular correctamente el costo de uso por categoría.
        </p>
      </div>

      {cogsStatus && (
        <p className={`text-sm ${cogsStatus.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{cogsStatus}</p>
      )}

      {cogsMappings.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 border-dashed rounded-xl p-10 text-center">
          <p className="text-gray-500">No hay mapeos de COGS configurados.</p>
          <p className="text-gray-600 text-xs mt-2">Se crean automáticamente al subir el primer reporte COGS.</p>
        </div>
      ) : (
        <>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-800">
                  <th className="text-left text-gray-500 text-xs py-3 px-5 font-medium">Cuenta R365</th>
                  <th className="text-right text-gray-500 text-xs py-3 px-5 font-medium">Mapear a</th>
                </tr>
              </thead>
              <tbody>
                {cogsMappings.map((m: any) => (
                  <tr key={m.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition">
                    <td className="py-3 px-5">
                      <span className="text-white text-sm font-medium">{m.source_account}</span>
                    </td>
                    <td className="py-3 px-5 text-right">
                      <select
                        value={m.mapped_to}
                        onChange={e => updateMapping(m.id, e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500">
                        {COGS_MAPPED_TO_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-4">Vista previa del mapeo</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {grouped.map(group => (
                <div key={group.value} className="bg-gray-800 rounded-lg p-3">
                  <p className="text-gray-400 text-xs font-semibold mb-2">{group.label}</p>
                  <div className="space-y-1">
                    {group.accounts.map((a: any) => (
                      <p key={a.id} className="text-gray-300 text-xs">• {a.source_account}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const COST_CATEGORIES = [
  { key: 'food', label: 'Food', color: '#f97316', icon: '🍔', description: 'Costo de alimentos vs ventas de food' },
  { key: 'na_beverage', label: 'NA Beverage', color: '#06b6d4', icon: '🥤', description: 'Bebidas no alcohólicas vs ventas de beverage' },
  { key: 'liquor', label: 'Licor', color: '#a855f7', icon: '🥃', description: 'Licor vs ventas de liquor' },
  { key: 'beer', label: 'Cerveza', color: '#eab308', icon: '🍺', description: 'Cerveza vs ventas de beer' },
  { key: 'wine', label: 'Vino', color: '#ec4899', icon: '🍷', description: 'Vino vs ventas de wine' },
]

function MetasTab({ targets, setTargets, saveTargets, savingTargets, targetsStatus }: any) {
  return (
    <div className="space-y-6">
      <div className="bg-blue-950 border border-blue-800 rounded-xl p-5">
        <h2 className="text-blue-300 font-semibold mb-1">🎯 ¿Qué son las metas de costo?</h2>
        <p className="text-blue-400 text-sm">
          Define el porcentaje máximo de costo que quieres alcanzar para cada categoría.
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-white font-semibold mb-6">Configurar metas por categoría</h2>
        <div className="space-y-5">
          {COST_CATEGORIES.map(cat => {
            const value = targets[cat.key] ?? 0
            const isAggressive = value < 15
            const isRealistic = value >= 15 && value <= 35
            return (
              <div key={cat.key} className="flex items-center gap-6">
                <div className="w-40 shrink-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span>{cat.icon}</span>
                    <span className="text-white text-sm font-medium">{cat.label}</span>
                  </div>
                  <p className="text-gray-600 text-xs">{cat.description}</p>
                </div>
                <div className="flex-1">
                  <input type="range" min={0} max={60} step={0.5} value={value}
                    onChange={e => setTargets((prev: any) => ({ ...prev, [cat.key]: Number(e.target.value) }))}
                    className="w-full accent-blue-500" />
                  <div className="flex justify-between text-xs text-gray-700 mt-0.5">
                    <span>0%</span><span>30%</span><span>60%</span>
                  </div>
                </div>
                <div className="w-24 shrink-0">
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={60} step={0.5} value={value}
                      onChange={e => setTargets((prev: any) => ({ ...prev, [cat.key]: Number(e.target.value) }))}
                      className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-blue-500" />
                    <span className="text-gray-400 text-sm">%</span>
                  </div>
                  <p className={`text-xs mt-1 ${isAggressive ? 'text-red-400' : isRealistic ? 'text-green-400' : 'text-yellow-400'}`}>
                    {isAggressive ? '⚠️ Muy agresivo' : isRealistic ? '✓ Realista' : '○ Holgado'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {targetsStatus && (
          <p className={`mt-4 text-sm ${targetsStatus.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{targetsStatus}</p>
        )}

        <div className="mt-6 pt-5 border-t border-gray-800 flex items-center justify-between">
          <p className="text-gray-500 text-xs">Los cambios aplican inmediatamente en Food Cost y Costo de Uso</p>
          <button onClick={saveTargets} disabled={savingTargets}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition">
            {savingTargets ? 'Guardando...' : '💾 Guardar metas'}
          </button>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-white font-semibold mb-4">Referencia de la industria</h2>
        <div className="grid grid-cols-5 gap-3">
          {COST_CATEGORIES.map(cat => {
            const benchmarks: Record<string, { min: number; max: number; ideal: number }> = {
              food: { min: 25, max: 35, ideal: 28 },
              na_beverage: { min: 5, max: 15, ideal: 8 },
              liquor: { min: 15, max: 25, ideal: 20 },
              beer: { min: 20, max: 30, ideal: 25 },
              wine: { min: 25, max: 40, ideal: 30 },
            }
            const bench = benchmarks[cat.key]
            const userTarget = targets[cat.key] ?? 0
            const diff = userTarget - bench.ideal
            return (
              <div key={cat.key} className="bg-gray-800 rounded-xl p-3 text-center">
                <p className="text-lg mb-1">{cat.icon}</p>
                <p className="text-gray-300 text-xs font-medium mb-2">{cat.label}</p>
                <p className="text-white text-sm font-bold">{bench.ideal}%</p>
                <p className="text-gray-500 text-xs">ideal</p>
                <p className="text-gray-600 text-xs mt-1">{bench.min}%–{bench.max}%</p>
                {userTarget > 0 && (
                  <p className={`text-xs mt-2 font-medium ${Math.abs(diff) <= 3 ? 'text-green-400' : diff > 0 ? 'text-yellow-400' : 'text-blue-400'}`}>
                    Tu meta: {userTarget}%{Math.abs(diff) <= 3 ? ' ✓' : diff > 0 ? ' ▲' : ' ▼'}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}