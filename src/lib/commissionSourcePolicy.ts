export type CommissionSourceRule = {
  id: string
  name: string
  agent_id: string
  agent_bps: number
  active: boolean
  revision: number
}

export type CommissionSourceSnapshot = {
  ruleId: string
  name: string
  agentId: string | null
  agentName: string
  agentBps: number
  revision: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function commissionSourceId(source: unknown): string | null {
  if (typeof source !== 'string' || !source.startsWith('referral:')) return null
  const id = source.slice(9)
  return UUID.test(id) ? id.toLowerCase() : null
}

export function validateCommissionSourceRule(input: Record<string, unknown>) {
  const id = typeof input.id === 'string' ? input.id : ''
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  const agentId = typeof input.agentId === 'string' ? input.agentId : ''
  const agentBps = input.agentBps
  const revision = input.revision
  if (!UUID.test(id) || !UUID.test(agentId) || !name || name.length > 120
    || typeof agentBps !== 'number' || !Number.isInteger(agentBps) || agentBps < 0 || agentBps > 10000
    || typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0
    || typeof input.active !== 'boolean') throw new Error('Provide a source name, active agent and a percentage between 0 and 100.')
  return { id, name, agentId, agentBps, revision, active: input.active }
}
