import 'server-only'
import { getStaffAccountProfileById } from '@/lib/staffAccounts'
import type { AdminSessionIdentity } from '@/lib/adminAuth'

export async function getMenuSettingsActor(identity: AdminSessionIdentity | null) {
  if (!identity) return null
  const account = await getStaffAccountProfileById(identity.id)
  if (!account?.active || account.username !== identity.username || account.role !== identity.role) return null
  return account
}
