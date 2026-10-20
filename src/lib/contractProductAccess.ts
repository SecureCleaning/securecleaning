import type { AdminRole } from '@/lib/staffAccounts'

export function canAccessStateProduct(role: AdminRole, actorId: string, actorState: string | null, productState: string | null) {
  return role === 'owner' || role === 'manager' || (role === 'agent' && Boolean(actorId)
    && ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'].includes(actorState ?? '') && actorState === productState)
}
