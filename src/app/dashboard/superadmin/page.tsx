'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'

type SATab = 'orgs' | 'restaurants' | 'users' | 'reports'

const ROLES = [
  { value: 'owner', label: 'Owner / Dueño' },
  { value: 'gm', label: 'General Manager' },
  { value: 'manager', label: 'Manager' },
  { value: 'chef', label: 'Chef / Jefe de Cocina' },
  { value: 'supervisor', label: 'Supervisor' },
]

export default function SuperAdminPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<SATab>('orgs')
  const [status, setStatus] = useState('')

  const [orgs, setOrgs] = useState<any[]>([])
  const [restaurants, setRestaurants] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])

  const [newOrg, setNewOrg] = useState({ name: '', slug: '' })
  const [newRest, setNewRest] = useState({ name: '', org_id: '' })
  const [savingOrg, setSavingOrg] = useState(false)
  const [savingRest, setSavingRest] = useState(false)
  const [formMsg, setFormMsg] = useState('')

  const [editingOrgId, setEditingOrgId] = useState<string | null>(null)
  const [editOrgName, setEditOrgName] = useState('')
  const [editOrgSlug, setEditOrgSlug] = useState('')
  const [savingEditOrg, setSavingEditOrg] = useState(false)

  const [editingRestId, setEditingRestId] = useState<string | null>(null)
  const [editRestName, setEditRestName] = useState('')
  const [editRestOrgId, setEditRestOrgId] = useState('')
  const [savingEditRest, setSavingEditRest] = useState(false)

  useEffect(() => { checkSuperAdmin() }, [user])

  async function checkSuperAdmin() {
    if (!user) return
    const { data: profile } = await supabase.from('profiles').select('is_superadmin').eq('id', user.id).single()
    if (!profile?.is_superadmin) { router.push('/dashboard'); return }
    loadAll()
  }

  async function loadAll() {
    setLoading(true)
    const [orgsRes, restsRes, reportsRes] = await Promise.all([
      supabase.from('organizations').select('*').order('name'),
      supabase.from('restaurants').select('*, organizations(name)').order('name'),
      supabase.from('reports').select('*, restaurants(name)').order('created_at', { ascending: false }).limit(50),
    ])
    setOrgs(orgsRes.data || [])
    setRestaurants(restsRes.data || [])
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

  async function saveEditOrg(id: string) {
    if (!editOrgName) return
    setSavingEditOrg(true)
    const { error } = await supabase.from('organizations').update({ name: editOrgName, slug: editOrgSlug || editOrgName.toLowerCase().replace(/\s+/g, '-') }).eq('id', id)
    if (!error) { setEditingOrgId(null); loadAll() }
    setSavingEditOrg(false)
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

  async function saveEditRest(id: string) {
    if (!editRestName || !editRestOrgId) return
    setSavingEditRest(true)
    const { error } = await supabase.from('restaurants').update({ name: editRestName, organization_id: editRestOrgId }).eq('id', id)
    if (!error) { setEditingRestId(null); loadAll() }
    setSavingEditRest(false)
  }

  const tabs: { id: SATab; label: string }[] = [
    { id: 'orgs', label: '🏢 Organizaciones' },
    { id: 'restaurants', label: '🍽️ Restaurantes' },
    { id: 'users', label: '👥 Usuarios' },
    { id: 'reports', label: '📊 Reportes' },
  ]

  const inputCls = 'bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500'

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center"><p className="text-gray-400">Cargando Super Admin...</p></div>

  return (
    <div className="min-h-screen bg-gray-950">
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
        {status && <div className="bg-green-950 border border-green-800 text-green-400 px-4 py-3 rounded-lg text-sm">{status}</div>}

        {/* ══ ORGANIZACIONES ══ */}
        {activeTab === 'orgs' && (
          <>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">➕ Nueva organización</h2>
              <div className="flex gap-3 flex-wrap">
                <input type="text" placeholder="Nombre (ej. Grupo Mercurio)" value={newOrg.name}
                  onChange={e => setNewOrg(p => ({ ...p, name: e.target.value }))}
                  className={`flex-1 min-w-48 ${inputCls}`} />
                <input type="text" placeholder="Slug (opcional)" value={newOrg.slug}
                  onChange={e => setNewOrg(p => ({ ...p, slug: e.target.value }))}
                  className={`flex-1 min-w-48 ${inputCls}`} />
                <button onClick={createOrg} disabled={savingOrg || !newOrg.name}
                  className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition">
                  {savingOrg ? 'Creando...' : 'Crear'}
                </button>
              </div>
              {formMsg && <p className={`text-xs mt-2 ${formMsg.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{formMsg}</p>}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="text-white font-semibold">Organizaciones ({orgs.length})</h2>
              </div>
              <div className="divide-y divide-gray-800">
                {orgs.map(org => {
                  const orgRests = restaurants.filter(r => r.organization_id === org.id)
                  const isEditing = editingOrgId === org.id
                  return (
                    <div key={org.id} className="px-6 py-4">
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="flex gap-3 flex-wrap">
                            <input type="text" value={editOrgName} onChange={e => setEditOrgName(e.target.value)}
                              placeholder="Nombre" className={`flex-1 min-w-48 ${inputCls}`} />
                            <input type="text" value={editOrgSlug} onChange={e => setEditOrgSlug(e.target.value)}
                              placeholder="Slug (opcional)" className={`flex-1 min-w-48 ${inputCls}`} />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => saveEditOrg(org.id)} disabled={savingEditOrg || !editOrgName}
                              className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition">
                              {savingEditOrg ? 'Guardando...' : '✓ Guardar'}
                            </button>
                            <button onClick={() => setEditingOrgId(null)}
                              className="bg-gray-800 hover:bg-gray-700 text-gray-400 px-4 py-1.5 rounded-lg text-sm transition">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
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
                          <div className="flex gap-2">
                            <button onClick={() => { setEditingOrgId(org.id); setEditOrgName(org.name); setEditOrgSlug(org.slug || '') }}
                              className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition">
                              ✏️ Editar
                            </button>
                            <button onClick={() => archiveOrg(org.id, org.archived)}
                              className={`text-xs px-3 py-1.5 rounded-lg transition ${org.archived ? 'bg-green-900 text-green-400 hover:bg-green-800' : 'bg-gray-800 text-gray-400 hover:bg-red-950 hover:text-red-400'}`}>
                              {org.archived ? 'Restaurar' : 'Archivar'}
                            </button>
                          </div>
                        </div>
                      )}
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
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">➕ Nuevo restaurante / sucursal</h2>
              <div className="flex gap-3 flex-wrap">
                <input type="text" placeholder="Nombre del restaurante" value={newRest.name}
                  onChange={e => setNewRest(p => ({ ...p, name: e.target.value }))}
                  className={`flex-1 min-w-48 ${inputCls}`} />
                <select value={newRest.org_id} onChange={e => setNewRest(p => ({ ...p, org_id: e.target.value }))}
                  className={`flex-1 min-w-48 ${inputCls}`}>
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

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800">
                <h2 className="text-white font-semibold">Restaurantes ({restaurants.length})</h2>
              </div>
              <div className="divide-y divide-gray-800">
                {restaurants.map(rest => {
                  const isEditing = editingRestId === rest.id
                  return (
                    <div key={rest.id} className="px-6 py-4">
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="flex gap-3 flex-wrap">
                            <input type="text" value={editRestName} onChange={e => setEditRestName(e.target.value)}
                              placeholder="Nombre" className={`flex-1 min-w-48 ${inputCls}`} />
                            <select value={editRestOrgId} onChange={e => setEditRestOrgId(e.target.value)}
                              className={`flex-1 min-w-48 ${inputCls}`}>
                              <option value="">— Organización —</option>
                              {orgs.filter(o => !o.archived).map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => saveEditRest(rest.id)} disabled={savingEditRest || !editRestName || !editRestOrgId}
                              className="bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition">
                              {savingEditRest ? 'Guardando...' : '✓ Guardar'}
                            </button>
                            <button onClick={() => setEditingRestId(null)}
                              className="bg-gray-800 hover:bg-gray-700 text-gray-400 px-4 py-1.5 rounded-lg text-sm transition">
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-white font-medium">{rest.name}</p>
                            <p className="text-gray-500 text-xs mt-0.5">{rest.organizations?.name || '—'} · ID: {rest.id.substring(0, 8)}...</p>
                          </div>
                          <button onClick={() => { setEditingRestId(rest.id); setEditRestName(rest.name); setEditRestOrgId(rest.organization_id) }}
                            className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition">
                            ✏️ Editar
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
                {restaurants.length === 0 && <p className="px-6 py-4 text-gray-500 text-sm">No hay restaurantes</p>}
              </div>
            </div>
          </>
        )}

        {/* ══ USUARIOS ══ */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            <div className="bg-yellow-950 border border-yellow-800 rounded-xl p-5">
              <p className="text-yellow-300 text-sm font-semibold">⚡ Modo Superadmin</p>
              <p className="text-yellow-400 text-xs mt-1">Puedes crear y asignar usuarios a cualquier organización y restaurante de la plataforma.</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-1">Crear nuevo usuario</h2>
              <p className="text-gray-500 text-xs mb-4">El usuario podrá entrar inmediatamente con estas credenciales</p>
              <CreateUserForm allOrgs={orgs} onSuccess={(msg) => setStatus(msg)} />
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-4">Asignar usuario existente a organización</h2>
              <AssignUserForm allOrgs={orgs} onStatus={(msg) => setStatus(msg)} />
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-semibold mb-1">Gestionar accesos de un usuario</h2>
              <p className="text-gray-500 text-xs mb-4">Busca un usuario y ve/modifica todos sus accesos en la plataforma</p>
              <ManageUserAccess allOrgs={orgs} onStatus={(msg) => setStatus(msg)} />
            </div>
          </div>
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
                  {reports.length === 0 && <tr><td colSpan={4} className="px-6 py-4 text-gray-500 text-sm">No hay reportes</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ── Crear usuario ─────────────────────────────────────────────────────────────
function CreateUserForm({ allOrgs, onSuccess }: { allOrgs: any[], onSuccess: (msg: string) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgId, setOrgId] = useState('')
  const [restaurantId, setRestaurantId] = useState('')
  const [role, setRole] = useState('manager')
  const [restaurants, setRestaurants] = useState<any[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  async function loadRestaurants(orgId: string) {
    const { data } = await supabase.from('restaurants').select('id, name').eq('organization_id', orgId)
    setRestaurants(data || [])
    setRestaurantId('')
  }

  async function handleCreate() {
    if (!email || !password || !orgId || !restaurantId) { setError('Completa todos los campos'); return }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    setCreating(true); setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, organizationId: orgId, restaurantId, role, requesterId: user?.id }),
    })
    const result = await res.json()
    setCreating(false)
    if (result.error) { setError(result.error) }
    else {
      onSuccess('✅ Usuario creado exitosamente — ya puede iniciar sesión')
      setEmail(''); setPassword(''); setOrgId(''); setRestaurantId(''); setRestaurants([])
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@ejemplo.com"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
        </div>
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Contraseña</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Organización</label>
          <select value={orgId} onChange={e => { setOrgId(e.target.value); loadRestaurants(e.target.value) }}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
            <option value="">Seleccionar...</option>
            {allOrgs.filter(o => !o.archived).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Restaurante</label>
          <select value={restaurantId} onChange={e => setRestaurantId(e.target.value)} disabled={!orgId}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500 disabled:opacity-50">
            <option value="">Seleccionar...</option>
            {restaurants.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-gray-400 text-xs mb-1 block">Rol</label>
          <select value={role} onChange={e => setRole(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500">
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button onClick={handleCreate} disabled={creating}
        className="bg-green-600 hover:bg-green-700 disabled:bg-gray-800 disabled:text-gray-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition">
        {creating ? 'Creando usuario...' : '+ Crear usuario'}
      </button>
    </div>
  )
}

// ── Asignar usuario existente ─────────────────────────────────────────────────
function AssignUserForm({ allOrgs, onStatus }: { allOrgs: any[], onStatus: (msg: string) => void }) {
  const [searchEmail, setSearchEmail] = useState('')
  const [foundUser, setFoundUser] = useState<any>(null)
  const [searching, setSearching] = useState(false)
  const [assignOrgId, setAssignOrgId] = useState('')
  const [assignRestaurantId, setAssignRestaurantId] = useState('')
  const [assignRole, setAssignRole] = useState('manager')
  const [allRestaurants, setAllRestaurants] = useState<any[]>([])

  async function searchUserByEmail() {
    if (!searchEmail) return
    setSearching(true); setFoundUser(null)
    const { data } = await supabase.rpc('find_user_by_email', { p_email: searchEmail }).single()
    if (data) { setFoundUser(data) }
    else {
      for (const org of allOrgs) {
        const { data: rests } = await supabase.from('restaurants').select('id').eq('organization_id', org.id)
        for (const rest of rests || []) {
          const { data: users } = await supabase.rpc('get_users_with_email', { p_restaurant_id: rest.id })
          const match = (users || []).find((u: any) => u.email === searchEmail)
          if (match) { setFoundUser(match); setSearching(false); return }
        }
      }
    }
    setSearching(false)
  }

  async function assignUserToOrg() {
    if (!foundUser || !assignOrgId || !assignRestaurantId) return
    const { error } = await supabase.from('user_restaurants').upsert({
      user_id: foundUser.user_id, restaurant_id: assignRestaurantId,
      organization_id: assignOrgId, role: assignRole, active: true,
    }, { onConflict: 'user_id,restaurant_id' })
    if (!error) {
      onStatus('✅ Usuario asignado a la organización')
      setFoundUser(null); setSearchEmail('')
      setTimeout(() => onStatus(''), 3000)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-gray-400 text-xs mb-1 block">Buscar usuario por email</label>
        <div className="flex gap-2">
          <input type="email" value={searchEmail} onChange={e => setSearchEmail(e.target.value)}
            placeholder="email@ejemplo.com" onKeyDown={e => e.key === 'Enter' && searchUserByEmail()}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
          <button onClick={searchUserByEmail} disabled={searching || !searchEmail}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm transition">
            {searching ? 'Buscando...' : 'Buscar'}
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
                setAssignOrgId(e.target.value); setAssignRestaurantId('')
                const { data } = await supabase.from('restaurants').select('id, name').eq('organization_id', e.target.value)
                setAllRestaurants(data || [])
              }} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="">Seleccionar org...</option>
                {allOrgs.filter(o => !o.archived).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Restaurante</label>
              <select value={assignRestaurantId} onChange={e => setAssignRestaurantId(e.target.value)} disabled={!assignOrgId}
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
          <button onClick={assignUserToOrg} disabled={!assignOrgId || !assignRestaurantId}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            Asignar acceso
          </button>
        </div>
      )}
      {searchEmail && !foundUser && !searching && (
        <p className="text-gray-500 text-sm">No se encontró ningún usuario con ese email.</p>
      )}
    </div>
  )
}

// ── Gestionar accesos ─────────────────────────────────────────────────────────
function ManageUserAccess({ allOrgs, onStatus }: { allOrgs: any[], onStatus: (msg: string) => void }) {
  const [searchEmail, setSearchEmail] = useState('')
  const [searching, setSearching] = useState(false)
  const [userData, setUserData] = useState<any>(null)
  const [userAccess, setUserAccess] = useState<any[]>([])

  async function searchUser() {
    if (!searchEmail) return
    setSearching(true); setUserData(null); setUserAccess([])
    const { data: found } = await supabase.rpc('find_user_by_email', { p_email: searchEmail }).single()
    if (!found) {
      for (const org of allOrgs) {
        const { data: rests } = await supabase.from('restaurants').select('id').eq('organization_id', org.id)
        for (const rest of rests || []) {
          const { data: users } = await supabase.rpc('get_users_with_email', { p_restaurant_id: rest.id })
          const match = (users || []).find((u: any) => u.email === searchEmail)
          if (match) { await loadUserAccess(match.user_id, match.email); setSearching(false); return }
        }
      }
      setSearching(false); return
    }
    await loadUserAccess((found as any).user_id, (found as any).email)
    setSearching(false)
  }

  async function loadUserAccess(userId: string, email: string) {
    setUserData({ user_id: userId, email })
    const { data: access } = await supabase.from('user_restaurants')
      .select('id, role, active, restaurant_id, organization_id').eq('user_id', userId)
    const enriched = await Promise.all((access || []).map(async (ur: any) => {
      const { data: rest } = await supabase.from('restaurants').select('name').eq('id', ur.restaurant_id).single()
      const org = allOrgs.find(o => o.id === ur.organization_id)
      return { ...ur, restaurant_name: rest?.name || ur.restaurant_id, org_name: org?.name || ur.organization_id }
    }))
    setUserAccess(enriched)
  }

  async function toggleAccess(urId: string, active: boolean) {
    await supabase.from('user_restaurants').update({ active: !active }).eq('id', urId)
    setUserAccess(prev => prev.map(ur => ur.id === urId ? { ...ur, active: !active } : ur))
    onStatus(active ? '✅ Acceso desactivado' : '✅ Acceso activado')
    setTimeout(() => onStatus(''), 2000)
  }

  async function removeAccess(urId: string) {
    if (!confirm('¿Eliminar completamente este acceso?')) return
    await supabase.from('user_restaurants').delete().eq('id', urId)
    setUserAccess(prev => prev.filter(ur => ur.id !== urId))
    onStatus('✅ Acceso eliminado'); setTimeout(() => onStatus(''), 2000)
  }

  async function updateRole(urId: string, newRole: string) {
    await supabase.from('user_restaurants').update({ role: newRole }).eq('id', urId)
    setUserAccess(prev => prev.map(ur => ur.id === urId ? { ...ur, role: newRole } : ur))
    onStatus('✅ Rol actualizado'); setTimeout(() => onStatus(''), 2000)
  }

  const byOrg: Record<string, any[]> = {}
  userAccess.forEach(ur => { if (!byOrg[ur.org_name]) byOrg[ur.org_name] = []; byOrg[ur.org_name].push(ur) })

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input type="email" value={searchEmail} onChange={e => setSearchEmail(e.target.value)}
          placeholder="email@ejemplo.com" onKeyDown={e => e.key === 'Enter' && searchUser()}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500" />
        <button onClick={searchUser} disabled={searching || !searchEmail}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm transition">
          {searching ? 'Buscando...' : 'Buscar'}
        </button>
      </div>
      {userData && userAccess.length === 0 && <p className="text-gray-500 text-sm">Este usuario no tiene acceso a ningún restaurante.</p>}
      {userData && userAccess.length > 0 && (
        <div className="space-y-4">
          <p className="text-white text-sm font-medium">{userData.email} — <span className="text-gray-400 font-normal">{userAccess.length} acceso{userAccess.length !== 1 ? 's' : ''}</span></p>
          {Object.entries(byOrg).map(([orgName, accesses]) => (
            <div key={orgName} className="bg-gray-800 rounded-xl p-4">
              <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">🏢 {orgName}</p>
              <div className="space-y-2">
                {accesses.map((ur: any) => (
                  <div key={ur.id} className={`flex items-center justify-between p-3 rounded-lg border ${ur.active ? 'border-gray-700' : 'border-gray-800 opacity-60'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full ${ur.active ? 'bg-green-400' : 'bg-gray-600'}`} />
                      <div>
                        <p className="text-white text-sm">{ur.restaurant_name}</p>
                        <select value={ur.role} onChange={e => updateRole(ur.id, e.target.value)}
                          className="mt-0.5 bg-gray-700 border border-gray-600 rounded px-2 py-0.5 text-xs text-gray-300 focus:outline-none">
                          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleAccess(ur.id, ur.active)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border transition ${ur.active ? 'border-yellow-800 text-yellow-400 hover:bg-yellow-950' : 'border-green-800 text-green-400 hover:bg-green-950'}`}>
                        {ur.active ? 'Desactivar' : 'Activar'}
                      </button>
                      <button onClick={() => removeAccess(ur.id)}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-red-900 text-red-400 hover:bg-red-950 transition">
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {searchEmail && !userData && !searching && <p className="text-gray-500 text-sm">No se encontró ningún usuario con ese email.</p>}
    </div>
  )
}