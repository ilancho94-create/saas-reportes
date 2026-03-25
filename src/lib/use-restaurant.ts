import { useAuth } from '@/lib/auth-context'

export function useRestaurantId(): string {
  const { currentRestaurant } = useAuth()
  return currentRestaurant?.id || '00000000-0000-0000-0000-000000000001'
}