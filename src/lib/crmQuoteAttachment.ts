import { createHash } from 'node:crypto'
import { getCrmQuoteSend } from './crmQuoteActivity'
import { ClientCrmError } from './clientCrmData'
import type { ClientCrmActor } from './clientCrmAuth'
import type { FinalQuoteDocument } from './quoteWorkflowData'
import { buildClientScopeReport } from './scopeOfWorks'
import { getRoomTaskCadenceLabel } from './roomTypeConfig'
import { buildContractSaleAgreementPdf } from './contractSaleAgreementDocument'

export function buildCrmQuoteAttachment(send: Awaited<ReturnType<typeof getCrmQuoteSend>>) {
  const doc = send.document_snapshot as FinalQuoteDocument | null
  if (!doc || Number(doc.version) !== send.document_version) {
    throw new ClientCrmError('The saved document for this sent quote version is unavailable. Review the quote before sending a new version.', 409)
  }
  const report = buildClientScopeReport(send.quote_ref, doc.inputs, doc.result, doc.firmQuoteDraft, doc.roomTypeConfig, null, doc.reviewedAt, doc.pricingPreview)
  const lines = [
    'Cleaning quote', `Quote reference: ${send.quote_ref}`, `Sent version: ${send.document_version}`,
    `Business: ${report.businessName}`, `Contact: ${report.contactName}`, `Location: ${report.location}`,
    `Price per visit: ${report.displayedPrice} excluding GST`, `Frequency: ${report.frequencyLabel}`, `Cleaning time: ${report.timePreferenceLabel}`, '',
    ...report.rooms.flatMap((room, index) => [
      `${index + 1}. ${room.label.toUpperCase()}`, `Quantity: ${room.quantity}`, `Floor area: ${room.size ?? 0} sqm each`, `Floor: ${room.floor}`,
      room.description, ...room.tasks.map(task => `- ${task.label} - ${getRoomTaskCadenceLabel(task.cadence)}`), ...room.selectedOptions.map(option => `- ${option}`), '',
    ]),
    ...report.selectedOptions.map(option => `- ${option}`),
    ...[['Summary', report.summary], ['Inclusions', report.inclusions], ['Exclusions', report.exclusions]]
      .flatMap(([label, value]) => value ? [`${label}:`, value, ''] : []),
  ]
  // Bound individual paragraphs/words so long saved scopes paginate safely in
  // the existing document renderer. No text is omitted.
  const content = lines.flatMap(line => String(line ?? '').split(/\r?\n/))
    .map(line => line.replace(/\S{61,}/g, word => word.match(/.{1,60}/g)!.join(' ')))
    .flatMap(line => line.match(/.{1,240}(?:\s|$)|.{1,240}/g) ?? ['']).join('\n')
  const sentAt = send.finalized_at || send.provider_accepted_at
  if (!sentAt || !Number.isFinite(Date.parse(sentAt))) throw new ClientCrmError('The original quote sent date is unavailable.', 409)
  const pdf = buildContractSaleAgreementPdf({
    content, saleCode: `Version ${send.document_version}`, productCode: '', cleanerBusiness: '',
    preparedBy: 'Secure Cleaning', preparedOn: new Date(sentAt).toISOString().slice(0, 10),
    documentTitle: 'Cleaning quote and scope of works', footerLabel: send.quote_ref,
  })
  if (pdf.length > 5 * 1024 * 1024) throw new ClientCrmError('This quote is too large to attach. Review its saved scope first.', 409)
  return {
    filename: `quote-${send.quote_ref.replace(/[^a-zA-Z0-9_-]/g, '-')}-v${send.document_version}.pdf`,
    content: pdf, contentType: 'application/pdf', quoteRef: send.quote_ref, version: send.document_version,
    sendId: send.id, sha256: createHash('sha256').update(pdf).digest('hex'),
  }
}

export async function getCrmQuoteAttachment(actor: ClientCrmActor, opportunityId: string, sendId: string) {
  return buildCrmQuoteAttachment(await getCrmQuoteSend(actor, opportunityId, sendId))
}
