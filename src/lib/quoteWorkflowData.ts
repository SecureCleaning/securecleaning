import { getAdminSupabase } from '@/lib/supabase'
import type { QuoteInputs, QuoteResult } from '@/lib/types'
import {
  applyFirmQuoteDisplayPrice,
  buildFirmQuotePreview,
  createDefaultFirmQuoteDraft,
  createDefaultInspectionReport,
  getFirmQuoteDisplayPrice,
  getFinalQuoteReadiness,
  parseFirmQuoteDraft,
  parseInspectionReport,
  type FirmQuoteDraft,
  type FirmQuoteDisplayPrice,
  type FirmQuotePreview,
  type InspectionReport,
} from '@/lib/quoteWorkflow'
import { getQuotePricingConfig, type QuotePricingConfig } from '@/lib/pricing'
import { DEFAULT_QUOTE_ROOM_TYPE_CONFIG, getQuoteRoomTypeConfig, type QuoteRoomTypeConfig } from '@/lib/roomTypeConfig'
import { buildClientScopeReport, type ClientScopeReport } from '@/lib/scopeOfWorks'
import { toPublicQuoteDocument } from '@/lib/publicQuoteDocument'

export type QuoteDocumentVariant = 'remote_review' | 'final'

export class QuoteWorkflowConflictError extends Error {}

export type QuoteWorkflowActor = {
  kind: 'staff_account' | 'agent_session'
  id: string
  name: string
}


export type FinalQuoteDocument = {
  variant: 'final'
  version: number
  reviewedAt: string
  reviewedBy: QuoteWorkflowActor
  inputs: QuoteInputs
  result: QuoteResult
  firmQuoteDraft: FirmQuoteDraft
  pricingPreview: FirmQuotePreview
  displayPrice: FirmQuoteDisplayPrice
  roomTypeConfig: QuoteRoomTypeConfig
}

export type QuoteWorkflowRecord = {
  id: string
  quoteRef: string
  inputs: QuoteInputs
  result: QuoteResult
  status: string
  validUntil?: string | null
  createdAt?: string | null
  inspectionReport: InspectionReport
  firmQuoteDraft: FirmQuoteDraft
  workflowColumnsAvailable: boolean
  finalDocument: FinalQuoteDocument | null
  reviewedAt?: string | null
  reviewedBy?: QuoteWorkflowActor | null
  sentAt?: string | null
  sentBy?: QuoteWorkflowActor | null
  sentTo?: string | null
  sentDocumentVariant?: QuoteDocumentVariant | null
}

export type PublicQuoteWorkflowRecord = QuoteWorkflowRecord & {
  pricingPreview: FirmQuotePreview
  displayPrice: FirmQuoteDisplayPrice
  roomTypeConfig: QuoteRoomTypeConfig
}

function isMissingColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return message.includes('column') && (
    message.includes('inspection_report') ||
    message.includes('firm_quote_workflow') ||
    message.includes('final_quote_document')
  )
}

export async function getQuoteWorkflowByRef(
  quoteRef: string,
  roomTypeConfig: QuoteRoomTypeConfig = DEFAULT_QUOTE_ROOM_TYPE_CONFIG
): Promise<QuoteWorkflowRecord | null> {
  const db = getAdminSupabase()
  const { data, error } = await db.from('quotes')
    .select('id, quote_ref, inputs, result, status, valid_until, created_at')
    .eq('quote_ref', quoteRef).maybeSingle()
  if (error) {
    console.error('[quoteWorkflowData] Failed to load base quote:', error)
    return null
  }
  if (!data) return null

  let inspectionReport = createDefaultInspectionReport(data.inputs as QuoteInputs)
  let firmQuoteDraft = createDefaultFirmQuoteDraft(data.inputs as QuoteInputs, roomTypeConfig)
  let workflowColumnsAvailable = false
  let finalDocument: FinalQuoteDocument | null = null
  let reviewedAt: string | null = null
  let reviewedBy: QuoteWorkflowActor | null = null
  let sentAt: string | null = null
  let sentBy: QuoteWorkflowActor | null = null
  let sentTo: string | null = null
  let sentDocumentVariant: QuoteDocumentVariant | null = null

  const workflowRes = await db.from('quotes').select(
    'inspection_report, firm_quote_workflow, final_quote_document, final_quote_reviewed_at, final_quote_reviewed_by, final_quote_sent_at, final_quote_sent_by, final_quote_sent_to, final_quote_sent_variant'
  ).eq('quote_ref', quoteRef).maybeSingle()

  if (workflowRes.error) {
    if (!isMissingColumnError(workflowRes.error)) console.error('[quoteWorkflowData] Failed to load workflow fields:', workflowRes.error)
  } else if (workflowRes.data) {
    workflowColumnsAvailable = true
    inspectionReport = parseInspectionReport(workflowRes.data.inspection_report, data.inputs as QuoteInputs)
    firmQuoteDraft = parseFirmQuoteDraft(workflowRes.data.firm_quote_workflow, data.inputs as QuoteInputs, roomTypeConfig)
    finalDocument = workflowRes.data.final_quote_document as FinalQuoteDocument | null
    reviewedAt = workflowRes.data.final_quote_reviewed_at
    reviewedBy = workflowRes.data.final_quote_reviewed_by as QuoteWorkflowActor | null
    sentAt = workflowRes.data.final_quote_sent_at
    sentBy = workflowRes.data.final_quote_sent_by as QuoteWorkflowActor | null
    sentTo = workflowRes.data.final_quote_sent_to
    sentDocumentVariant = workflowRes.data.final_quote_sent_variant as QuoteDocumentVariant | null
  }

  return {
    id: data.id, quoteRef: data.quote_ref, inputs: data.inputs as QuoteInputs, result: data.result as QuoteResult,
    status: data.status, validUntil: data.valid_until, createdAt: data.created_at, inspectionReport, firmQuoteDraft,
    workflowColumnsAvailable, finalDocument, reviewedAt, reviewedBy, sentAt, sentBy, sentTo, sentDocumentVariant,
  }
}

export async function getPublicScopeByRef(quoteRef: string): Promise<ClientScopeReport | null> {
  return getPublicScopeDocumentByRef(quoteRef, 'remote_review')
}

export async function getPublicScopeDocumentByRef(quoteRef: string, variant: QuoteDocumentVariant): Promise<ClientScopeReport | null> {
  const quote = await getPublicQuoteWorkflowByRef(quoteRef, variant)
  if (!quote) return null
  return buildClientScopeReport(quote.quoteRef, quote.inputs, quote.result, quote.firmQuoteDraft, quote.roomTypeConfig,
    quote.validUntil, quote.createdAt, quote.pricingPreview)
}

export async function getPublicQuoteWorkflowByRef(
  quoteRef: string,
  variant: QuoteDocumentVariant = 'remote_review'
): Promise<PublicQuoteWorkflowRecord | null> {
  const roomTypeConfig = await getQuoteRoomTypeConfig()
  const pricingConfig = await getQuotePricingConfig()
  const quote = await getQuoteWorkflowByRef(quoteRef, roomTypeConfig)
  if (!quote) return null

  if (variant === 'final') {
    if (!quote.finalDocument) return null
    return { ...quote, ...quote.finalDocument }
  }

  const remoteDraft = createDefaultFirmQuoteDraft(quote.inputs, roomTypeConfig)
  const calculatedPreview = buildFirmQuotePreview(remoteDraft, pricingConfig, roomTypeConfig)
  const pricingPreview = {
    ...calculatedPreview,
    calculated: quote.result,
    calculatedLow: quote.result.totalLow,
    calculatedHigh: quote.result.totalHigh,
    adjustedLow: quote.result.totalLow,
    adjustedHigh: quote.result.totalHigh,
    suggestedPrice: null,
  }
  const displayPrice = { low: quote.result.totalLow, high: quote.result.totalHigh, isFirm: false }
  return {
    ...quote,
    firmQuoteDraft: remoteDraft,
    inputs: quote.inputs,
    result: applyFirmQuoteDisplayPrice(quote.result, displayPrice),
    pricingPreview,
    displayPrice,
    roomTypeConfig,
  }
}

export async function getPublicQuoteDocumentByRef(quoteRef: string, variant: QuoteDocumentVariant = 'remote_review') {
  const record = await getPublicQuoteWorkflowByRef(quoteRef, variant)
  return record ? toPublicQuoteDocument(record, variant) : null
}

export async function saveQuoteWorkflowByRef(quoteRef: string, inspectionReport: InspectionReport, firmQuoteDraft: FirmQuoteDraft) {
  const db = getAdminSupabase()
  const { data, error } = await db.from('quotes').update({
    inspection_report: inspectionReport,
    firm_quote_workflow: firmQuoteDraft,
    updated_at: new Date().toISOString(),
  }).eq('quote_ref', quoteRef).is('final_quote_document', null).select('quote_ref').maybeSingle()
  if (error) throw error
  if (!data) throw new QuoteWorkflowConflictError('Reviewed and sent quotes cannot be changed by a normal save.')
  return data
}

export async function reviewQuoteWorkflowByRef(
  quoteRef: string,
  inspectionReport: InspectionReport,
  firmQuoteDraft: FirmQuoteDraft,
  actor: QuoteWorkflowActor,
  pricingConfig: QuotePricingConfig,
  roomTypeConfig: QuoteRoomTypeConfig
) {
  const readiness = getFinalQuoteReadiness(firmQuoteDraft)
  if (!readiness.ready) throw new Error(readiness.errors[0])
  const current = await getQuoteWorkflowByRef(quoteRef, roomTypeConfig)
  if (!current) throw new Error('Quote not found.')
  const reviewedAt = new Date().toISOString()
  const pricingPreview = buildFirmQuotePreview(firmQuoteDraft, pricingConfig, roomTypeConfig)
  const displayPrice = getFirmQuoteDisplayPrice(firmQuoteDraft, pricingPreview)
  const finalDocument: FinalQuoteDocument = {
    variant: 'final', version: 1, reviewedAt, reviewedBy: actor,
    inputs: firmQuoteDraft.revisedInputs,
    result: applyFirmQuoteDisplayPrice(current.result, displayPrice),
    firmQuoteDraft, pricingPreview, displayPrice, roomTypeConfig,
  }
  const db = getAdminSupabase()
  const { data, error } = await db.from('quotes').update({
    inspection_report: inspectionReport, firm_quote_workflow: firmQuoteDraft,
    final_quote_document: finalDocument, final_quote_document_version: 1,
    final_quote_reviewed_at: reviewedAt, final_quote_reviewed_by: actor, updated_at: reviewedAt,
  }).eq('quote_ref', quoteRef).is('final_quote_document', null).select('quote_ref').maybeSingle()
  if (error) throw error
  if (!data) throw new QuoteWorkflowConflictError('This quote has already been reviewed. Reload before continuing.')
  return finalDocument
}

export type QuoteSendAttempt = {
  id: string
  status: 'claimed' | 'provider_accepted' | 'finalized' | 'failed'
  providerMessageId?: string | null
}

export async function createFinalQuoteSendAttempt(
  quoteRef: string,
  attemptId: string,
  actor: QuoteWorkflowActor,
  recipient: string,
  documentVersion: number
): Promise<QuoteSendAttempt | null> {
  const db = getAdminSupabase()
  const { data, error } = await db.rpc('claim_final_quote_send', {
    p_attempt_id: attemptId, p_quote_ref: quoteRef, p_actor: actor,
    p_recipient: recipient, p_document_version: documentVersion,
  })
  if (error) throw error
  return data ? { id: attemptId, status: 'claimed' } : null
}

export async function recordFinalQuoteProviderAccepted(attemptId: string, providerMessageId: string | null) {
  const db = getAdminSupabase()
  const { data, error } = await db.from('quote_send_attempts').update({
    status: 'provider_accepted', provider_message_id: providerMessageId, provider_accepted_at: new Date().toISOString(),
  }).eq('id', attemptId).eq('status', 'claimed').select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new QuoteWorkflowConflictError('The delivery attempt changed before provider acceptance could be recorded.')
}

export async function recordFinalQuoteSendFailure(attemptId: string, failureStage: 'provider_rejected' | 'internal_before_provider') {
  const db = getAdminSupabase()
  const { data, error } = await db.from('quote_send_attempts').update({ status: 'failed', failure_stage: failureStage, failed_at: new Date().toISOString() })
    .eq('id', attemptId).eq('status', 'claimed').select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new QuoteWorkflowConflictError('The delivery attempt changed before failure could be recorded.')
}

export async function completeFinalQuoteSend(quoteRef: string, attemptId: string, documentVersion: number) {
  const db = getAdminSupabase()
  const sentAt = new Date().toISOString()
  const { data, error } = await db.rpc('finalize_final_quote_send', {
    p_quote_ref: quoteRef,
    p_attempt_id: attemptId,
    p_document_version: documentVersion,
    p_sent_at: sentAt,
  })
  if (error) throw error
  if (!data) throw new Error('The send could not be finalized.')
  return { sentAt }
}

export async function getUnresolvedFinalQuoteSendAttempt(quoteRef: string) {
  const db = getAdminSupabase()
  const { data, error } = await db.from('quote_send_attempts')
    .select('id, status, recipient, document_variant, document_version, provider_message_id, claimed_at, provider_accepted_at')
    .eq('quote_ref', quoteRef).in('status', ['claimed', 'provider_accepted']).order('claimed_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data
}

export async function reconcileFinalQuoteSend(
  quoteRef: string, attemptId: string, resolution: 'confirmed_rejected' | 'confirmed_accepted',
  evidence: string, actor: QuoteWorkflowActor, providerMessageId?: string
) {
  const db = getAdminSupabase()
  const { data, error } = await db.rpc('reconcile_final_quote_send', {
    p_quote_ref: quoteRef, p_attempt_id: attemptId, p_resolution: resolution, p_evidence: evidence,
    p_actor: actor, p_provider_message_id: providerMessageId || null, p_reconciled_at: new Date().toISOString(),
  })
  if (error) throw error
  if (!data) throw new QuoteWorkflowConflictError('The delivery attempt is no longer unresolved or did not match this quote.')
  return data
}

export function getFirmQuotePreview(record: Pick<QuoteWorkflowRecord, 'firmQuoteDraft'>, pricingConfig: QuotePricingConfig,
  roomTypeConfig?: QuoteRoomTypeConfig): FirmQuotePreview {
  return buildFirmQuotePreview(record.firmQuoteDraft, pricingConfig, roomTypeConfig)
}
