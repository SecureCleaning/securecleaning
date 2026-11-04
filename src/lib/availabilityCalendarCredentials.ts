import 'server-only'
import { randomBytes } from 'node:crypto'
import type { AvailabilityAssignee } from '@/lib/availability'
import { hashAvailabilityAccessCode } from '@/lib/availabilityAccessCode'

// Only saved server credentials may be preserved; never accept keys from a browser payload.
export function prepareAvailabilityCalendarCredentials(
  previous: AvailabilityAssignee | undefined,
  draftAccessCode: string,
) {
  const accessCodeHash = draftAccessCode.trim()
    ? hashAvailabilityAccessCode(draftAccessCode)
    : previous?.accessCodeHash
  return {
    accessCodeHash,
    calendarFeedKey: previous?.calendarFeedKey || (accessCodeHash ? undefined : randomBytes(32).toString('hex')),
  }
}

export function getAvailabilityCalendarFeedKey(assignee: AvailabilityAssignee | null | undefined) {
  if (!assignee?.active) return undefined
  // Keep existing subscriptions valid, including their legacy password-change revocation.
  return assignee.accessCodeHash || assignee.calendarFeedKey || undefined
}
