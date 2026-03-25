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

interface AuthContextType {
  user: any
  loading: boolean
  currentRestaurant: UserRestaurant | null
  restaurants: UserRestaurant[]
  switchRestaurant: (restaurantId: string) => void
  can: (module: Module, action: Action) => boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  currentRestaurant: null,
  restaurants: [],
  switchRestaurant: () => {},
  can: () => false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [restaurants, setRestaurants] = useState<UserRestaurant[]>([])
  const [currentRestaurant, setCurrentRestaurant] = useState<UserRestaurant | null>(null)

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
    const { data } = await supabase
      .from('user_restaurants')
      .select(`
        id, role, custom_permissions,
        restaurant_id,
        restaurants(id, name, organization_id, organizations(name))
      `)
      .eq('user_id', userId)
      .eq('active', true)

    if (!data?.length) {
      const { data: profile } = await supabase
        .from('profiles').select('restaurant_id, role').eq('id', userId).single()
      if (profile?.restaurant_id) {
        const { data: rest } = await supabase
          .from('restaurants').select('id, name, organization_id, organizations(name)')
          .eq('id', profile.restaurant_id).single()
        if (rest) {
          const r: UserRestaurant = {
            id: rest.id, name: rest.name,
            organization_id: rest.organization_id,
            organization_name: (rest.organizations as any)?.name || '',
            role: profile.role || 'manager',
            custom_permissions: null,
          }
          setRestaurants([r])
          setCurrentRestaurant(r)
        }
      }
      setLoading(false)
      return
    }

    const mapped: UserRestaurant[] = data.map((ur: any) => ({
      id: ur.restaurants.id, name: ur.restaurants.name,
      organization_id: ur.restaurants.organization_id,
      organization_name: ur.restaurants.organizations?.name || '',
      role: ur.role,
      custom_permissions: ur.custom_permissions,
    }))

    setRestaurants(mapped)
    const savedId = typeof window !== 'undefined' ? localStorage.getItem('xray_restaurant_id') : null
    const saved = mapped.find(r => r.id === savedId)
    setCurrentRestaurant(saved || mapped[0])
    setLoading(false)
  }

  function switchRestaurant(restaurantId: string) {
    const r = restaurants.find(r => r.id === restaurantId)
    if (r) {
      setCurrentRestaurant(r)
      localStorage.setItem('xray_restaurant_id', restaurantId)
    }
  }

  function canDo(module: Module, action: Action): boolean {
    if (!currentRestaurant) return false
    return can(currentRestaurant.role, module, action, currentRestaurant.custom_permissions)
  }

  return (
    <AuthContext.Provider value={{ user, loading, currentRestaurant, restaurants, switchRestaurant, can: canDo }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}