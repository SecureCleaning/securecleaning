import 'server-only'

import { getAdminSupabase } from '@/lib/supabase'
import type { ContractProductActor } from '@/lib/contractProductAuth'
import {
  buildCleanerScopeSnapshot,
  calculateContractProductPricing,
  canActorAccessContractProduct,
  canTransitionContractProduct,
  isPublishableCleanerScope,
  normalizeContractProductState,
  type CleanerScopeSnapshotV1,
  type ContractProductQuoteSnapshot,
  type ContractProductState,
  type ContractProductStatus,
} from '@/lib/contractProductPolicy'
import { getQuotePricingConfig } from '@/lib/pricing'
import {
  applyFirmQuoteDisplayPrice,
  buildFirmQuotePreview,
  getFirmQuoteDisplayPrice,
  parseFirmQuoteDraft,
} from '@/lib/quoteWorkflow'
import type { FinalQuoteDocument } from '@/lib/quoteWorkflowData'
import { getQuoteRoomTypeConfig } from '@/lib/roomTypeConfig'
import type { QuoteInputs } from '@/lib/types'
import { isValidContractProductHours, normalizeContractProductHours } from '@/lib/contractProductListingDetails'

export class ContractProductError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

export type ContractProduct = {
  id: string
  productCode: string
  opportunityId: string
  sourceQuoteId: string
  sourceQuoteRef: string
  assignedStaffId: string | null
  status: ContractProductStatus
  heading: string
  description: string
  state: ContractProductState
  suburb: string
  premisesType: string
  startDate: string
  frequency: string
  annualVisits: number
  timePreference: string
  estimatedHoursPerVisit: string
  keyedJob: 'unknown' | 'keyed' | 'not_keyed'
  formalContract: boolean
  freeInitialClean: boolean
  clientPricePerVisitExGstCents: number
  annualContractValueExGstCents: number
  purchasePriceExGstCents: number
  pricingMethod: 'default_50_percent' | 'manual'
  pricingNote: string
  cleanerScopeSnapshot: CleanerScopeSnapshotV1
  version: number
  listedAt: string | null
  createdAt: string
  updatedAt: string
  interestCount: number
}

export type CleanerJobListing = Pick<ContractProduct,
  'productCode' | 'heading' | 'description' | 'state' | 'suburb' | 'premisesType' | 'startDate' |
  'frequency' | 'annualVisits' | 'timePreference' | 'estimatedHoursPerVisit' | 'keyedJob' |
  'formalContract' | 'freeInitialClean' | 'annualContractValueExGstCents' |
  'purchasePriceExGstCents' | 'cleanerScopeSnapshot' | 'listedAt'
>

type ProductRow = Record<string, unknown>

function clean(value: unknown, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function parseMoneyToCents(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 10_000_000) return null
  return Math.round(numeric * 100)
}

function normalizedText(value: unknown) {
  return clean(value, 1000).toLowerCase()
    .replace(/[^a-z0-9@.]+/g, ' ')
    .replace(/\bstreet\b/g, 'st').replace(/\broad\b/g, 'rd').replace(/\bavenue\b/g, 'ave')
    .replace(/\bdrive\b/g, 'dr').replace(/\bboulevard\b/g, 'blvd').replace(/\bhighway\b/g, 'hwy')
    .replace(/\bproprietary limited\b/g, 'pty ltd')
    .replace(/\s+/g, ' ').trim()
}

function digits(value: unknown) {
  return clean(value, 100).replace(/[^0-9]/g, '')
}

async function assertCleanerListingExcludesSourcePii(product: ProductRow) {
  const db = getAdminSupabase()
  const { data: opportunity, error } = await db.from('crm_opportunities')
    .select('organisation_id, primary_contact_id, site_id').eq('id', String(product.opportunity_id)).maybeSingle()
  if (error) throw error
  if (!opportunity) throw new ContractProductError('The source client opportunity is no longer available.', 409)
  const [organisation, contact, site] = await Promise.all([
    db.from('crm_organisations').select('business_name, legal_name').eq('id', opportunity.organisation_id).maybeSingle(),
    db.from('clients').select('business_name, contact_name, email, phone').eq('id', opportunity.primary_contact_id).maybeSingle(),
    opportunity.site_id
      ? db.from('sites').select('site_name, address, postcode').eq('id', opportunity.site_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  for (const result of [organisation, contact, site]) if (result.error) throw result.error
  const listingText = normalizedText(`${product.heading ?? ''} ${product.description ?? ''}`)
  const sensitiveText = [
    organisation.data?.business_name, organisation.data?.legal_name,
    contact.data?.business_name, contact.data?.contact_name, contact.data?.email,
    site.data?.site_name, site.data?.address, site.data?.postcode,
  ].map(normalizedText).filter((value) => value.length >= 4)
  const phone = digits(contact.data?.phone)
  if (sensitiveText.some((value) => listingText.includes(value)) || (phone.length >= 8 && digits(listingText).includes(phone))) {
    throw new ContractProductError('Remove client identity, exact address, postcode, email, or phone details before publishing.', 409)
  }
}

function mapProduct(row: ProductRow, quoteRef = '', interestCount = 0): ContractProduct {
  return {
    id: String(row.id),
    productCode: String(row.product_code ?? ''),
    opportunityId: String(row.opportunity_id ?? ''),
    sourceQuoteId: String(row.source_quote_id ?? ''),
    sourceQuoteRef: quoteRef,
    assignedStaffId: typeof row.assigned_staff_id === 'string' ? row.assigned_staff_id : null,
    status: String(row.status ?? 'draft') as ContractProductStatus,
    heading: String(row.heading ?? ''),
    description: String(row.description ?? ''),
    state: String(row.state ?? '') as ContractProductState,
    suburb: String(row.suburb ?? ''),
    premisesType: String(row.premises_type ?? ''),
    startDate: String(row.start_date ?? ''),
    frequency: String(row.frequency ?? ''),
    annualVisits: Number(row.annual_visits ?? 0),
    timePreference: String(row.time_preference ?? ''),
    estimatedHoursPerVisit: normalizeContractProductHours(row.estimated_hours_per_visit),
    keyedJob: String(row.keyed_job ?? 'unknown') as ContractProduct['keyedJob'],
    formalContract: Boolean(row.formal_contract),
    freeInitialClean: Boolean(row.free_initial_clean),
    clientPricePerVisitExGstCents: Number(row.client_price_per_visit_ex_gst_cents ?? 0),
    annualContractValueExGstCents: Number(row.annual_contract_value_ex_gst_cents ?? 0),
    purchasePriceExGstCents: Number(row.purchase_price_ex_gst_cents ?? 0),
    pricingMethod: row.pricing_method === 'manual' ? 'manual' : 'default_50_percent',
    pricingNote: String(row.pricing_note ?? ''),
    cleanerScopeSnapshot: row.cleaner_scope_snapshot as CleanerScopeSnapshotV1,
    version: Number(row.version ?? 0),
    listedAt: typeof row.listed_at === 'string' ? row.listed_at : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    interestCount,
  }
}

const PRODUCT_SELECT = 'id, product_code, opportunity_id, source_quote_id, assigned_staff_id, status, heading, description, state, suburb, premises_type, start_date, frequency, annual_visits, time_preference, estimated_hours_per_visit, keyed_job, formal_contract, free_initial_clean, client_price_per_visit_ex_gst_cents, annual_contract_value_ex_gst_cents, purchase_price_ex_gst_cents, pricing_method, pricing_note, cleaner_scope_snapshot, version, listed_at, created_at, updated_at'

async function getAuthorizedProduct(actor: ContractProductActor, productId: string) {
  const db = getAdminSupabase()
  const { data, error } = await db.from('contract_products').select(PRODUCT_SELECT).eq('id', productId).maybeSingle()
  if (error) throw error
  if (!data || !canActorAccessContractProduct(actor.role, actor.id, data.assigned_staff_id)) {
    throw new ContractProductError('Contract product not found.', 404)
  }
  if (actor.role === 'agent' && data.state !== actor.productState) {
    throw new ContractProductError('Contract product not found.', 404)
  }
  return data as ProductRow
}

async function getContractProductQuoteSnapshot(quote: ProductRow): Promise<ContractProductQuoteSnapshot> {
  const finalDocument = quote.final_quote_document as FinalQuoteDocument | null
  if (finalDocument) {
    if (finalDocument.variant !== 'final' || !(Number(finalDocument.displayPrice?.low) > 0)) {
      throw new ContractProductError('The saved final quote does not contain a valid price.', 409)
    }
    return finalDocument
  }

  const inputs = quote.inputs as QuoteInputs
  const [pricingConfig, roomTypeConfig] = await Promise.all([
    getQuotePricingConfig(),
    getQuoteRoomTypeConfig(),
  ])
  const firmQuoteDraft = parseFirmQuoteDraft(quote.firm_quote_workflow, inputs, roomTypeConfig)
  const pricingPreview = buildFirmQuotePreview(firmQuoteDraft, pricingConfig, roomTypeConfig)
  const displayPrice = getFirmQuoteDisplayPrice(firmQuoteDraft, pricingPreview)
  if (!(displayPrice.low > 0)) throw new ContractProductError('Save a quote version with a valid price before recording the win.', 409)
  return {
    inputs: firmQuoteDraft.revisedInputs,
    result: applyFirmQuoteDisplayPrice(pricingPreview.calculated, displayPrice),
    firmQuoteDraft,
    displayPrice,
    roomTypeConfig,
  }
}

export async function closeOpportunityWonAndCreateProduct(actor: ContractProductActor, input: Record<string, unknown>) {
  const opportunityId = clean(input.opportunityId, 100)
  const quoteId = clean(input.quoteId, 100)
  const expectedUpdatedAt = clean(input.expectedUpdatedAt, 100)
  const acceptanceDate = clean(input.acceptanceDate, 20)
  const acceptanceMethod = clean(input.acceptanceMethod, 40)
  const acceptanceNote = clean(input.acceptanceNote, 1000)
  if (!opportunityId || !quoteId || !expectedUpdatedAt || !/^\d{4}-\d{2}-\d{2}$/.test(acceptanceDate)
      || !['email', 'signed_agreement', 'phone', 'other'].includes(acceptanceMethod)
      || acceptanceNote.length < 3) {
    throw new ContractProductError('Select the winning saved quote and record the acceptance date, method, and evidence.')
  }

  const db = getAdminSupabase()
  const { data: opportunity, error: opportunityError } = await db.from('crm_opportunities')
    .select('id, assigned_staff_id, updated_at').eq('id', opportunityId).maybeSingle()
  if (opportunityError) throw opportunityError
  if (!opportunity || !canActorAccessContractProduct(actor.role, actor.id, opportunity.assigned_staff_id)) {
    throw new ContractProductError('Opportunity not found.', 404)
  }
  const { data: link, error: linkError } = await db.from('crm_opportunity_quotes')
    .select('quote_id').eq('opportunity_id', opportunityId).eq('quote_id', quoteId).maybeSingle()
  if (linkError) throw linkError
  if (!link) throw new ContractProductError('The selected quote is not part of this opportunity.', 409)
  const { data: quote, error: quoteError } = await db.from('quotes')
    .select('id, inputs, result, firm_quote_workflow, final_quote_document').eq('id', quoteId).maybeSingle()
  if (quoteError) throw quoteError
  if (!quote) throw new ContractProductError('The selected quote is no longer available.', 409)
  const sourceSnapshot = await getContractProductQuoteSnapshot(quote as ProductRow)
  const cleanerScopeSnapshot = buildCleanerScopeSnapshot(sourceSnapshot)
  if (!isPublishableCleanerScope(cleanerScopeSnapshot)) {
    throw new ContractProductError('The saved quote could not be converted into a privacy-safe cleaner scope.', 409)
  }
  if (actor.role === 'agent' && cleanerScopeSnapshot.state !== actor.productState) {
    throw new ContractProductError('Agents can only create products in their assigned state.', 403)
  }
  const rpcCleanerScopeSnapshot = {
    ...cleanerScopeSnapshot,
    sourcePricing: {
      clientPricePerVisitExGstCents: Math.round(sourceSnapshot.displayPrice.low * 100),
    },
  }

  const { data, error } = await db.rpc('close_crm_opportunity_won_and_create_product', {
    p_opportunity_id: opportunityId,
    p_quote_id: quoteId,
    p_expected_updated_at: expectedUpdatedAt,
    p_acceptance_date: acceptanceDate,
    p_acceptance_method: acceptanceMethod,
    p_acceptance_note: acceptanceNote,
    p_cleaner_scope_snapshot: rpcCleanerScopeSnapshot,
    p_actor_id: actor.id,
    p_actor_role: actor.role,
    p_actor_state: actor.productState,
  })
  if (error?.code === '40001') throw new ContractProductError('This opportunity changed while you were editing it. Reload and try again.', 409)
  if (error?.code === '42501') throw new ContractProductError('You cannot create a product for this opportunity.', 403)
  if (error) throw error
  return { productId: String(data) }
}

export async function getContractProducts(actor: ContractProductActor) {
  const db = getAdminSupabase()
  let query = db.from('contract_products').select(PRODUCT_SELECT).order('updated_at', { ascending: false }).limit(200)
  if (actor.role === 'agent') query = query.eq('assigned_staff_id', actor.id).eq('state', actor.productState)
  const { data, error } = await query
  if (error) throw error
  const rows = (data ?? []) as ProductRow[]
  const quoteIds = rows.map((row) => String(row.source_quote_id))
  const productIds = rows.map((row) => String(row.id))
  const [quotes, interests] = await Promise.all([
    quoteIds.length ? db.from('quotes').select('id, quote_ref').in('id', quoteIds) : Promise.resolve({ data: [], error: null }),
    productIds.length ? db.from('contract_product_interests').select('product_id').in('product_id', productIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (quotes.error) throw quotes.error
  if (interests.error) throw interests.error
  const quoteRefs = new Map((quotes.data ?? []).map((row) => [String(row.id), String(row.quote_ref)]))
  const interestCounts = new Map<string, number>()
  for (const row of interests.data ?? []) {
    const id = String(row.product_id)
    interestCounts.set(id, (interestCounts.get(id) ?? 0) + 1)
  }
  return rows.map((row) => mapProduct(row, quoteRefs.get(String(row.source_quote_id)) ?? '', interestCounts.get(String(row.id)) ?? 0))
}

export async function updateContractProduct(actor: ContractProductActor, input: Record<string, unknown>) {
  const productId = clean(input.productId, 100)
  const expectedUpdatedAt = clean(input.expectedUpdatedAt, 100)
  if (!productId || !expectedUpdatedAt) throw new ContractProductError('Product ID and current version are required.')
  const current = await getAuthorizedProduct(actor, productId)
  if (String(current.updated_at) !== expectedUpdatedAt) throw new ContractProductError('This product changed while you were editing it. Reload and try again.', 409)
  if (!['draft', 'withdrawn'].includes(String(current.status))) {
    throw new ContractProductError('Withdraw an available product before editing and publishing a new version.', 409)
  }

  const heading = clean(input.heading, 200)
  const description = clean(input.description, 3000)
  const annualVisits = Math.round(Number(input.annualVisits))
  const startDate = clean(input.startDate, 20)
  const estimatedHours = normalizeContractProductHours(input.estimatedHoursPerVisit)
  const keyedJob = clean(input.keyedJob, 20)
  const pricingMethod = input.pricingMethod === 'manual' ? 'manual' : 'default_50_percent'
  const manualPurchaseCents = parseMoneyToCents(input.purchasePriceExGst)
  if (!heading || !description || !Number.isInteger(annualVisits) || annualVisits < 1 || annualVisits > 366) {
    throw new ContractProductError('Provide a heading, description, and annual visit count between 1 and 366.')
  }
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new ContractProductError('Enter a valid proposed start date.')
  if (!isValidContractProductHours(estimatedHours)) {
    throw new ContractProductError('Enter estimated hours as one duration or a range, such as 1.5 - 2 hours.')
  }
  if (!['unknown', 'keyed', 'not_keyed'].includes(keyedJob)) throw new ContractProductError('Select a valid keyed-job option.')
  if (pricingMethod === 'manual' && !manualPurchaseCents) throw new ContractProductError('Enter a valid manual purchase price.')

  const pricing = calculateContractProductPricing(Number(current.client_price_per_visit_ex_gst_cents), annualVisits)
  const purchasePrice = pricingMethod === 'manual' ? manualPurchaseCents! : pricing.suggestedPurchasePriceExGstCents
  if (Math.round(purchasePrice * 1.1) <= 50_000) {
    throw new ContractProductError('The cleaner purchase price must be greater than the $500 GST-inclusive deposit.')
  }
  const db = getAdminSupabase()
  const { data, error } = await db.from('contract_products').update({
    heading,
    description,
    start_date: startDate || null,
    annual_visits: annualVisits,
    estimated_hours_per_visit: estimatedHours || null,
    keyed_job: keyedJob,
    formal_contract: input.formalContract === true,
    free_initial_clean: input.freeInitialClean === true,
    annual_contract_value_ex_gst_cents: pricing.annualValueExGstCents,
    purchase_price_ex_gst_cents: purchasePrice,
    pricing_method: pricingMethod,
    pricing_note: clean(input.pricingNote, 1000) || null,
  }).eq('id', productId).eq('updated_at', expectedUpdatedAt).select(PRODUCT_SELECT).maybeSingle()
  if (error) throw error
  if (!data) throw new ContractProductError('This product changed while you were editing it. Reload and try again.', 409)
  return mapProduct(data as ProductRow)
}

export async function publishContractProduct(actor: ContractProductActor, input: Record<string, unknown>) {
  const productId = clean(input.productId, 100)
  const expectedUpdatedAt = clean(input.expectedUpdatedAt, 100)
  const current = await getAuthorizedProduct(actor, productId)
  if (!isPublishableCleanerScope(current.cleaner_scope_snapshot)) throw new ContractProductError('The cleaner scope is not ready to publish.', 409)
  await assertCleanerListingExcludesSourcePii(current)
  const { data, error } = await getAdminSupabase().rpc('publish_contract_product', {
    p_product_id: productId,
    p_expected_updated_at: expectedUpdatedAt,
    p_actor_id: actor.id,
    p_actor_role: actor.role,
    p_actor_state: actor.productState,
  })
  if (error?.code === '40001') throw new ContractProductError('This product changed while you were editing it. Reload and try again.', 409)
  if (error?.code === '42501') throw new ContractProductError('You cannot publish this product.', 403)
  if (error) throw error
  return { productId, version: Number(data) }
}

export async function withdrawContractProduct(actor: ContractProductActor, input: Record<string, unknown>) {
  const productId = clean(input.productId, 100)
  const expectedUpdatedAt = clean(input.expectedUpdatedAt, 100)
  const current = await getAuthorizedProduct(actor, productId)
  const status = String(current.status) as ContractProductStatus
  if (!canTransitionContractProduct(status, 'withdrawn')) throw new ContractProductError('This product cannot be withdrawn.', 409)
  const { data, error } = await getAdminSupabase().from('contract_products').update({
    status: 'withdrawn', withdrawn_at: new Date().toISOString(),
  }).eq('id', productId).eq('updated_at', expectedUpdatedAt).select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new ContractProductError('This product changed while you were editing it. Reload and try again.', 409)
  return { productId }
}

export async function getAvailableCleanerJobs(state?: ContractProductState | null): Promise<CleanerJobListing[]> {
  const db = getAdminSupabase()
  let query = db.from('contract_products').select(PRODUCT_SELECT).eq('status', 'available').order('listed_at', { ascending: false }).limit(100)
  if (state) query = query.eq('state', state)
  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as ProductRow[]).map((row) => {
    const product = mapProduct(row)
    return {
      productCode: product.productCode,
      heading: product.heading,
      description: product.description,
      state: product.state,
      suburb: product.suburb,
      premisesType: product.premisesType,
      startDate: product.startDate,
      frequency: product.frequency,
      annualVisits: product.annualVisits,
      timePreference: product.timePreference,
      estimatedHoursPerVisit: product.estimatedHoursPerVisit,
      keyedJob: product.keyedJob,
      formalContract: product.formalContract,
      freeInitialClean: product.freeInitialClean,
      annualContractValueExGstCents: product.annualContractValueExGstCents,
      purchasePriceExGstCents: product.purchasePriceExGstCents,
      cleanerScopeSnapshot: product.cleanerScopeSnapshot,
      listedAt: product.listedAt,
    }
  })
}

export async function registerContractProductInterest(input: {
  productCode: string
  accessLinkId: string
  email: string
  note?: string
}) {
  const db = getAdminSupabase()
  const email = input.email.trim().toLowerCase().slice(0, 320)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false
  const accessLink = await getJobsAccessLink(input.accessLinkId)
  if (!accessLink) return false
  const { data: product } = await db.from('contract_products').select('id, state').eq('product_code', input.productCode).eq('status', 'available').maybeSingle()
  if (!product) return false
  if (accessLink.state && accessLink.state !== product.state) return false
  const { data: cleaner } = await db.from('cleaners').select('id, email, state, status, contact_name, phone')
    .eq('email', email).eq('status', 'approved').maybeSingle()
  if (!cleaner || String(cleaner.state ?? '').toUpperCase() !== product.state) return false
  const { error } = await db.from('contract_product_interests').upsert({
    product_id: product.id,
    cleaner_id: cleaner.id,
    access_link_id: input.accessLinkId,
    contact_name: clean(cleaner.contact_name, 160) || 'Cleaner',
    email_normalized: email,
    phone: clean(cleaner.phone, 40) || null,
    note: clean(input.note, 1000) || null,
  }, { onConflict: 'product_id,cleaner_id', ignoreDuplicates: true })
  if (error) throw error
  return true
}

export async function getActiveJobsAccessLinkId() {
  const { data, error } = await getAdminSupabase().from('contract_product_access_links')
    .select('id').eq('active', true).is('state', null).or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data?.id ? String(data.id) : null
}

export async function isActiveJobsAccessLink(accessLinkId: string) {
  return Boolean(await getJobsAccessLink(accessLinkId))
}

export async function getJobsAccessLink(accessLinkId: string): Promise<{ id: string; state: ContractProductState | null } | null> {
  const { data, error } = await getAdminSupabase().from('contract_product_access_links')
    .select('id, state').eq('id', accessLinkId).eq('active', true)
    .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString()).maybeSingle()
  if (error) throw error
  if (!data?.id) return null
  return { id: String(data.id), state: normalizeContractProductState(data.state) }
}

export async function unsubscribeCleanerBroadcast(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false
  const { data, error } = await getAdminSupabase().rpc('unsubscribe_cleaner_broadcast', { p_token: token })
  if (error) throw error
  return data === true
}
