import 'server-only'
import { getAdminSupabase } from '@/lib/supabase'
import type { ClientCrmActor } from '@/lib/clientCrmAuth'
import { ClientCrmError } from '@/lib/clientCrmErrors'
import { ContractProductError } from '@/lib/contractProducts'
import { commissionSourceId, validateCommissionSourceRule, type CommissionSourceRule } from '@/lib/commissionSourcePolicy'

export async function getCommissionSourceRules(): Promise<CommissionSourceRule[]> {
  const rows: CommissionSourceRule[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await getAdminSupabase().from('commission_source_rules')
      .select('id,name,agent_id,agent_bps,active,revision').order('id').range(offset, offset + 499)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 500) return rows.sort((a, b) => a.name.localeCompare(b.name))
  }
}

export async function getCrmCommissionSources(actor: ClientCrmActor) {
  // Source labels are available in CRM; financial rule management remains owner-only.
  return (await getCommissionSourceRules()).filter(rule => actor.role !== 'agent' || rule.agent_id === actor.id)
    .map(rule => ({ id: rule.id, name: rule.name, agentId: rule.agent_id, active: rule.active }))
}

export async function resolveCrmCommissionSource(actor: ClientCrmActor, source: string) {
  const id = commissionSourceId(source)
  if (!id) return null
  const { data, error } = await getAdminSupabase().from('commission_source_rules')
    .select('id,name,agent_id,active').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data?.active) throw new ClientCrmError('This enquiry source is unavailable. Refresh and choose an active source.')
  if (actor.role === 'agent' && data.agent_id !== actor.id) throw new ClientCrmError('This enquiry source belongs to another agent.', 403)
  return data
}

export async function saveCommissionSourceRule(actor: ClientCrmActor, input: Record<string, unknown>) {
  if (actor.role !== 'owner') throw new ContractProductError('Only the owner can change commission source rules.', 403)
  let rule
  try { rule = validateCommissionSourceRule(input) }
  catch (error) { throw new ContractProductError((error as Error).message) }
  const { error } = await getAdminSupabase().rpc('save_commission_source_rule', {
    p_actor_id: actor.id, p_id: rule.id, p_name: rule.name, p_agent_id: rule.agentId,
    p_agent_bps: rule.agentBps, p_active: rule.active, p_expected_revision: rule.revision,
  })
  if (error) throw new ContractProductError(error.code === '40001'
    ? 'This rule changed. Refresh commissions before editing it again.'
    : 'Unable to save the rule. Use a unique source name and an active agent.', error.code === '42501' ? 403 : 409)
}
