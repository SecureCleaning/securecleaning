import { getAdminSupabase } from '@/lib/supabase'
import type { QuoteInputs, QuoteResult } from '@/lib/types'
import {
  applyFirmQuoteDisplayPrice,
  buildFirmQuotePreview,
  createDefaultFirmQuoteDraft,
  createDefaultInspectionReport,
  getFirmQuoteDisplayPrice,
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
}

export type PublicQuoteWorkflowRecord = QuoteWorkflowRecord & {
  pricingPreview: FirmQuotePreview
  displayPrice: FirmQuoteDisplayPrice
  roomTypeConfig: QuoteRoomTypeConfig
}

function isMissingColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return message.includes('column') && (message.includes('inspection_report') || message.includes('firm_quote_workflow'))
}

export async function getQuoteWorkflowByRef(
  quoteRef: string,
  roomTypeConfig: QuoteRoomTypeConfig = DEFAULT_QUOTE_ROOM_TYPE_CONFIG
): Promise<QuoteWorkflowRecord | null> {
  const db = getAdminSupabase()

  const { data, error } = await db
    .from('quotes')
    .select('id, quote_ref, inputs, result, status, valid_until, created_at')
    .eq('quote_ref', quoteRef)
    .maybeSingle()

  if (error) {
    console.error('[quoteWorkflowData] Failed to load base quote:', error)
    return null
  }

  if (!data) return null

  let inspectionReport = createDefaultInspectionReport(data.inputs as QuoteInputs)
  let firmQuoteDraft = createDefaultFirmQuoteDraft(data.inputs as QuoteInputs, roomTypeConfig)
  let workflowColumnsAvailable = false

  const workflowRes = await db
    .from('quotes')
    .select('inspection_report, firm_quote_workflow')
    .eq('quote_ref', quoteRef)
    .maybeSingle()

  if (workflowRes.error) {
    if (!isMissingColumnError(workflowRes.error)) {
      console.error('[quoteWorkflowData] Failed to load workflow fields:', workflowRes.error)
    }
  } else if (workflowRes.data) {
    workflowColumnsAvailable = true
    inspectionReport = parseInspectionReport(workflowRes.data.inspection_report, data.inputs as QuoteInputs)
    firmQuoteDraft = parseFirmQuoteDraft(workflowRes.data.firm_quote_workflow, data.inputs as QuoteInputs, roomTypeConfig)
  }

  return {
    id: data.id,
    quoteRef: data.quote_ref,
    inputs: data.inputs as QuoteInputs,
    result: data.result as QuoteResult,
    status: data.status,
    validUntil: data.valid_until,
    createdAt: data.created_at,
    inspectionReport,
    firmQuoteDraft,
    workflowColumnsAvailable,
  }
}

export async function getPublicScopeByRef(quoteRef: string): Promise<ClientScopeReport | null> {
  const quote = await getPublicQuoteWorkflowByRef(quoteRef)
  if (!quote) return null

  return buildClientScopeReport(
    quote.quoteRef,
    quote.inputs,
    quote.result,
    quote.firmQuoteDraft,
    quote.roomTypeConfig,
    quote.validUntil,
    quote.createdAt,
    quote.pricingPreview
  )
}

export async function getPublicQuoteWorkflowByRef(quoteRef: string): Promise<PublicQuoteWorkflowRecord | null> {
  const roomTypeConfig = await getQuoteRoomTypeConfig()
  const pricingConfig = await getQuotePricingConfig()
  const quote = await getQuoteWorkflowByRef(quoteRef, roomTypeConfig)

  if (!quote) return null

  const pricingPreview = buildFirmQuotePreview(quote.firmQuoteDraft, pricingConfig, roomTypeConfig)
  const displayPrice = getFirmQuoteDisplayPrice(quote.firmQuoteDraft, pricingPreview)

  return {
    ...quote,
    inputs: quote.firmQuoteDraft.revisedInputs,
    result: applyFirmQuoteDisplayPrice(quote.result, displayPrice),
    pricingPreview,
    displayPrice,
    roomTypeConfig,
  }
}

export async function saveQuoteWorkflowByRef(
  quoteRef: string,
  inspectionReport: InspectionReport,
  firmQuoteDraft: FirmQuoteDraft
) {
  const db = getAdminSupabase()

  const { data, error } = await db
    .from('quotes')
    .update({
      inspection_report: inspectionReport,
      firm_quote_workflow: firmQuoteDraft,
      updated_at: new Date().toISOString(),
    })
    .eq('quote_ref', quoteRef)
    .select('quote_ref')
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

export function getFirmQuotePreview(
  record: Pick<QuoteWorkflowRecord, 'firmQuoteDraft'>,
  pricingConfig: QuotePricingConfig,
  roomTypeConfig?: QuoteRoomTypeConfig
): FirmQuotePreview {
  return buildFirmQuotePreview(record.firmQuoteDraft, pricingConfig, roomTypeConfig)
}
