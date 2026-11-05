import { getAdminSupabase } from './supabase'
import { actorCanAccessOpportunity, type ClientCrmActor } from './clientCrmAuth'
import { ClientCrmError } from './clientCrmData'
import { buildClientScopeReport } from './scopeOfWorks'
import { getRoomTaskCadenceLabel } from './roomTypeConfig'
import { escapeHtml } from './htmlEscape'
import type { FinalQuoteDocument } from './quoteWorkflowData'

export async function getCrmQuoteSend(actor: ClientCrmActor, opportunityId: string, sendId: string) {
  if (![opportunityId, sendId].every(value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))) throw new ClientCrmError('Invalid quote history reference.')
  const db = getAdminSupabase()
  const opportunity = await db.from('crm_opportunities').select('id,primary_contact_id,assigned_staff_id').eq('id', opportunityId).maybeSingle()
  if (opportunity.error) throw opportunity.error
  if (!opportunity.data || !actorCanAccessOpportunity(actor, opportunity.data.assigned_staff_id)) throw new ClientCrmError('Opportunity not found.', 404)
  const send = await db.from('quote_send_attempts').select('id,quote_ref,recipient,document_version,document_snapshot,email_snapshot,finalized_at,provider_accepted_at,actor').eq('id', sendId).eq('status', 'finalized').maybeSingle()
  if (send.error) throw send.error
  if (!send.data) throw new ClientCrmError('Sent quote not found.', 404)
  const quote = await db.from('quotes').select('id').eq('quote_ref', send.data.quote_ref).maybeSingle()
  if (quote.error) throw quote.error
  const link = await db.from('crm_opportunity_quotes').select('quote_id').eq('opportunity_id', opportunityId).eq('quote_id', quote.data?.id || '').maybeSingle()
  if (link.error) throw link.error
  if (!link.data) throw new ClientCrmError('Sent quote not found.', 404)
  return { ...send.data, contactId: opportunity.data.primary_contact_id }
}

export function renderArchivedQuote(quoteRef: string, doc: FinalQuoteDocument) {
  const report = buildClientScopeReport(quoteRef, doc.inputs, doc.result, doc.firmQuoteDraft, doc.roomTypeConfig, null, doc.reviewedAt, doc.pricingPreview)
  const e = (value: unknown) => escapeHtml(String(value ?? ''))
  const list = (values: string[]) => `<ul>${values.map(value => `<li>${e(value)}</li>`).join('')}</ul>`
  return `<main style="font-family:Arial,sans-serif;padding:24px;color:#172033"><h1>Sent quote ${e(quoteRef)}</h1><p>Saved version ${doc.version}. Read-only archive.</p><h2>${e(report.businessName)}</h2><p>${e(report.contactName)}<br>${e(report.location)}</p><p><strong>${e(report.displayedPrice)}</strong> per visit, excluding GST</p><p>${e(report.frequencyLabel)} · ${e(report.timePreferenceLabel)}</p>${report.rooms.map(room => `<section style="border-top:1px solid #ddd;margin-top:20px"><h2>${e(room.label)}</h2><p>Quantity ${room.quantity} · ${room.size ?? 0} sqm each · Floor ${room.floor}</p><p>${e(room.description)}</p>${list(room.tasks.map(task => `${task.label} — ${getRoomTaskCadenceLabel(task.cadence)}`))}${list(room.selectedOptions)}</section>`).join('')}${list(report.selectedOptions)}${[['Summary',report.summary],['Inclusions',report.inclusions],['Exclusions',report.exclusions]].map(([label,value])=>value ? `<h2>${label}</h2><p style="white-space:pre-wrap">${e(value)}</p>` : '').join('')}</main>`
}

export async function getCrmQuoteArchive(actor: ClientCrmActor, opportunityId: string, sendId: string, document: boolean) {
  const send = await getCrmQuoteSend(actor, opportunityId, sendId)
  if (document) {
    if (!send.document_snapshot || Number(send.document_snapshot.version) !== send.document_version) throw new ClientCrmError('The document for this older sent version was not retained. Open the quote to review the current version.', 404)
    return { subject: `${send.quote_ref} - version ${send.document_version}`, html: renderArchivedQuote(send.quote_ref, send.document_snapshot as FinalQuoteDocument), history: true }
  }
  if (!send.email_snapshot?.html) throw new ClientCrmError('The original email content was not archived for this older send. Its sent date and quote reference are retained.', 404)
  return { ...send.email_snapshot, cc: (send.email_snapshot.cc ?? []).join(', '), history: true }
}
