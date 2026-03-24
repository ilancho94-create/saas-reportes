'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [restaurant, setRestaurant] = useState<any>(null)
  const [collapsed, setCollapsed] = useState(false)

  const nav = [
    { section: 'GENERAL', items: [
      { label: 'Inicio', icon: '🏠', href: '/dashboard' },
      { label: 'Dashboard CEO', icon: '👑', href: '/dashboard/ceo' },
    ]},
    { section: 'ANALISIS', items: [
      { label: 'Ventas', icon: '💰', href: '/dashboard/ventas' },
      { label: 'Labor', icon: '👥', href: '/dashboard/labor' },
      { label: 'Food Cost', icon: '🛒', href: '/dashboard/food-cost' },
      { label: 'Costo de Uso', icon: '📦', href: '/dashboard/costo-uso' },
      { label: 'Waste y AvT', icon: '📊', href: '/dashboard/waste' },
    ]},
    { section: 'REPORTES', items: [
      { label: 'Historial', icon: '📅', href: '/dashboard/history' },
      { label: 'Subir reporte', icon: '⬆️', href: '/upload' },
    ]},
    { section: 'CONFIG', items: [
      { label: 'Settings', icon: '⚙️', href: '/dashboard/settings' },
    ]},
  ]

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      setUser(data.user)
      const { data: profile } = await supabase
        .from('profiles')
        .select('restaurant_id')
        .eq('id', data.user.id)
        .single()
      if (profile?.restaurant_id) {
        const { data: rest } = await supabase
          .from('restaurants')
          .select('*, organizations(name)')
          .eq('id', profile.restaurant_id)
          .single()
        setRestaurant(rest)
      }
    })
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      <aside
        className={
          (collapsed ? 'w-16' : 'w-56') +
          ' min-h-screen bg-gray-900 border-r border-gray-800 flex flex-col transition-all duration-200 shrink-0'
        }
      >
        <div className="px-4 py-4 border-b border-gray-800 flex items-center justify-between">
          {!collapsed && (
            <div>
              <p className="text-white font-bold text-sm">SaaS Reportes 🚀</p>
              {restaurant && (
                <p className="text-gray-500 text-xs truncate">{restaurant.name}</p>
              )}
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-gray-500 hover:text-white transition p-1 rounded"
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {nav.map(function(group) {
            return (
              <div key={group.section} className="mb-4">
                {!collapsed && (
                  <p className="text-gray-600 text-xs font-semibold px-4 mb-1 tracking-wider">
                    {group.section}
                  </p>
                )}
                {group.items.map(function(item) {
                  const active = isActive(item.href)
                  const base = 'flex items-center gap-3 px-4 py-2 text-sm transition-all '
                  const align = collapsed ? 'justify-center ' : ''
                  const color = active
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      title={item.label}
                      className={base + align + color}
                    >
                      <span className="text-base shrink-0">{item.icon}</span>
                      {!collapsed && <span>{item.label}</span>}
                    </a>
                  )
                })}
              </div>
            )
          })}
        </nav>

        <div className="border-t border-gray-800 p-3">
          {!collapsed ? (
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-gray-300 text-xs truncate">{user?.email}</p>
                {restaurant?.organizations?.name && (
                  <p className="text-gray-600 text-xs truncate">
                    {restaurant.organizations.name}
                  </p>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="text-gray-500 hover:text-red-400 text-xs ml-2 shrink-0 transition"
                title="Salir"
              >
                ⏻
              </button>
            </div>
          ) : (
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-red-400 w-full flex justify-center transition"
              title="Salir"
            >
              ⏻
            </button>
          )}
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  )
}