'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const CATEGORIES = [
  { value: 'food', label: 'Food', color: 'text-orange-400' },
  { value: 'na_beverage', label: 'NA Beverage', color: 'text-cyan-400' },
  { value: 'liquor', label: 'Liquor', color: 'text-purple-400' },
  { value: 'beer', label: 'Beer', color: 'text-yellow-400' },
  { value: 'wine', label: 'Wine', color: 'text-pink-400' },
  { value: 'general', label: 'General', color: 'text-gray-400' },
  { value: 'ignore', label: 'Ignorar', color: 'text-red-400' },
]

interface UnmatchedItem {
  item: string
  theo_cost: number
  assigned?: string
}

export default function MapeoItemsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [unmatchedItems, setUnmatchedItems] = useState<UnmatchedItem[]>([])
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [savedCount, setSavedCount] = useState(0)
  const [status, setStatus] = useState('')
  const restaurantId = '00000000-0000-0000-0000-000000000001'

  useEffect(() => {
    loadUnmatchedItems()
  }, [])

  async function loadUnmatchedItems() {
    setLoading(true)

    // Obtener todos los unmatched_items de todos los reportes
    const { data: pmData } = await supabase
      .from('product_mix_data')
      .select('raw_data, report_id')
      .order('created_at', { ascending: false })

    // Obtener mappings ya guardados
    const { data: existingMappings } = await supabase
      .from('category_mappings')
      .select('source_category, mapped_to')
      .eq('restaurant_id', restaurantId)
      .eq('source_system', 'r365_item')

    const mappingLookup: Record<string, string> = {}
    for (const m of existingMappings || []) {
      mappingLookup[m.source_category.toLowerCase()] = m.mapped_to
    }

    // Consolidar todos los unmatched items únicos
    const itemMap: Record<string, UnmatchedItem> = {}
    for (const row of pmData || []) {
      const unmatched = row.raw_data?.unmatched_items || []
      for (const u of unmatched) {
        const key = u.item.toLowerCase()
        if (!itemMap[key]) {
          itemMap[key] = { item: u.item, theo_cost: u.theo_cost }
        }
      }
    }

    // Marcar los que ya tienen mapping guardado
    const preAssigned: Record<string, string> = {}
    for (const [key, item] of Object.entries(itemMap)) {
      if (mappingLookup[key]) {
        preAssigned[item.item] = mappingLookup[key]
      }
    }

    setSavedCount(Object.keys(mappingLookup).length)
    setAssignments(preAssigned)
    setUnmatchedItems(Object.values(itemMap).sort((a, b) => b.theo_cost - a.theo_cost))
    setLoading(false)
  }

  function assign(item: string, category: string) {
    setAssignments(prev => ({ ...prev, [item]: category }))
  }

  async function handleSave() {
    setSaving(true)
    setStatus('')

    const toSave = Object.entries(assignments).map(([item, cat]) => ({
      restaurant_id: restaurantId,
      source_system: 'r365_item',
      source_category: item,
      mapped_to: cat,
    }))

    if (toSave.length === 0) {
      setStatus('⚠️ No hay asignaciones para guardar')
      setSaving(false)
      return
    }

    // Upsert — reemplaza si ya existe
    const { error } = await supabase
      .from('category_mappings')
      .upsert(toSave, {
        onConflict: 'restaurant_id,source_system,source_category',
        ignoreDuplicates: false,
      })

    if (error) {
      // Si no tiene upsert por constraint, hacer delete + insert
      await supabase
        .from('category_mappings')
        .delete()
        .eq('restaurant_id', restaurantId)
        .eq('source_system', 'r365_item')
        .in('source_category', toSave.map(x => x.source_category))

      await supabase.from('category_mappings').insert(toSave)
    }

    setStatus(`✅ ${toSave.length} items guardados. La próxima vez que subas reportes se aplicarán automáticamente.`)
    setSavedCount(toSave.length)
    setSaving(false)
  }

  const pending = unmatchedItems.filter(u => !assignments[u.item])
  const assigned = unmatchedItems.filter(u => assignments[u.item])
  const totalTheoUnmatched = pending.reduce((a, b) => a + b.theo_cost, 0)

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando items sin categoría...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push('/dashboard/settings')}
          className="text-gray-400 hover:text-white text-sm"
        >
          ← Settings
        </button>
        <div>
          <span className="text-white font-semibold">Mapeo de Items</span>
          <span className="text-gray-500 text-sm ml-2">Asigna categoría a items de R365 sin match en Toast</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">

        {/* Resumen */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-500 text-xs mb-1">Sin asignar</p>
            <p className="text-white text-2xl font-bold">{pending.length}</p>
            <p className="text-red-400 text-xs mt-1">${totalTheoUnmatched.toFixed(2)} sin categorizar</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-500 text-xs mb-1">Asignados esta sesión</p>
            <p className="text-white text-2xl font-bold">{assigned.length}</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-gray-500 text-xs mb-1">Guardados en sistema</p>
            <p className="text-green-400 text-2xl font-bold">{savedCount}</p>
          </div>
        </div>

        {/* Lista de items sin asignar */}
        {pending.length > 0 && (
          <div className="mb-8">
            <h2 className="text-white font-semibold mb-3">
              Sin categoría <span className="text-gray-500 font-normal text-sm">({pending.length} items)</span>
            </h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800">
              {pending.map(u => (
                <div key={u.item} className="px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{u.item}</p>
                    <p className="text-gray-500 text-xs">${u.theo_cost.toFixed(2)} theo cost</p>
                  </div>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat.value}
                        onClick={() => assign(u.item, cat.value)}
                        className={`text-xs px-2 py-1 rounded-lg border transition ${
                          assignments[u.item] === cat.value
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lista de items ya asignados */}
        {assigned.length > 0 && (
          <div className="mb-8">
            <h2 className="text-white font-semibold mb-3">
              Asignados <span className="text-gray-500 font-normal text-sm">({assigned.length} items)</span>
            </h2>
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800">
              {assigned.map(u => {
                const cat = CATEGORIES.find(c => c.value === assignments[u.item])
                return (
                  <div key={u.item} className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{u.item}</p>
                      <p className="text-gray-500 text-xs">${u.theo_cost.toFixed(2)} theo cost</p>
                    </div>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {CATEGORIES.map(c => (
                        <button
                          key={c.value}
                          onClick={() => assign(u.item, c.value)}
                          className={`text-xs px-2 py-1 rounded-lg border transition ${
                            assignments[u.item] === c.value
                              ? 'bg-blue-600 border-blue-500 text-white'
                              : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {unmatchedItems.length === 0 && (
          <div className="bg-green-950 border border-green-800 rounded-xl p-6 text-center">
            <p className="text-green-400 font-medium">✅ Todos los items tienen categoría asignada</p>
          </div>
        )}

        {/* Botón guardar */}
        {status && (
          <div className={`mb-4 px-4 py-3 rounded-lg text-sm ${
            status.startsWith('✅') ? 'bg-green-950 border border-green-800 text-green-400' :
            'bg-yellow-950 border border-yellow-800 text-yellow-400'
          }`}>
            {status}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || Object.keys(assignments).length === 0}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 text-white font-semibold py-3 rounded-xl transition"
        >
          {saving ? 'Guardando...' : `💾 Guardar ${Object.keys(assignments).length} asignaciones`}
        </button>

      </main>
    </div>
  )
}