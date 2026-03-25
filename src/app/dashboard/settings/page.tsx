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
  const [restaurantName, setRestaurantName] = useState('')
  const [mappings, setMappings] = useState<any[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [newMappedTo, setNewMappedTo] = useState('food')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [activeTab, setActiveTab] = useState<'categorias' | 'restaurante' | 'mapeo-items'>('categorias')

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

      </main>
    </div>
  )
}