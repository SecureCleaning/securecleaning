import { getAdminSupabase } from '@/lib/supabase'
import type { ClientCrmActor } from '@/lib/clientCrmAuth'
import { ClientCrmError } from '@/lib/clientCrmData'
import { parsePremisesSelection, premisesLabel, type PremisesOption } from '@/lib/premisesCatalog'

export async function getPremisesCatalog(): Promise<PremisesOption[]> {
  const { data, error } = await getAdminSupabase().from('crm_premises_types').select('code,label,active,updated_at').order('label')
  if (error) throw error
  return data ?? []
}
export async function validatePremisesSelection(input: Record<string, unknown>, existing?: string | null) {
  let selection: ReturnType<typeof parsePremisesSelection>
  try { selection = parsePremisesSelection(input) } catch (error) { throw new ClientCrmError((error as Error).message) }
  if (selection.type && !(await getPremisesCatalog()).some(option => option.code === selection.type && (option.active || option.code === existing))) throw new ClientCrmError('Select an available premises type.')
  return selection
}
export async function savePremisesOption(actor: ClientCrmActor, input: Record<string, unknown>) {
  if (!['owner', 'manager'].includes(actor.role)) throw new ClientCrmError('Only an administrator can edit premises types.', 403)
  const code = typeof input.code === 'string' ? input.code.trim() : ''
  const label = typeof input.label === 'string' ? input.label.trim() : ''
  if (!/^[a-z][a-z0-9_]{0,59}$/.test(code) || !label || label.length > 100 || typeof input.active !== 'boolean') throw new ClientCrmError('Enter a unique code and label (up to 100 characters).')
  if (code === 'other' && (!input.active || label !== 'Other')) throw new ClientCrmError('Other must remain available with its existing name.')
  const { data, error } = await getAdminSupabase().rpc('save_crm_premises_option', {
    p_actor_id: actor.id, p_code: code, p_label: label, p_active: input.active,
    p_expected_updated_at: input.expectedUpdatedAt || null,
  })
  if (error?.code === '23505') throw new ClientCrmError('That code or name already exists.', 409)
  if (error?.code === '40001') throw new ClientCrmError('The list changed. Reload before editing.', 409)
  if (error?.code === '42501') throw new ClientCrmError('Administrator access required.', 403)
  if (error) throw error
  return data
}
export async function resolveIndustry(site: { premises_type?: unknown; premises_type_other?: unknown } | null | undefined) {
  if (!site?.premises_type) return ''
  return premisesLabel(site?.premises_type, site?.premises_type_other, await getPremisesCatalog())
}

export async function resolveQuoteIndustry(quoteRef: string) {
  const db = getAdminSupabase()
  const { data: quote, error } = await db.from('quotes').select('id,inputs,final_quote_document').eq('quote_ref', quoteRef).maybeSingle()
  if (error) throw error
  if (!quote) return ''
  const link = await db.from('crm_opportunity_quotes').select('opportunity_id').eq('quote_id', quote.id).maybeSingle()
  if (link.error) throw link.error
  if (link.data) {
    const opportunity = await db.from('crm_opportunities').select('site_id').eq('id', link.data.opportunity_id).maybeSingle()
    if (opportunity.error) throw opportunity.error
    if (opportunity.data?.site_id) {
      const site = await db.from('sites').select('premises_type,premises_type_other').eq('id', opportunity.data.site_id).maybeSingle()
      if (site.error) throw site.error
      if (site.data?.premises_type) return resolveIndustry(site.data)
    }
  }
  return resolveIndustry({ premises_type: quote.final_quote_document?.inputs?.premisesType || quote.inputs?.premisesType })
}
