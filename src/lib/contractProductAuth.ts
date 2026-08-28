import type { NextRequest } from 'next/server'
import { getAvailabilityAssignee, getAvailabilityConfig } from '@/lib/availability'
import { getClientCrmActor, type ClientCrmActor } from '@/lib/clientCrmAuth'
import { getContractProductStateForCity, type ContractProductState } from '@/lib/contractProductPolicy'

export type ContractProductActor = ClientCrmActor & { productState: ContractProductState | null }

export async function getContractProductActor(request: NextRequest): Promise<ContractProductActor | null> {
  const actor = await getClientCrmActor(request)
  if (!actor) return null
  if (actor.role !== 'agent') return { ...actor, productState: null }
  if (!actor.availabilityAssigneeId) return null

  const config = await getAvailabilityConfig()
  const assignee = getAvailabilityAssignee(config, actor.availabilityAssigneeId)
  const productState = assignee?.active ? getContractProductStateForCity(assignee.city) : null
  return productState ? { ...actor, productState } : null
}
