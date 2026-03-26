'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { can, Module, Action } from '@/lib/permissions'

interface UserRestaurant {
  id: string
  name: string
  organization_id: string
  organization_name: string
  role: string
  custom_permissions: any
}

interface Organization {
  id: string
  name: string
  restaurants: UserRestaurant[]
}

interface AuthContextType {
  user: any
  loading: boolean
  isSuperAdmin: boolean
  currentRestaurant: UserRestaurant | null
  currentOrganization: Organization | null
  restaurants: UserRestaurant[]
  organizations: Organization[]
  switchRestaurant: (restaurantId: string) => void
  switchOrganization: (orgId: string) => void
  can: (module: Module, action: Action) => boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isSuperAdmin: false,
  currentRestaurant: null,
  currentOrganization: null,
  restaurants: [],
  organizations: [],
  switchRestaurant: () => {},
  switchOrganization: () => {},
  can: () => false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [restaurants, setRestaurants] = useState<UserRestaurant[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [currentRestaurant, setCurrentRestaurant] = useState<UserRestaurant | null>(null)
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user)
        loadUserRestaurants(data.user.id)
      } else {
        setLoading(false)
      }
    })
  }, [])

  async function loadUserRestaurants(userId: string) {
    // Cargar perfil para obtener is_superadmin
    const { data: profile } = await supabase
      .from('profiles')
      .select('restaurant_id, role, is_superadmin')
      .eq('id', userId)
      .single()

    setIsSuperAdmin(profile?.is_superadmin === true)

    const { data } = await supabase
      .from('user_restaurants')
      .select(`
        id, role, custom_permissions,
        restaurant_id,
        restaurants(id, name, organization_id, organizations(id, name))
      `)
      .eq('user_id', userId)
      .eq('active', true)

    let mapped: UserRestaurant[] = []

    if (!data?.length) {
      if (profile?.restaurant_id) {
        const { data: rest } = await supabase
          .from('restaurants').select('id, name, organization_id, organizations(id, name)')
          .eq('id', profile.restaurant_id).single()
        if (rest) {
          mapped = [{
            id: rest.id, name: rest.name,
            organization_id: rest.organization_id,
            organization_name: (rest.organizations as any)?.name || '',
            role: profile.role || 'manager',
            custom_permissions: null,
          }]
        }
      }
    } else {
      mapped = data.map((ur: any) => ({
        id: ur.restaurants.id,
        name: ur.restaurants.name,
        organization_id: ur.restaurants.organization_id,
        organization_name: ur.restaurants.organizations?.name || '',
        role: ur.role,
        custom_permissions: ur.custom_permissions,
      }))
    }

    setRestaurants(mapped)

    const orgMap: Record<string, Organization> = {}
    mapped.forEach(r => {
      if (!orgMap[r.organization_id]) {
        orgMap[r.organization_id] = { id: r.organization_id, name: r.organization_name, restaurants: [] }
      }
      orgMap[r.organization_id].restaurants.push(r)
    })
    const orgs = Object.values(orgMap)
    setOrganizations(orgs)

    const savedRestId = typeof window !== 'undefined' ? localStorage.getItem('xray_restaurant_id') : null
    const savedRest = mapped.find(r => r.id === savedRestId)
    const activeRest = savedRest || mapped[0]
    setCurrentRestaurant(activeRest)

    if (activeRest) {
      const activeOrg = orgs.find(o => o.id === activeRest.organization_id) || orgs[0]
      setCurrentOrganization(activeOrg)
    }

    setLoading(false)
  }

  function switchRestaurant(restaurantId: string) {
    const r = restaurants.find(r => r.id === restaurantId)
    if (r) {
      setCurrentRestaurant(r)
      localStorage.setItem('xray_restaurant_id', restaurantId)
      const org = organizations.find(o => o.id === r.organization_id)
      if (org) setCurrentOrganization(org)
    }
  }

  function switchOrganization(orgId: string) {
    const org = organizations.find(o => o.id === orgId)
    if (org) {
      setCurrentOrganization(org)
      const firstRest = org.restaurants[0]
      if (firstRest) {
        setCurrentRestaurant(firstRest)
        localStorage.setItem('xray_restaurant_id', firstRest.id)
      }
    }
  }

  function canDo(module: Module, action: Action): boolean {
    if (!currentRestaurant) return false
    return can(currentRestaurant.role, module, action, currentRestaurant.custom_permissions)
  }

  return (
    <AuthContext.Provider value={{
      user, loading, isSuperAdmin,
      currentRestaurant, currentOrganization,
      restaurants, organizations,
      switchRestaurant, switchOrganization,
      can: canDo,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}