'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, currentRestaurant: restaurant, currentOrganization, organizations, switchRestaurant, switchOrganization, can } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [showOrgMenu, setShowOrgMenu] = useState(false)

  const nav = [
    { section: 'GENERAL', items: [
      { label: 'Inicio', icon: '🏠', href: '/dashboard', module: 'dashboard' },
      { label: 'Dashboard CEO', icon: '👑', href: '/dashboard/ceo', module: 'dashboard' },
    ]},
    { section: 'ANALISIS', items: [
      { label: 'Ventas', icon: '💰', href: '/dashboard/ventas', module: 'ventas' },
      { label: 'Labor', icon: '👥', href: '/dashboard/labor', module: 'labor' },
      { label: 'Food Cost', icon: '🛒', href: '/dashboard/food-cost', module: 'food_cost' },
      { label: 'Costo de Uso', icon: '📦', href: '/dashboard/costo-uso', module: 'costo_uso' },
      { label: 'Waste', icon: '🗑️', href: '/dashboard/waste', module: 'waste' },
      { label: 'Actual vs Teórico', icon: '📊', href: '/dashboard/avt', module: 'avt' },
      { label: 'Compras', icon: '🧾', href: '/dashboard/compras', module: 'compras' },
    ]},
    { section: 'REPORTES', items: [
      { label: 'Historial', icon: '📅', href: '/dashboard/history', module: 'historial' },
      { label: 'Subir reporte', icon: '⬆️', href: '/upload', module: 'upload' },
    ]},
    { section: 'CONFIG', items: [
      { label: 'Settings', icon: '⚙️', href: '/dashboard/settings', module: 'settings' },
      { label: 'Usuarios', icon: '👤', href: '/dashboard/users', module: 'users' },
    ]},
  ]

  async function handleLogout() {
    const { supabase } = await import('@/lib/supabase')
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      <aside className={(collapsed ? 'w-16' : 'w-56') + ' min-h-screen bg-gray-900 border-r border-gray-800 flex flex-col transition-all duration-200 shrink-0'}>

        {/* Header con org + restaurante */}
        <div className="px-4 py-4 border-b border-gray-800 flex items-center justify-between gap-2">
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-white font-bold text-sm mb-2">Restaurant X-Ray 🔬</p>

              {/* Selector de organización */}
              <div className="relative">
                <button
                  onClick={() => setShowOrgMenu(!showOrgMenu)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg border transition flex items-center justify-between gap-1 ${
                    showOrgMenu
                      ? 'bg-gray-700 border-gray-600'
                      : 'bg-gray-800 border-gray-700 hover:border-gray-600 hover:bg-gray-750'
                  }`}>
                  <div className="min-w-0">
                    <p className="text-gray-400 text-xs leading-none mb-0.5">Organización</p>
                    <p className="text-white text-xs font-medium truncate">{currentOrganization?.name || '—'}</p>
                  </div>
                  <span className="text-gray-500 text-xs shrink-0">{showOrgMenu ? '▲' : '▼'}</span>
                </button>

                {showOrgMenu && organizations.length > 1 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                    {organizations.map(org => (
                      <button
                        key={org.id}
                        onClick={() => { switchOrganization(org.id); setShowOrgMenu(false) }}
                        className={`w-full text-left px-3 py-2.5 text-xs transition flex items-center justify-between ${
                          currentOrganization?.id === org.id
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-300 hover:bg-gray-700'
                        }`}>
                        <span>{org.name}</span>
                        <span className={`text-xs ${currentOrganization?.id === org.id ? 'text-blue-200' : 'text-gray-500'}`}>
                          {org.restaurants.length} rest.
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selector de restaurante */}
              <div className="mt-1.5">
                {currentOrganization && currentOrganization.restaurants.length > 1 ? (
                  <select
                    value={restaurant?.id || ''}
                    onChange={e => switchRestaurant(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-lg px-2.5 py-2 text-white text-xs focus:outline-none focus:border-blue-500 cursor-pointer">
                    {currentOrganization.restaurants.map(r => (
                      <option key={r.id} value={r.id} className="bg-gray-900">{r.name}</option>
                    ))}
                  </select>
                ) : (
                  <div className="px-2.5 py-2 bg-gray-800 border border-gray-700 rounded-lg">
                    <p className="text-gray-400 text-xs leading-none mb-0.5">Restaurante</p>
                    <p className="text-white text-xs font-medium truncate">{restaurant?.name || '—'}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {collapsed && (
            <div className="w-full flex justify-center">
              <span className="text-white font-bold text-sm">X</span>
            </div>
          )}

          <button onClick={() => setCollapsed(!collapsed)} className="text-gray-500 hover:text-white transition p-1 rounded shrink-0">
            {collapsed ? '→' : '←'}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {nav.map(function(group) {
            const visibleItems = group.items.filter(item =>
              item.module ? can(item.module as any, 'view') : true
            )
            if (visibleItems.length === 0) return null
            return (
              <div key={group.section} className="mb-4">
                {!collapsed && <p className="text-gray-600 text-xs font-semibold px-4 mb-1 tracking-wider">{group.section}</p>}
                {visibleItems.map(function(item) {
                  const active = isActive(item.href)
                  const base = 'flex items-center gap-3 px-4 py-2 text-sm transition-all '
                  const align = collapsed ? 'justify-center ' : ''
                  const color = active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  return (
                    <a key={item.href} href={item.href} title={item.label} className={base + align + color}>
                      <span className="text-base shrink-0">{item.icon}</span>
                      {!collapsed && <span>{item.label}</span>}
                    </a>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-800 p-3">
          {!collapsed ? (
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-gray-300 text-xs truncate">{user?.email}</p>
                {restaurant && (
                  <p className="text-gray-600 text-xs truncate capitalize">{restaurant.role}</p>
                )}
              </div>
              <button onClick={handleLogout} className="text-gray-500 hover:text-red-400 text-xs ml-2 shrink-0 transition" title="Salir">⏻</button>
            </div>
          ) : (
            <button onClick={handleLogout} className="text-gray-500 hover:text-red-400 w-full flex justify-center transition" title="Salir">⏻</button>
          )}
        </div>
      </aside>

      {/* Cerrar org menu al hacer click fuera */}
      {showOrgMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowOrgMenu(false)} />
      )}

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}