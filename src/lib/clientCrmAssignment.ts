export type CrmServiceRegion = 'melbourne' | 'sydney'

type AvailabilityAssigneeRegion = {
  id: string
  city: CrmServiceRegion
  active: boolean
}

export function canAgentSelfAssignCrmRegion(input: {
  availabilityAssigneeId?: string | null
  city: CrmServiceRegion
  assignees: AvailabilityAssigneeRegion[]
}) {
  if (!input.availabilityAssigneeId) return false
  const assignee = input.assignees.find((candidate) => candidate.id === input.availabilityAssigneeId)
  return Boolean(assignee?.active && assignee.city === input.city)
}

export function getCrmAgentRegion(availabilityAssigneeId: string | null | undefined, assignees: AvailabilityAssigneeRegion[]): CrmServiceRegion | null {
  return assignees.find((assignee) => assignee.id === availabilityAssigneeId && assignee.active)?.city ?? null
}
