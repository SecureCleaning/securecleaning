import 'server-only'
import { getAdminSupabase } from '@/lib/supabase'
import { ContractProductError } from '@/lib/contractProducts'
import type { ClientCrmActor } from '@/lib/clientCrmAuth'

export async function getCommissionWorkspace(actor: ClientCrmActor) {
  if (!['owner', 'agent'].includes(actor.role)) throw new ContractProductError('Owner or agent access required.', 403)
  const db = getAdminSupabase()
  async function read(table: string, select: string, agentColumn?: string) {
    const rows: Record<string, unknown>[] = []
    for (let offset = 0; ; offset += 500) {
      let query = db.from(table).select(select)
      if (actor.role === 'agent' && agentColumn) query = query.eq(agentColumn, actor.id)
      const { data, error } = await query.order(table === 'contract_commission_balances' || table === 'contract_commission_assignments' ? 'sale_id' : 'id').range(offset, offset + 499)
      if (error) throw error
      rows.push(...(data ?? []) as unknown as Record<string, unknown>[])
      if (!data || data.length < 500) return rows
    }
  }
  const [balances, claims, payouts] = await Promise.all([
    read('contract_commission_balances', '*', 'agent_id'), read('contract_commission_claims', '*', 'agent_id'), read('contract_commission_payouts', '*', 'agent_id'),
  ])
  // Beneficiary access is independent of operational sale assignment; expose no cleaner/client data.
  const ids = Array.from(new Set(balances.map(row => String(row.sale_id))))
  const assignments: Record<string, unknown>[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from('contract_commission_assignments').select('*').in('sale_id', ids.slice(i, i + 100))
    if (error) throw error
    assignments.push(...(data ?? []))
  }
  const components = assignments.flatMap(row => [
    { saleId: row.sale_id, agentId: row.win_agent_id, component: 'Site won', rateBps: row.win_bps },
    { saleId: row.sale_id, agentId: row.sale_agent_id, component: 'Sale', rateBps: row.sale_bps },
  ]).filter(row => actor.role === 'owner' || row.agentId === actor.id)
  const [settings, agents, sales] = actor.role === 'owner' ? await Promise.all([
    db.from('contract_commission_settings').select('win_bps,sale_bps').eq('id', true).single(),
    db.from('admin_staff_accounts').select('id,display_name').eq('role', 'agent').eq('active', true).order('display_name'),
    db.from('contract_product_sales').select('id,sale_code,agreed_purchase_price_inc_gst_cents,status').neq('status', 'cancelled').order('created_at', { ascending: false }),
  ]) : [{ data: null, error: null }, { data: [], error: null }, { data: [], error: null }]
  for (const result of [settings, agents, sales]) if (result.error) throw result.error
  return { role: actor.role, balances, claims, payouts, components, settings: settings.data, agents: agents.data, sales: (sales.data ?? []).filter(row => !ids.includes(row.id)) }
}

export async function manageCommission(actor: ClientCrmActor, input: Record<string, unknown>) {
  const action = input.action
  if (!['settings', 'assign', 'claim', 'payout'].includes(String(action))) throw new ContractProductError('Invalid commission action.')
  if (action === 'claim' ? actor.role !== 'agent' : actor.role !== 'owner') throw new ContractProductError('You cannot perform this commission action.', 403)
  const { error } = await getAdminSupabase().rpc('manage_contract_commission', { p_actor_id: actor.id, p_action: action, p_input: input })
  if (error) throw new ContractProductError(error.code === '42501' ? 'Commission access denied.' : 'Unable to save. Check the amounts, references and available commission; refresh before retrying.', error.code === '42501' ? 403 : 409)
}
