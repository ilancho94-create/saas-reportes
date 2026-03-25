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
  const [activeTab, setActiveTab] = useState<'categorias' | 'restaurante' | 'mapeo-items' | 'metas'>('categorias')

  useEffect(() => {
    if (restaurantId) loadData()
  }, [restaurantId])

  async function loadData() {
    if (!restaurantId) return
    setLoading(true)

    const { data: rest } = await supabase
      .from('restaurants').select('name').eq('id', restaurantId).single()
    setRestaurantName(rest?.name || '')

    const { data: maps } = await supabase
      .from('category_mappings')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('source_category')
    setMappings(maps || [])

    // Load cost targets
    const { data: tgts } = await supabase
      .from('cost_targets')
      .select('category, target_pct')
      .eq('restaurant_id', restaurantId)
    if (tgts && tgts.length > 0) {
      const tgtsMap: Record<string, number> = {}
      tgts.forEach((t: any) => { tgtsMap[t.category] = Number(t.target_pct) })
      setTargets(prev => ({ ...prev, ...tgtsMap }))
    }

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

  const groupedMappings = MAPPED_TO_OPTIONS.map(opt => ({
    ...opt,
    categories: mappings.filter(m => m.mapped_to === opt.value)
  })).filter(g => g.categories.length > 0)

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
        <div className="flex gap-1">
          {[
            { key: 'categorias', label: 'Mapeo de Categorías' },
            { key: 'restaurante', label: 'Restaurante' },
            { key: 'mapeo-items', label: '🗂 Mapeo de Items R365' },
            { key: 'metas', label: '🎯 Metas de Costo' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 ${
                activeTab === tab.key ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {activeTab === 'categorias' && (
          <>
            <div className="bg-blue-950 border border-blue-800 rounded-xl p-5">
              <h2 className="text-blue-300 font-semibold mb-1">¿Para qué sirve esto?</h2>
              <p className="text-blue-400 text-sm">
                Cada restaurante categoriza sus ventas diferente en Toast. Aquí defines cómo mapear
                las categorías de Toast a las categorías estándar del sistema para calcular
                correctamente Food Cost, Beverage Cost, etc.
              </p>
              <p className="text-blue-400 text-sm mt-2">
                <strong>Ejemplo:</strong> Si Toast tiene "Ayce" como categoría de ventas, puedes mapearlo
                a "Food" para que se incluya en el cálculo de food cost.
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
              <p className="text-gray-500 text-xs mb-4">Así se calcularán los costos con el mapeo actual</p>
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

        {activeTab === 'restaurante' && (
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
        )}

        {activeTab === 'mapeo-items' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-2">Mapeo de Items R365</h2>
            <p className="text-gray-500 text-sm mb-6">
              Asigna categoría (food, beverage, liquor...) a los items de Menu Item Analysis
              que no tienen match automático con Toast. Se aplican en todos los reportes futuros.
            </p>
            <a href="/dashboard/settings/mapeo-items"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition">
              🗂 Ir a Mapeo de Items →
            </a>
          </div>
        )}


        {activeTab === 'metas' && (
          <MetasTab
            targets={targets}
            setTargets={setTargets}
            saveTargets={saveTargets}
            savingTargets={savingTargets}
            targetsStatus={targetsStatus}
          />
        )}

      </main>
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
          Estos objetivos se comparan contra el <strong>costo real</strong> (compras) y el <strong>costo teórico</strong> (según recetas y P.Mix)
          para darte una visión completa de qué tan realistas son tus metas.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
          <div className="bg-blue-900/50 rounded-lg p-2.5">
            <p className="text-blue-300 font-medium">Meta configurada</p>
            <p className="text-blue-400 mt-0.5">Lo que quieres lograr</p>
          </div>
          <div className="bg-blue-900/50 rounded-lg p-2.5">
            <p className="text-blue-300 font-medium">Costo teórico</p>
            <p className="text-blue-400 mt-0.5">Lo que debería costar según tus recetas</p>
          </div>
          <div className="bg-blue-900/50 rounded-lg p-2.5">
            <p className="text-blue-300 font-medium">Costo real</p>
            <p className="text-blue-400 mt-0.5">Lo que realmente gastaste</p>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-white font-semibold mb-6">Configurar metas por categoría</h2>
        <div className="space-y-5">
          {COST_CATEGORIES.map(cat => {
            const value = targets[cat.key] ?? 0
            const isAggressive = value < 15
            const isRealistic = value >= 15 && value <= 35
            const isLenient = value > 35
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
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={0.5}
                    value={value}
                    onChange={e => setTargets((prev: any) => ({ ...prev, [cat.key]: Number(e.target.value) }))}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-xs text-gray-700 mt-0.5">
                    <span>0%</span>
                    <span>30%</span>
                    <span>60%</span>
                  </div>
                </div>
                <div className="w-24 shrink-0">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={60}
                      step={0.5}
                      value={value}
                      onChange={e => setTargets((prev: any) => ({ ...prev, [cat.key]: Number(e.target.value) }))}
                      className="w-16 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-blue-500"
                    />
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
          <p className={`mt-4 text-sm ${targetsStatus.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>
            {targetsStatus}
          </p>
        )}

        <div className="mt-6 pt-5 border-t border-gray-800 flex items-center justify-between">
          <p className="text-gray-500 text-xs">Los cambios aplican inmediatamente en Food Cost y Costo de Uso</p>
          <button
            onClick={saveTargets}
            disabled={savingTargets}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition"
          >
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
                    Tu meta: {userTarget}%
                    {Math.abs(diff) <= 3 ? ' ✓' : diff > 0 ? ' ▲' : ' ▼'}
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