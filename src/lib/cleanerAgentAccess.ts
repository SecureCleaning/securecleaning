import type { NextRequest } from 'next/server'
import { getAvailabilityAssignee, getAvailabilityConfig, type AvailabilityAssignee } from '@/lib/availability'
import { isAuthorizedAvailabilityAgentRequest } from '@/lib/availabilityAgentAuth'
import { getStateForAvailabilityCity, type AustralianAgentState } from '@/lib/cleanerAgentPolicy'

export type CleanerAgentContext = {
  assignee: AvailabilityAssignee
  state: AustralianAgentState
  actor: {
    id: string
    username: string
    role: 'availability_agent'
  }
}

export async function getCleanerAgentContext(
  request: NextRequest,
  assigneeId: string,
): Promise<CleanerAgentContext | null> {
  if (!(await isAuthorizedAvailabilityAgentRequest(request, assigneeId))) return null

  const config = await getAvailabilityConfig()
  const assignee = getAvailabilityAssignee(config, assigneeId)
  if (!assignee?.active) return null
  const state = getStateForAvailabilityCity(assignee.city)
  if (!state) return null

  return {
    assignee,
    state,
    actor: {
      id: assignee.id,
      username: assignee.username || assignee.name,
      role: 'availability_agent',
    },
  }
}
