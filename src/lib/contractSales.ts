import { parsePlanInstalments } from '@/lib/commissionPolicy'
import { parseRichEmailContent, sanitizeRichEmailHtml } from '@/lib/richEmailServer'
import { plainTextToEmailHtml } from '@/lib/richEmailContent'
import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { getAdminSupabase } from '@/lib/supabase'
import { EmailProviderRejectedError, sendEmailOrThrow } from '@/lib/email'
import { writeAuditLogStrict } from '@/lib/auditLog'
import type { ContractProductActor } from '@/lib/contractProductAuth'
import { getContractProducts, ContractProductError } from '@/lib/contractProducts'
import { createCleanerForState, type CleanerPayload } from '@/lib/cleaners'
import { getDateTimeInTimeZone } from '@/lib/calendarInvite'
import { getAvailabilityAssignee, getAvailabilityConfig } from '@/lib/availability'
import { upsertContractSaleInspectionEvent } from '@/lib/googleCalendar'
import { applyEmailMergeFields, findUnsupportedEmailMergeFields, INSPECTION_EMAIL_MERGE_FIELD_KEYS } from '@/lib/emailMergeFields'
import { buildContractSaleChecklistPdf, type ContractSaleChecklistData } from '@/lib/contractSaleChecklistPdf'
import {
  buildContractSaleTaxInvoicePdf,
  renderContractSaleInvoiceTemplateText,
  type ContractSaleInvoiceTemplateTokens,
  type ContractSaleTaxInvoicePdfInput,
} from '@/lib/contractSaleInvoicePdf'
import {
  buildContractSaleAgreementPdf,
  renderContractSaleAgreementEmailHtml,
} from '@/lib/contractSaleAgreementDocument'
import {
  CONTRACT_SALE_DEPOSIT_INC_GST_CENTS,
  buildContractSaleAgreement,
  buildMonthlyInstalments,
  buildPaymentPlanTerms,
  calculateInclusiveGstComponent,
  canConfirmContractSalePayment,
  canManageContractSale,
  normalizeInvoiceEmail,
  type ContractSaleStatus,
} from '@/lib/contractSalePolicy'

type Row = Record<string, unknown>

export type ContractSaleInvoice = {
  id: string
  invoiceNumber: string
  invoiceType: 'sale' | 'deposit' | 'balance'
  status: string
  totalIncGstCents: number
  gstComponentCents: number
  depositRequiredIncGstCents: number
  dueOn: string | null
  paymentTerms: string
  deliveryStatus: string
  issuedAt: string
  paidCents: number
}

export type ContractSalePayment = {
  id: string
  amountCents: number
  receivedOn: string
  method: string
  reference: string
  evidenceNote: string
  status: string
  recordedAt: string
  invoiceId: string | null
}

export type ContractSale = {
  id: string
  saleCode: string
  productId: string
  productCode: string
  opportunityId: string
  sourceQuoteRef: string
  cleanerId: string
  cleanerName: string
  cleanerBusiness: string
  cleanerEmail: string
  cleanerPhone: string
  cleanerStatus: string
  assignedStaffId: string | null
  status: ContractSaleStatus
  state: string
  suburb: string
  siteId: string | null
  siteName: string
  siteAddress: string
  siteAccessNotes: string
  siteAlarmNotes: string
  siteInductionNotes: string
  siteKeyholderName: string
  siteKeyholderPhone: string
  clientBusiness: string
  clientName: string
  clientEmail: string
  clientPhone: string
  agreedPurchasePriceIncGstCents: number
  depositIncGstCents: number
  priceFinalised: boolean
  commencementDate: string
  notes: string
  handoverAt: string | null
  createdAt: string
  updatedAt: string
  invoices: ContractSaleInvoice[]
  payments: ContractSalePayment[]
  inspection: null | {
    id: string
    status: string
    startsAt: string
    durationMinutes: number
    timeZone: string
    location: string
    inviteStatus: string
    calendarStatus: string
    calendarError: string
    notes: string
  }
  checklist: null | {
    id: string
    status: string
    data: ContractSaleChecklistData
    uploads: Array<{ id: string; fileName: string; mimeType: string; uploadedAt: string }>
  }
  agreement: null | {
    id: string
    version: number
    type: string
    status: string
    content: string
    signedAt: string | null
    signedFileName: string | null
  }
  paymentPlan: null | {
    id: string
    status: string
    terms: string
    openingPaidCents: number
    instalments: Array<{ sequenceNumber: number; dueOn: string; amountCents: number }>
  }
  activity: Array<{ id: string; action: string; details: Record<string, unknown>; createdAt: string }>
}

export type ContractSaleInspectionTemplate = {
  availabilitySubject: string
  availabilityBodyText: string
  availabilityBodyHtml: string
  availabilityBodyDocument?: Record<string, unknown> | null
  clientSubject: string
  clientBodyText: string
  clientBodyHtml: string
  clientBodyDocument?: Record<string, unknown> | null
  cleanerSubject: string
  cleanerBodyText: string
  cleanerBodyHtml: string
  cleanerBodyDocument?: Record<string, unknown> | null
  updatedAt: string | null
}

export type ContractSaleCleanerOption = {
  id: string
  businessName: string
  contactName: string
  email: string
  state: string
  status: string
  complianceStatus: string
}

export type ContractSaleInvoiceTemplate = {
  supplierName: string
  supplierAbn: string
  supplierEmail: string
  invoiceTitle: string
  lineItemTemplate: string
  emailSubjectTemplate: string
  emailIntroTemplate: string
  emailIntroHtml?: string
  emailIntroDocument?: Record<string, unknown> | null
  paymentTermsTemplate: string
  bankAccountName: string
  bankName: string
  bankBsb: string
  bankAccountNumber: string
  paymentReferenceTemplate: string
  footerNote: string
  updatedAt: string | null
}

const SALE_SELECT = 'id, sale_code, product_id, cleaner_id, opportunity_id, source_quote_id, deleted_source_quote_ref, site_id, assigned_staff_id, status, agreed_purchase_price_inc_gst_cents, deposit_inc_gst_cents, price_finalised_at, product_snapshot, cleaner_snapshot, client_snapshot, site_snapshot, commencement_date, internal_notes, handover_at, created_at, updated_at'
const INVOICE_SELECT = 'id, invoice_number, sale_id, invoice_type, status, total_inc_gst_cents, gst_component_cents, deposit_required_inc_gst_cents, due_on, payment_terms_snapshot, delivery_status, issued_at'
const INVOICE_DOCUMENT_SELECT = 'id, invoice_number, invoice_type, recipient_email_snapshot, recipient_business_snapshot, recipient_name_snapshot, recipient_address_snapshot, recipient_abn_snapshot, supplier_name_snapshot, supplier_abn_snapshot, supplier_email_snapshot, invoice_title_snapshot, email_subject_template_snapshot, email_intro_template_snapshot, email_intro_html_snapshot, footer_note_snapshot, description_snapshot, total_inc_gst_cents, gst_component_cents, deposit_required_inc_gst_cents, due_on, payment_terms_snapshot, bank_account_name_snapshot, bank_name_snapshot, bank_bsb_snapshot, bank_account_number_snapshot, payment_reference_template_snapshot, sender_name_snapshot, sender_title_snapshot, sender_email_snapshot, issued_at, status, delivery_status, provider_message_id'
const PAYMENT_SELECT = 'id, sale_id, intended_invoice_id, amount_cents, received_on, payment_method, payment_reference, evidence_note, status, created_at'
const SECURE_CLEANING_NAME = 'Secure Cleaning'
const SECURE_CLEANING_ABN = '81 674 121 825'
const SECURE_CLEANING_EMAIL = 'info@securecleaning.com.au'
const INVOICE_TEMPLATE_ID = 'default'
const INSPECTION_TEMPLATE_ID = 'default'
export const DEFAULT_CONTRACT_SALE_INVOICE_TEMPLATE: ContractSaleInvoiceTemplate = {
  supplierName: SECURE_CLEANING_NAME,
  supplierAbn: SECURE_CLEANING_ABN,
  supplierEmail: SECURE_CLEANING_EMAIL,
  invoiceTitle: 'TAX INVOICE',
  lineItemTemplate: 'Contract sale for {product_code} - {suburb}, {state}',
  emailSubjectTemplate: '{invoice_number} - Tax invoice for {product_code}',
  emailIntroTemplate: 'Please find attached the full tax invoice for contract product {product_code}.',
  paymentTermsTemplate: '{deposit_inc_gst} deposit including GST is due on receipt and must clear before the site inspection. The remaining balance of {balance_inc_gst} is due before cleaning commences unless an approved payment plan applies.',
  footerNote: 'This document is a tax invoice. All amounts are in Australian dollars and the total amount payable includes GST.',
  bankAccountName: '', bankName: '', bankBsb: '', bankAccountNumber: '', paymentReferenceTemplate: '{invoice_number}',
  updatedAt: null,
}

export const DEFAULT_CONTRACT_SALE_INSPECTION_TEMPLATE: ContractSaleInspectionTemplate = {
  availabilitySubject: 'Site inspection availability - <<site_name>>',
  availabilityBodyText: 'Hi <<client_first_name>>,\n\nWe are ready to arrange the site inspection for <<site_name>>. Please reply with the days and times that suit you, along with any access requirements we should know before attending.\n\nKind regards,\n<<sender_name>>\n<<sender_title>>\nSecure Cleaning\n<<sender_phone>>\n<<sender_email>>',
  availabilityBodyHtml: '',
  clientSubject: 'Site inspection confirmed - <<site_name>> - <<inspection_date>>',
  clientBodyText: 'Hi <<client_first_name>>,\n\nThis confirms the Secure Cleaning site inspection at <<site_name>>.\n\nDate: <<inspection_date>>\nTime: <<inspection_time>>\nDuration: <<inspection_duration>>\nLocation: <<inspection_location>>\n\nA calendar invitation is attached. Please let us know if anything changes.\n\nKind regards,\n<<sender_name>>\n<<sender_title>>\nSecure Cleaning\n<<sender_phone>>\n<<sender_email>>',
  clientBodyHtml: '',
  cleanerSubject: 'Site inspection booked - <<site_name>> - <<inspection_date>>',
  cleanerBodyText: 'Hi <<cleaner_first_name>>,\n\nThe client has confirmed the site inspection for <<site_name>>.\n\nDate: <<inspection_date>>\nTime: <<inspection_time>>\nDuration: <<inspection_duration>>\nLocation: <<inspection_location>>\n\nPlease attend with <<sender_name>>. A calendar invitation is attached.\n\nKind regards,\n<<sender_name>>\n<<sender_title>>\nSecure Cleaning\n<<sender_phone>>\n<<sender_email>>',
  cleanerBodyHtml: '',
  updatedAt: null,
}

const ALLOWED_INVOICE_TEMPLATE_TOKENS = new Set([
  'invoice_number', 'product_code', 'sale_code', 'cleaner_name', 'cleaner_business', 'suburb', 'state',
  'total_inc_gst', 'deposit_inc_gst', 'balance_inc_gst', 'agent_name', 'agent_title',
])

function clean(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function normalizeAustralianAbn(value: unknown) {
  const digits = clean(value, 32).replace(/\D/g, '')
  if (digits.length !== 11) return ''
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
  const numbers = digits.split('').map(Number)
  numbers[0] -= 1
  if (numbers.reduce((sum, number, index) => sum + number * weights[index], 0) % 89 !== 0) return ''
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`
}

function validateInvoiceTemplateText(value: unknown, label: string, min: number, max: number) {
  const text = clean(value, max)
  if (text.length < min) throw new ContractProductError(`${label} must be between ${min} and ${max} characters.`)
  const tokens = text.matchAll(/\{([^{}]+)\}/g)
  for (const token of tokens) {
    if (!ALLOWED_INVOICE_TEMPLATE_TOKENS.has(token[1])) throw new ContractProductError(`${label} contains the unsupported token {${token[1]}}.`)
  }
  return text
}

export function renderContractSaleInvoiceEmailIntro(text: string, html: unknown, tokens: ContractSaleInvoiceTemplateTokens) {
  const safeTokens = Object.fromEntries(Object.entries(tokens).map(([key, value]) => [key, escapeHtml(value)])) as ContractSaleInvoiceTemplateTokens
  return sanitizeRichEmailHtml(renderContractSaleInvoiceTemplateText(typeof html === 'string' && html.trim() ? sanitizeRichEmailHtml(html) : plainTextToEmailHtml(text), safeTokens))
}

function mapInvoiceTemplate(row: Row | null | undefined): ContractSaleInvoiceTemplate {
  if (!row) return { ...DEFAULT_CONTRACT_SALE_INVOICE_TEMPLATE }
  return {
    supplierName: String(row.supplier_name), supplierAbn: String(row.supplier_abn), supplierEmail: String(row.supplier_email),
    invoiceTitle: String(row.invoice_title), lineItemTemplate: String(row.line_item_template),
    emailSubjectTemplate: String(row.email_subject_template), emailIntroTemplate: String(row.email_intro_template),
    emailIntroHtml: String(row.email_intro_html ?? ''), emailIntroDocument: row.email_intro_document as Record<string, unknown> | null,
    paymentTermsTemplate: String(row.payment_terms_template), footerNote: String(row.footer_note),
    bankAccountName: String(row.bank_account_name ?? ''), bankName: String(row.bank_name ?? ''),
    bankBsb: String(row.bank_bsb ?? ''), bankAccountNumber: String(row.bank_account_number ?? ''),
    paymentReferenceTemplate: String(row.payment_reference_template ?? '{invoice_number}'),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  }
}

async function loadInvoiceTemplate() {
  const { data, error } = await getAdminSupabase().from('contract_sale_invoice_templates').select('*').eq('id', INVOICE_TEMPLATE_ID).maybeSingle()
  if (error) throw error
  return mapInvoiceTemplate(data as Row | null)
}

function mapInspectionTemplate(row: Row | null | undefined): ContractSaleInspectionTemplate {
  if (!row) return { ...DEFAULT_CONTRACT_SALE_INSPECTION_TEMPLATE }
  return {
    availabilitySubject: String(row.availability_subject), availabilityBodyText: String(row.availability_body_text),
    availabilityBodyHtml: String(row.availability_body_html ?? ''), availabilityBodyDocument: row.availability_body_document as Record<string, unknown> | null,
    clientSubject: String(row.client_subject), clientBodyText: String(row.client_body_text), clientBodyHtml: String(row.client_body_html ?? ''),
    clientBodyDocument: row.client_body_document as Record<string, unknown> | null,
    cleanerSubject: String(row.cleaner_subject), cleanerBodyText: String(row.cleaner_body_text), cleanerBodyHtml: String(row.cleaner_body_html ?? ''),
    cleanerBodyDocument: row.cleaner_body_document as Record<string, unknown> | null,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  }
}

async function loadInspectionTemplate() {
  const { data, error } = await getAdminSupabase().from('contract_sale_inspection_templates').select('*').eq('id', INSPECTION_TEMPLATE_ID).maybeSingle()
  if (error) throw error
  return mapInspectionTemplate(data as Row | null)
}

type InspectionEmailKind = 'availability' | 'client' | 'cleaner'

function parseInspectionEmailDraft(input: Record<string, unknown>, prefix: InspectionEmailKind) {
  const subject = clean(input[`${prefix}Subject`], 200)
  if (subject.length < 3) throw new ContractProductError('Enter an email subject.')
  const rich = parseRichEmailContent(input, {
    text: `${prefix}BodyText`, html: `${prefix}BodyHtml`, document: `${prefix}BodyDocument`, maxText: 5000,
  })
  if (rich.text.trim().length < 10) throw new ContractProductError('Enter at least 10 characters for the email message.')
  const unsupported = findUnsupportedEmailMergeFields(INSPECTION_EMAIL_MERGE_FIELD_KEYS, subject, rich.text, rich.html)
  if (unsupported.length) throw new ContractProductError(`Remove unsupported inspection email fields: ${unsupported.join(', ')}.`)
  return { subject, bodyText: rich.text, bodyHtml: rich.html, bodyDocument: rich.document }
}

function inspectionEmailFingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function firstName(value: unknown) {
  return clean(value, 160).split(/\s+/)[0] || 'there'
}

function renderInspectionEmail(draft: ReturnType<typeof parseInspectionEmailDraft>, values: Record<string, string>) {
  const subject = applyEmailMergeFields(draft.subject, values)
  const bodyText = applyEmailMergeFields(draft.bodyText, values)
  const safeValues = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, escapeHtml(value)]))
  const sourceHtml = draft.bodyHtml.trim() ? sanitizeRichEmailHtml(draft.bodyHtml) : plainTextToEmailHtml(draft.bodyText)
  const bodyHtml = sanitizeRichEmailHtml(applyEmailMergeFields(sourceHtml, safeValues))
  const html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#1f2937"><div style="border-bottom:4px solid #0c766e;padding:18px 0"><strong style="font-size:24px;color:#0c766e">Secure Cleaning</strong></div><div style="padding:22px 0">${bodyHtml}</div></div>`
  return { subject, bodyText, bodyHtml, bodyDocument: draft.bodyDocument, html }
}

const CHECKLIST_KEYS: Array<keyof ContractSaleChecklistData> = [
  'inspectionDate', 'commencementDate', 'clientBusiness', 'clientContact', 'clientPhone', 'clientEmail',
  'cleanerBusiness', 'cleanerContact', 'cleanerPhone', 'cleanerEmail', 'siteName', 'siteAddress',
  'cleaningDays', 'cleaningTime', 'frequency', 'scopeSummary', 'initialClean', 'accessHours',
  'accessInstructions', 'inductionRequirements', 'alarmSecurity', 'keyholderDetails', 'lightSwitches',
  'cleanerStorage', 'consumables', 'waterAccess', 'rubbishDisposal', 'cleanerBook', 'hazards', 'equipment',
  'keysItemsHandedOver', 'notes',
]

function parseChecklist(value: unknown): ContractSaleChecklistData {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return Object.fromEntries(CHECKLIST_KEYS.map((key) => [key, clean(source[key], key === 'scopeSummary' || key === 'notes' ? 5000 : 2000)])) as ContractSaleChecklistData
}

function assertDate(value: unknown, required = true) {
  const date = clean(value, 20)
  if ((!date && required) || (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    throw new ContractProductError('Enter a valid date.')
  }
  return date
}

function money(cents: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

function actorAudit(actor: ContractProductActor) {
  return { actorId: actor.id, actorUsername: actor.username, actorRole: actor.role }
}

async function getAuthorizedSale(actor: ContractProductActor, saleId: string) {
  const { data, error } = await getAdminSupabase().from('contract_product_sales')
    .select(SALE_SELECT).eq('id', saleId).maybeSingle()
  if (error) throw error
  if (!data || !canManageContractSale(actor.role, actor.id, data.assigned_staff_id)) {
    throw new ContractProductError('Product sale not found.', 404)
  }
  if (actor.role === 'agent') {
    const { data: product } = await getAdminSupabase().from('contract_products').select('state').eq('id', data.product_id).maybeSingle()
    if (!product || product.state !== actor.productState) throw new ContractProductError('Product sale not found.', 404)
  }
  return data as Row
}

async function loadSaleContext(sale: Row) {
  const db = getAdminSupabase()
  const [product, cleaner, opportunity, quote, staff] = await Promise.all([
    db.from('contract_products').select('id, product_code, state, suburb, start_date, frequency, time_preference, cleaner_scope_snapshot').eq('id', sale.product_id).single(),
    db.from('cleaners').select('id, business_name, contact_name, email, phone, address, suburb, postcode, state, abn, status, compliance_status').eq('id', sale.cleaner_id).single(),
    db.from('crm_opportunities').select('primary_contact_id, site_id').eq('id', sale.opportunity_id).single(),
    sale.source_quote_id
      ? db.from('quotes').select('quote_ref').eq('id', sale.source_quote_id).single()
      : Promise.resolve({ data: sale.deleted_source_quote_ref ? { quote_ref: String(sale.deleted_source_quote_ref) } : null, error: null }),
    sale.assigned_staff_id
      ? db.from('admin_staff_accounts').select('id, display_name, email, job_title, phone, availability_assignee_id').eq('id', sale.assigned_staff_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  for (const result of [product, cleaner, opportunity, quote, staff]) if (result.error) throw result.error
  if (!product.data || !cleaner.data || !opportunity.data || !quote.data) {
    throw new ContractProductError('The linked product, cleaner, client opportunity, or quote is no longer available.', 409)
  }
  const [client, site] = await Promise.all([
    db.from('clients').select('business_name, contact_name, email, phone').eq('id', opportunity.data.primary_contact_id).maybeSingle(),
    opportunity.data.site_id
      ? db.from('sites').select('id, site_name, address, suburb, postcode, city, access_notes, alarm_notes, induction_notes, keyholder_name, keyholder_phone').eq('id', opportunity.data.site_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (client.error) throw client.error
  if (site.error) throw site.error
  return { product: product.data, cleaner: cleaner.data, opportunity: opportunity.data, quote: quote.data, staff: staff.data, client: client.data, site: site.data }
}

export async function getContractSaleWorkspace(actor: ContractProductActor) {
  const db = getAdminSupabase()
  const [products, invoiceTemplate, inspectionTemplate] = await Promise.all([getContractProducts(actor), loadInvoiceTemplate(), loadInspectionTemplate()])
  const productIds = products.map((product) => product.id)
  let saleRows: Row[] = []
  if (productIds.length) {
    const { data, error } = await db.from('contract_product_sales').select(SALE_SELECT)
      .in('product_id', productIds).order('updated_at', { ascending: false })
    if (error) throw error
    saleRows = (data ?? []) as Row[]
  }
  const saleIds = saleRows.map((sale) => String(sale.id))
  const cleanerIds = Array.from(new Set(saleRows.map((sale) => String(sale.cleaner_id))))
  const opportunityIds = Array.from(new Set(saleRows.map((sale) => String(sale.opportunity_id))))
  const quoteIds = Array.from(new Set(saleRows.flatMap((sale) => sale.source_quote_id ? [String(sale.source_quote_id)] : [])))
  const siteIds = Array.from(new Set(saleRows.map((sale) => String(sale.site_id ?? '')).filter(Boolean)))
  const [cleanersResult, opportunityResult, quotesResult, sitesResult, invoicesResult, paymentsResult, inspectionsResult, agreementsResult, plansResult, activityResult, checklistsResult, checklistUploadsResult] = await Promise.all([
    cleanerIds.length ? db.from('cleaners').select('id, business_name, contact_name, email, phone, state, status').in('id', cleanerIds) : Promise.resolve({ data: [], error: null }),
    opportunityIds.length ? db.from('crm_opportunities').select('id, primary_contact_id').in('id', opportunityIds) : Promise.resolve({ data: [], error: null }),
    quoteIds.length ? db.from('quotes').select('id, quote_ref').in('id', quoteIds) : Promise.resolve({ data: [], error: null }),
    siteIds.length ? db.from('sites').select('id, site_name, address, suburb, postcode, city, access_notes, alarm_notes, induction_notes, keyholder_name, keyholder_phone').in('id', siteIds) : Promise.resolve({ data: [], error: null }),
    saleIds.length ? db.from('contract_sale_invoices').select(INVOICE_SELECT).in('sale_id', saleIds).order('issued_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    saleIds.length ? db.from('contract_sale_payments').select(PAYMENT_SELECT).in('sale_id', saleIds).order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    saleIds.length ? db.from('contract_sale_inspections').select('id, sale_id, status, starts_at, duration_minutes, time_zone, location_snapshot, invite_status, calendar_status, calendar_error, notes').in('sale_id', saleIds) : Promise.resolve({ data: [], error: null }),
    saleIds.length ? db.from('contract_sale_agreements').select('id, sale_id, version, agreement_type, status, content_snapshot, signed_at, signed_file_name').in('sale_id', saleIds).order('version', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    saleIds.length ? db.from('contract_sale_payment_plans').select('id, sale_id, version, status, terms_snapshot, opening_paid_cents').in('sale_id', saleIds).order('version', { ascending: false }) : Promise.resolve({ data: [], error: null }),
    saleIds.length ? db.from('admin_audit_log').select('id, entity_ref, action, details, created_at').eq('entity_type', 'contract_sale').in('entity_ref', saleIds).order('created_at', { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
    saleIds.length ? db.from('contract_sale_site_checklists').select('id, sale_id, status, checklist_data').in('sale_id', saleIds) : Promise.resolve({ data: [], error: null }),
    saleIds.length ? db.from('contract_sale_checklist_uploads').select('id, sale_id, checklist_id, file_name, mime_type, uploaded_at').in('sale_id', saleIds).order('uploaded_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ])
  for (const result of [cleanersResult, opportunityResult, quotesResult, sitesResult, invoicesResult, paymentsResult, inspectionsResult, agreementsResult, plansResult, activityResult, checklistsResult, checklistUploadsResult]) if (result.error) throw result.error
  const invoiceIds = (invoicesResult.data ?? []).map((row) => String(row.id))
  const planIds = (plansResult.data ?? []).map((row) => String(row.id))
  const [allocationsResult, instalmentsResult] = await Promise.all([
    invoiceIds.length ? db.from('contract_sale_payment_allocations').select('payment_id, invoice_id, amount_cents').in('invoice_id', invoiceIds) : Promise.resolve({ data: [], error: null }),
    planIds.length ? db.from('contract_sale_payment_plan_instalments').select('payment_plan_id, sequence_number, due_on, amount_cents').in('payment_plan_id', planIds).order('sequence_number') : Promise.resolve({ data: [], error: null }),
  ])
  if (allocationsResult.error) throw allocationsResult.error
  if (instalmentsResult.error) throw instalmentsResult.error

  const contactIds = Array.from(new Set((opportunityResult.data ?? []).map((row) => String(row.primary_contact_id))))
  const { data: contacts, error: contactError } = contactIds.length
    ? await db.from('clients').select('id, business_name, contact_name, email, phone').in('id', contactIds)
    : { data: [], error: null }
  if (contactError) throw contactError
  const byId = <T extends { id: unknown }>(rows: T[]) => new Map(rows.map((row) => [String(row.id), row]))
  const productsById = new Map(products.map((product) => [product.id, product]))
  const cleanersById = byId(cleanersResult.data ?? [])
  const opportunitiesById = byId(opportunityResult.data ?? [])
  const contactsById = byId(contacts ?? [])
  const quotesById = byId(quotesResult.data ?? [])
  const sitesById = byId(sitesResult.data ?? [])
  const allocationsByInvoice = new Map<string, number>()
  const allocationInvoiceByPayment = new Map<string, string>()
  for (const allocation of allocationsResult.data ?? []) {
    allocationsByInvoice.set(String(allocation.invoice_id), (allocationsByInvoice.get(String(allocation.invoice_id)) ?? 0) + Number(allocation.amount_cents))
    allocationInvoiceByPayment.set(String(allocation.payment_id), String(allocation.invoice_id))
  }
  const agreementsBySale = new Map<string, Row>()
  for (const agreement of (agreementsResult.data ?? []) as Row[]) if (!agreementsBySale.has(String(agreement.sale_id))) agreementsBySale.set(String(agreement.sale_id), agreement)
  const plansBySale = new Map<string, Row>()
  for (const plan of (plansResult.data ?? []) as Row[]) {
    const key = String(plan.sale_id)
    const current = plansBySale.get(key)
    if (!current || (['awaiting_acceptance', 'active'].includes(String(plan.status)) && !['awaiting_acceptance', 'active'].includes(String(current.status)))) plansBySale.set(key, plan)
  }

  const sales: ContractSale[] = saleRows.map((sale) => {
    const product = productsById.get(String(sale.product_id))!
    const cleaner = cleanersById.get(String(sale.cleaner_id))
    const opportunity = opportunitiesById.get(String(sale.opportunity_id))
    const contact = opportunity ? contactsById.get(String(opportunity.primary_contact_id)) : null
    const quote = quotesById.get(String(sale.source_quote_id))
    const site = sale.site_id ? sitesById.get(String(sale.site_id)) : null
    const agreement = agreementsBySale.get(String(sale.id))
    const plan = plansBySale.get(String(sale.id))
    const productSnapshot = (sale.product_snapshot ?? {}) as Row
    const cleanerSnapshot = (sale.cleaner_snapshot ?? {}) as Row
    const clientSnapshot = (sale.client_snapshot ?? {}) as Row
    const siteSnapshot = (sale.site_snapshot ?? {}) as Row
    return {
      id: String(sale.id), saleCode: String(sale.sale_code), productId: String(sale.product_id),
      productCode: String(productSnapshot.product_code ?? product?.productCode ?? ''), opportunityId: String(sale.opportunity_id), sourceQuoteRef: String(quote?.quote_ref ?? ''),
      cleanerId: String(sale.cleaner_id), cleanerName: String(cleanerSnapshot.contact_name ?? cleaner?.contact_name ?? ''), cleanerBusiness: String(cleanerSnapshot.business_name ?? cleaner?.business_name ?? ''),
      cleanerEmail: String(cleanerSnapshot.email ?? cleaner?.email ?? ''), cleanerPhone: String(cleanerSnapshot.phone ?? cleaner?.phone ?? ''), cleanerStatus: String(cleaner?.status ?? ''), assignedStaffId: typeof sale.assigned_staff_id === 'string' ? sale.assigned_staff_id : null,
      status: String(sale.status) as ContractSaleStatus, state: String(productSnapshot.state ?? product?.state ?? ''), suburb: String(productSnapshot.suburb ?? product?.suburb ?? ''),
      siteId: typeof sale.site_id === 'string' ? sale.site_id : null, siteName: String(siteSnapshot.site_name ?? site?.site_name ?? ''),
      siteAddress: [siteSnapshot.address ?? site?.address, siteSnapshot.suburb ?? site?.suburb, siteSnapshot.postcode ?? site?.postcode].filter(Boolean).join(', '),
      siteAccessNotes: String(siteSnapshot.access_notes ?? site?.access_notes ?? ''), siteAlarmNotes: String(siteSnapshot.alarm_notes ?? site?.alarm_notes ?? ''),
      siteInductionNotes: String(siteSnapshot.induction_notes ?? site?.induction_notes ?? ''), siteKeyholderName: String(siteSnapshot.keyholder_name ?? site?.keyholder_name ?? ''),
      siteKeyholderPhone: String(siteSnapshot.keyholder_phone ?? site?.keyholder_phone ?? ''),
      clientBusiness: String(clientSnapshot.business_name ?? contact?.business_name ?? ''),
      clientName: String(clientSnapshot.contact_name ?? contact?.contact_name ?? ''), clientEmail: String(clientSnapshot.email ?? contact?.email ?? ''), clientPhone: String(clientSnapshot.phone ?? contact?.phone ?? ''),
      agreedPurchasePriceIncGstCents: Number(sale.agreed_purchase_price_inc_gst_cents), depositIncGstCents: Number(sale.deposit_inc_gst_cents), priceFinalised: typeof sale.price_finalised_at === 'string',
      commencementDate: String(sale.commencement_date ?? ''), notes: String(sale.internal_notes ?? ''),
      handoverAt: typeof sale.handover_at === 'string' ? sale.handover_at : null, createdAt: String(sale.created_at), updatedAt: String(sale.updated_at),
      invoices: ((invoicesResult.data ?? []).filter((row) => String(row.sale_id) === String(sale.id))).map((row) => ({
        id: String(row.id), invoiceNumber: String(row.invoice_number), invoiceType: row.invoice_type as 'sale' | 'deposit' | 'balance', status: String(row.status),
        totalIncGstCents: Number(row.total_inc_gst_cents), gstComponentCents: Number(row.gst_component_cents),
        depositRequiredIncGstCents: Number(row.deposit_required_inc_gst_cents ?? (row.invoice_type === 'deposit' ? row.total_inc_gst_cents : 0)),
        dueOn: typeof row.due_on === 'string' ? row.due_on : null, paymentTerms: String(row.payment_terms_snapshot), deliveryStatus: String(row.delivery_status),
        issuedAt: String(row.issued_at), paidCents: allocationsByInvoice.get(String(row.id)) ?? 0,
      })),
      payments: ((paymentsResult.data ?? []).filter((row) => String(row.sale_id) === String(sale.id))).map((row) => ({
        id: String(row.id), amountCents: Number(row.amount_cents), receivedOn: String(row.received_on), method: String(row.payment_method),
        reference: String(row.payment_reference), evidenceNote: String(row.evidence_note ?? ''), status: String(row.status), recordedAt: String(row.created_at),
        invoiceId: allocationInvoiceByPayment.get(String(row.id)) ?? (String(row.intended_invoice_id ?? '') || null),
      })),
      inspection: (() => { const row = (inspectionsResult.data ?? []).find((item) => String(item.sale_id) === String(sale.id)); return row ? {
        id: String(row.id), status: String(row.status), startsAt: String(row.starts_at), durationMinutes: Number(row.duration_minutes),
        timeZone: String(row.time_zone), location: String(row.location_snapshot), inviteStatus: String(row.invite_status),
        calendarStatus: String(row.calendar_status ?? 'email_fallback'), calendarError: String(row.calendar_error ?? ''), notes: String(row.notes ?? ''),
      } : null })(),
      checklist: (() => { const row = (checklistsResult.data ?? []).find((item) => String(item.sale_id) === String(sale.id)); return row ? {
        id: String(row.id), status: String(row.status), data: parseChecklist(row.checklist_data),
        uploads: (checklistUploadsResult.data ?? []).filter((item) => String(item.sale_id) === String(sale.id)).map((item) => ({ id: String(item.id), fileName: String(item.file_name), mimeType: String(item.mime_type), uploadedAt: String(item.uploaded_at) })),
      } : null })(),
      agreement: agreement ? { id: String(agreement.id), version: Number(agreement.version), type: String(agreement.agreement_type), status: String(agreement.status), content: String(agreement.content_snapshot), signedAt: typeof agreement.signed_at === 'string' ? agreement.signed_at : null, signedFileName: typeof agreement.signed_file_name === 'string' ? agreement.signed_file_name : null } : null,
      paymentPlan: plan ? { id: String(plan.id), status: String(plan.status), terms: String(plan.terms_snapshot), openingPaidCents: Number(plan.opening_paid_cents ?? 0), instalments: (instalmentsResult.data ?? []).filter((item) => String(item.payment_plan_id) === String(plan.id)).map((item) => ({ sequenceNumber: Number(item.sequence_number), dueOn: String(item.due_on), amountCents: Number(item.amount_cents) })) } : null,
      activity: (activityResult.data ?? []).filter((item) => String(item.entity_ref) === String(sale.id)).map((item) => ({ id: String(item.id), action: String(item.action), details: (item.details ?? {}) as Record<string, unknown>, createdAt: String(item.created_at) })),
    }
  })

  let cleanerQuery = db.from('cleaners').select('id, business_name, contact_name, email, state, status, compliance_status').in('status', ['approved', 'pending_approval']).order('business_name')
  if (actor.role === 'agent' && actor.productState) cleanerQuery = cleanerQuery.eq('state', actor.productState)
  const { data: cleanerOptions, error: cleanerOptionsError } = await cleanerQuery.limit(300)
  if (cleanerOptionsError) throw cleanerOptionsError
  return {
    products,
    sales,
    invoiceTemplate,
    inspectionTemplate,
    cleaners: (cleanerOptions ?? []).map((row) => ({ id: String(row.id), businessName: String(row.business_name), contactName: String(row.contact_name), email: String(row.email), state: String(row.state ?? ''), status: String(row.status), complianceStatus: String(row.compliance_status ?? '') })) as ContractSaleCleanerOption[],
    actor: { id: actor.id, role: actor.role, state: actor.productState, displayName: actor.displayName },
  }
}

export async function updateContractSaleInvoiceTemplate(actor: ContractProductActor, input: Record<string, unknown>) {
  if (actor.role !== 'owner' && actor.role !== 'manager') {
    throw new ContractProductError('Only an owner or manager can edit the invoice template.', 403)
  }
  const supplierName = validateInvoiceTemplateText(input.supplierName, 'Supplier name', 2, 160)
  const supplierAbn = normalizeAustralianAbn(input.supplierAbn)
  if (!supplierAbn) throw new ContractProductError('Enter a valid Australian ABN.')
  const supplierEmail = normalizeInvoiceEmail(input.supplierEmail)
  if (!supplierEmail) throw new ContractProductError('Enter a valid supplier email address.')
  const invoiceTitle = validateInvoiceTemplateText(input.invoiceTitle, 'Invoice title', 3, 40)
  if (!/tax invoice/i.test(invoiceTitle)) throw new ContractProductError('The invoice title must include Tax Invoice.')
  const lineItemTemplate = validateInvoiceTemplateText(input.lineItemTemplate, 'Line-item template', 10, 500)
  const emailSubjectTemplate = validateInvoiceTemplateText(input.emailSubjectTemplate, 'Email subject template', 5, 200)
  const richIntro = parseRichEmailContent(input, { text: 'emailIntroTemplate', html: 'emailIntroHtml', document: 'emailIntroDocument', maxText: 1500 })
  const emailIntroTemplate = validateInvoiceTemplateText(richIntro.text, 'Email introduction template', 10, 1500)
  validateInvoiceTemplateText(richIntro.html, 'Email introduction formatting', 1, 120000)
  const paymentTermsTemplate = validateInvoiceTemplateText(input.paymentTermsTemplate, 'Payment terms template', 20, 1500)
  const bankAccountName = clean(input.bankAccountName, 160)
  const bankName = clean(input.bankName, 120)
  const bankBsb = clean(input.bankBsb, 16)
  const bankAccountNumber = clean(input.bankAccountNumber, 32)
  const bankBsbDigits = bankBsb.replace(/\D/g, '')
  const bankAccountDigits = bankAccountNumber.replace(/\D/g, '')
  const hasBankDetails = Boolean(bankAccountName || bankName || bankBsbDigits || bankAccountDigits)
  if (hasBankDetails && (bankAccountName.length < 2 || !/^\d{3}[ -]?\d{3}$/.test(bankBsb) || !/^[0-9 -]+$/.test(bankAccountNumber) || bankAccountDigits.length < 4 || bankAccountDigits.length > 16)) {
    throw new ContractProductError('Complete the account name, six-digit BSB, and bank account number, or leave all bank details blank.')
  }
  const paymentReferenceTemplate = validateInvoiceTemplateText(input.paymentReferenceTemplate ?? '{invoice_number}', 'Payment reference', 1, 120)
  const footerNote = validateInvoiceTemplateText(input.footerNote, 'Invoice footer', 20, 500)
  const values = {
    supplier_name: supplierName, supplier_abn: supplierAbn, supplier_email: supplierEmail,
    invoice_title: invoiceTitle, line_item_template: lineItemTemplate,
    email_subject_template: emailSubjectTemplate, email_intro_template: emailIntroTemplate, email_intro_html: richIntro.html, email_intro_document: richIntro.document,
    payment_terms_template: paymentTermsTemplate, bank_account_name: bankAccountName, bank_name: bankName,
    bank_bsb: bankBsbDigits ? `${bankBsbDigits.slice(0, 3)}-${bankBsbDigits.slice(3)}` : '',
    bank_account_number: bankAccountNumber, payment_reference_template: paymentReferenceTemplate, footer_note: footerNote,
    updated_by_staff_id: actor.id, updated_at: new Date().toISOString(),
  }
  const { data, error } = await getAdminSupabase().from('contract_sale_invoice_templates')
    .upsert({ id: INVOICE_TEMPLATE_ID, ...values }, { onConflict: 'id' }).select('*').single()
  if (error) throw error
  await writeAuditLogStrict('contract_sale_invoice_template', INVOICE_TEMPLATE_ID, 'contract_sale.invoice_template.updated', actorAudit(actor))
  return { invoiceTemplate: mapInvoiceTemplate(data as Row) }
}

export async function applyContractSaleInvoiceBankDetails(actor: ContractProductActor, input: Record<string, unknown>) {
  if (actor.role !== 'owner') throw new ContractProductError('Only the owner can apply bank details to an existing invoice.', 403)
  if (input.includePaymentTerms !== undefined && typeof input.includePaymentTerms !== 'boolean') throw new ContractProductError('Select whether to include payment terms.')
  const sale = await getAuthorizedSale(actor, clean(input.saleId, 100))
  const invoiceId = clean(input.invoiceId, 100)
  const { data: invoice, error } = await getAdminSupabase().from('contract_sale_invoices')
    .select('id,status').eq('id', invoiceId).eq('sale_id', String(sale.id)).maybeSingle()
  if (error) throw error
  if (!invoice || invoice.status === 'void' || sale.status === 'cancelled') throw new ContractProductError('Select a current invoice.', 409)
  const template = await loadInvoiceTemplate()
  if (!template.bankAccountName || !template.bankBsb || !template.bankAccountNumber) throw new ContractProductError('Save the bank account fields in the invoice template first.')
  if (input.templateUpdatedAt !== template.updatedAt) throw new ContractProductError('The saved bank details changed. Refresh and review them before applying.', 409)
  const { error: revisionError } = await getAdminSupabase().from('contract_sale_invoice_bank_revisions').insert({
    invoice_id: invoiceId, actor_staff_id: actor.id,
    bank_account_name_snapshot: template.bankAccountName, bank_name_snapshot: template.bankName,
    bank_bsb_snapshot: template.bankBsb, bank_account_number_snapshot: template.bankAccountNumber,
    payment_reference_template_snapshot: template.paymentReferenceTemplate,
    ...(input.includePaymentTerms === true ? { payment_terms_snapshot: validateInvoiceTemplateText(template.paymentTermsTemplate, 'Payment terms', 20, 1500) } : {}),
  })
  if (revisionError) throw revisionError
  return { invoiceId }
}

export async function createCleanerInsideContractSale(actor: ContractProductActor, input: Record<string, unknown>) {
  const state = clean(input.state, 8).toUpperCase()
  if (actor.role === 'agent' && state !== actor.productState) throw new ContractProductError('Agents can only add cleaners in their assigned state.', 403)
  const cleaner = await createCleanerForState({
    businessName: clean(input.businessName, 160), firstName: clean(input.firstName, 80), lastName: clean(input.lastName, 80),
    contactName: `${clean(input.firstName, 80)} ${clean(input.lastName, 80)}`.trim(), email: clean(input.email, 254),
    phone: clean(input.phone, 40), suburb: clean(input.suburb, 80), state, status: 'pending_approval',
  } as CleanerPayload, state, actor)
  return { cleanerId: cleaner.id, status: cleaner.status }
}

export async function createContractSale(actor: ContractProductActor, input: Record<string, unknown>) {
  const productId = clean(input.productId, 100)
  const cleanerId = clean(input.cleanerId, 100)
  if (!productId || !cleanerId) throw new ContractProductError('Select an available product and an approved cleaner.')
  const { data, error } = await getAdminSupabase().rpc('create_contract_product_sale', {
    p_product_id: productId, p_cleaner_id: cleanerId, p_actor_id: actor.id, p_actor_role: actor.role, p_actor_state: actor.productState,
  })
  if (error?.code === '42501') throw new ContractProductError('You cannot create this product sale.', 403)
  if (error) throw new ContractProductError(error.message, 409)
  return { saleId: String(data) }
}

export async function updateContractSale(actor: ContractProductActor, input: Record<string, unknown>) {
  const sale = await getAuthorizedSale(actor, clean(input.saleId, 100))
  if (sale.handover_at || ['completed', 'cancelled'].includes(String(sale.status))) {
    throw new ContractProductError('A completed, handed-over, or cancelled sale cannot be edited.', 409)
  }
  const commencementDate = assertDate(input.commencementDate, false)
  const priceText = clean(input.finalPrice, 30)
  if (!/^\d+(?:\.\d{1,2})?$/.test(priceText)) throw new ContractProductError('Enter the final GST-inclusive purchase price with no more than two decimal places.')
  const finalPriceIncGstCents = Math.round(Number(priceText) * 100)
  if (!Number.isSafeInteger(finalPriceIncGstCents) || finalPriceIncGstCents <= CONTRACT_SALE_DEPOSIT_INC_GST_CENTS) {
    throw new ContractProductError('The final purchase price must be greater than the $500 GST-inclusive deposit.')
  }
  const { error } = await getAdminSupabase().rpc('update_contract_sale_overview', {
    p_sale_id: sale.id, p_price_inc_gst_cents: finalPriceIncGstCents,
    p_commencement_date: commencementDate || null, p_notes: clean(input.notes, 2000) || null,
    p_actor_id: actor.id, p_actor_role: actor.role, p_actor_state: actor.productState,
  })
  if (error?.code === '42501') throw new ContractProductError('You cannot update this product sale.', 403)
  if (error) throw new ContractProductError(error.message, 409)
  return { saleId: String(sale.id) }
}

function invoiceTemplateTokens(invoice: Row, sale: Row, context: Awaited<ReturnType<typeof loadSaleContext>>): ContractSaleInvoiceTemplateTokens {
  const total = Number(invoice.total_inc_gst_cents)
  const deposit = Number(invoice.deposit_required_inc_gst_cents ?? CONTRACT_SALE_DEPOSIT_INC_GST_CENTS)
  return {
    invoiceNumber: String(invoice.invoice_number), productCode: String(context.product.product_code), saleCode: String(sale.sale_code),
    cleanerName: String(invoice.recipient_name_snapshot), cleanerBusiness: String(invoice.recipient_business_snapshot),
    suburb: String(context.product.suburb), state: String(context.product.state), totalIncGst: money(total),
    depositIncGst: money(deposit), balanceIncGst: money(Math.max(0, total - deposit)),
    agentName: String(invoice.sender_name_snapshot), agentTitle: String(invoice.sender_title_snapshot ?? ''),
  }
}

function invoicePdfInput(invoice: Row, sale: Row, context: Awaited<ReturnType<typeof loadSaleContext>>): ContractSaleTaxInvoicePdfInput {
  const tokens = invoiceTemplateTokens(invoice, sale, context)
  return {
    invoiceTitle: String(invoice.invoice_title_snapshot ?? 'TAX INVOICE'),
    invoiceNumber: String(invoice.invoice_number),
    issuedOn: String(invoice.issued_at ?? new Date().toISOString()),
    dueOn: typeof invoice.due_on === 'string' ? invoice.due_on : null,
    supplierName: String(invoice.supplier_name_snapshot ?? SECURE_CLEANING_NAME),
    supplierAbn: String(invoice.supplier_abn_snapshot ?? SECURE_CLEANING_ABN),
    supplierEmail: String(invoice.supplier_email_snapshot ?? SECURE_CLEANING_EMAIL),
    recipientName: String(invoice.recipient_name_snapshot),
    recipientBusiness: String(invoice.recipient_business_snapshot),
    recipientAbn: typeof invoice.recipient_abn_snapshot === 'string' ? invoice.recipient_abn_snapshot : null,
    recipientAddress: typeof invoice.recipient_address_snapshot === 'string' ? invoice.recipient_address_snapshot : null,
    description: renderContractSaleInvoiceTemplateText(String(invoice.description_snapshot), tokens),
    productCode: String(context.product.product_code),
    saleCode: String(sale.sale_code),
    totalIncGstCents: Number(invoice.total_inc_gst_cents),
    gstComponentCents: Number(invoice.gst_component_cents),
    depositRequiredIncGstCents: Number(invoice.deposit_required_inc_gst_cents ?? CONTRACT_SALE_DEPOSIT_INC_GST_CENTS),
    paidCents: Number(invoice.paid_cents ?? 0),
    paymentTermsRevised: invoice.payment_terms_revised === true,
    paymentPlanTerms: typeof invoice.plan_terms === 'string' ? invoice.plan_terms : null,
    paymentTerms: renderContractSaleInvoiceTemplateText(String(invoice.payment_terms_snapshot), tokens),
    bankAccountName: String(invoice.bank_account_name_snapshot ?? '') || null,
    bankName: String(invoice.bank_name_snapshot ?? '') || null,
    bankBsb: String(invoice.bank_bsb_snapshot ?? '') || null,
    bankAccountNumber: String(invoice.bank_account_number_snapshot ?? '') || null,
    paymentReference: renderContractSaleInvoiceTemplateText(String(invoice.payment_reference_template_snapshot ?? '{invoice_number}'), tokens),
    senderName: String(invoice.sender_name_snapshot),
    senderTitle: typeof invoice.sender_title_snapshot === 'string' ? invoice.sender_title_snapshot : null,
    senderEmail: String(invoice.sender_email_snapshot),
    footerNote: renderContractSaleInvoiceTemplateText(String(invoice.footer_note_snapshot ?? DEFAULT_CONTRACT_SALE_INVOICE_TEMPLATE.footerNote), tokens),
  }
}

// Allocations are created atomically only when an owner/manager confirms cleared funds.
// Use the same ledger for every rendered copy; pending evidence is not a payment.
async function invoiceWithConfirmedPayments(invoice: Row, saleId: string, agreementPlanId?: string | null): Promise<Row> {
  let paidCents = 0
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await getAdminSupabase().from('contract_sale_payment_allocations')
      .select('payment_id, amount_cents').eq('invoice_id', String(invoice.id)).order('payment_id').range(offset, offset + pageSize - 1)
    if (error) throw error
    paidCents += (data ?? []).reduce((sum, item) => sum + Number(item.amount_cents), 0)
    if (!data || data.length < pageSize) break
  }
  let planQuery = getAdminSupabase().from('contract_sale_payment_plans').select('terms_snapshot,status').eq('sale_id', saleId).in('status', ['awaiting_acceptance', 'active', 'completed'])
  if (agreementPlanId) planQuery = planQuery.eq('id', agreementPlanId)
  const { data: plan, error: planError } = agreementPlanId === null ? { data: null, error: null } : await planQuery.order('version', { ascending: false }).limit(1).maybeSingle()
  if (planError) throw planError
  if (agreementPlanId && !plan) throw new ContractProductError('The agreement payment plan has changed. Refresh before sending.', 409)
  const { data: correction, error: correctionError } = await getAdminSupabase().from('contract_sale_invoice_bank_revisions')
    .select('bank_account_name_snapshot,bank_name_snapshot,bank_bsb_snapshot,bank_account_number_snapshot,payment_reference_template_snapshot')
    .eq('invoice_id', String(invoice.id)).order('id', { ascending: false }).limit(1).maybeSingle()
  if (correctionError) throw correctionError
  // A later bank-only correction must not undo the last explicit terms correction.
  const { data: termsRevision, error: termsError } = await getAdminSupabase().from('contract_sale_invoice_bank_revisions')
    .select('payment_terms_snapshot').eq('invoice_id', String(invoice.id)).not('payment_terms_snapshot', 'is', null)
    .order('id', { ascending: false }).limit(1).maybeSingle()
  if (termsError) throw termsError
  return { ...invoice, ...correction, ...(termsRevision ? { payment_terms_snapshot: termsRevision.payment_terms_snapshot, payment_terms_revised: true } : {}), paid_cents: paidCents, plan_terms: plan ? `${plan.status === 'awaiting_acceptance' ? 'PROPOSED PAYMENT PLAN - SUBJECT TO SIGNED ACCEPTANCE' : 'AGREED PAYMENT PLAN'}\n${plan.terms_snapshot}` : null }
}

async function sendInvoiceEmail(invoice: Row, sale: Row, context: Awaited<ReturnType<typeof loadSaleContext>>) {
  const pdfInput = invoicePdfInput(invoice, sale, context)
  const outstanding = Math.max(0, pdfInput.totalIncGstCents - pdfInput.paidCents)
  const depositDue = Math.min(outstanding, Math.max(0, pdfInput.depositRequiredIncGstCents - pdfInput.paidCents))
  const tokens = invoiceTemplateTokens(invoice, sale, context)
  const pdf = buildContractSaleTaxInvoicePdf(pdfInput)
  const bankDetails = pdfInput.bankAccountName && pdfInput.bankBsb && pdfInput.bankAccountNumber
    ? `<div style="border:1px solid #d1d5db;border-radius:10px;padding:18px;margin:20px 0"><p style="margin:0 0 8px"><strong>Bank payment details</strong></p><p style="margin:0 0 4px">Account name: ${escapeHtml(pdfInput.bankAccountName)}</p>${pdfInput.bankName ? `<p style="margin:0 0 4px">Bank: ${escapeHtml(pdfInput.bankName)}</p>` : ''}<p style="margin:0 0 4px">BSB: ${escapeHtml(pdfInput.bankBsb)}</p><p style="margin:0">Account number: ${escapeHtml(pdfInput.bankAccountNumber)}</p></div>`
    : ''
  const fileName = `${pdfInput.invoiceNumber.replace(/[^A-Za-z0-9_-]/g, '-')}.pdf`
  const result = await sendEmailOrThrow({
    from: process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au',
    to: invoice.recipient_email_snapshot,
    replyTo: invoice.sender_email_snapshot,
    subject: renderContractSaleInvoiceTemplateText(String(invoice.email_subject_template_snapshot ?? DEFAULT_CONTRACT_SALE_INVOICE_TEMPLATE.emailSubjectTemplate), tokens),
    html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#1f2937"><h1 style="color:#0f766e">${escapeHtml(String(invoice.supplier_name_snapshot ?? SECURE_CLEANING_NAME))}</h1><h2>${escapeHtml(String(invoice.invoice_title_snapshot ?? 'Tax Invoice'))} ${escapeHtml(String(invoice.invoice_number))}</h2><p>Hi ${escapeHtml(String(invoice.recipient_name_snapshot))},</p>${renderContractSaleInvoiceEmailIntro(String(invoice.email_intro_template_snapshot ?? DEFAULT_CONTRACT_SALE_INVOICE_TEMPLATE.emailIntroTemplate), invoice.email_intro_html_snapshot, tokens)}<div style="border:1px solid #d1d5db;border-radius:10px;padding:18px;margin:20px 0"><p style="margin:0 0 8px"><strong>Total contract purchase:</strong> ${money(Number(invoice.total_inc_gst_cents))} including GST</p><p style="margin:0 0 8px"><strong>${pdfInput.paymentPlanTerms ? 'Deposit still required' : 'Deposit payable now'}:</strong> ${money(depositDue)} including GST</p><p style="margin:0 0 8px"><strong>Payments received:</strong> ${money(pdfInput.paidCents)}</p><p style="margin:0"><strong>Outstanding balance:</strong> ${money(outstanding)}</p></div><p><strong>Payment terms:</strong> ${escapeHtml(pdfInput.paymentPlanTerms ? 'See the payment schedule attached to this invoice. A proposed plan requires signed acceptance; Secure Cleaning retains contract and assignment rights until payment in full.' : pdfInput.paymentTerms)}</p>${pdfInput.paymentPlanTerms && pdfInput.paymentTermsRevised ? `<p><strong>Updated invoice payment terms (agreed payment schedule unchanged):</strong> ${escapeHtml(pdfInput.paymentTerms)}</p>` : ''}${bankDetails}<p>Please use <strong>${escapeHtml(pdfInput.paymentReference ?? String(invoice.invoice_number))}</strong> as the payment reference.</p><p>Kind regards,<br>${escapeHtml(String(invoice.sender_name_snapshot))}${invoice.sender_title_snapshot ? `<br>${escapeHtml(String(invoice.sender_title_snapshot))}` : ''}<br>${escapeHtml(String(invoice.supplier_name_snapshot ?? SECURE_CLEANING_NAME))}<br>${escapeHtml(String(invoice.sender_email_snapshot))}</p></div>`,
    attachments: [{ filename: fileName, content: pdf.toString('base64') }],
  }) as { id?: string } | null
  return result?.id ?? ''
}

export async function issueContractSaleInvoice(actor: ContractProductActor, input: Record<string, unknown>) {
  const sale = await getAuthorizedSale(actor, clean(input.saleId, 100))
  const invoiceType = 'sale'
  const [context, invoiceTemplate] = await Promise.all([loadSaleContext(sale), loadInvoiceTemplate()])
  if (context.cleaner.status !== 'approved') throw new ContractProductError('The cleaner must remain approved before an invoice can be issued.', 409)
  if (sale.handover_at || ['completed', 'cancelled', 'active_payment_plan'].includes(String(sale.status))) throw new ContractProductError('An invoice cannot be issued for this sale state.', 409)
  if (!sale.price_finalised_at) throw new ContractProductError('Save and finalise the GST-inclusive purchase price before preparing the tax invoice.', 409)
  const recipientEmail = normalizeInvoiceEmail(context.cleaner.email)
  if (!recipientEmail) throw new ContractProductError('The cleaner needs a valid email address.', 409)
  if (!normalizeInvoiceEmail(actor.email)) throw new ContractProductError('Your staff account needs a valid email address before sending invoices.', 409)
  if (!clean(actor.displayName, 160)) throw new ContractProductError('Your staff account needs a display name before sending invoices.', 409)
  const db = getAdminSupabase()
  const idempotencyKey = clean(input.idempotencyKey, 80)
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw new ContractProductError('A valid invoice request ID is required.')
  const { data: existing, error: existingError } = await db.from('contract_sale_invoices').select('id, idempotency_key, invoice_type').eq('sale_id', sale.id).in('invoice_type', ['sale', 'deposit']).neq('status', 'void').limit(1).maybeSingle()
  if (existingError) throw existingError
  if (existing) {
    if (existing.idempotency_key === idempotencyKey) return { invoiceId: String(existing.id), replayed: true }
    throw new ContractProductError(existing.invoice_type === 'deposit' ? 'This sale already has a legacy deposit invoice.' : 'An active sale tax invoice already exists.', 409)
  }
  const total = Number(sale.agreed_purchase_price_inc_gst_cents)
  const dueOn = sale.commencement_date ? String(sale.commencement_date) : null
  const { data: invoice, error } = await db.from('contract_sale_invoices').insert({
    idempotency_key: idempotencyKey, sale_id: sale.id, invoice_type: invoiceType, description_snapshot: invoiceTemplate.lineItemTemplate,
    total_inc_gst_cents: total, gst_component_cents: calculateInclusiveGstComponent(total), deposit_required_inc_gst_cents: CONTRACT_SALE_DEPOSIT_INC_GST_CENTS, due_on: dueOn,
    bank_account_name_snapshot: invoiceTemplate.bankAccountName, bank_name_snapshot: invoiceTemplate.bankName,
    bank_bsb_snapshot: invoiceTemplate.bankBsb, bank_account_number_snapshot: invoiceTemplate.bankAccountNumber,
    payment_reference_template_snapshot: invoiceTemplate.paymentReferenceTemplate,
    payment_terms_snapshot: invoiceTemplate.paymentTermsTemplate, recipient_name_snapshot: context.cleaner.contact_name,
    recipient_business_snapshot: context.cleaner.business_name, recipient_email_snapshot: recipientEmail,
    recipient_address_snapshot: [context.cleaner.address, context.cleaner.suburb, context.cleaner.postcode].filter(Boolean).join(', ') || null,
    recipient_abn_snapshot: context.cleaner.abn || null, supplier_name_snapshot: invoiceTemplate.supplierName,
    supplier_abn_snapshot: invoiceTemplate.supplierAbn, supplier_email_snapshot: invoiceTemplate.supplierEmail,
    invoice_title_snapshot: invoiceTemplate.invoiceTitle, email_subject_template_snapshot: invoiceTemplate.emailSubjectTemplate,
    email_intro_template_snapshot: invoiceTemplate.emailIntroTemplate, email_intro_html_snapshot: invoiceTemplate.emailIntroHtml || null, footer_note_snapshot: invoiceTemplate.footerNote,
    sender_name_snapshot: actor.displayName, sender_title_snapshot: actor.jobTitle || null,
    sender_email_snapshot: actor.email, issued_by_staff_id: actor.id,
  }).select('id, invoice_number, invoice_type, recipient_email_snapshot, recipient_business_snapshot, recipient_name_snapshot, recipient_address_snapshot, recipient_abn_snapshot, supplier_name_snapshot, supplier_abn_snapshot, supplier_email_snapshot, invoice_title_snapshot, email_subject_template_snapshot, email_intro_template_snapshot, email_intro_html_snapshot, footer_note_snapshot, description_snapshot, total_inc_gst_cents, gst_component_cents, deposit_required_inc_gst_cents, due_on, payment_terms_snapshot, bank_account_name_snapshot, bank_name_snapshot, bank_bsb_snapshot, bank_account_number_snapshot, payment_reference_template_snapshot, sender_name_snapshot, sender_title_snapshot, sender_email_snapshot, issued_at').single()
  if (error?.code === '23505') {
    const { data: replay } = await db.from('contract_sale_invoices').select('id, sale_id, invoice_type, total_inc_gst_cents').eq('idempotency_key', idempotencyKey).maybeSingle()
    if (replay && String(replay.sale_id) === String(sale.id) && replay.invoice_type === invoiceType && Number(replay.total_inc_gst_cents) === total) {
      return { invoiceId: String(replay.id), replayed: true }
    }
    throw new ContractProductError('That invoice request ID was already used for different invoice details.', 409)
  }
  if (error) throw error
  await writeAuditLogStrict('contract_sale', String(sale.id), 'contract_sale.invoice.prepared', { ...actorAudit(actor), invoiceId: invoice.id, invoiceType, totalIncGstCents: total })
  return { invoiceId: String(invoice.id) }
}

export async function resendContractSaleInvoice(actor: ContractProductActor, input: Record<string, unknown>) {
  const sale = await getAuthorizedSale(actor, clean(input.saleId, 100))
  const invoiceId = clean(input.invoiceId, 100)
  const context = await loadSaleContext(sale)
  const { data: invoice, error } = await getAdminSupabase().from('contract_sale_invoices')
    .select('id, invoice_number, invoice_type, recipient_email_snapshot, recipient_business_snapshot, recipient_name_snapshot, recipient_address_snapshot, recipient_abn_snapshot, supplier_name_snapshot, supplier_abn_snapshot, supplier_email_snapshot, invoice_title_snapshot, email_subject_template_snapshot, email_intro_template_snapshot, email_intro_html_snapshot, footer_note_snapshot, description_snapshot, total_inc_gst_cents, gst_component_cents, deposit_required_inc_gst_cents, due_on, payment_terms_snapshot, bank_account_name_snapshot, bank_name_snapshot, bank_bsb_snapshot, bank_account_number_snapshot, payment_reference_template_snapshot, sender_name_snapshot, sender_title_snapshot, sender_email_snapshot, issued_at, status, delivery_status')
    .eq('id', invoiceId).eq('sale_id', sale.id).maybeSingle()
  if (error) throw error
  if (!invoice || invoice.status === 'void') throw new ContractProductError('Active invoice not found.', 404)
  if (invoice.delivery_status === 'unknown') throw new ContractProductError('Delivery is unresolved. Verify the recipient inbox or provider activity before deliberately resending.', 409)
  const currentInvoice = await invoiceWithConfirmedPayments(invoice as Row, String(sale.id))
  try {
    const providerMessageId = await sendInvoiceEmail(currentInvoice, sale, context)
    const { error: deliveryError } = await getAdminSupabase().from('contract_sale_invoices').update({ provider_message_id: providerMessageId || null, delivery_status: providerMessageId ? 'sent' : 'unknown', delivery_error: null }).eq('id', invoice.id)
    if (deliveryError) throw deliveryError
  } catch (sendError) {
    const rejected = sendError instanceof EmailProviderRejectedError
    const { error: outcomeError } = await getAdminSupabase().from('contract_sale_invoices').update({ delivery_status: rejected ? 'failed' : 'unknown', delivery_error: clean(sendError instanceof Error ? sendError.message : 'Provider outcome unknown', 500) }).eq('id', invoice.id)
    if (outcomeError) throw outcomeError
    throw new ContractProductError(rejected ? 'Invoice delivery was rejected. No duplicate invoice was created.' : 'Invoice delivery is unresolved. Verify provider activity before trying again.', 502)
  }
  await writeAuditLogStrict('contract_sale', String(sale.id), 'contract_sale.invoice.resent', { ...actorAudit(actor), invoiceId })
  return { invoiceId }
}

export async function downloadContractSaleInvoice(actor: ContractProductActor, saleId: string, invoiceId: string) {
  const sale = await getAuthorizedSale(actor, clean(saleId, 100))
  const context = await loadSaleContext(sale)
  const { data: invoice, error } = await getAdminSupabase().from('contract_sale_invoices')
    .select('id, invoice_number, recipient_email_snapshot, recipient_business_snapshot, recipient_name_snapshot, recipient_address_snapshot, recipient_abn_snapshot, supplier_name_snapshot, supplier_abn_snapshot, supplier_email_snapshot, invoice_title_snapshot, email_subject_template_snapshot, email_intro_template_snapshot, email_intro_html_snapshot, footer_note_snapshot, description_snapshot, total_inc_gst_cents, gst_component_cents, deposit_required_inc_gst_cents, due_on, payment_terms_snapshot, bank_account_name_snapshot, bank_name_snapshot, bank_bsb_snapshot, bank_account_number_snapshot, payment_reference_template_snapshot, sender_name_snapshot, sender_title_snapshot, sender_email_snapshot, issued_at, status')
    .eq('id', clean(invoiceId, 100)).eq('sale_id', sale.id).maybeSingle()
  if (error) throw error
  if (!invoice || invoice.status === 'void') throw new ContractProductError('Active invoice not found.', 404)
  const currentInvoice = await invoiceWithConfirmedPayments(invoice as Row, String(sale.id))
  const pdf = buildContractSaleTaxInvoicePdf(invoicePdfInput(currentInvoice, sale, context))
  return { pdf, fileName: `${String(invoice.invoice_number).replace(/[^A-Za-z0-9_-]/g, '-')}.pdf` }
}

export async function recordContractSalePayment(actor: ContractProductActor, input: Record<string, unknown>) {
  const sale = await getAuthorizedSale(actor, clean(input.saleId, 100))
  const invoiceId = clean(input.invoiceId, 100)
  const amount = Math.round(Number(input.amount) * 100)
  const receivedOn = assertDate(input.receivedOn)
  const method = clean(input.method, 30)
  const reference = clean(input.reference, 160)
  const idempotencyKey = clean(input.idempotencyKey, 80)
  if (!invoiceId || !Number.isFinite(amount) || amount <= 0 || !['bank_transfer', 'card', 'cash', 'other'].includes(method) || !reference) {
    throw new ContractProductError('Select an invoice and provide a positive amount, received date, method, and reference.')
  }
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw new ContractProductError('A valid payment request ID is required.')
  const { data: invoice, error: invoiceError } = await getAdminSupabase().from('contract_sale_invoices')
    .select('id, total_inc_gst_cents, status').eq('id', invoiceId).eq('sale_id', sale.id).maybeSingle()
  if (invoiceError) throw invoiceError
  if (!invoice || invoice.status === 'void' || invoice.status === 'paid') throw new ContractProductError('Select an unpaid active invoice.', 409)
  const { data, error } = await getAdminSupabase().from('contract_sale_payments').insert({
    idempotency_key: idempotencyKey, sale_id: sale.id, intended_invoice_id: invoiceId, amount_cents: amount, received_on: receivedOn, payment_method: method,
    payment_reference: reference, evidence_note: clean(input.evidenceNote, 1000) || null, recorded_by_staff_id: actor.id,
  }).select('id').single()
  if (error?.code === '23505') {
    const { data: replay } = await getAdminSupabase().from('contract_sale_payments')
      .select('id, sale_id, intended_invoice_id, amount_cents, received_on, payment_method, payment_reference')
      .eq('idempotency_key', idempotencyKey).maybeSingle()
    if (replay && String(replay.sale_id) === String(sale.id) && String(replay.intended_invoice_id) === invoiceId
      && Number(replay.amount_cents) === amount && replay.received_on === receivedOn
      && replay.payment_method === method && replay.payment_reference === reference) {
      return { paymentId: String(replay.id), invoiceId, replayed: true }
    }
    throw new ContractProductError('That payment request ID was already used for different evidence.', 409)
  }
  if (error) throw error
  await writeAuditLogStrict('contract_sale', String(sale.id), 'contract_sale.payment.recorded', { ...actorAudit(actor), paymentId: data.id, invoiceId, amountCents: amount })
  return { paymentId: String(data.id), invoiceId }
}

export async function confirmContractSalePayment(actor: ContractProductActor, input: Record<string, unknown>) {
  if (!canConfirmContractSalePayment(actor.role)) throw new ContractProductError('An owner or manager must confirm cleared funds.', 403)
  const sale = await getAuthorizedSale(actor, clean(input.saleId, 100))
  const paymentId = clean(input.paymentId, 100)
  const invoiceId = clean(input.invoiceId, 100)
  const { error } = await getAdminSupabase().rpc('confirm_contract_sale_payment', { p_payment_id: paymentId, p_invoice_id: invoiceId, p_actor_id: actor.id, p_actor_role: actor.role })
  if (error?.code === '42501') throw new ContractProductError('An owner or manager must confirm cleared funds.', 403)
  if (error) throw new ContractProductError(error.message, 409)
  return { saleId: String(sale.id), paymentId }
}

export async function updateContractSaleInspectionTemplate(actor: ContractProductActor, input: Record<string, unknown>) {
  if (!['owner', 'manager'].includes(actor.role)) throw new ContractProductError('Only an owner or manager can edit inspection email defaults.', 403)
  const availability = parseInspectionEmailDraft(input, 'availability')
  const client = parseInspectionEmailDraft(input, 'client')
  const cleaner = parseInspectionEmailDraft(input, 'cleaner')
  const values = {
    availability_subject: availability.subject, availability_body_text: availability.bodyText,
    availability_body_html: availability.bodyHtml, availability_body_document: availability.bodyDocument,
    client_subject: client.subject, client_body_text: client.bodyText, client_body_html: client.bodyHtml, client_body_document: client.bodyDocument,
    cleaner_subject: cleaner.subject, cleaner_body_text: cleaner.bodyText, cleaner_body_html: cleaner.bodyHtml, cleaner_body_document: cleaner.bodyDocument,
    updated_by_staff_id: actor.id, updated_at: new Date().toISOString(),
  }
  const { data, error } = await getAdminSupabase().from('contract_sale_inspection_templates')
    .upsert({ id: INSPECTION_TEMPLATE_ID, ...values }, { onConflict: 'id' }).select('*').single()
  if (error) throw error
  await writeAuditLogStrict('contract_sale_inspection_template', INSPECTION_TEMPLATE_ID, 'contract_sale.inspection_template.updated', actorAudit(actor))
  return { inspectionTemplate: mapInspectionTemplate(data as Row) }
}

function inspectionTimeZone(state: unknown) {
  const zones: Record<string, string> = {
    ACT: 'Australia/Sydney', NSW: 'Australia/Sydney', NT: 'Australia/Darwin', QLD: 'Australia/Brisbane',
    SA: 'Australia/Adelaide', TAS: 'Australia/Hobart', VIC: 'Australia/Melbourne', WA: 'Australia/Perth',
  }
  return zones[String(state)] ?? ''
}

function inspectionMergeValues(sale: Row, context: Awaited<ReturnType<typeof loadSaleContext>>, actor: ContractProductActor, input: Record<string, unknown>) {
  const date = clean(input.date, 20)
  const time = clean(input.time, 10)
  const duration = Math.round(Number(input.durationMinutes))
  const location = clean(input.location, 500) || [context.site?.address, context.site?.suburb, context.site?.postcode].filter(Boolean).join(', ')
  const timeZone = inspectionTimeZone(context.product.state)
  let displayDate = date
  let displayTime = time
  if (date && time && timeZone) {
    const startsAt = getDateTimeInTimeZone(date, time, timeZone)
    if (!Number.isNaN(startsAt.getTime())) {
      displayDate = new Intl.DateTimeFormat('en-AU', { dateStyle: 'long', timeZone }).format(startsAt)
      displayTime = new Intl.DateTimeFormat('en-AU', { timeStyle: 'short', timeZone }).format(startsAt)
    }
  }
  return {
    client_first_name: firstName(context.client?.contact_name), client_name: String(context.client?.contact_name ?? ''),
    client_business: String(context.client?.business_name ?? ''), cleaner_first_name: firstName(context.cleaner.contact_name),
    cleaner_name: String(context.cleaner.contact_name), cleaner_business: String(context.cleaner.business_name),
    site_name: String(context.site?.site_name || context.client?.business_name || context.site?.address || 'the cleaning site'),
    site_address: [context.site?.address, context.site?.suburb, context.site?.postcode].filter(Boolean).join(', '),
    inspection_date: displayDate || 'To be confirmed', inspection_time: displayTime || 'To be confirmed',
    inspection_duration: Number.isFinite(duration) && duration > 0 ? `${duration} minutes` : 'To be confirmed',
    inspection_location: location || 'To be confirmed', sale_code: String(sale.sale_code), product_code: String(context.product.product_code),
    sender_name: actor.displayName, sender_title: actor.jobTitle || '', sender_email: actor.email || '', sender_phone: actor.phone || '',
  }
}

async function inspectionEmailContext(actor: ContractProductActor, input: Record<string, unknown>) {
  const sale = await getAuthorizedSale(actor, clean(input.saleId, 100))
  if (sale.status === 'cancelled') throw new ContractProductError('A cancelled product sale cannot send inspection email.', 409)
  const context = await loadSaleContext(sale)
  if (!normalizeInvoiceEmail(actor.email)) throw new ContractProductError('Your staff account needs a valid work email.', 409)
  return { sale, context, values: inspectionMergeValues(sale, context, actor, input) }
}

export async function previewContractSaleInspectionEmail(actor: ContractProductActor, input: Record<string, unknown>) {
  const kind = clean(input.kind, 30) as InspectionEmailKind
  if (!['availability', 'client', 'cleaner'].includes(kind)) throw new ContractProductError('Select an inspection email to preview.')
  const { sale, context, values } = await inspectionEmailContext(actor, input)
  const draft = parseInspectionEmailDraft(input, kind)
  const rendered = renderInspectionEmail(draft, values)
  const to = kind === 'cleaner' ? normalizeInvoiceEmail(context.cleaner.email) : normalizeInvoiceEmail(context.client?.email)
  if (!to) throw new ContractProductError(`${kind === 'cleaner' ? 'Cleaner' : 'Client'} email is missing or invalid.`, 409)
  const fingerprint = inspectionEmailFingerprint({ saleId: sale.id, kind, to, senderId: actor.id, rendered, appointment: [input.date, input.time, input.durationMinutes, input.location] })
  return { kind, to, from: actor.email, ...rendered, fingerprint }
}

export async function sendContractSaleInspectionAvailabilityRequest(actor: ContractProductActor, input: Record<string, unknown>) {
  const requestId = clean(input.requestId, 100)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new ContractProductError('Refresh and try sending again.')
  const preview = await previewContractSaleInspectionEmail(actor, { ...input, kind: 'availability' })
  if (input.previewFingerprint !== preview.fingerprint) throw new ContractProductError('This email changed after preview. Preview it again before sending.', 409)
  const db = getAdminSupabase()
  const { sale, context } = await inspectionEmailContext(actor, input)
  const pendingMessage = {
    sale_id: sale.id, message_type: 'availability_request', recipient_name_snapshot: context.client?.contact_name || 'Client',
    recipient_email_snapshot: preview.to, subject_snapshot: preview.subject, body_text_snapshot: preview.bodyText,
    body_html_snapshot: preview.bodyHtml, body_document_snapshot: preview.bodyDocument, sender_staff_id: actor.id,
    sender_name_snapshot: actor.displayName, sender_email_snapshot: actor.email, preview_fingerprint: preview.fingerprint,
    request_id: requestId, delivery_status: 'unknown', provider_message_id: null, delivery_error: 'Delivery attempt is being processed.',
  }
  const { data: claimed, error: claimError } = await db.from('contract_sale_inspection_messages').insert(pendingMessage).select('id').single()
  if (claimError?.code === '23505') {
    const { data: replay, error: replayError } = await db.from('contract_sale_inspection_messages').select('id,delivery_status')
      .eq('request_id', requestId).eq('sale_id', sale.id).eq('sender_staff_id', actor.id).maybeSingle()
    if (replayError) throw replayError
    if (replay) return { messageId: String(replay.id), deliveryStatus: String(replay.delivery_status), replayed: true }
    throw new ContractProductError('That availability request ID was already used for another message. Refresh and preview again.', 409)
  }
  if (claimError) throw claimError
  let providerMessageId = ''
  let deliveryStatus: 'sent' | 'failed' | 'unknown' = 'unknown'
  let deliveryError = ''
  try {
    const result = await sendEmailOrThrow({ from: process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au', to: preview.to, replyTo: actor.email, subject: preview.subject, html: preview.html }) as { id?: string } | null
    providerMessageId = result?.id ?? ''; deliveryStatus = 'sent'
  } catch (error) {
    deliveryStatus = error instanceof EmailProviderRejectedError ? 'failed' : 'unknown'
    deliveryError = clean(error instanceof Error ? error.message : 'Provider outcome unknown', 500)
  }
  const { data, error } = await db.from('contract_sale_inspection_messages').update({
    delivery_status: deliveryStatus, provider_message_id: providerMessageId || null, delivery_error: deliveryError || null,
  }).eq('id', claimed.id).eq('delivery_status', 'unknown').select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new ContractProductError('The availability request outcome was already finalized. Check the message history before retrying.', 409)
  await writeAuditLogStrict('contract_sale', String(sale.id), 'contract_sale.inspection.availability_sent', { ...actorAudit(actor), messageId: data.id, deliveryStatus })
  if (deliveryStatus !== 'sent') throw new ContractProductError(deliveryStatus === 'unknown' ? 'The availability request has an unknown delivery outcome. Check provider activity before retrying.' : 'The availability request was rejected by the email provider.', 502)
  return { messageId: String(data.id), deliveryStatus }
}

export async function previewContractSaleInspectionConfirmations(actor: ContractProductActor, input: Record<string, unknown>) {
  const client = await previewContractSaleInspectionEmail(actor, { ...input, kind: 'client' })
  const cleaner = await previewContractSaleInspectionEmail(actor, { ...input, kind: 'cleaner' })
  const fingerprint = inspectionEmailFingerprint({ client: client.fingerprint, cleaner: cleaner.fingerprint })
  return { client, cleaner, fingerprint }
}

export async function saveContractSaleChecklist(actor: ContractProductActor, input: Record<string, unknown>) {
  const sale = await getAuthorizedSale(actor, clean(input.saleId, 100))
  if (sale.status === 'cancelled') throw new ContractProductError('A cancelled product sale cannot update its checklist.', 409)
  const checklist = parseChecklist(input.checklist)
  if (!checklist.siteAddress || !checklist.clientContact || !checklist.cleanerContact) throw new ContractProductError('The checklist needs the site, client and cleaner details.')
  const db = getAdminSupabase()
  const { data: existing, error: readError } = await db.from('contract_sale_site_checklists').select('id,status,prepared_by_staff_id').eq('sale_id', sale.id).maybeSingle()
  if (readError) throw readError
  if (existing?.status === 'uploaded') throw new ContractProductError('The completed checklist copy is already archived and cannot be replaced.', 409)
  const { data, error } = await db.from('contract_sale_site_checklists').upsert({
    ...(existing ? { id: existing.id } : {}), sale_id: sale.id, checklist_data: checklist,
    status: existing?.status === 'handed_over' ? 'handed_over' : 'draft', prepared_by_staff_id: existing?.prepared_by_staff_id ?? actor.id,
    updated_by_staff_id: actor.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'sale_id' }).select('id,status').single()
  if (error) throw error
  await writeAuditLogStrict('contract_sale', String(sale.id), 'contract_sale.checklist.saved', { ...actorAudit(actor), checklistId: data.id })
  return { checklistId: String(data.id), status: String(data.status) }
}

export async function downloadContractSaleChecklist(actor: ContractProductActor, saleId: string, includeScope = false) {
  const sale = await getAuthorizedSale(actor, clean(saleId, 100))
  const { data, error } = await getAdminSupabase().from('contract_sale_site_checklists').select('id,checklist_data,status').eq('sale_id', sale.id).maybeSingle()
  if (error) throw error
  if (!data) throw new ContractProductError('Save the site checklist before printing.', 409)
  const context = await loadSaleContext(sale)
  const pdf = buildContractSaleChecklistPdf({
    saleCode: String(sale.sale_code),
    productCode: String(context.product.product_code),
    checklist: parseChecklist(data.checklist_data),
    includeScope,
    scope: context.product.cleaner_scope_snapshot,
  })
  return { pdf, fileName: `${String(sale.sale_code).replace(/[^A-Za-z0-9_-]/g, '-')}-site-checklist.pdf` }
}

function inspectionIcs(input: { uid: string; startsAt: Date; durationMinutes: number; location: string; description: string }) {
  const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const end = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000)
  const esc = (value: string) => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Secure Cleaning//Contract Sale Inspection//EN', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST', 'BEGIN:VEVENT', `UID:${input.uid}@securecleaning.com.au`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(input.startsAt)}`, `DTEND:${stamp(end)}`, 'SUMMARY:Secure Cleaning site inspection', `DESCRIPTION:${esc(input.description)}`, `LOCATION:${esc(input.location)}`, 'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
}

export async function scheduleContractSaleInspection(actor: ContractProductActor, input: Record<string, unknown>) {
  const sale = await getAuthorizedSale(actor, clean(input.saleId, 100))
  const db = getAdminSupabase()
  const [{ data: invoiceRows, error: depositError }, { data: existingInspection, error: inspectionReadError }] = await Promise.all([
    db.from('contract_sale_invoices').select('id, invoice_type, status, total_inc_gst_cents, deposit_required_inc_gst_cents').eq('sale_id', sale.id).in('invoice_type', ['sale', 'deposit']).neq('status', 'void'),
    db.from('contract_sale_inspections').select('status, starts_at, provider_message_ids').eq('sale_id', sale.id).maybeSingle(),
  ])
  if (depositError) throw depositError
  if (inspectionReadError) throw inspectionReadError
  const invoice = invoiceRows?.find((item) => item.invoice_type === 'sale') ?? invoiceRows?.find((item) => item.invoice_type === 'deposit')
  const { data: depositAllocations, error: depositAllocationError } = invoice
    ? await db.from('contract_sale_payment_allocations').select('amount_cents').eq('invoice_id', invoice.id)
    : { data: [], error: null }
  if (depositAllocationError) throw depositAllocationError
  const confirmedCents = (depositAllocations ?? []).reduce((sum, item) => sum + Number(item.amount_cents), 0)
  const depositRequired = invoice?.invoice_type === 'sale' ? Number(invoice.deposit_required_inc_gst_cents) : Number(invoice?.total_inc_gst_cents ?? CONTRACT_SALE_DEPOSIT_INC_GST_CENTS)
  if (!invoice || confirmedCents < depositRequired) throw new ContractProductError('The $500 deposit must be confirmed before booking the inspection.', 409)
  const { data: signedAgreement, error: agreementError } = await db.from('contract_sale_agreements')
    .select('id').eq('sale_id', sale.id).eq('status', 'signed').limit(1).maybeSingle()
  if (agreementError) throw agreementError
  if (!signedAgreement) throw new ContractProductError('Upload the signed agreement before booking the inspection.', 409)
  if (existingInspection?.status === 'completed') throw new ContractProductError('A completed inspection cannot be rescheduled.', 409)
  const date = assertDate(input.date)
  const time = clean(input.time, 10)
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ContractProductError('Enter a valid inspection time.')
  const durationMinutes = Math.round(Number(input.durationMinutes))
  if (durationMinutes < 15 || durationMinutes > 480) throw new ContractProductError('Inspection duration must be between 15 and 480 minutes.')
  const context = await loadSaleContext(sale)
  const clientEmail = normalizeInvoiceEmail(context.client?.email)
  const cleanerEmail = normalizeInvoiceEmail(context.cleaner.email)
  const staffEmail = normalizeInvoiceEmail(actor.email)
  if (!clientEmail || !cleanerEmail || !staffEmail) throw new ContractProductError('The client, cleaner, and staff account all need valid email addresses.', 409)
  const timeZone = inspectionTimeZone(context.product.state)
  if (!timeZone) throw new ContractProductError('The product needs a supported Australian state before an inspection can be scheduled.', 409)
  const startsAt = getDateTimeInTimeZone(date, time, timeZone)
  if (Number.isNaN(startsAt.getTime())) throw new ContractProductError('Enter a valid inspection date and time.')
  const location = clean(input.location, 500) || [context.site?.address, context.site?.suburb, context.site?.postcode].filter(Boolean).join(', ')
  if (!location) throw new ContractProductError('Enter the inspection location.')
  const confirmationPreview = await previewContractSaleInspectionConfirmations(actor, input)
  if (input.previewFingerprint !== confirmationPreview.fingerprint) throw new ContractProductError('The appointment or email wording changed after preview. Preview both confirmations again.', 409)
  const clientRequestId = clean(input.clientRequestId, 100)
  const cleanerRequestId = clean(input.cleanerRequestId, 100)
  if (![clientRequestId, cleanerRequestId].every((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))) {
    throw new ContractProductError('Refresh and preview the inspection emails again.', 409)
  }
  const clientDraft = parseInspectionEmailDraft(input, 'client')
  const cleanerDraft = parseInspectionEmailDraft(input, 'cleaner')
  type InviteOutcome = { recipient: 'client' | 'cleaner' | 'staff'; email: string; status: 'sending' | 'sent' | 'failed' | 'unknown'; providerMessageId?: string; error?: string }
  const sameAppointment = existingInspection?.starts_at === startsAt.toISOString()
  const outcomes: InviteOutcome[] = sameAppointment && Array.isArray(existingInspection?.provider_message_ids)
    ? (existingInspection.provider_message_ids as InviteOutcome[]).filter((item) => item && typeof item === 'object' && typeof item.recipient === 'string')
    : []
  const row = {
    sale_id: sale.id, status: 'scheduled', starts_at: startsAt.toISOString(), duration_minutes: durationMinutes,
    time_zone: timeZone, location_snapshot: location, client_name_snapshot: context.client?.contact_name || 'Client',
    client_email_snapshot: clientEmail, cleaner_name_snapshot: context.cleaner.contact_name,
    cleaner_email_snapshot: cleanerEmail, staff_name_snapshot: actor.displayName, staff_email_snapshot: staffEmail,
    notes: clean(input.notes, 1000) || null, invite_status: 'pending', provider_message_ids: outcomes, invite_error: null, scheduled_by_staff_id: actor.id,
    client_subject_snapshot: confirmationPreview.client.subject, client_body_text_snapshot: confirmationPreview.client.bodyText,
    client_body_html_snapshot: confirmationPreview.client.bodyHtml, client_body_document_snapshot: clientDraft.bodyDocument,
    cleaner_subject_snapshot: confirmationPreview.cleaner.subject, cleaner_body_text_snapshot: confirmationPreview.cleaner.bodyText,
    cleaner_body_html_snapshot: confirmationPreview.cleaner.bodyHtml, cleaner_body_document_snapshot: cleanerDraft.bodyDocument,
  }
  const { data: inspection, error } = await db.from('contract_sale_inspections').upsert(row, { onConflict: 'sale_id' }).select('id').single()
  if (error) throw error
  const description = `Product sale ${sale.sale_code}\nClient: ${context.client?.contact_name || 'Client'}\nCleaner: ${context.cleaner.business_name}\nNotes: ${clean(input.notes, 1000) || 'None'}`
  const ics = inspectionIcs({ uid: String(inspection.id), startsAt, durationMinutes, location, description })
  const availability = await getAvailabilityConfig()
  const calendarId = (actor.availabilityAssigneeId ? getAvailabilityAssignee(availability, actor.availabilityAssigneeId)?.calendarId : '')
    || process.env.GOOGLE_CALENDAR_ID || ''
  const calendar = calendarId ? await upsertContractSaleInspectionEvent({
    inspectionId: String(inspection.id), calendarId, startsAt, durationMinutes, timeZone,
    summary: `Secure Cleaning site inspection - ${context.site?.site_name || context.client?.business_name || sale.sale_code}`,
    description, location,
  }) : { status: 'failed' as const, reason: 'No calendar is configured for the sending staff member' }
  const calendarStatus = calendar.status === 'failed' ? 'email_fallback' : calendar.status
  const { error: calendarUpdateError } = await db.from('contract_sale_inspections').update({
    calendar_id_snapshot: calendarId || null, calendar_event_id: calendar.eventId ?? null,
    calendar_status: calendarStatus, calendar_error: calendar.reason ?? null,
  }).eq('id', inspection.id)
  if (calendarUpdateError) throw calendarUpdateError
  const staffHtml = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#1f2937"><p>Your Secure Cleaning site inspection has been scheduled.</p><p><strong>${escapeHtml(date)} at ${escapeHtml(time)}</strong><br>${escapeHtml(location)}</p><p>${escapeHtml(description).replaceAll('\n', '<br>')}</p><p>${calendar.status === 'failed' ? 'The direct calendar write was unavailable. Use the attached calendar invitation.' : 'The appointment was written to your configured calendar. The attached invitation is a backup copy.'}</p></div>`
  const recipients: Array<{ recipient: InviteOutcome['recipient']; email: string; name: string; subject: string; html: string; bodyText: string; bodyHtml: string; bodyDocument: Record<string, unknown> | null; requestId?: string }> = [
    { recipient: 'client', email: clientEmail, name: context.client?.contact_name || 'Client', subject: confirmationPreview.client.subject, html: confirmationPreview.client.html, bodyText: confirmationPreview.client.bodyText, bodyHtml: confirmationPreview.client.bodyHtml, bodyDocument: clientDraft.bodyDocument, requestId: clientRequestId },
    { recipient: 'cleaner', email: cleanerEmail, name: context.cleaner.contact_name, subject: confirmationPreview.cleaner.subject, html: confirmationPreview.cleaner.html, bodyText: confirmationPreview.cleaner.bodyText, bodyHtml: confirmationPreview.cleaner.bodyHtml, bodyDocument: cleanerDraft.bodyDocument, requestId: cleanerRequestId },
    { recipient: 'staff', email: staffEmail, name: actor.displayName, subject: `Site inspection - ${sale.sale_code}`, html: staffHtml, bodyText: description, bodyHtml: staffHtml, bodyDocument: null },
  ]
  for (const target of recipients) {
    const prior = outcomes.find((item) => item.recipient === target.recipient && item.email === target.email)
    if (prior && ['sent', 'unknown', 'sending'].includes(prior.status)) continue
    const claimed: InviteOutcome = { recipient: target.recipient, email: target.email, status: 'sending' }
    const priorIndex = outcomes.findIndex((item) => item.recipient === target.recipient)
    if (priorIndex >= 0) outcomes[priorIndex] = claimed
    else outcomes.push(claimed)
    const { error: claimError } = await db.from('contract_sale_inspections').update({ provider_message_ids: outcomes }).eq('id', inspection.id)
    if (claimError) throw claimError
    try {
      const result = await sendEmailOrThrow({ from: process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au', to: target.email, replyTo: staffEmail, subject: target.subject, html: target.html, attachments: [{ filename: `inspection-${sale.sale_code}.ics`, content: Buffer.from(ics).toString('base64') }] }) as { id?: string } | null
      Object.assign(claimed, { status: 'sent' as const, providerMessageId: result?.id ?? '' })
      if (target.recipient !== 'staff') {
        const { error: historyError } = await db.from('contract_sale_inspection_messages').insert({
          sale_id: sale.id, inspection_id: inspection.id, message_type: target.recipient === 'client' ? 'client_confirmation' : 'cleaner_confirmation',
          recipient_name_snapshot: target.name, recipient_email_snapshot: target.email, subject_snapshot: target.subject,
          body_text_snapshot: target.bodyText, body_html_snapshot: target.bodyHtml, body_document_snapshot: target.bodyDocument,
          sender_staff_id: actor.id, sender_name_snapshot: actor.displayName, sender_email_snapshot: staffEmail,
          preview_fingerprint: confirmationPreview.fingerprint, request_id: target.requestId,
          delivery_status: 'sent', provider_message_id: result?.id ?? null,
        })
        if (historyError) throw historyError
      }
    } catch (sendError) {
      Object.assign(claimed, { status: sendError instanceof EmailProviderRejectedError ? 'failed' as const : 'unknown' as const, error: clean(sendError instanceof Error ? sendError.message : 'Provider outcome unknown', 500) })
    }
    const { error: outcomeError } = await db.from('contract_sale_inspections').update({ provider_message_ids: outcomes }).eq('id', inspection.id)
    if (outcomeError) throw outcomeError
  }
  const unresolved = outcomes.filter((item) => item.status !== 'sent')
  const inviteStatus = unresolved.some((item) => item.status === 'unknown' || item.status === 'sending') ? 'unknown' : unresolved.length ? 'failed' : 'sent'
  const inviteError = unresolved.map((item) => `${item.recipient}: ${item.error || item.status}`).join('; ') || null
  const { error: inviteUpdateError } = await db.from('contract_sale_inspections').update({ invite_status: inviteStatus, invite_error: inviteError, provider_message_ids: outcomes }).eq('id', inspection.id)
  if (inviteUpdateError) throw inviteUpdateError
  if (inviteStatus !== 'sent') throw new ContractProductError(inviteStatus === 'unknown'
    ? 'The inspection was saved, but at least one invitation has an unresolved delivery outcome. Verify provider activity before retrying.'
    : 'The inspection was saved, but at least one invitation was rejected. Retrying will skip recipients already sent.', 502)
  const { error: saleUpdateError } = await db.from('contract_product_sales').update({ status: 'inspection_scheduled', updated_by_staff_id: actor.id }).eq('id', sale.id)
  if (saleUpdateError) throw saleUpdateError
  await writeAuditLogStrict('contract_sale', String(sale.id), 'contract_sale.inspection.scheduled', { ...actorAudit(actor), inspectionId: inspection.id, startsAt: startsAt.toISOString() })
  return { inspectionId: String(inspection.id) }
}

export async function completeContractSaleInspection(actor: ContractProductActor, input: Record<string, unknown>) {
  const sale = await getAuthorizedSale(actor, clean(input.saleId, 100))
  const db = getAdminSupabase()
  const { data, error } = await db.from('contract_sale_inspections').update({ status: 'completed', completed_by_staff_id: actor.id, completed_at: new Date().toISOString(), notes: clean(input.notes, 1000) || null }).eq('sale_id', sale.id).eq('status', 'scheduled').select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new ContractProductError('A scheduled inspection was not found.', 409)
  const [{ data: fullInvoice, error: invoiceError }, { data: activePlan, error: planError }] = await Promise.all([
    db.from('contract_sale_invoices').select('status').eq('sale_id', sale.id).eq('invoice_type', 'sale').neq('status', 'void').maybeSingle(),
    db.from('contract_sale_payment_plans').select('id').eq('sale_id', sale.id).eq('status', 'active').maybeSingle(),
  ])
  if (invoiceError) throw invoiceError
  if (planError) throw planError
  const nextStatus = fullInvoice?.status === 'paid' ? 'ready_for_handover' : activePlan ? 'active_payment_plan' : 'balance_due'
  const { error: saleUpdateError } = await db.from('contract_product_sales').update({ status: nextStatus, updated_by_staff_id: actor.id }).eq('id', sale.id)
  if (saleUpdateError) throw saleUpdateError
  await writeAuditLogStrict('contract_sale', String(sale.id), 'contract_sale.inspection.completed', { ...actorAudit(actor), inspectionId: data.id })
  return { inspectionId: String(data.id) }
}

export async function createContractSaleAgreement(actor: ContractProductActor, input: Record<string, unknown>) {
  const sale = await getAuthorizedSale(actor, clean(input.saleId, 100))
  if (!sale.price_finalised_at) throw new ContractProductError('Save and finalise the GST-inclusive purchase price before creating the agreement.', 409)
  const context = await loadSaleContext(sale)
  const db = getAdminSupabase()
  const { data: latest, error: latestError } = await db.from('contract_sale_agreements').select('version').eq('sale_id', sale.id).order('version', { ascending: false }).limit(1).maybeSingle()
  const { data: plan, error: planError } = await db.from('contract_sale_payment_plans').select('id, terms_snapshot').eq('sale_id', sale.id).in('status', ['awaiting_acceptance', 'active']).order('version', { ascending: false }).limit(1).maybeSingle()
  if (latestError) throw latestError
  if (planError) throw planError
  const cleanerAddress = [context.cleaner.address, context.cleaner.suburb, context.cleaner.state, context.cleaner.postcode].filter(Boolean).join(', ')
  const content = buildContractSaleAgreement({ saleCode: String(sale.sale_code), productCode: String(context.product.product_code), cleanerName: context.cleaner.contact_name, cleanerBusiness: context.cleaner.business_name, cleanerAbn: context.cleaner.abn, cleanerAddress, suburb: context.product.suburb, state: context.product.state, purchasePriceIncGstCents: Number(sale.agreed_purchase_price_inc_gst_cents), depositIncGstCents: Number(sale.deposit_inc_gst_cents), paymentPlanTerms: plan?.terms_snapshot })
  const { data, error } = await db.from('contract_sale_agreements').insert({ sale_id: sale.id, version: Number(latest?.version ?? 0) + 1, agreement_type: plan ? 'payment_plan' : 'standard', payment_plan_id: plan?.id ?? null, content_snapshot: content, cleaner_name_snapshot: context.cleaner.contact_name, cleaner_business_snapshot: context.cleaner.business_name, cleaner_email_snapshot: context.cleaner.email, created_by_staff_id: actor.id }).select('id').single()
  if (error) throw error
  await writeAuditLogStrict('contract_sale', String(sale.id), 'contract_sale.agreement.created', { ...actorAudit(actor), agreementId: data.id })
  return { agreementId: String(data.id) }
}

export async function sendContractSaleAgreement(actor: ContractProductActor, input: Record<string, unknown>) {
  const sale = await getAuthorizedSale(actor, clean(input.saleId, 100))
  const agreementId = clean(input.agreementId, 100)
  const db = getAdminSupabase()
  const [{ data: agreement, error }, { data: preparedInvoice, error: invoiceError }] = await Promise.all([
    db.from('contract_sale_agreements').select('id, version, status, content_snapshot, cleaner_email_snapshot, cleaner_business_snapshot, created_at, payment_plan_id').eq('id', agreementId).eq('sale_id', sale.id).maybeSingle(),
    db.from('contract_sale_invoices').select(INVOICE_DOCUMENT_SELECT).eq('sale_id', sale.id).eq('invoice_type', 'sale').neq('status', 'void').maybeSingle(),
  ])
  if (error) throw error
  if (invoiceError) throw invoiceError
  if (!agreement || agreement.status !== 'draft') throw new ContractProductError('Only an unsent draft agreement can be sent. Create a new version for a deliberate resend.', 409)
  if (!preparedInvoice) throw new ContractProductError('Prepare the full tax invoice before sending the document bundle.', 409)
  if (preparedInvoice.delivery_status === 'unknown') throw new ContractProductError('Invoice delivery is unresolved. Verify provider activity before sending another document bundle.', 409)
  const { data: expectedPlan, error: expectedPlanError } = await db.from('contract_sale_payment_plans').select('id').eq('sale_id', sale.id).in('status', ['awaiting_acceptance', 'active']).order('version', { ascending: false }).limit(1).maybeSingle()
  if (expectedPlanError) throw expectedPlanError
  if (expectedPlan && agreement.payment_plan_id !== expectedPlan.id) throw new ContractProductError('Create a new agreement version for the current payment plan before sending.', 409)
  const senderEmail = normalizeInvoiceEmail(actor.email)
  if (!senderEmail || !clean(actor.displayName, 160)) throw new ContractProductError('Your staff account needs a display name and valid email before sending documents.', 409)
  const email = normalizeInvoiceEmail(agreement.cleaner_email_snapshot)
  if (!email) throw new ContractProductError('The cleaner needs a valid email address.', 409)
  if (email !== normalizeInvoiceEmail(preparedInvoice.recipient_email_snapshot)) throw new ContractProductError('The agreement and tax invoice recipients do not match. Prepare new documents after correcting the cleaner record.', 409)
  const context = await loadSaleContext(sale)
  const currentEmail = normalizeInvoiceEmail(context.cleaner.email)
  if (!currentEmail || currentEmail !== email) throw new ContractProductError('The cleaner email changed after these documents were prepared. Create new document versions for the current recipient.', 409)
  let invoice = preparedInvoice
  if (['pending', 'failed'].includes(String(preparedInvoice.delivery_status))) {
    const { data: senderInvoice, error: senderSnapshotError } = await db.from('contract_sale_invoices').update({
      sender_name_snapshot: actor.displayName, sender_title_snapshot: actor.jobTitle || null,
      sender_email_snapshot: senderEmail,
    }).eq('id', preparedInvoice.id).in('delivery_status', ['pending', 'failed']).select(INVOICE_DOCUMENT_SELECT).maybeSingle()
    if (senderSnapshotError) throw senderSnapshotError
    if (!senderInvoice) throw new ContractProductError('The tax invoice sender changed while this document bundle was being prepared.', 409)
    invoice = senderInvoice
  } else if (preparedInvoice.delivery_status !== 'sent'
    || normalizeInvoiceEmail(preparedInvoice.sender_email_snapshot) !== senderEmail
    || clean(preparedInvoice.sender_name_snapshot, 160) !== clean(actor.displayName, 160)) {
    throw new ContractProductError('The tax invoice sender is locked by an earlier delivery. The same sender must send any replacement agreement bundle.', 409)
  }
  const currentInvoice = await invoiceWithConfirmedPayments(invoice as Row, String(sale.id), agreement.payment_plan_id ?? null)
  const sentAt = new Date().toISOString()
  const { data: claimed, error: claimError } = await db.from('contract_sale_agreements').update({ status: 'sent', sent_at: sentAt })
    .eq('id', agreement.id).eq('status', 'draft').select('id').maybeSingle()
  if (claimError) throw claimError
  if (!claimed) throw new ContractProductError('This agreement was already sent or changed.', 409)
  const invoiceInput = invoicePdfInput(currentInvoice, sale, context)
  const agreementInput = {
    content: String(agreement.content_snapshot), saleCode: String(sale.sale_code),
    productCode: String(context.product.product_code), cleanerBusiness: String(agreement.cleaner_business_snapshot),
    preparedBy: actor.displayName, preparedOn: String(agreement.created_at),
  }
  const invoicePdf = buildContractSaleTaxInvoicePdf(invoiceInput)
  const agreementPdf = buildContractSaleAgreementPdf(agreementInput)
  let result: { id?: string } | null = null
  try {
    result = await sendEmailOrThrow({
      from: process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au', to: email, replyTo: actor.email,
      subject: `Contract sale documents — ${context.product.product_code}`,
      html: renderContractSaleAgreementEmailHtml(agreementInput),
      attachments: [
        { filename: `${String(invoice.invoice_number).replace(/[^A-Za-z0-9_-]/g, '-')}.pdf`, content: invoicePdf.toString('base64') },
        { filename: `agreement-${String(sale.sale_code).replace(/[^A-Za-z0-9_-]/g, '-')}-v${agreement.version}.pdf`, content: agreementPdf.toString('base64') },
      ],
    }) as { id?: string } | null
  } catch (sendError) {
    if (sendError instanceof EmailProviderRejectedError) {
      const [release, invoiceOutcome] = await Promise.all([
        db.from('contract_sale_agreements').update({ status: 'draft', sent_at: null }).eq('id', agreement.id).eq('status', 'sent').is('provider_message_id', null),
        db.from('contract_sale_invoices').update({ delivery_status: 'failed', delivery_error: clean(sendError.message, 500) }).eq('id', invoice.id),
      ])
      if (release.error) throw release.error
      if (invoiceOutcome.error) throw invoiceOutcome.error
      throw new ContractProductError('The provider rejected the document email. Correct the cleaner email before trying again.', 502)
    }
    const { error: outcomeError } = await db.from('contract_sale_invoices').update({ delivery_status: 'unknown', delivery_error: clean(sendError instanceof Error ? sendError.message : 'Provider outcome unknown', 500) }).eq('id', invoice.id)
    if (outcomeError) throw outcomeError
    throw new ContractProductError('Document delivery is unresolved. Verify provider activity before sending again.', 502)
  }
  const providerMessageId = result?.id ?? null
  const [agreementUpdate, invoiceUpdate, saleUpdate] = await Promise.all([
    db.from('contract_sale_agreements').update({ provider_message_id: providerMessageId }).eq('id', agreement.id).eq('status', 'sent'),
    db.from('contract_sale_invoices').update({ provider_message_id: providerMessageId, delivery_status: providerMessageId ? 'sent' : 'unknown', delivery_error: null }).eq('id', invoice.id),
    db.from('contract_product_sales').update({ status: 'deposit_due', updated_by_staff_id: actor.id }).eq('id', sale.id).eq('status', 'draft'),
  ])
  if (agreementUpdate.error) throw agreementUpdate.error
  if (invoiceUpdate.error) throw invoiceUpdate.error
  if (saleUpdate.error) throw saleUpdate.error
  await writeAuditLogStrict('contract_sale', String(sale.id), 'contract_sale.documents.sent', { ...actorAudit(actor), agreementId, invoiceId: invoice.id, providerMessageId })
  return { agreementId, invoiceId: String(invoice.id) }
}

export async function createContractSalePaymentPlan(actor: ContractProductActor, input: Record<string, unknown>) {
  const sale = await getAuthorizedSale(actor, clean(input.saleId, 100))
  const db = getAdminSupabase()
  const { data: invoiceRows, error: invoiceError } = await db.from('contract_sale_invoices').select('id, invoice_type, total_inc_gst_cents, status').eq('sale_id', sale.id).in('invoice_type', ['sale', 'balance']).neq('status', 'void')
  if (invoiceError) throw invoiceError
  const invoice = invoiceRows?.find((item) => item.invoice_type === 'sale') ?? invoiceRows?.find((item) => item.invoice_type === 'balance')
  if (!invoice || invoice.status === 'paid') throw new ContractProductError('Issue the full tax invoice before creating a payment plan.', 409)
  const { data: existing, error: existingError } = await db.from('contract_sale_payment_plans').select('id').eq('sale_id', sale.id).eq('status', 'active').maybeSingle()
  if (existingError) throw existingError
  // A replacement plan preserves the active plan until its new agreement is signed.
  void existing
  const context = await loadSaleContext(sale)
  const { data: allocations, error: allocationError } = await db.from('contract_sale_payment_allocations').select('amount_cents').eq('invoice_id', invoice.id)
  if (allocationError) throw allocationError
  const outstandingBalance = Number(invoice.total_inc_gst_cents) - (allocations ?? []).reduce((sum, item) => sum + Number(item.amount_cents), 0)
  let instalments
  try {
    instalments = input.instalments !== undefined
      ? parsePlanInstalments(input.instalments, outstandingBalance)
      : buildMonthlyInstalments({ balanceCents: outstandingBalance, count: Number(input.count), firstDueOn: assertDate(input.firstDueOn) })
  } catch (error) { throw new ContractProductError(error instanceof Error ? error.message : 'Invalid payment schedule.') }
  const terms = buildPaymentPlanTerms({ saleCode: String(sale.sale_code), cleanerBusiness: context.cleaner.business_name, balanceCents: outstandingBalance, instalments })
  const { data: planId, error } = await db.rpc('create_contract_sale_payment_plan', {
    p_sale_id: sale.id, p_balance_invoice_id: invoice.id, p_terms_snapshot: terms,
    p_instalments: instalments, p_actor_id: actor.id, p_actor_role: actor.role, p_actor_state: actor.productState,
  })
  if (error?.code === '42501') throw new ContractProductError('You cannot approve this payment plan.', 403)
  if (error) throw new ContractProductError(error.message, 409)
  return { paymentPlanId: String(planId) }
}

export async function completeContractSaleHandover(actor: ContractProductActor, input: Record<string, unknown>) {
  const sale = await getAuthorizedSale(actor, clean(input.saleId, 100))
  const commencedOn = assertDate(input.commencedOn)
  const { data, error } = await getAdminSupabase().rpc('complete_contract_sale_handover', { p_sale_id: sale.id, p_commenced_on: commencedOn, p_actor_id: actor.id, p_actor_role: actor.role, p_actor_state: actor.productState })
  if (error?.code === '42501') throw new ContractProductError('You cannot complete this handover.', 403)
  if (error) throw new ContractProductError(error.message, 409)
  await getAdminSupabase().from('contract_sale_site_checklists').update({ status: 'handed_over', handed_over_at: new Date().toISOString(), updated_by_staff_id: actor.id, updated_at: new Date().toISOString() }).eq('sale_id', sale.id).eq('status', 'draft')
  return { saleId: String(sale.id), status: String(data) }
}

export async function cancelContractSale(actor: ContractProductActor, input: Record<string, unknown>) {
  const sale = await getAuthorizedSale(actor, clean(input.saleId, 100))
  const reason = clean(input.reason, 1000)
  if (reason.length < 5) throw new ContractProductError('Enter a cancellation reason.')
  const { error } = await getAdminSupabase().rpc('cancel_contract_product_sale', {
    p_sale_id: sale.id, p_reason: reason, p_actor_id: actor.id, p_actor_role: actor.role, p_actor_state: actor.productState,
  })
  if (error?.code === '42501') throw new ContractProductError('You cannot cancel this product sale.', 403)
  if (error) throw new ContractProductError(error.message, 409)
  return { saleId: String(sale.id) }
}

export async function uploadSignedContractSaleAgreement(actor: ContractProductActor, input: { saleId: string; agreementId: string; file: File }) {
  const sale = await getAuthorizedSale(actor, input.saleId)
  if (input.file.type !== 'application/pdf' || input.file.size <= 0 || input.file.size > 10 * 1024 * 1024) throw new ContractProductError('Upload a PDF smaller than 10 MB.')
  const db = getAdminSupabase()
  const { data: agreement } = await db.from('contract_sale_agreements').select('id, status').eq('id', input.agreementId).eq('sale_id', sale.id).maybeSingle()
  if (!agreement || !['draft', 'sent'].includes(agreement.status)) throw new ContractProductError('Only an unsigned draft or sent agreement can receive its first signed PDF.', 409)
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120) || 'signed-agreement.pdf'
  const path = `${sale.id}/${agreement.id}/${randomUUID()}-${safeName}`
  const fileBuffer = Buffer.from(await input.file.arrayBuffer())
  if (fileBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new ContractProductError('The selected file is not a valid PDF.')
  const { error: uploadError } = await db.storage.from('contract-sale-agreements').upload(path, fileBuffer, { contentType: 'application/pdf', upsert: false })
  if (uploadError) throw uploadError
  const { data: updated, error } = await db.from('contract_sale_agreements').update({ status: 'signed', signed_at: new Date().toISOString(), signed_file_name: safeName, signed_storage_path: path })
    .eq('id', agreement.id).in('status', ['draft', 'sent']).select('id').maybeSingle()
  if (error) throw error
  if (!updated) {
    await db.storage.from('contract-sale-agreements').remove([path])
    throw new ContractProductError('This agreement was already signed or changed. Create a new version instead.', 409)
  }
  await writeAuditLogStrict('contract_sale', String(sale.id), 'contract_sale.agreement.signed_uploaded', { ...actorAudit(actor), agreementId: agreement.id, fileName: safeName })
  return { agreementId: String(agreement.id), fileName: safeName }
}

export async function downloadSignedContractSaleAgreement(actor: ContractProductActor, saleId: string, agreementId: string) {
  const sale = await getAuthorizedSale(actor, saleId)
  const { data: agreement } = await getAdminSupabase().from('contract_sale_agreements').select('signed_file_name, signed_storage_path').eq('id', agreementId).eq('sale_id', sale.id).maybeSingle()
  if (!agreement?.signed_storage_path) throw new ContractProductError('Signed agreement not found.', 404)
  const { data, error } = await getAdminSupabase().storage.from('contract-sale-agreements').download(agreement.signed_storage_path)
  if (error) throw error
  return { blob: data, fileName: agreement.signed_file_name || 'signed-agreement.pdf' }
}

export async function uploadContractSaleChecklistCopy(actor: ContractProductActor, input: { saleId: string; file: File }) {
  const sale = await getAuthorizedSale(actor, input.saleId)
  if (!sale.handover_at) throw new ContractProductError('Complete operational handover before uploading the photographed checklist.', 409)
  const allowed = ['application/pdf', 'image/jpeg', 'image/png']
  if (!allowed.includes(input.file.type) || input.file.size <= 0 || input.file.size > 15 * 1024 * 1024) throw new ContractProductError('Upload a PDF, JPG or PNG smaller than 15 MB.')
  const db = getAdminSupabase()
  const { data: checklist, error: checklistError } = await db.from('contract_sale_site_checklists').select('id').eq('sale_id', sale.id).maybeSingle()
  if (checklistError) throw checklistError
  if (!checklist) throw new ContractProductError('Save the site checklist before uploading its completed copy.', 409)
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120) || 'completed-site-checklist'
  const path = `${sale.id}/${checklist.id}/${randomUUID()}-${safeName}`
  const fileBuffer = Buffer.from(await input.file.arrayBuffer())
  const validMagic = input.file.type === 'application/pdf' ? fileBuffer.subarray(0, 5).toString('ascii') === '%PDF-'
    : input.file.type === 'image/png' ? fileBuffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8 && fileBuffer[fileBuffer.length - 2] === 0xff && fileBuffer[fileBuffer.length - 1] === 0xd9
  if (!validMagic) throw new ContractProductError('The selected checklist file does not match its file type.')
  const { error: uploadError } = await db.storage.from('contract-sale-checklists').upload(path, fileBuffer, { contentType: input.file.type, upsert: false })
  if (uploadError) throw uploadError
  const { data, error } = await db.from('contract_sale_checklist_uploads').insert({
    sale_id: sale.id, checklist_id: checklist.id, file_name: safeName, mime_type: input.file.type,
    file_size_bytes: input.file.size, storage_path: path, uploaded_by_staff_id: actor.id,
  }).select('id').single()
  if (error) { await db.storage.from('contract-sale-checklists').remove([path]); throw error }
  const { error: statusError } = await db.from('contract_sale_site_checklists').update({ status: 'uploaded', updated_by_staff_id: actor.id, updated_at: new Date().toISOString() }).eq('id', checklist.id)
  if (statusError) throw statusError
  await writeAuditLogStrict('contract_sale', String(sale.id), 'contract_sale.checklist.uploaded', { ...actorAudit(actor), checklistId: checklist.id, uploadId: data.id, fileName: safeName })
  return { uploadId: String(data.id), fileName: safeName }
}

export async function downloadContractSaleChecklistCopy(actor: ContractProductActor, saleId: string, uploadId: string) {
  const sale = await getAuthorizedSale(actor, saleId)
  const { data: upload, error: readError } = await getAdminSupabase().from('contract_sale_checklist_uploads')
    .select('file_name,mime_type,storage_path').eq('id', uploadId).eq('sale_id', sale.id).maybeSingle()
  if (readError) throw readError
  if (!upload) throw new ContractProductError('Completed checklist copy not found.', 404)
  const { data, error } = await getAdminSupabase().storage.from('contract-sale-checklists').download(upload.storage_path)
  if (error) throw error
  return { blob: data, fileName: String(upload.file_name), mimeType: String(upload.mime_type) }
}
