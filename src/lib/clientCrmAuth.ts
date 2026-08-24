import type { NextRequest } from 'next/server'
import { getAdminSessionIdentityFromRequest } from '@/lib/adminAuth'
import { getStaffAccountProfileById, type StaffAccount } from '@/lib/staffAccounts'
import { canAccessClientCrm } from '@/lib/clientCrmPolicy'

export type ClientCrmActor = StaffAccount & { role: 'owner' | 'manager' | 'agent' }

export async function getClientCrmActor(request: NextRequest): Promise<ClientCrmActor | null> {
  const identity = getAdminSessionIdentityFromRequest(request)
  if (!identity || !canAccessClientCrm(identity.role)) return null

  const account = await getStaffAccountProfileById(identity.id)
  if (!account?.active || account.username !== identity.username || account.role !== identity.role) return null
  if (!canAccessClientCrm(account.role)) return null
  if (account.role === 'agent' && !account.availabilityAssigneeId) return null
  return account as ClientCrmActor
}
export function actorCanAccessLead(actor: ClientCrmActor, assignedStaffId: string | null) {
  return actor.role === 'owner' || actor.role === 'manager' || assignedStaffId === actor.id
}
