import 'server-only'
import { createHash } from 'node:crypto'
import type { ContractProductActor } from '@/lib/contractProductAuth'
import { getAuthorizedSale } from '@/lib/contractSales'
import { ContractProductError, getContractProductCleanerScope } from '@/lib/contractProducts'
import { getAdminSupabase } from '@/lib/supabase'
import { normalizeInvoiceEmail } from '@/lib/contractSalePolicy'
import { buildCleanerScopePdf } from '@/lib/contractSaleChecklistPdf'
import { cleanerScopeEmailDraft } from '@/lib/cleanerScopeEmailTemplate'
import { loadCleanerScopeEmailTemplate, parseCleanerScopeMessage } from '@/lib/cleanerScopeEmailTemplateServer'
import { richEmailFingerprint } from '@/lib/richEmailServer'
import { EmailProviderRejectedError, sendEmailOrThrow } from '@/lib/email'
import { writeAuditLogStrict } from '@/lib/auditLog'

export async function contractSaleScopeEmail(actor: ContractProductActor, input: Record<string, unknown>) {
  const saleId = typeof input.saleId === 'string' ? input.saleId : ''
  const sale = await getAuthorizedSale(actor, saleId)
  if (sale.status === 'cancelled') throw new ContractProductError('Cannot email the scope for a cancelled sale.', 409)
  const db = getAdminSupabase()
  // Resolve both the recipient and privacy-screened product snapshot on the server, again on send.
  const { data: cleaner, error } = await db.from('cleaners').select('email, contact_name').eq('id', sale.cleaner_id).single()
  if (error) throw error
  const to = normalizeInvoiceEmail(cleaner?.email)
  const replyTo = normalizeInvoiceEmail(actor.email)
  if (!to || !replyTo) throw new ContractProductError('The cleaner and your staff account need valid email addresses.', 409)
  const { productCode, scope } = await getContractProductCleanerScope(actor, String(sale.product_id))
  const hasDraft = ['subject', 'body', 'bodyHtml', 'bodyDocument'].some(key => Object.prototype.hasOwnProperty.call(input, key))
  const defaultDraft = input.action === 'scope-email.draft' || !hasDraft
    ? cleanerScopeEmailDraft(await loadCleanerScopeEmailTemplate(), {
      product_code: productCode, cleaner_first_name: String(cleaner?.contact_name || '').trim().split(/\s+/)[0] || 'there', sender_name: actor.displayName,
    }) : null
  if (input.action === 'scope-email.draft') return { ...defaultDraft, to, replyTo }
  const { subject, text, html } = parseCleanerScopeMessage(defaultDraft ?? input)
  const pdf = buildCleanerScopePdf(productCode, scope)
  if (pdf.length > 2_500_000) throw new ContractProductError('The scope PDF is too large to email. Contact an administrator.', 409)
  const attachment = { filename: `cleaner-scope-${productCode.replace(/[^a-z0-9-]/gi, '')}.pdf`, content: pdf.toString('base64') }
  const from = process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au'
  const pdfHash = createHash('sha256').update(pdf).digest('hex')
  const fingerprint = richEmailFingerprint({ subject, html, text, context: JSON.stringify([saleId, sale.cleaner_id, sale.product_id, to, replyTo, from, actor.id, attachment.filename, pdfHash]) })
  if (input.action === 'scope-email.preview') return { to, from, replyTo, subject, html, fingerprint, attachment }
  if (input.action !== 'scope-email.send') throw new ContractProductError('Select a valid cleaner scope email action.')
  if (input.fingerprint !== fingerprint) throw new ContractProductError('The scope, recipient or email changed. Preview it again before sending.', 409)
  if (typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new ContractProductError('Preview the scope email again before sending.')
  const { data: existing, error: lookupError } = await db.from('contract_sale_followups').select('status, fingerprint').eq('id', input.requestId).eq('sale_id', saleId).maybeSingle()
  if (lookupError) throw lookupError
  if (existing) {
    if (existing.status === 'sent' && existing.fingerprint === fingerprint) return { sent: true }
    throw new ContractProductError('This send was already attempted. Check Follow Up history before sending again.', 409)
  }
  // Shared unresolved-send index prevents concurrent/uncertain sends to this cleaner audience.
  const { error: claimError } = await db.from('contract_sale_followups').insert({ id: input.requestId, sale_id: saleId, audience: 'cleaner', recipient: to, subject, html, fingerprint, sender_name: actor.displayName, sent_by_staff_id: actor.id, status: 'pending', attachments: [attachment] })
  if (claimError) {
    if (claimError.code === '23505') throw new ContractProductError('An email is already pending or has an uncertain outcome. Check Follow Up history before sending again.', 409)
    throw claimError
  }
  let status = 'unknown'
  let providerId: string | null = null
  try {
    await writeAuditLogStrict('contract_sale', saleId, 'contract_sale.cleaner_scope_email.requested', { actorId: actor.id, followupId: input.requestId, productId: sale.product_id, pdfHash, attachmentName: attachment.filename })
    const result = await sendEmailOrThrow({ from, to, replyTo, subject, html, attachments: [attachment] }, { idempotencyKey: `cleaner-scope-${input.requestId}` }) as { id?: string } | null
    providerId = result?.id ?? null
    status = providerId ? 'sent' : 'unknown'
  } catch (sendError) {
    status = sendError instanceof EmailProviderRejectedError ? 'failed' : 'unknown'
  }
  const { error: updateError } = await db.from('contract_sale_followups').update({ status, provider_message_id: providerId }).eq('id', input.requestId)
  if (updateError || status === 'unknown') throw new ContractProductError('Delivery is uncertain. Check provider activity before sending again.', 502)
  if (status === 'failed') throw new ContractProductError('The provider rejected the email. Check the cleaner email address before trying again.', 502)
  return { sent: true }
}
