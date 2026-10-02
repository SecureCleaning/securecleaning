import 'server-only'
import { validateCommissionRevision, type CommissionRevisionPreview } from '@/lib/commissionRevision'
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
  const revisions = actor.role === 'owner' ? await read('contract_commission_revisions', 'id,sale_id,actor_id,reason,preview,created_at,actor:admin_staff_accounts(display_name)') : []
  const assignedSales = actor.role === 'owner' ? assignments.map(row => ({
    sale_id: String(row.sale_id),
    win_agent_id: String(row.win_agent_id),
    sale_agent_id: String(row.sale_agent_id),
    win_bps: Number(row.win_bps),
    sale_bps: Number(row.sale_bps),
    sale_code: String(balances.find(balance => balance.sale_id === row.sale_id)?.sale_code ?? row.sale_id),
    can_correct: !claims.some(claim => claim.sale_id === row.sale_id) && !payouts.some(payout => payout.sale_id === row.sale_id),
  })) : []
  return { revisions, role: actor.role, balances, claims, payouts, components, assignments: assignedSales, settings: settings.data, agents: agents.data, sales: (sales.data ?? []).filter(row => !ids.includes(row.id)) }
}

export async function manageCommission(actor: ClientCrmActor, input: Record<string, unknown>) {
  const action = input.action
  if (action === 'preview_revision' || action === 'revise') {
    if (actor.role !== 'owner') throw new ContractProductError('Only the owner can revise commissions.', 403)
    let validated
    try { validated = validateCommissionRevision(input) }
    catch (error) { throw new ContractProductError(error instanceof Error ? error.message : 'Invalid revision.') }
    const args = { p_actor_id: actor.id, p_sale_id: validated.saleId, p_win_bps: validated.winBps, p_sale_bps: validated.saleBps }
    const result = action === 'preview_revision'
      ? await getAdminSupabase().rpc('preview_contract_commission_revision', args)
      : await getAdminSupabase().rpc('revise_contract_commission', { ...args, p_reason: validated.reason, p_request_id: input.requestId, p_expected: input.expected })
    if (result.error) {
      if (result.error.code === '42501') throw new ContractProductError('Only the owner can revise commissions.', 403)
      if (result.error.code === '40001') throw new ContractProductError('Commission changed since preview. Preview again before confirming.', 409)
      throw new ContractProductError('Unable to revise commission. Check the sale and rates, then preview again.', 409)
    }
    return action === 'preview_revision' ? { preview: result.data as CommissionRevisionPreview } : undefined
  }
  if (!['settings', 'assign', 'correct', 'claim', 'payout'].includes(String(action))) throw new ContractProductError('Invalid commission action.')
  if (action === 'claim' ? actor.role !== 'agent' : actor.role !== 'owner') throw new ContractProductError('You cannot perform this commission action.', 403)
  const { error } = await getAdminSupabase().rpc('manage_contract_commission', { p_actor_id: actor.id, p_action: action, p_input: input })
  if (error) {
    const correctionBlocked = String(error.message ?? '').includes('cannot be corrected after an agent invoice or payout exists')
    throw new ContractProductError(error.code === '42501' ? 'Commission access denied.' : correctionBlocked ? 'This assignment cannot be corrected because an agent invoice or payout already exists.' : 'Unable to save. Check the agents, amounts, references and available commission; refresh before retrying.', error.code === '42501' ? 403 : 409)
  }
}
