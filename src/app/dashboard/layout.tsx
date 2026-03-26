'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { user, currentRestaurant: restaurant, currentOrganization, organizations, switchRestaurant, switchOrganization, can } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [showOrgMenu, setShowOrgMenu] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

  const nav = [
    { section: 'GENERAL', items: [
      { label: 'Inicio', icon: '🏠', href: '/dashboard', module: 'dashboard' },
      { label: 'Dashboard CEO', icon: '👑', href: '/dashboard/ceo', module: 'dashboard' },
    ]},
    { section: 'ANALISIS', items: [
      { label: 'Ventas', icon: '💰', href: '/dashboard/ventas', module: 'ventas' },
      { label: 'Labor', icon: '👥', href: '/dashboard/labor', module: 'labor' },
      { label: 'Employee', icon: '🏆', href: '/dashboard/employee', module: 'labor' },
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

  async function handleChangePassword() {
    setPwError(''); setPwSuccess('')
    if (!pwNew || !pwConfirm) { setPwError('Completa todos los campos'); return }
    if (pwNew.length < 6) { setPwError('La contraseña debe tener al menos 6 caracteres'); return }
    if (pwNew !== pwConfirm) { setPwError('Las contraseñas no coinciden'); return }
    setPwLoading(true)
    const { supabase } = await import('@/lib/supabase')
    const { error } = await supabase.auth.updateUser({ password: pwNew })
    if (error) { setPwError(error.message); setPwLoading(false); return }
    setPwSuccess('Contraseña actualizada correctamente')
    setPwCurrent(''); setPwNew(''); setPwConfirm('')
    setPwLoading(false)
  }

  function closeProfile() {
    setShowProfile(false)
    setPwCurrent(''); setPwNew(''); setPwConfirm('')
    setPwError(''); setPwSuccess('')
  }

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  // Iniciales del usuario para el avatar
  const userInitials = user?.email?.substring(0, 2).toUpperCase() || '??'
  const roleLabel = restaurant?.role ? (restaurant.role.charAt(0).toUpperCase() + restaurant.role.slice(1)) : ''

  return (
    <div className="min-h-screen bg-gray-950 flex">
      <aside className={(collapsed ? 'w-16' : 'w-56') + ' min-h-screen bg-gray-900 border-r border-gray-800 flex flex-col transition-all duration-200 shrink-0'}>

        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-800 flex items-center justify-between gap-2">
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-white font-bold text-sm mb-2">Restaurant X-Ray 🔬</p>
              <div className="relative">
                <button onClick={() => setShowOrgMenu(!showOrgMenu)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg border transition flex items-center justify-between gap-1 ${showOrgMenu ? 'bg-gray-700 border-gray-600' : 'bg-gray-800 border-gray-700 hover:border-gray-600 hover:bg-gray-750'}`}>
                  <div className="min-w-0">
                    <p className="text-gray-400 text-xs leading-none mb-0.5">Organización</p>
                    <p className="text-white text-xs font-medium truncate">{currentOrganization?.name || '—'}</p>
                  </div>
                  <span className="text-gray-500 text-xs shrink-0">{showOrgMenu ? '▲' : '▼'}</span>
                </button>
                {showOrgMenu && organizations.length > 1 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
                    {organizations.map(org => (
                      <button key={org.id} onClick={() => { switchOrganization(org.id); setShowOrgMenu(false) }}
                        className={`w-full text-left px-3 py-2.5 text-xs transition flex items-center justify-between ${currentOrganization?.id === org.id ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                        <span>{org.name}</span>
                        <span className={`text-xs ${currentOrganization?.id === org.id ? 'text-blue-200' : 'text-gray-500'}`}>{org.restaurants.length} rest.</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-1.5">
                {currentOrganization && currentOrganization.restaurants.length > 1 ? (
                  <select value={restaurant?.id || ''} onChange={e => switchRestaurant(e.target.value)}
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
          {collapsed && <div className="w-full flex justify-center"><span className="text-white font-bold text-sm">X</span></div>}
          <button onClick={() => setCollapsed(!collapsed)} className="text-gray-500 hover:text-white transition p-1 rounded shrink-0">
            {collapsed ? '→' : '←'}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {nav.map(function(group) {
            const visibleItems = group.items.filter(item => item.module ? can(item.module as any, 'view') : true)
            if (visibleItems.length === 0) return null
            return (
              <div key={group.section} className="mb-4">
                {!collapsed && <p className="text-gray-600 text-xs font-semibold px-4 mb-1 tracking-wider">{group.section}</p>}
                {visibleItems.map(function(item) {
                  const active = isActive(item.href)
                  return (
                    <a key={item.href} href={item.href} title={item.label}
                      className={`flex items-center gap-3 px-4 py-2 text-sm transition-all ${collapsed ? 'justify-center' : ''} ${active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                      <span className="text-base shrink-0">{item.icon}</span>
                      {!collapsed && <span>{item.label}</span>}
                    </a>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* Footer — botón de perfil */}
        <div className="border-t border-gray-800 p-3">
          {!collapsed ? (
            <button onClick={() => setShowProfile(true)}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-800 transition group text-left">
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-gray-300 text-xs truncate">{user?.email}</p>
                {roleLabel && <p className="text-gray-600 text-xs truncate">{roleLabel}</p>}
              </div>
              <span className="text-gray-600 group-hover:text-gray-400 text-xs shrink-0">⚙️</span>
            </button>
          ) : (
            <button onClick={() => setShowProfile(true)}
              className="w-full flex justify-center py-1 hover:bg-gray-800 rounded-lg transition" title="Mi perfil">
              <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                {userInitials}
              </div>
            </button>
          )}
        </div>
      </aside>

      {/* Cerrar org menu */}
      {showOrgMenu && <div className="fixed inset-0 z-40" onClick={() => setShowOrgMenu(false)} />}

      {/* ── Modal de perfil ── */}
      {showProfile && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md overflow-hidden">

            {/* Header del modal */}
            <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-white font-bold text-base">Mi perfil</h2>
              <button onClick={closeProfile} className="text-gray-500 hover:text-white transition text-lg">✕</button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Avatar + info */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
                  {userInitials}
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{user?.email}</p>
                  {roleLabel && (
                    <span className="inline-block mt-1 bg-gray-800 text-gray-300 text-xs px-2 py-0.5 rounded-full">
                      {roleLabel}
                    </span>
                  )}
                  {restaurant && (
                    <p className="text-gray-500 text-xs mt-1">{restaurant.name}</p>
                  )}
                  {currentOrganization && (
                    <p className="text-gray-600 text-xs">{currentOrganization.name}</p>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-800" />

              {/* Cambiar contraseña */}
              <div>
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Cambiar contraseña</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-gray-500 text-xs block mb-1">Nueva contraseña</label>
                    <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-gray-600" />
                  </div>
                  <div>
                    <label className="text-gray-500 text-xs block mb-1">Confirmar contraseña</label>
                    <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)}
                      placeholder="Repite la nueva contraseña"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-gray-600" />
                  </div>
                  {pwError && <p className="text-red-400 text-xs">{pwError}</p>}
                  {pwSuccess && <p className="text-green-400 text-xs">✓ {pwSuccess}</p>}
                  <button onClick={handleChangePassword} disabled={pwLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white py-2 rounded-lg text-sm font-medium transition">
                    {pwLoading ? 'Actualizando...' : 'Actualizar contraseña'}
                  </button>
                </div>
              </div>

              <div className="border-t border-gray-800" />

              {/* Logout */}
              <button onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-red-950 border border-gray-700 hover:border-red-800 text-gray-400 hover:text-red-400 py-2.5 rounded-lg text-sm font-medium transition">
                <span>⏻</span>
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}