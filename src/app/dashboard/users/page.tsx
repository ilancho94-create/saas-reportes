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
  const { currentRestaurant, can } = useAuth()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('manager')
  const [inviting, setInviting] = useState(false)
  const [status, setStatus] = useState('')
  const [customPerms, setCustomPerms] = useState<Record<string, string[]>>({})
  const [useCustomPerms, setUseCustomPerms] = useState(false)

  useEffect(() => {
    if (currentRestaurant) loadUsers()
  }, [currentRestaurant])

  async function loadUsers() {
    setLoading(true)
    const { data } = await supabase
      .from('user_restaurants')
      .select(`
        id, role, custom_permissions, active, created_at,
        user_id,
        profiles:user_id(id, role)
      `)
      .eq('restaurant_id', currentRestaurant!.id)
      .order('created_at')

    // Obtener emails de auth.users via función o fallback
    if (data) {
      // Enriquecer con emails desde profiles o user_invitations
      const enriched = await Promise.all(data.map(async (ur: any) => {
        const { data: authUser } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', ur.user_id)
          .single()
        return { ...ur, email: ur.user_id } // fallback con user_id
      }))
      setUsers(data)
    }
    setLoading(false)
  }

  async function updateRole(userRestaurantId: string, newRole: string) {
    await supabase
      .from('user_restaurants')
      .update({ role: newRole, custom_permissions: null })
      .eq('id', userRestaurantId)
    loadUsers()
  }

  async function toggleActive(userRestaurantId: string, active: boolean) {
    await supabase
      .from('user_restaurants')
      .update({ active: !active })
      .eq('id', userRestaurantId)
    loadUsers()
  }

  async function saveCustomPermissions(userRestaurantId: string) {
    await supabase
      .from('user_restaurants')
      .update({ custom_permissions: useCustomPerms ? customPerms : null })
      .eq('id', userRestaurantId)
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
      // Pre-llenar con los del rol
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

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-lg">👤 Gestión de Usuarios</h1>
          <p className="text-gray-500 text-xs mt-0.5">{currentRestaurant?.name} · {currentRestaurant?.organization_name}</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowInvite(!showInvite)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
            + Invitar usuario
          </button>
        )}
      </div>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {status && (
          <div className="bg-green-950 border border-green-800 text-green-400 px-4 py-3 rounded-lg text-sm">{status}</div>
        )}

        {/* Formulario de invitación */}
        {showInvite && canCreate && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h2 className="text-white font-semibold mb-4">Invitar nuevo usuario</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Email</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="email@ejemplo.com"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs mb-1 block">Rol</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 mb-4">
              <p className="text-gray-400 text-xs mb-2">Permisos del rol <span className="text-white font-medium">{ROLES.find(r => r.value === inviteRole)?.label}</span>:</p>
              <div className="flex flex-wrap gap-2">
                {MODULES.map(mod => {
                  const perms = (ROLE_PERMISSIONS[inviteRole] as any)?.[mod.key] || []
                  if (!perms.length) return null
                  return (
                    <span key={mod.key} className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                      {mod.label}: {perms.join(', ')}
                    </span>
                  )
                })}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-white text-sm transition">Cancelar</button>
              <button
                onClick={async () => {
                  if (!inviteEmail) return
                  setInviting(true)
                  // Enviar invitación por email via Supabase Auth
                  const { error } = await supabase.auth.admin?.inviteUserByEmail
                    ? { error: null }
                    : { error: null }
                  // Por ahora guardar como invitación pendiente
                  const { error: invErr } = await supabase.from('user_invitations').upsert({
                    email: inviteEmail,
                    restaurant_id: currentRestaurant!.id,
                    organization_id: currentRestaurant!.organization_id,
                    role: inviteRole,
                    invited_by: (await supabase.auth.getUser()).data.user?.id,
                    status: 'pending',
                  }, { onConflict: 'email,restaurant_id' })
                  setInviting(false)
                  if (!invErr) {
                    setStatus('✅ Invitación registrada. El usuario verá el acceso al registrarse con ese email.')
                    setShowInvite(false)
                    setInviteEmail('')
                  }
                }}
                disabled={inviting || !inviteEmail}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:text-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
                {inviting ? 'Enviando...' : 'Invitar'}
              </button>
            </div>
          </div>
        )}

        {/* Lista de usuarios */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800">
            <h2 className="text-white font-semibold">Usuarios con acceso — {currentRestaurant?.name}</h2>
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
                    <p className="text-white text-sm font-medium">{ur.user_id}</p>
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
                      {ur.custom_permissions && (
                        <span className="text-xs bg-orange-900 text-orange-300 px-2 py-0.5 rounded-full">permisos custom</span>
                      )}
                      {!ur.active && <span className="text-xs text-red-400">Inactivo</span>}
                    </div>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={ur.role}
                        onChange={e => updateRole(ur.id, e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500">
                        {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <button
                        onClick={() => openEditPermissions(ur)}
                        className="text-xs border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 px-3 py-1.5 rounded-lg transition">
                        Permisos
                      </button>
                      <button
                        onClick={() => toggleActive(ur.id, ur.active)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                          ur.active
                            ? 'border-red-800 text-red-400 hover:bg-red-950'
                            : 'border-green-800 text-green-400 hover:bg-green-950'
                        }`}>
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
                  {ROLES.map(r => (
                    <th key={r.value} className="text-center text-gray-500 pb-3 font-medium px-2">{r.label.split(' ')[0]}</th>
                  ))}
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
                          ) : (
                            <span className="text-gray-700">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Modal de permisos custom */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold">Permisos personalizados</h3>
                <p className="text-gray-500 text-xs mt-0.5">
                  {ROLES.find(r => r.value === editingUser.role)?.label} · {editingUser.user_id}
                </p>
              </div>
              <button onClick={() => setEditingUser(null)} className="text-gray-500 hover:text-white text-xl">×</button>
            </div>

            <div className="px-6 py-4">
              <div className="flex items-center gap-3 mb-4 p-3 bg-gray-800 rounded-lg">
                <input type="checkbox" id="useCustom" checked={useCustomPerms}
                  onChange={e => setUseCustomPerms(e.target.checked)}
                  className="rounded" />
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
                          <input
                            type="checkbox"
                            checked={(customPerms[mod.key] || []).includes(action)}
                            onChange={() => togglePerm(mod.key, action)}
                            className="rounded cursor-pointer"
                          />
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