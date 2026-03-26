'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'

type SATab = 'orgs' | 'restaurants' | 'users' | 'reports'

export default function SuperAdminPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<SATab>('orgs')

  // Data
  const [orgs, setOrgs] = useState<any[]>([])
  const [restaurants, setRestaurants] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])

  // Forms
  const [newOrg, setNewOrg] = useState({ name: '', slug: '' })
  const [newRest, setNewRest] = useState({ name: '', org_id: '' })
  const [savingOrg, setSavingOrg] = useState(false)
  const [savingRest, setSavingRest] = useState(false)
  const [formMsg, setFormMsg] = useState('')

  // User management
  const [userSearch, setUserSearch] = useState('')
  const [foundUser, setFoundUser] = useState<any>(null)
  const [searchingUser, setSearchingUser] = useState(false)
  const [assignOrg, setAssignOrg] = useState('')
  const [assignRest, setAssignRest] = useState('')
  const [assignRole, setAssignRole] = useState('manager')
  const [assigningUser, setAssigningUser] = useState(false)
  const [assignMsg, setAssignMsg] = useState('')

  // New user
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserOrg, setNewUserOrg] = useState('')
  const [newUserRest, setNewUserRest] = useState('')
  const [newUserRole, setNewUserRole] = useState('manager')
  const [creatingUser, setCreatingUser] = useState(false)
  const [createUserMsg, setCreateUserMsg] = useState('')

  useEffect(() => {
    checkSuperAdmin()
  }, [user])

  async function checkSuperAdmin() {
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('is_superadmin').eq('id', user.id).single()
    if (!profile?.is_superadmin) { router.push('/dashboard'); return }
    loadAll()
  }

  async function loadAll() {
    setLoading(true)
    const [orgsRes, restsRes, usersRes, reportsRes] = await Promise.all([
      supabase.from('organizations').select('*').order('name'),
      supabase.from('restaurants').select('*, organizations(name)').order('name'),
      supabase.from('profiles').select('*, user_restaurants(restaurant_id, role, restaurants(name))').limit(100),
      supabase.from('reports').select('*, restaurants(name)').order('created_at', { ascending: false }).limit(50),
    ])
    setOrgs(orgsRes.data || [])
    setRestaurants(restsRes.data || [])
    setUsers(usersRes.data || [])
    setReports(reportsRes.data || [])
    setLoading(false)
  }

  async function createOrg() {
    if (!newOrg.name) return
    setSavingOrg(true); setFormMsg('')
    const { error } = await supabase.from('organizations').insert({ name: newOrg.name, slug: newOrg.slug || newOrg.name.toLowerCase().replace(/\s+/g, '-') })
    if (error) { setFormMsg('❌ ' + error.message) }
    else { setFormMsg('✅ Organización creada'); setNewOrg({ name: '', slug: '' }); loadAll() }
    setSavingOrg(false)
  }

  async function archiveOrg(id: string, archived: boolean) {
    await supabase.from('organizations').update({ archived: !archived }).eq('id', id)
    loadAll()
  }

  async function createRestaurant() {
    if (!newRest.name || !newRest.org_id) return
    setSavingRest(true); setFormMsg('')
    const { error } = await supabase.from('restaurants').insert({ name: newRest.name, organization_id: newRest.org_id })
    if (error) { setFormMsg('❌ ' + error.message) }
    else { setFormMsg('✅ Restaurante creado'); setNewRest({ name: '', org_id: '' }); loadAll() }
    setSavingRest(false)
  }

  async function searchUser() {
    if (!userSearch) return
    setSearchingUser(true); setFoundUser(null); setAssignMsg('')
    const { data } = await supabase.from('profiles').select('*, user_restaurants(*, restaurants(name, organizations(name)))').eq('email', userSearch.trim()).single()
    setFoundUser(data || null)
    if (!data) setAssignMsg('❌ Usuario no encontrado')
    setSearchingUser(false)
  }

  async function assignUserToRestaurant() {
    if (!foundUser || !assignRest || !assignRole) return
    setAssigningUser(true); setAssignMsg('')
    const { error } = await supabase.from('user_restaurants').upsert({
      user_id: foundUser.id, restaurant_id: assignRest, role: assignRole,
      organization_id: assignOrg,
    }, { onConflict: 'user_id,restaurant_id' })
    if (error) { setAssignMsg('❌ ' + error.message) }
    else { setAssignMsg('✅ Acceso asignado correctamente'); loadAll() }
    setAssigningUser(false)
  }

  async function removeUserFromRestaurant(userId: string, restaurantId: string) {
    await supabase.from('user_restaurants').delete().eq('user_id', userId).eq('restaurant_id', restaurantId)
    loadAll()
    if (foundUser?.id === userId) searchUser()
  }

  async function createNewUser() {
    if (!newUserEmail || !newUserPassword || !newUserRest) return
    setCreatingUser(true); setCreateUserMsg('')
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newUserEmail, password: newUserPassword, restaurant_id: newUserRest, organization_id: newUserOrg, role: newUserRole }),
      })
      const data = await res.json()
      if (data.success) {
        setCreateUserMsg('✅ Usuario creado correctamente')
        setNewUserEmail(''); setNewUserPassword(''); setNewUserOrg(''); setNewUserRest(''); setNewUserRole('manager')
        loadAll()
      } else {
        setCreateUserMsg('❌ ' + (data.error || 'Error al crear usuario'))
      }
    } catch { setCreateUserMsg('❌ Error de conexión') }
    setCreatingUser(false)
  }

  const tabs: { id: SATab; label: string }[] = [
    { id: 'orgs', label: '🏢 Organizaciones' },
    { id: 'restaurants', label: '🍽️ Restaurantes' },
    { id: 'users', label: '👥 Usuarios' },
    { id: 'reports', label: '📊 Reportes' },
  ]

  const ROLES = ['admin', 'owner', 'gm', 'manager', 'chef', 'supervisor']

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando Super Admin...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-amber-900 bg-gray-900 px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-600 flex items-center justify-center text-white font-bold text-sm">⚡</div>
          <div>
            <h1 className="text-white font-bold text-lg">Super Admin</h1>
            <p className="text-amber-500 text-xs">Control total de la plataforma · {user?.email}</p>
          </div>
        </div>
        <div className="flex gap-1 flex-wrap">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${activeTab === tab.id ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* ══ ORGANIZACIONES ══ */}
        {activeTab === 'orgs' && (
          <>
            {/* Crear org */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">➕ Nueva organización</h2>
              <div className="flex gap-3 flex-wrap">
                <input type="text" placeholder="Nombre (ej. Grupo Mercurio)" value={newOrg.name}
                  onChange={e => setNewOrg(p => ({ ...p, name: e.target.value }))}
                  className="flex-1 min-w-48 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
                <input type="text" placeholder="Slug (opcional, auto-generado)" value={newOrg.slug}
                  onChange={e => setNewOrg(p => ({ ...p, slug: e.target.value }))}
                  className="flex-1 min-w-48 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
                <button onClick={createOrg} disabled={savingOrg || !newOrg.name}
                  className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition">
                  {savingOrg ? 'Creando...' : 'Crear'}
                </button>
              </div>
              {formMsg && <p className={`text-xs mt-2 ${formMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{formMsg}</p>}
            </div>

            {/* Lista de orgs */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="text-white font-semibold">Organizaciones ({orgs.length})</h2>
              </div>
              <div className="divide-y divide-gray-800">
                {orgs.map(org => {
                  const orgRests = restaurants.filter(r => r.organization_id === org.id)
                  return (
                    <div key={org.id} className="px-6 py-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-white font-medium">{org.name}</p>
                          {org.archived && <span className="text-xs bg-red-900 text-red-400 px-2 py-0.5 rounded-full">Archivada</span>}
                        </div>
                        <p className="text-gray-500 text-xs mt-0.5">{org.slug} · {orgRests.length} restaurante{orgRests.length !== 1 ? 's' : ''}</p>
                        {orgRests.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {orgRests.map(r => <span key={r.id} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{r.name}</span>)}
                          </div>
                        )}
                      </div>
                      <button onClick={() => archiveOrg(org.id, org.archived)}
                        className={`text-xs px-3 py-1.5 rounded-lg transition ${org.archived ? 'bg-green-900 text-green-400 hover:bg-green-800' : 'bg-gray-800 text-gray-400 hover:bg-red-950 hover:text-red-400'}`}>
                        {org.archived ? 'Restaurar' : 'Archivar'}
                      </button>
                    </div>
                  )
                })}
                {orgs.length === 0 && <p className="px-6 py-4 text-gray-500 text-sm">No hay organizaciones</p>}
              </div>
            </div>
          </>
        )}

        {/* ══ RESTAURANTES ══ */}
        {activeTab === 'restaurants' && (
          <>
            {/* Crear restaurante */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">➕ Nuevo restaurante / sucursal</h2>
              <div className="flex gap-3 flex-wrap">
                <input type="text" placeholder="Nombre del restaurante" value={newRest.name}
                  onChange={e => setNewRest(p => ({ ...p, name: e.target.value }))}
                  className="flex-1 min-w-48 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
                <select value={newRest.org_id} onChange={e => setNewRest(p => ({ ...p, org_id: e.target.value }))}
                  className="flex-1 min-w-48 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                  <option value="">— Seleccionar organización —</option>
                  {orgs.filter(o => !o.archived).map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
                <button onClick={createRestaurant} disabled={savingRest || !newRest.name || !newRest.org_id}
                  className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition">
                  {savingRest ? 'Creando...' : 'Crear'}
                </button>
              </div>
              {formMsg && <p className={`text-xs mt-2 ${formMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{formMsg}</p>}
            </div>

            {/* Lista de restaurantes */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="text-white font-semibold">Restaurantes ({restaurants.length})</h2>
              </div>
              <div className="divide-y divide-gray-800">
                {restaurants.map(rest => (
                  <div key={rest.id} className="px-6 py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{rest.name}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{rest.organizations?.name || '—'} · ID: {rest.id.substring(0, 8)}...</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded font-mono">{rest.id.substring(0, 8)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {restaurants.length === 0 && <p className="px-6 py-4 text-gray-500 text-sm">No hay restaurantes</p>}
              </div>
            </div>
          </>
        )}

        {/* ══ USUARIOS ══ */}
        {activeTab === 'users' && (
          <>
            {/* Crear nuevo usuario */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">➕ Crear nuevo usuario</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <input type="email" placeholder="Email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
                <input type="password" placeholder="Contraseña (mín. 6 caracteres)" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
                <select value={newUserOrg} onChange={e => { setNewUserOrg(e.target.value); setNewUserRest('') }}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                  <option value="">— Organización —</option>
                  {orgs.filter(o => !o.archived).map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
                <select value={newUserRest} onChange={e => setNewUserRest(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                  <option value="">— Restaurante —</option>
                  {restaurants.filter(r => !newUserOrg || r.organization_id === newUserOrg).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
                <button onClick={createNewUser} disabled={creatingUser || !newUserEmail || !newUserPassword || !newUserRest}
                  className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition">
                  {creatingUser ? 'Creando...' : '+ Crear usuario'}
                </button>
              </div>
              {createUserMsg && <p className={`text-xs ${createUserMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{createUserMsg}</p>}
            </div>

            {/* Buscar y gestionar usuario existente */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">🔍 Gestionar usuario existente</h2>
              <div className="flex gap-3 mb-4">
                <input type="email" placeholder="Email del usuario" value={userSearch} onChange={e => setUserSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchUser()}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
                <button onClick={searchUser} disabled={searchingUser}
                  className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition">
                  {searchingUser ? 'Buscando...' : 'Buscar'}
                </button>
              </div>

              {assignMsg && !foundUser && <p className="text-red-400 text-xs mb-3">{assignMsg}</p>}

              {foundUser && (
                <div className="space-y-4">
                  {/* Info del usuario */}
                  <div className="bg-gray-800 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
                        {foundUser.email?.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-white font-medium text-sm">{foundUser.email}</p>
                        <p className="text-gray-500 text-xs">{foundUser.id}</p>
                      </div>
                    </div>
                    {/* Accesos actuales */}
                    {foundUser.user_restaurants?.length > 0 && (
                      <div>
                        <p className="text-gray-500 text-xs mb-2">Accesos actuales:</p>
                        <div className="space-y-1">
                          {foundUser.user_restaurants.map((ur: any) => (
                            <div key={ur.restaurant_id} className="flex items-center justify-between bg-gray-700 rounded-lg px-3 py-2">
                              <div>
                                <p className="text-gray-300 text-sm">{ur.restaurants?.name}</p>
                                <p className="text-gray-500 text-xs">{ur.restaurants?.organizations?.name} · {ur.role}</p>
                              </div>
                              <button onClick={() => removeUserFromRestaurant(foundUser.id, ur.restaurant_id)}
                                className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-950 transition">
                                Eliminar
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Asignar nuevo acceso */}
                  <div>
                    <p className="text-gray-400 text-xs font-semibold mb-2">Asignar nuevo acceso:</p>
                    <div className="flex gap-3 flex-wrap">
                      <select value={assignOrg} onChange={e => { setAssignOrg(e.target.value); setAssignRest('') }}
                        className="flex-1 min-w-40 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                        <option value="">— Organización —</option>
                        {orgs.filter(o => !o.archived).map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                      </select>
                      <select value={assignRest} onChange={e => setAssignRest(e.target.value)}
                        className="flex-1 min-w-40 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                        <option value="">— Restaurante —</option>
                        {restaurants.filter(r => !assignOrg || r.organization_id === assignOrg).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      <select value={assignRole} onChange={e => setAssignRole(e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
                        {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                      </select>
                      <button onClick={assignUserToRestaurant} disabled={assigningUser || !assignRest}
                        className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition">
                        {assigningUser ? 'Asignando...' : 'Asignar acceso'}
                      </button>
                    </div>
                    {assignMsg && <p className={`text-xs mt-2 ${assignMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{assignMsg}</p>}
                  </div>
                </div>
              )}
            </div>

            {/* Lista todos los usuarios */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="text-white font-semibold">Todos los usuarios ({users.length})</h2>
              </div>
              <div className="divide-y divide-gray-800">
                {users.map(u => (
                  <div key={u.id} className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-white text-sm font-medium">{u.email}</p>
                        {u.is_superadmin && <span className="text-xs bg-amber-900 text-amber-400 px-2 py-0.5 rounded-full">⚡ Superadmin</span>}
                      </div>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {(u.user_restaurants || []).map((ur: any) => (
                          <span key={ur.restaurant_id} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">
                            {ur.restaurants?.name} · {ur.role}
                          </span>
                        ))}
                        {(!u.user_restaurants || u.user_restaurants.length === 0) && (
                          <span className="text-xs text-gray-600">Sin restaurantes asignados</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ══ REPORTES ══ */}
        {activeTab === 'reports' && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-800">
              <h2 className="text-white font-semibold">Reportes recientes ({reports.length})</h2>
              <p className="text-gray-500 text-xs mt-0.5">Últimos 50 reportes subidos en la plataforma</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    {['Semana', 'Restaurante', 'Fecha subida', 'ID'].map((h, i) => (
                      <th key={i} className="text-left text-gray-500 text-xs pb-3 font-medium px-6 pt-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reports.map(r => (
                    <tr key={r.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="px-6 py-3 text-white font-medium">{r.week}</td>
                      <td className="px-6 py-3 text-gray-400">{r.restaurants?.name || '—'}</td>
                      <td className="px-6 py-3 text-gray-500 text-xs">{new Date(r.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                      <td className="px-6 py-3 text-gray-600 text-xs font-mono">{r.id.substring(0, 8)}...</td>
                    </tr>
                  ))}
                  {reports.length === 0 && (
                    <tr><td colSpan={4} className="px-6 py-4 text-gray-500 text-sm">No hay reportes</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}