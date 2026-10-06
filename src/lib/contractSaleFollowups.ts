import 'server-only'

import { getAdminSupabase } from '@/lib/supabase'
import { getAuthorizedSale, loadSaleContext } from '@/lib/contractSales'
import type { ContractProductActor } from '@/lib/contractProductAuth'
import { ContractProductError } from '@/lib/contractProducts'
import { normalizeInvoiceEmail } from '@/lib/contractSalePolicy'
import { parseRichEmailContent, richEmailFingerprint } from '@/lib/richEmailServer'
import { plainTextToEmailHtml } from '@/lib/richEmailContent'
import { EmailProviderRejectedError, sendEmailOrThrow } from '@/lib/email'
import { writeAuditLogStrict } from '@/lib/auditLog'

export async function contractSaleFollowup(actor: ContractProductActor, input: Record<string, unknown>) {
  const saleId = typeof input.saleId === 'string' ? input.saleId : ''
  const sale = await getAuthorizedSale(actor, saleId)
  const db = getAdminSupabase()
  if (input.action === 'followup.history') {
    const { data, error } = await db.from('contract_sale_followups').select('id, audience, recipient, subject, html, sender_name, status, created_at').eq('sale_id', saleId).order('created_at', { ascending: false }).limit(100)
    if (error) throw error
    return { history: data ?? [] }
  }
  const { data: inspection, error: inspectionError } = await db.from('contract_sale_inspections').select('status').eq('sale_id', saleId).maybeSingle()
  if (inspectionError) throw inspectionError
  if (inspection?.status !== 'completed' || sale.status === 'cancelled') throw new ContractProductError('Complete the inspection on an active sale before sending a follow-up.', 409)
  if (input.audience !== 'client' && input.audience !== 'cleaner') throw new ContractProductError('Select the client or cleaner.')
  const context = await loadSaleContext(sale)
  const recipient = normalizeInvoiceEmail(input.audience === 'client' ? context.client?.email : context.cleaner.email)
  const replyTo = normalizeInvoiceEmail(actor.email)
  if (!recipient || !replyTo) throw new ContractProductError('The recipient and your staff account need valid email addresses.', 409)
  const subject = typeof input.subject === 'string' ? input.subject.trim() : ''
  if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) throw new ContractProductError('Enter a subject of up to 200 characters without line breaks.')
  let content
  try { content = parseRichEmailContent(input) } catch { throw new ContractProductError('Enter a valid follow-up message.') }
  const html = `${content.html}${plainTextToEmailHtml(`Kind regards,\n\n${actor.displayName}\n${actor.jobTitle || ''}\nSecure Cleaning\n${actor.phone || ''}\n${replyTo}\nsecurecleaning.com.au`)}`
  const from = process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au'
  const fingerprint = richEmailFingerprint({ subject, html, text: content.text, context: JSON.stringify([saleId, input.audience, recipient, replyTo, from, actor.id]) })
  if (input.action === 'followup.preview') return { subject, html, to: recipient, from, fingerprint }
  if (input.action !== 'followup.send') throw new ContractProductError('Select a valid follow-up action.')
  if (input.fingerprint !== fingerprint) throw new ContractProductError('The email or contact details changed. Preview it again before sending.', 409)
  if (typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new ContractProductError('Preview the message again before sending.')
  const { data: existing, error: existingError } = await db.from('contract_sale_followups').select('status, fingerprint').eq('id', input.requestId).eq('sale_id', saleId).maybeSingle()
  if (existingError) throw existingError
  if (existing) {
    if (existing.status === 'sent' && existing.fingerprint === fingerprint) return { sent: true }
    throw new ContractProductError('This send has already been attempted. Check the email history before preparing another message.', 409)
  }
  // The partial unique index also blocks concurrent or uncertain sends to this audience.
  const { error: claimError } = await db.from('contract_sale_followups').insert({ id: input.requestId, sale_id: saleId, audience: input.audience, recipient, subject, html, fingerprint, sender_name: actor.displayName, sent_by_staff_id: actor.id, status: 'pending' })
  if (claimError) {
    if (claimError.code === '23505') throw new ContractProductError('A previous send is still pending or uncertain. Check its delivery before sending again.', 409)
    throw claimError
  }
  let status = 'unknown'
  let providerId: string | null = null
  try {
    await writeAuditLogStrict('contract_sale', saleId, 'contract_sale.followup.requested', { actorId: actor.id, followupId: input.requestId, audience: input.audience })
    const result = await sendEmailOrThrow({ from, to: recipient, replyTo, subject, html }) as { id?: string } | null
    providerId = result?.id ?? null
    status = providerId ? 'sent' : 'unknown'
  } catch (error) {
    status = error instanceof EmailProviderRejectedError ? 'failed' : 'unknown'
  }
  const { error: updateError } = await db.from('contract_sale_followups').update({ status, provider_message_id: providerId }).eq('id', input.requestId)
  if (updateError || status === 'unknown') throw new ContractProductError('Delivery is uncertain. Check provider activity before sending again.', 502)
  if (status === 'failed') throw new ContractProductError('The email provider rejected this message. Review the recipient before trying again.', 502)
  return { sent: true }
}
