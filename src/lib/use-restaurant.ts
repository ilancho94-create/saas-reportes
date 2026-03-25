import { useAuth } from '@/lib/auth-context'

export function useRestaurantId(): string | null {
  const { currentRestaurant } = useAuth()
  return currentRestaurant?.id || null
}