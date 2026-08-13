import type { AvailabilityAssignee, AvailabilityConfig, ServiceZone } from '@/lib/availability'
import { locationMatchesServiceZones } from '@/lib/availability'

type BookingLinkageRow = {
  assigned_operator_id?: string | null
  inputs?: unknown
}

type OwnerOperatorLinkTarget = {
  id: string
  city: string
  is_active: boolean
}

function getBookingInputs(booking: BookingLinkageRow) {
  return booking.inputs && typeof booking.inputs === 'object'
    ? booking.inputs as Record<string, unknown>
    : {}
}

export function bookingBelongsToAvailabilityAssignee(
  booking: BookingLinkageRow,
  assignee: AvailabilityAssignee,
  serviceZones: ServiceZone[],
) {
  if (!assignee.active) return false

  const inputs = getBookingInputs(booking)
  if (inputs.city !== assignee.city) return false

  const preferredAssigneeId = typeof inputs.preferredInspectionAssigneeId === 'string'
    ? inputs.preferredInspectionAssigneeId.trim()
    : ''
  if (preferredAssigneeId) {
    if (preferredAssigneeId !== assignee.id) return false
  } else if (!assignee.ownerOperatorId || booking.assigned_operator_id !== assignee.ownerOperatorId) {
    return false
  }

  if (serviceZones.length === 0) return true
  return locationMatchesServiceZones(
    {
      address: typeof inputs.address === 'string' ? inputs.address : undefined,
      suburb: typeof inputs.suburb === 'string' ? inputs.suburb : undefined,
      postcode: typeof inputs.postcode === 'string' ? inputs.postcode : undefined,
    },
    assignee.city,
    serviceZones,
  )
}

export function validateOwnerOperatorLinks(
  config: AvailabilityConfig,
  ownerOperators: OwnerOperatorLinkTarget[],
) {
  const operatorsById = new Map(ownerOperators.map((operator) => [operator.id, operator]))
  const linkedAssigneeByOperatorId = new Map<string, string>()

  for (const assignee of config.assignees) {
    const ownerOperatorId = assignee.ownerOperatorId?.trim()
    if (!ownerOperatorId) continue

    const operator = operatorsById.get(ownerOperatorId)
    if (!operator) return 'A linked owner-operator could not be found.'
    if (!operator.is_active) return 'Linked owner-operators must be active.'
    if (operator.city !== assignee.city) return 'Agents and linked owner-operators must be in the same city.'

    const existingAssigneeId = linkedAssigneeByOperatorId.get(ownerOperatorId)
    if (existingAssigneeId && existingAssigneeId !== assignee.id) {
      return 'An owner-operator can only be linked to one availability agent.'
    }
    linkedAssigneeByOperatorId.set(ownerOperatorId, assignee.id)
  }

  return null
}
