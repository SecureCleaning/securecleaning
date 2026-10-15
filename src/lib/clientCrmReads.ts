import { followUpSummary } from './crmFollowUpSummary'
import { getAdminSupabase } from './supabase'
import type { ClientCrmActor } from './clientCrmAuth'
import { canActorAccessAssignedOpportunity } from './clientCrmPolicy'
import { ClientCrmError } from './clientCrmData'

export type CrmFollowUpItem = { id: string; businessName: string; contactName: string; stage: string; nextFollowUpAt: string; assignedStaffName: string | null; summary: string }

export async function getCrmFollowUps(actor: ClientCrmActor) {
  const db = getAdminSupabase()
  const opportunities: CrmFollowUpItem[] = []
  // Hydrate in bounded batches, without loading unrelated CRM entities or email bodies.
  for (let offset = 0; ; offset += 200) {
    let request = db.from('crm_opportunities').select('id, organisation_id, primary_contact_id, assigned_staff_id, stage, next_follow_up_at')
      .not('next_follow_up_at', 'is', null).not('stage', 'in', '(won,lost,cancelled)')
      .order('next_follow_up_at').order('id').range(offset, offset + 199)
    if (actor.role === 'agent') request = request.eq('assigned_staff_id', actor.id)
    const result = await request
    if (result.error) throw result.error
    const rows = result.data ?? []
    if (!rows.length) break
    const ids = rows.map(r => r.id)
    const read = (table: string, fields: string, key: string, values: string[]) => values.length
      ? db.from(table).select(fields).in(key, [...new Set(values)]).returns<Record<string, string | null>[]>()
      : Promise.resolve({ data: [], error: null })
    const [organisations, contacts, agents, emails, links, templates] = await Promise.all([
      read('crm_organisations', 'id,business_name', 'id', rows.map(r => r.organisation_id).filter(Boolean)),
      read('clients', 'id,business_name,contact_name', 'id', rows.map(r => r.primary_contact_id).filter(Boolean)),
      read('admin_staff_accounts', 'id,display_name', 'id', rows.map(r => r.assigned_staff_id).filter(Boolean)),
      db.from('crm_communications').select('opportunity_id,template_id,sent_at').in('opportunity_id', ids).eq('status','sent').not('sent_at','is',null).order('sent_at',{ascending:false}),
      read('crm_opportunity_quotes','opportunity_id,quote_id','opportunity_id',ids),
      db.from('crm_email_templates').select('id,name,visibility,created_by_staff_id').neq('status','archived'),
    ])
    for (const value of [organisations, contacts, agents, emails, links, templates]) if (value.error) throw value.error
    const quotes = await read('quotes','id,final_quote_sent_at','id',(links.data ?? []).map(r => r.quote_id).filter((id): id is string => Boolean(id)))
    if (quotes.error) throw quotes.error
    // Supabase's dynamic table helper returns generic rows; keep this read model local.
    const byId = (data: unknown) => new Map((data as Array<Record<string, unknown>>).map(r => [String(r.id),r]))
    const orgMap=byId(organisations.data ?? []), contactMap=byId(contacts.data ?? []), agentMap=byId(agents.data ?? []), quoteMap=byId(quotes.data ?? [])
    for (const row of rows) {
      const contact=contactMap.get(row.primary_contact_id), org=orgMap.get(row.organisation_id)
      const email=(emails.data ?? []).find(e=>e.opportunity_id===row.id)
      const sentQuotes=(links.data ?? []).filter(l=>l.opportunity_id===row.id).map(l=>quoteMap.get(String(l.quote_id))?.final_quote_sent_at).filter(Boolean).map(String).sort().reverse()
      const template=(templates.data ?? []).find(t=>t.id===email?.template_id && (t.visibility==='shared'||t.created_by_staff_id===actor.id))
      const summary=followUpSummary({ communications: email ? [{ status: 'sent', sentAt: email.sent_at, templateId: email.template_id }] : [], quotes: sentQuotes.map(finalQuoteSentAt => ({ finalQuoteSentAt })) }, template ? [{ id: template.id, name: template.name }] : [])
      opportunities.push({id:row.id,businessName:String(org?.business_name ?? contact?.business_name ?? ''),contactName:String(contact?.contact_name ?? ''),stage:row.stage,nextFollowUpAt:row.next_follow_up_at,assignedStaffName:String(agentMap.get(row.assigned_staff_id)?.display_name ?? '')||null,summary})
    }
    if (rows.length<200) break
  }
  return { opportunities, actor: { role: actor.role, availabilityAssigneeId: actor.availabilityAssigneeId } }
}

export async function getCrmSentEmail(actor: ClientCrmActor, opportunityId: string, emailId: string) {
  if (![opportunityId,emailId].every(id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new ClientCrmError('Invalid email reference.')
  const db=getAdminSupabase()
  const opportunity=await db.from('crm_opportunities').select('id,assigned_staff_id').eq('id',opportunityId).maybeSingle()
  if (opportunity.error) throw opportunity.error
  if (!opportunity.data || !canActorAccessAssignedOpportunity(actor.role,actor.id,opportunity.data.assigned_staff_id)) throw new ClientCrmError('Opportunity not found.',404)
  const email=await db.from('crm_communications').select('subject_snapshot,to_email,sender_name,final_html_snapshot').eq('id',emailId).eq('opportunity_id',opportunityId).maybeSingle()
  if (email.error) throw email.error
  if (!email.data?.final_html_snapshot) throw new ClientCrmError('No saved email content is available.',404)
  return {subject:email.data.subject_snapshot,to:email.data.to_email,from:email.data.sender_name,html:email.data.final_html_snapshot,history:true}
}
