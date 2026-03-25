'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { ROLE_PERMISSIONS } from '@/lib/permissions'

const ROLES = [
  { value: 'owner', label: 'Owner / Dueño' },
  { value: 'gm', label: 'General Manager' },
  { value: 'manager', label: 'Manager' },
  { value: 'chef', label: 'Chef / Jefe de Cocina' },
  { value: 'supervisor', label: 'Supervisor' },
]

const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'labor', label: 'Labor' },
  { key: 'food_cost', label: 'Food Cost' },
  { key: 'costo_uso', label: 'Costo de Uso' },
  { key: 'waste', label: 'Waste' },
  { key: 'avt', label: 'Actual vs Teórico' },
  { key: 'compras', label: 'Compras' },
  { key: 'historial', label: 'Historial' },
  { key: 'upload', label: 'Subir reportes' },
  { key: 'settings', label: 'Settings' },
  { key: 'users', label: 'Usuarios' },
]

const ACTIONS = ['view', 'edit', 'create']

export default function UsersPage() {
  const { currentRestaurant, currentOrganization, organizations, can } = useAuth()
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'restaurante' | 'organizacion' | 'superadmin'>('restaurante')
  const [showInvite, setShowInvite] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('manager')
  const [inviting, setInviting] = useState(false)
  const [status, setStatus] = useState('')
  const [customPerms, setCustomPerms] = useState<Record<string, string[]>>({})
  const [useCustomPerms, setUseCustomPerms] = useState(false)

  // Org-level state
  const [allOrgUsers, setAllOrgUsers] = useState<any[]>([])
  const [allRestaurants, setAllRestaurants] = useState<any[]>([])
  const [loadingOrg, setLoadingOrg] = useState(false)
  const [managingUser, setManagingUser] = useState<any>(null)
  const [userRestaurantAccess, setUserRestaurantAccess] = useState<any[]>([])

  // Superadmin state
  const [allOrgs, setAllOrgs] = useState<any[]>([])
  const [searchEmail, setSearchEmail] = useState('')
  const [foundUser, setFoundUser] = useState<any>(null)
  const [searchingUser, setSearchingUser] = useState(false)
  const [assignOrgId, setAssignOrgId] = useState('')
  const [assignRestaurantId, setAssignRestaurantId] = useState('')
  const [assignRole, setAssignRole] = useState('manager')

  useEffect(() => {
    checkSuperadmin()
    if (currentRestaurant) loadUsers()
  }, [currentRestaurant])

  async function checkSuperadmin() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('profiles').select('is_superadmin').eq('id', user.id).single()
    setIsSuperadmin(data?.is_superadmin || false)
    if (data?.is_superadmin) loadSuperadminData()
  }

  async function loadUsers() {
    setLoading(true)
    const { data, error } = await supabase
      .rpc('get_users_with_email', { p_restaurant_id: currentRestaurant!.id })
    if (data) {
      setUsers(data)
    } else {
      const { data: fallback } = await supabase
        .from('user_restaurants')
        .select('id, role, custom_permissions, active, created_at, user_id')
        .eq('restaurant_id', currentRestaurant!.id)
        .order('created_at')
      setUsers(fallback || [])
    }
    setLoading(false)
  }

  async function loadOrgUsers() {
    if (!currentOrganization) return
    setLoadingOrg(true)

    // Cargar todos los restaurantes de la org
    const { data: rests } = await supabase
      .from('restaurants')
      .select('id, name')
      .eq('organization_id', currentOrganization.id)
    setAllRestaurants(rests || [])

    // Cargar todos los usuarios de todos los restaurantes de la org
    const restIds = (rests || []).map(r => r.id)
    if (!restIds.length) { setLoadingOrg(false); return }

    const { data } = await supabase
      .from('user_restaurants')
      .select('id, user_id, role, active, restaurant_id, custom_permissions')
      .in('restaurant_id', restIds)
      .order('created_at')

    // Enriquecer con emails via RPC por cada restaurante
    const emailMap: Record<string, string> = {}
    for (const restId of restIds) {
      const { data: withEmail } = await supabase
        .rpc('get_users_with_email', { p_restaurant_id: restId })
      if (withEmail) {
        withEmail.forEach((u: any) => { emailMap[u.user_id] = u.email })
      }
    }

    // Agrupar por usuario
    const byUser: Record<string, any> = {}
    for (const ur of data || []) {
      if (!byUser[ur.user_id]) {
        byUser[ur.user_id] = {
          user_id: ur.user_id,
          email: emailMap[ur.user_id] || ur.user_id,
          restaurants: [],
        }
      }
      const rest = rests?.find(r => r.id === ur.restaurant_id)
      byUser[ur.user_id].restaurants.push({
        ...ur,
        restaurant_name: rest?.name || ur.restaurant_id,
      })
    }
    setAllOrgUsers(Object.values(byUser))
    setLoadingOrg(false)
  }

  async function loadSuperadminData() {
    const { data } = await supabase.from('organizations').select('id, name').order('name')
    setAllOrgs(data || [])
  }

  async function openManageUser(user: any) {
    setManagingUser(user)
    setUserRestaurantAccess(user.restaurants)
  }

  async function toggleUserRestaurant(userId: string, restaurantId: string, orgId: string, currentAccess: any) {
    if (currentAccess) {
      // Toggle active/inactive
      await supabase.from('user_restaurants')
        .update({ active: !currentAccess.active })
        .eq('id', currentAccess.id)
    } else {
      // Agregar acceso
      await supabase.from('user_restaurants').insert({
        user_id: userId,
        restaurant_id: restaurantId,
        organization_id: orgId,
        role: 'manager',
        active: true,
      })
    }
    await loadOrgUsers()
    // Refresh managing user
    const updated = allOrgUsers.find(u => u.user_id === userId)
    if (updated) setUserRestaurantAccess(updated.restaurants)
    setStatus('✅ Acceso actualizado')
    setTimeout(() => setStatus(''), 2000)
  }

  async function updateRoleInRestaurant(urId: string, newRole: string) {
    await supabase.from('user_restaurants').update({ role: newRole }).eq('id', urId)
    await loadOrgUsers()
    setStatus('✅ Rol actualizado')
    setTimeout(() => setStatus(''), 2000)
  }

  async function searchUserByEmail() {
    if (!searchEmail) return
    setSearchingUser(true)
    setFoundUser(null)
    // Buscar en user_restaurants por email via RPC o profiles
    const { data: allUsers } = await supabase
      .from('profiles')
      .select('id')
    // We need to find by email - use auth.users via a helper
    // For now search across all known users
    const { data } = await supabase
      .rpc('find_user_by_email', { p_email: searchEmail })
      .single()
    if (data) {
      setFoundUser(data)
    } else {
      // Try get_users_with_email across known orgs
      for (const org of allOrgs) {
        const { data: rests } = await supabase
          .from('restaurants').select('id').eq('organization_id', org.id)
        for (const rest of rests || []) {
          const { data: users } = await supabase
            .rpc('get_users_with_email', { p_restaurant_id: rest.id })
          const found = (users || []).find((u: any) => u.email === searchEmail)
          if (found) { setFoundUser(found); break }
        }
        if (foundUser) break
      }
    }
    setSearchingUser(false)
  }

  async function assignUserToOrg() {
    if (!foundUser || !assignOrgId || !assignRestaurantId) return
    const { error } = await supabase.from('user_restaurants').upsert({
      user_id: foundUser.user_id,
      restaurant_id: assignRestaurantId,
      organization_id: assignOrgId,
      role: assignRole,
      active: true,
    }, { onConflict: 'user_id,restaurant_id' })
    if (!error) {
      setStatus('✅ Usuario asignado a la organización')
      setFoundUser(null)
      setSearchEmail('')
      setTimeout(() => setStatus(''), 3000)
    }
  }

  async function updateRole(userRestaurantId: string, newRole: string) {
    await supabase.from('user_restaurants')
      .update({ role: newRole, custom_permissions: null }).eq('id', userRestaurantId)
    loadUsers()
  }

  async function toggleActive(userRestaurantId: string, active: boolean) {
    await supabase.from('user_restaurants').update({ active: !active }).eq('id', userRestaurantId)
    loadUsers()
  }

  async function saveCustomPermissions(userRestaurantId: string) {
    await supabase.from('user_restaurants')
      .update({ custom_permissions: useCustomPerms ? customPerms : null }).eq('id', userRestaurantId)
    setEditingUser(null)
    setCustomPerms({})
    setUseCustomPerms(false)
    setStatus('✅ Permisos actualizados')
    setTimeout(() => setStatus(''), 3000)
    loadUsers()
  }

  function openEditPermissions(user: any) {
    setEditingUser(user)
    if (user.custom_permissions) {
      setCustomPerms(user.custom_permissions)
      setUseCustomPerms(true)
    } else {
      const rolePerms = ROLE_PERMISSIONS[user.role] || {}
      setCustomPerms(Object.fromEntries(
        Object.entries(rolePerms).map(([mod, actions]) => [mod, [...(actions as string[])]])
      ))
      setUseCustomPerms(false)
    }
  }

  function togglePerm(module: string, action: string) {
    setCustomPerms(prev => {
      const current = prev[module] || []
      const updated = current.includes(action)
        ? current.filter(a => a !== action)
        : [...current, action]
      return { ...prev, [module]: updated }
    })
  }

  const canEdit = can('users', 'edit')
  const canCreate = can('users', 'create')

  if (!can('users', 'view')) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-500">No tienes permiso para ver esta sección.</p>
      </div>
    )
  }

  // Restaurants of current org for superadmin assign
  const orgRestaurants = assignOrgId
    ? (allOrgs.find(o => o.id === assignOrgId) ? [] : []) // will load dynamically
    : []

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">👤 Gestión de Usuarios</h1>
          <p className="text-gray-500 text-xs mt-0.5">{currentRestaurant?.name} · {currentRestaurant?.organization_name}</p>
        </div>
        {canCreate && activeTab === 'restaurante' && (
          <button onClick={() => setShowInvite(!showInvite)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
            + Invitar usuario
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800 bg-gray-900 px-6">
        <div className="flex gap-1">
          <button onClick={() => setActiveTab('restaurante')}
            className={`px-4 py-3 text-sm font-medium transition border-b-2 ${activeTab === 'restaurante' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            🏠 Este Restaurante
          </button>
          <button onClick={() => { setActiveTab('organizacion'); loadOrgUsers() }}
            className={`px-4 py-3 text-sm font-medium transition border-b-2 ${activeTab === 'organizacion' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            🏢 Organización
          </button>
          {isSuperadmin && (
            <button onClick={() => setActiveTab('superadmin')}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 ${activeTab === 'superadmin' ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
              ⚡ Superadmin
            </button>
          )}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {status && (
          <div className="bg-green-950 border border-green-800 text-green-400 px-4 py-3 rounded-lg text-sm">{status}</div>
        )}

        {/* TAB: ESTE RESTAURANTE */}
        {activeTab === 'restaurante' && (
          <>
            {showInvite && canCreate && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h2 className="text-white font-semibold mb-4">Invitar nuevo usuario</h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Email</label>
                    <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                      placeholder="email@ejemplo.com"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-gray-400 text-xs mb-1 block">Rol</label>
                    <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-white text-sm transition">Cancelar</button>
                  <button onClick={async () => {
                    if (!inviteEmail) return
                    setInviting(true)
                    const { error } = await supabase.from('user_invitations').upsert({
                      email: inviteEmail,
                      restaurant_id: currentRestaurant!.id,
                      organization_id: currentRestaurant!.organization_id,
                      role: inviteRole,
                      invited_by: (await supabase.auth.getUser()).data.user?.id,
                      status: 'pending',
                    }, { onConflict: 'email,restaurant_id' })
                    setInviting(false)
                    if (!error) {
                      setStatus('✅ Invitación registrada.')
                      setShowInvite(false)
                      setInviteEmail('')
                    }
                  }} disabled={inviting || !inviteEmail}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                    {inviting ? 'Guardando...' : 'Invitar'}
                  </button>
                </div>
              </div>
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="text-white font-semibold">Usuarios — {currentRestaurant?.name}</h2>
                <p className="text-gray-500 text-xs mt-0.5">{users.filter(u => u.active).length} activos · {users.filter(u => !u.active).length} inactivos</p>
              </div>
              {loading ? (
                <div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>
              ) : users.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">No hay usuarios registrados aún.</div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {users.map((ur: any) => (
                    <div key={ur.id} className={`px-6 py-4 flex items-center justify-between gap-4 ${!ur.active ? 'opacity-50' : ''}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium">{ur.email || ur.user_id}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            ur.role === 'admin' || ur.role === 'owner' ? 'bg-yellow-900 text-yellow-300' :
                            ur.role === 'gm' ? 'bg-blue-900 text-blue-300' :
                            ur.role === 'manager' ? 'bg-purple-900 text-purple-300' :
                            ur.role === 'chef' ? 'bg-green-900 text-green-300' :
                            'bg-gray-800 text-gray-400'
                          }`}>
                            {ROLES.find(r => r.value === ur.role)?.label || ur.role}
                          </span>
                          {ur.custom_permissions && <span className="text-xs bg-orange-900 text-orange-300 px-2 py-0.5 rounded-full">permisos custom</span>}
                          {!ur.active && <span className="text-xs text-red-400">Inactivo</span>}
                        </div>
                      </div>
                      {canEdit && (
                        <div className="flex items-center gap-2 shrink-0">
                          <select value={ur.role} onChange={e => updateRole(ur.id, e.target.value)}
                            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500">
                            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                          <button onClick={() => openEditPermissions(ur)}
                            className="text-xs border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 px-3 py-1.5 rounded-lg transition">
                            Permisos
                          </button>
                          <button onClick={() => toggleActive(ur.id, ur.active)}
                            className={`text-xs px-3 py-1.5 rounded-lg border transition ${ur.active ? 'border-red-800 text-red-400 hover:bg-red-950' : 'border-green-800 text-green-400 hover:bg-green-950'}`}>
                            {ur.active ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tabla de roles */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Permisos por rol</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left text-gray-500 pb-3 font-medium">Módulo</th>
                      {ROLES.map(r => <th key={r.value} className="text-center text-gray-500 pb-3 font-medium px-2">{r.label.split(' ')[0]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map(mod => (
                      <tr key={mod.key} className="border-b border-gray-800">
                        <td className="py-2 text-gray-300">{mod.label}</td>
                        {ROLES.map(r => {
                          const perms = (ROLE_PERMISSIONS[r.value] as any)?.[mod.key] || []
                          return (
                            <td key={r.value} className="py-2 text-center px-2">
                              {perms.length > 0 ? (
                                <span className="text-green-400">
                                  {perms.includes('view') ? '👁' : ''}{perms.includes('edit') ? '✏️' : ''}{perms.includes('create') ? '➕' : ''}
                                </span>
                              ) : <span className="text-gray-700">—</span>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* TAB: ORGANIZACIÓN */}
        {activeTab === 'organizacion' && (
          <div className="space-y-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h2 className="text-white font-semibold mb-1">Usuarios de la organización</h2>
              <p className="text-gray-500 text-xs">{currentOrganization?.name} · Gestiona qué restaurantes puede ver cada usuario</p>
            </div>

            {loadingOrg ? (
              <div className="p-8 text-center text-gray-500 text-sm">Cargando...</div>
            ) : allOrgUsers.length === 0 ? (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500 text-sm">
                No hay usuarios en esta organización aún.
              </div>
            ) : (
              <div className="space-y-3">
                {allOrgUsers.map(user => (
                  <div key={user.user_id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-white text-sm font-medium">{user.email}</p>
                        <p className="text-gray-500 text-xs mt-0.5">
                          Acceso a {user.restaurants.filter((r: any) => r.active).length} de {allRestaurants.length} restaurantes
                        </p>
                      </div>
                      <button onClick={() => openManageUser(user)}
                        className="text-xs border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 px-3 py-1.5 rounded-lg transition">
                        Gestionar accesos
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {allRestaurants.map(rest => {
                        const access = user.restaurants.find((r: any) => r.restaurant_id === rest.id)
                        return (
                          <span key={rest.id} className={`text-xs px-2.5 py-1 rounded-full border ${
                            access?.active ? 'bg-green-950 border-green-800 text-green-300' :
                            access ? 'bg-gray-800 border-gray-700 text-gray-500' :
                            'bg-gray-900 border-gray-800 text-gray-700'
                          }`}>
                            {access?.active ? '✓ ' : access ? '○ ' : '— '}{rest.name}
                            {access && <span className="ml-1 opacity-60">· {access.role}</span>}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB: SUPERADMIN */}
        {activeTab === 'superadmin' && isSuperadmin && (
          <div className="space-y-6">
            <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-5">
              <p className="text-yellow-300 text-sm font-semibold">⚡ Modo Superadmin</p>
              <p className="text-yellow-400 text-xs mt-1">Puedes asignar usuarios existentes a cualquier organización y restaurante de la plataforma.</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Asignar usuario a organización</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 text-xs mb-1 block">Buscar usuario por email</label>
                  <div className="flex gap-2">
                    <input type="email" value={searchEmail} onChange={e => setSearchEmail(e.target.value)}
                      placeholder="email@ejemplo.com"
                      onKeyDown={e => e.key === 'Enter' && searchUserByEmail()}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                    <button onClick={searchUserByEmail} disabled={searchingUser || !searchEmail}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm transition">
                      {searchingUser ? 'Buscando...' : 'Buscar'}
                    </button>
                  </div>
                </div>

                {foundUser && (
                  <div className="bg-gray-800 rounded-xl p-4 space-y-3">
                    <p className="text-white text-sm font-medium">✓ Usuario encontrado: <span className="text-blue-400">{foundUser.email}</span></p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-gray-400 text-xs mb-1 block">Organización</label>
                        <select value={assignOrgId} onChange={async e => {
                          setAssignOrgId(e.target.value)
                          setAssignRestaurantId('')
                          // Load restaurants for this org
                          const { data } = await supabase.from('restaurants').select('id, name').eq('organization_id', e.target.value)
                          setAllRestaurants(data || [])
                        }}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                          <option value="">Seleccionar org...</option>
                          {allOrgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-gray-400 text-xs mb-1 block">Restaurante</label>
                        <select value={assignRestaurantId} onChange={e => setAssignRestaurantId(e.target.value)}
                          disabled={!assignOrgId}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50">
                          <option value="">Seleccionar restaurante...</option>
                          {allRestaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-gray-400 text-xs mb-1 block">Rol</label>
                        <select value={assignRole} onChange={e => setAssignRole(e.target.value)}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <button onClick={assignUserToOrg}
                      disabled={!assignOrgId || !assignRestaurantId}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                      Asignar acceso
                    </button>
                  </div>
                )}

                {searchEmail && !foundUser && !searchingUser && (
                  <p className="text-gray-500 text-sm">No se encontró ningún usuario con ese email. El usuario debe estar registrado primero.</p>
                )}
              </div>
            </div>

            {/* Vista de todas las orgs */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Todas las organizaciones</h2>
              <div className="space-y-2">
                {allOrgs.map(org => (
                  <div key={org.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                    <p className="text-white text-sm">{org.name}</p>
                    <span className="text-gray-500 text-xs font-mono">{org.id.substring(0, 8)}...</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal gestionar acceso a restaurantes */}
      {managingUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold">Acceso a restaurantes</h3>
                <p className="text-gray-500 text-xs mt-0.5">{managingUser.email} · {currentOrganization?.name}</p>
              </div>
              <button onClick={() => setManagingUser(null)} className="text-gray-500 hover:text-white text-xl">×</button>
            </div>
            <div className="px-6 py-4 space-y-3">
              {allRestaurants.map(rest => {
                const access = managingUser.restaurants.find((r: any) => r.restaurant_id === rest.id)
                return (
                  <div key={rest.id} className={`flex items-center justify-between p-4 rounded-xl border ${access?.active ? 'bg-gray-800 border-gray-700' : 'bg-gray-900 border-gray-800'}`}>
                    <div>
                      <p className="text-white text-sm font-medium">{rest.name}</p>
                      {access && (
                        <select value={access.role} onChange={e => updateRoleInRestaurant(access.id, e.target.value)}
                          className="mt-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none">
                          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      )}
                    </div>
                    <button
                      onClick={() => toggleUserRestaurant(managingUser.user_id, rest.id, currentOrganization!.id, access)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                        access?.active
                          ? 'border-red-800 text-red-400 hover:bg-red-950'
                          : 'border-green-800 text-green-400 hover:bg-green-950'
                      }`}>
                      {access?.active ? 'Quitar acceso' : 'Dar acceso'}
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="px-6 py-4 border-t border-gray-800">
              <button onClick={() => setManagingUser(null)} className="text-gray-400 hover:text-white text-sm transition">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal permisos custom */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold">Permisos personalizados</h3>
                <p className="text-gray-500 text-xs mt-0.5">{ROLES.find(r => r.value === editingUser.role)?.label} · {editingUser.email || editingUser.user_id}</p>
              </div>
              <button onClick={() => setEditingUser(null)} className="text-gray-500 hover:text-white text-xl">×</button>
            </div>
            <div className="px-6 py-4">
              <div className="flex items-center gap-3 mb-4 p-3 bg-gray-800 rounded-lg">
                <input type="checkbox" id="useCustom" checked={useCustomPerms}
                  onChange={e => setUseCustomPerms(e.target.checked)} className="rounded" />
                <label htmlFor="useCustom" className="text-gray-300 text-sm cursor-pointer">
                  Usar permisos personalizados para este usuario
                </label>
              </div>
              {useCustomPerms ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2 pb-2 border-b border-gray-800">
                    <p className="text-gray-500 text-xs font-medium">Módulo</p>
                    <p className="text-gray-500 text-xs font-medium text-center">Ver</p>
                    <p className="text-gray-500 text-xs font-medium text-center">Editar</p>
                    <p className="text-gray-500 text-xs font-medium text-center">Crear</p>
                  </div>
                  {MODULES.map(mod => (
                    <div key={mod.key} className="grid grid-cols-4 gap-2 items-center py-1.5 border-b border-gray-800">
                      <p className="text-gray-300 text-sm">{mod.label}</p>
                      {ACTIONS.map(action => (
                        <div key={action} className="flex justify-center">
                          <input type="checkbox"
                            checked={(customPerms[mod.key] || []).includes(action)}
                            onChange={() => togglePerm(mod.key, action)}
                            className="rounded cursor-pointer" />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <p className="text-gray-400 text-sm mb-3">Se usarán los permisos del rol <span className="text-white font-medium">{ROLES.find(r => r.value === editingUser.role)?.label}</span>:</p>
                  <div className="flex flex-wrap gap-2">
                    {MODULES.map(mod => {
                      const perms = (ROLE_PERMISSIONS[editingUser.role] as any)?.[mod.key] || []
                      if (!perms.length) return null
                      return (
                        <span key={mod.key} className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">
                          {mod.label}: {perms.join(', ')}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-white text-sm transition">Cancelar</button>
              <button onClick={() => saveCustomPermissions(editingUser.id)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                Guardar permisos
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}