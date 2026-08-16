import { getAvailabilityConfig } from '@/lib/availability'
import {
  createMigrationPassword,
  createStaffAccount,
  listStaffAccounts,
  normalizeStaffUsername,
  updateStaffAccount,
} from '@/lib/staffAccounts'

export async function migrateAvailabilityAgentsToStaffAccounts() {
  const [config, accounts] = await Promise.all([getAvailabilityConfig(), listStaffAccounts()])
  const migrated: Array<{ username: string; availabilityAssigneeId: string }> = []

  for (const assignee of config.assignees) {
    const username = normalizeStaffUsername(assignee.username || assignee.name)
    if (!username) continue

    const current = accounts.find((account) => (
      account.availabilityAssigneeId === assignee.id || (account.role !== 'owner' && account.username === username)
    ))

    if (current) {
      await updateStaffAccount({
        id: current.id,
        displayName: assignee.name,
        email: assignee.email ?? '',
        role: 'agent',
        active: assignee.active,
        availabilityAssigneeId: assignee.id,
      })
    } else {
      await createStaffAccount({
        username,
        displayName: assignee.name,
        email: assignee.email ?? '',
        role: 'agent',
        password: createMigrationPassword(),
        availabilityAssigneeId: assignee.id,
        legacyPasswordHash: assignee.accessCodeHash ?? null,
      })
    }

    migrated.push({ username, availabilityAssigneeId: assignee.id })
  }

  return migrated
}
