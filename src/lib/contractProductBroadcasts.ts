import 'server-only'
import { readEmailPages, acquireEmailDeliverySlot, emailProviderPause, EMAIL_DELIVERY_STEP_SIZE, EMAIL_DELIVERY_STEP_MS } from '@/lib/emailDeliveryQueue'

import { EmailProviderRejectedError, sendEmailOrThrow } from '@/lib/email'
import { createCleanerJobsAccessToken } from '@/lib/cleanerJobsAccess'
import type { ContractProductActor } from '@/lib/contractProductAuth'
import { normalizeContractProductState, type ContractProductState } from '@/lib/contractProductPolicy'
import { ContractProductError, getActiveJobsAccessLinkId, getContractProducts } from '@/lib/contractProducts'
import { hasCompleteCrmSignature } from '@/lib/clientCrmPolicy'
import {
  applyContractProductBroadcastTemplateFields,
  findUnsupportedContractProductBroadcastTemplateFields,
  type ContractProductBroadcastTemplateValues,
} from '@/lib/contractProductBroadcastTemplateTokens'
import { getSiteUrl } from '@/lib/siteUrl'
import { getStaffAccountProfileById, listStaffAccounts, type StaffAccount } from '@/lib/staffAccounts'
import { getAdminSupabase } from '@/lib/supabase'
import { parseRichEmailContent, richEmailFingerprint, sanitizeRichEmailHtml } from '@/lib/richEmailServer'
import type { RichEmailContent } from '@/lib/richEmailContent'

type BroadcastProduct = {
  id: string
  productCode: string
  heading: string
  suburb: string
  state: ContractProductState
  frequency: string
  annualVisits: number
  timePreference: string
  annualValueIncGstCents: number
  purchasePriceIncGstCents: number
  startDate: string
}

type EligibleCleaner = {
  id: string
  email: string
  name: string
  businessName: string
  firstName: string
  lastName: string
  city: string
  suburb: string
  postcode: string
  phone: string
  address: string
  abn: string
  services: string
  unsubscribeToken: string
}

type BroadcastRecipientMode = 'state' | 'single' | 'multiple'
type BroadcastSender = Pick<StaffAccount, 'id' | 'displayName' | 'email' | 'jobTitle' | 'phone' | 'role'>

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

function safeHeaderName(value: string) {
  return value.replace(/[\r\n<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
}

function getVerifiedFromAddress(value: string) {
  const candidate = value.trim()
  const bracketed = candidate.match(/<([^<>]+)>/)?.[1]?.trim() ?? candidate
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(bracketed)
    ? bracketed
    : 'quotes@securecleaning.com.au'
}

function money(cents: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(cents / 100)
}

function assertBroadcastState(actor: ContractProductActor, value: unknown) {
  const state = normalizeContractProductState(value)
  if (!state) throw new ContractProductError('Select a valid Australian state or territory.')
  if (actor.role === 'agent' && actor.productState !== state) {
    throw new ContractProductError('Agents can only broadcast jobs in their assigned state.', 403)
  }
  return state
}

function getRecipientMode(value: unknown): BroadcastRecipientMode {
  if (value === 'state' || value === 'single' || value === 'multiple') return value
  throw new ContractProductError('Select who should receive this email.')
}

function senderOption(account: StaffAccount): BroadcastSender {
  return {
    id: account.id,
    displayName: account.displayName,
    email: account.email,
    jobTitle: account.jobTitle,
    phone: account.phone,
    role: account.role,
  }
}

export async function listContractProductBroadcastSenders(actor: ContractProductActor) {
  if (actor.role !== 'owner') return [senderOption(actor)]
  return (await listStaffAccounts())
    .filter((account) => account.active && ['owner', 'manager', 'agent'].includes(account.role))
    .map(senderOption)
}

async function resolveBroadcastSender(actor: ContractProductActor, value: unknown) {
  const requestedId = clean(value, 100) || actor.id
  if (actor.role !== 'owner' && requestedId !== actor.id) {
    throw new ContractProductError('Only the owner can send a product broadcast as another team member.', 403)
  }
  const sender = requestedId === actor.id ? actor : await getStaffAccountProfileById(requestedId)
  if (!sender?.active || !['owner', 'manager', 'agent'].includes(sender.role)) {
    throw new ContractProductError('Select an active team member to send this email.', 409)
  }
  if (!hasCompleteCrmSignature(sender)) {
    throw new ContractProductError("Complete the selected sender's Team Access email signature before sending.", 409)
  }
  return sender
}

function parseRecipientEmails(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw.length > 300000) throw new ContractProductError('The cleaner email list is too long.')
  const values = raw.split(/[,;\n]+/).map((email) => email.trim().toLowerCase()).filter(Boolean)
  if (values.length < 2) {
    throw new ContractProductError('Enter at least two cleaner email addresses, separated by commas or new lines.')
  }
  const invalid = values.filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  if (invalid.length > 0) {
    throw new ContractProductError(`Correct these invalid email addresses: ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? ', …' : ''}`)
  }
  const duplicates = values.filter((email, index) => values.indexOf(email) !== index)
  if (duplicates.length > 0) {
    throw new ContractProductError(`Remove duplicate email addresses: ${[...new Set(duplicates)].slice(0, 5).join(', ')}${duplicates.length > 5 ? ', …' : ''}`)
  }
  return values
}

async function getBroadcastProducts(actor: ContractProductActor, state: ContractProductState, selectedProductIds: unknown) {
  const selected = Array.isArray(selectedProductIds)
    ? new Set(selectedProductIds.filter((id): id is string => typeof id === 'string').slice(0, 50))
    : new Set<string>()
  const products = (await getContractProducts(actor)).filter((product) => (
    product.status === 'available' && product.state === state && (selected.size === 0 || selected.has(product.id))
  ))
  if (products.length === 0) throw new ContractProductError('There are no available products selected for this state.', 409)
  if (selected.size > 0 && products.length !== selected.size) {
    throw new ContractProductError('One or more selected products are unavailable or outside your state.', 409)
  }
  return products.map<BroadcastProduct>((product) => ({
    id: product.id,
    productCode: product.productCode,
    heading: product.heading,
    suburb: product.suburb,
    state: product.state,
    frequency: product.frequency,
    annualVisits: product.annualVisits,
    timePreference: product.timePreference,
    annualValueIncGstCents: Math.round(product.annualContractValueExGstCents * 1.1),
    purchasePriceIncGstCents: Math.round(product.purchasePriceExGstCents * 1.1),
    startDate: product.startDate,
  }))
}

async function getEligibleCleaners(state: ContractProductState) {
  const db = getAdminSupabase()
  const candidates = await readEmailPages((from, to) => db.from('cleaners')
    .select('id, email, phone, address, contact_name, business_name, first_name, last_name, city, suburb, postcode, abn, services, broadcast_unsubscribe_token')
    .eq('status', 'approved').eq('state', state).order('id').range(from, to))
  const emails = candidates.map((row) => String(row.email ?? '').trim().toLowerCase()).filter(Boolean)
  const [globalSuppressions, cleanerSuppressions] = emails.length ? await Promise.all([
    readEmailPages((from, to) => db.from('crm_email_suppressions').select('email_normalized').eq('blocks_all', true).order('email_normalized').range(from, to)),
    readEmailPages((from, to) => db.from('cleaner_broadcast_suppressions').select('cleaner_id').order('cleaner_id').range(from, to)),
  ]) : [[], []]
  const suppressedEmails = new Set(globalSuppressions.map((row) => String(row.email_normalized)))
  const suppressedCleanerIds = new Set(cleanerSuppressions.map((row) => String(row.cleaner_id)))
  const seen = new Set<string>()
  const eligible: EligibleCleaner[] = []
  const excluded = { invalidEmail: 0, suppressed: 0, duplicateEmail: 0 }
  for (const row of candidates) {
    const email = String(row.email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { excluded.invalidEmail += 1; continue }
    if (suppressedEmails.has(email) || suppressedCleanerIds.has(String(row.id))) { excluded.suppressed += 1; continue }
    if (seen.has(email)) { excluded.duplicateEmail += 1; continue }
    seen.add(email)
    eligible.push({
      id: String(row.id),
      email,
      name: String(row.contact_name ?? '').trim() || 'Cleaner',
      businessName: String(row.business_name ?? '').trim(),
      firstName: String(row.first_name ?? '').trim() || String(row.contact_name ?? '').trim().split(/\s+/)[0] || 'Cleaner',
      lastName: String(row.last_name ?? '').trim(),
      city: String(row.city ?? '').trim(),
      suburb: String(row.suburb ?? '').trim(),
      postcode: String(row.postcode ?? '').trim(),
      phone: String(row.phone ?? '').trim(),
      address: String(row.address ?? '').trim(),
      abn: String(row.abn ?? '').trim(),
      services: Array.isArray(row.services) ? row.services.map(String).join(', ') : '',
      unsubscribeToken: String(row.broadcast_unsubscribe_token ?? ''),
    })
  }
  return { eligible, excluded, considered: candidates.length }
}

function selectBroadcastRecipients(
  recipients: Awaited<ReturnType<typeof getEligibleCleaners>>,
  mode: BroadcastRecipientMode,
  cleanerIdValue: unknown,
  cleanerEmailsValue: unknown,
) {
  if (mode === 'state') return recipients.eligible
  if (mode === 'single') {
    const cleanerId = clean(cleanerIdValue, 80)
    const cleaner = recipients.eligible.find((candidate) => candidate.id === cleanerId)
    if (!cleaner) {
      throw new ContractProductError('Select an eligible approved cleaner in this state.', 409)
    }
    return [cleaner]
  }
  const emails = parseRecipientEmails(cleanerEmailsValue)
  const eligibleByEmail = new Map(recipients.eligible.map((cleaner) => [cleaner.email, cleaner]))
  const unmatched = emails.filter((email) => !eligibleByEmail.has(email))
  if (unmatched.length > 0) {
    throw new ContractProductError(
      `These addresses do not match eligible approved cleaners in this state: ${unmatched.slice(0, 5).join(', ')}${unmatched.length > 5 ? ', …' : ''}`,
      409,
    )
  }
  return emails.map((email) => eligibleByEmail.get(email) as EligibleCleaner)
}

function defaultBroadcastSubject(state: ContractProductState) {
  return `Available cleaning contracts in ${state}`
}

function defaultBroadcastIntro(state: ContractProductState) {
  return `The following Secure Cleaning contract opportunities are currently available in ${state}.`
}

async function getBroadcastJobsUrl(state: ContractProductState) {
  const accessLinkId = await getActiveJobsAccessLinkId()
  if (!accessLinkId) throw new ContractProductError('The reusable cleaner jobs link is not active.', 409)
  const accessToken = createCleanerJobsAccessToken(accessLinkId)
  if (!accessToken) throw new ContractProductError('The cleaner jobs access link could not be signed.', 500)
  return `${getSiteUrl()}/jobs/access/${encodeURIComponent(accessToken)}?state=${state}`
}

function getBroadcastTemplateValues(input: {
  cleaner: EligibleCleaner
  products: BroadcastProduct[]
  jobsUrl: string
  sender: BroadcastSender
}): ContractProductBroadcastTemplateValues {
  const state = input.products[0]?.state ?? ''
  return {
    first_name: input.cleaner.firstName,
    last_name: input.cleaner.lastName,
    name: input.cleaner.name,
    company: input.cleaner.businessName,
    email: input.cleaner.email,
    phone: input.cleaner.phone,
    address: input.cleaner.address,
    city: input.cleaner.city,
    suburb: input.cleaner.suburb,
    postcode: input.cleaner.postcode,
    state,
    abn: input.cleaner.abn,
    services: input.cleaner.services,
    product_count: String(input.products.length),
    product_codes: input.products.map((product) => product.productCode).join(', '),
    jobs_link: input.jobsUrl,
    sender_name: input.sender.displayName,
    sender_title: input.sender.jobTitle,
    sender_email: input.sender.email,
    sender_phone: input.sender.phone,
  }
}

function assertSupportedBroadcastTemplateFields(...values: string[]) {
  const unsupported = findUnsupportedContractProductBroadcastTemplateFields(...values)
  if (unsupported.length > 0) {
    throw new ContractProductError(`Remove or correct unsupported template fields: ${unsupported.join(', ')}`)
  }
}

function renderBroadcastTemplate(value: string, input: {
  cleaner: EligibleCleaner
  products: BroadcastProduct[]
  jobsUrl: string
  sender: BroadcastSender
}, escapeValues = false) {
  const values = getBroadcastTemplateValues(input)
  const renderedValues = escapeValues
    ? Object.fromEntries(Object.entries(values).map(([token, replacement]) => [token, escapeHtml(replacement)])) as ContractProductBroadcastTemplateValues
    : values
  return applyContractProductBroadcastTemplateFields(value, renderedValues)
}

function renderBroadcastSubject(value: string, input: Parameters<typeof renderBroadcastTemplate>[1]) {
  return renderBroadcastTemplate(value, input).replace(/[\r\n]+/g, ' ').trim()
}

function getBroadcastIntro(input: Record<string, unknown>, state: ContractProductState): RichEmailContent {
  const source = { ...input }
  if (!clean(source.intro, 20_000) && !clean(source.introHtml, 120_000)) {
    source.intro = defaultBroadcastIntro(state)
  }
  try {
    return parseRichEmailContent(source, { text: 'intro', html: 'introHtml', document: 'introDocument', maxText: 20_000, maxHtml: 120_000 })
  } catch (error) {
    throw new ContractProductError(error instanceof Error ? error.message : 'Introductory message is required.')
  }
}

function broadcastDraftFingerprint(input: Record<string, unknown>, values: {
  state: ContractProductState
  recipientMode: BroadcastRecipientMode
  senderId: string
  subject: string
  intro: RichEmailContent
}) {
  const productIds = Array.isArray(input.productIds) ? input.productIds.filter((id): id is string => typeof id === 'string').sort() : []
  const cleanerEmails = typeof input.cleanerEmails === 'string'
    ? input.cleanerEmails.split(/[,;\n]+/).map((email) => email.trim().toLowerCase()).filter(Boolean).sort()
    : []
  return richEmailFingerprint({
    subject: values.subject,
    html: values.intro.html,
    text: values.intro.text,
    context: JSON.stringify({
      state: values.state,
      recipientMode: values.recipientMode,
      senderId: values.senderId,
      productIds,
      cleanerId: clean(input.cleanerId, 80),
      cleanerEmails,
    }),
  })
}

export async function listEligibleContractProductBroadcastCleaners(
  actor: ContractProductActor,
  input: Record<string, unknown>,
) {
  const state = assertBroadcastState(actor, input.state)
  const recipients = await getEligibleCleaners(state)
  return {
    state,
    cleaners: recipients.eligible.map((cleaner) => ({
      id: cleaner.id,
      name: cleaner.name,
      businessName: cleaner.businessName,
      email: cleaner.email,
    })),
    consideredCount: recipients.considered,
    excluded: recipients.excluded,
  }
}

export async function previewContractProductBroadcast(actor: ContractProductActor, input: Record<string, unknown>) {
  const state = assertBroadcastState(actor, input.state)
  const recipientMode = getRecipientMode(input.recipientMode)
  const subject = clean(input.subject, 240) || defaultBroadcastSubject(state)
  const intro = getBroadcastIntro(input, state)
  assertSupportedBroadcastTemplateFields(subject, intro.text, intro.html)
  const [products, recipients, sender, jobsUrl] = await Promise.all([
    getBroadcastProducts(actor, state, input.productIds),
    getEligibleCleaners(state),
    resolveBroadcastSender(actor, input.senderStaffId),
    getBroadcastJobsUrl(state),
  ])
  const selectedRecipients = selectBroadcastRecipients(recipients, recipientMode, input.cleanerId, input.cleanerEmails)
  if (selectedRecipients.length === 0) {
    throw new ContractProductError('No eligible approved cleaners were found for this state.', 409)
  }
  const previewCleaner = selectedRecipients[0]
  const templateInput = { cleaner: previewCleaner, products, jobsUrl, sender }
  const fromAddress = getVerifiedFromAddress(process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au')
  return {
    state,
    products,
    recipientMode,
    recipientCount: selectedRecipients.length,
    canSend: selectedRecipients.length > 0,
    targetCleaner: recipientMode === 'single' ? {
      id: selectedRecipients[0].id,
      name: selectedRecipients[0].name,
      businessName: selectedRecipients[0].businessName,
      email: selectedRecipients[0].email,
    } : null,
    targetCleaners: recipientMode === 'state' ? [] : selectedRecipients.map((cleaner) => ({
      id: cleaner.id,
      name: cleaner.name,
      businessName: cleaner.businessName,
      email: cleaner.email,
    })),
    consideredCount: recipients.considered,
    excluded: recipients.excluded,
    defaultSubject: subject,
    defaultIntro: intro.text,
    defaultIntroHtml: intro.html,
    defaultIntroDocument: intro.document,
    previewFingerprint: broadcastDraftFingerprint(input, {
      state,
      recipientMode,
      senderId: sender.id,
      subject,
      intro,
    }),
    emailPreview: {
      recipient: {
        id: previewCleaner.id,
        name: previewCleaner.name,
        businessName: previewCleaner.businessName,
        email: previewCleaner.email,
      },
      fromName: `${safeHeaderName(sender.displayName)} - Secure Cleaning`,
      fromEmail: fromAddress,
      replyTo: sender.email,
      subject: renderBroadcastSubject(subject, templateInput),
      html: buildBroadcastHtml({
        ...templateInput,
        introHtml: intro.html,
        unsubscribeUrl: '#email-preview-unsubscribe',
      }),
      personalised: selectedRecipients.length > 1,
    },
  }
}

function buildBroadcastHtml(input: {
  cleaner: EligibleCleaner
  products: BroadcastProduct[]
  introHtml: string
  jobsUrl: string
  unsubscribeUrl: string
  sender: BroadcastSender
}) {
  const messageHtml = sanitizeRichEmailHtml(renderBroadcastTemplate(input.introHtml, input, true))
  const cards = input.products.map((product) => `
    <div style="border:1px solid #dbe3ea;border-radius:10px;padding:18px;margin:16px 0;">
      <div style="font-size:12px;font-weight:700;color:#0f766e;">${escapeHtml(product.productCode)} · ${escapeHtml(product.suburb)}, ${escapeHtml(product.state)}</div>
      <h2 style="font-size:18px;margin:8px 0;color:#172033;">${escapeHtml(product.heading)}</h2>
      <p style="margin:4px 0;color:#475569;">${escapeHtml(product.frequency.replaceAll('_', ' '))} · ${escapeHtml(product.timePreference.replaceAll('_', ' '))}</p>
      <p style="margin:10px 0 0;"><strong>Annual contract value:</strong> ${money(product.annualValueIncGstCents)} inc GST<br>
      <strong>Purchase price:</strong> ${money(product.purchasePriceIncGstCents)} inc GST</p>
    </div>`).join('')
  return `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#172033;">
      <div style="background:#1a2744;padding:24px;"><h1 style="color:white;margin:0;font-size:23px;">Secure Cleaning</h1></div>
      <div style="padding:26px 24px;">
        <p>Hi ${escapeHtml(input.cleaner.firstName)},</p>
        <div style="line-height:1.6;">${messageHtml}</div>
        ${cards}
        <p style="margin:26px 0;"><a href="${escapeHtml(input.jobsUrl)}" style="display:inline-block;background:#16a34a;color:white;padding:13px 20px;border-radius:7px;text-decoration:none;font-weight:700;">View all available jobs</a></p>
        <p>Kind regards,<br><br>${escapeHtml(input.sender.displayName)}<br>${escapeHtml(input.sender.jobTitle)}<br>Secure Cleaning<br>${escapeHtml(input.sender.phone)}<br>${escapeHtml(input.sender.email)}</p>
      </div>
      <div style="border-top:1px solid #e5e7eb;padding:18px 24px;color:#64748b;font-size:12px;">
        <p>These opportunities were sent because your cleaner profile is approved for work in ${escapeHtml(input.products[0].state)}.</p>
        <p><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#0f766e;">Unsubscribe from available-job broadcasts</a></p>
        <p>Secure Cleaning | securecleaning.com.au</p>
      </div>
    </div>`
}

function buildBroadcastText(input: {
  cleaner: EligibleCleaner
  products: BroadcastProduct[]
  introText: string
  jobsUrl: string
  unsubscribeUrl: string
  sender: BroadcastSender
}) {
  const products = input.products.map((product) => [
    `${product.productCode} · ${product.suburb}, ${product.state}`,
    product.heading,
    `${product.frequency.replaceAll('_', ' ')} · ${product.timePreference.replaceAll('_', ' ')}`,
    `Annual contract value: ${money(product.annualValueIncGstCents)} inc GST`,
    `Purchase price: ${money(product.purchasePriceIncGstCents)} inc GST`,
  ].join('\n')).join('\n\n')
  return [
    `Hi ${input.cleaner.firstName},`,
    renderBroadcastTemplate(input.introText, input),
    products,
    `View all available jobs: ${input.jobsUrl}`,
    `Kind regards,\n\n${input.sender.displayName}\n${input.sender.jobTitle}\nSecure Cleaning\n${input.sender.phone}\n${input.sender.email}`,
    `These opportunities were sent because your cleaner profile is approved for work in ${input.products[0].state}.`,
    `Unsubscribe from available-job broadcasts: ${input.unsubscribeUrl}`,
    'Secure Cleaning | securecleaning.com.au',
  ].join('\n\n')
}

function providerId(response: unknown) {
  return response && typeof response === 'object' && typeof (response as { id?: unknown }).id === 'string'
    ? (response as { id: string }).id : null
}

export async function sendContractProductBroadcast(actor: ContractProductActor, input: Record<string, unknown>) {
  const sender = await resolveBroadcastSender(actor, input.senderStaffId)
  const idempotencyKey = clean(input.idempotencyKey, 100)
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw new ContractProductError('A valid send request ID is required.')
  const state = assertBroadcastState(actor, input.state)
  const recipientMode = getRecipientMode(input.recipientMode)
  const targetCleanerId = recipientMode === 'single' ? clean(input.cleanerId, 80) : ''
  if (recipientMode === 'single' && !targetCleanerId) {
    throw new ContractProductError('Select a cleaner before sending.')
  }
  const targetCleanerEmails = recipientMode === 'multiple' ? parseRecipientEmails(input.cleanerEmails) : []
  const subject = clean(input.subject, 240)
  const intro = getBroadcastIntro(input, state)
  if (!subject || !intro.text) throw new ContractProductError('Subject and introductory message are required.')
  assertSupportedBroadcastTemplateFields(subject, intro.text, intro.html)
  const expectedPreviewFingerprint = broadcastDraftFingerprint(input, {
    state,
    recipientMode,
    senderId: sender.id,
    subject,
    intro,
  })
  if (clean(input.previewFingerprint, 100) !== expectedPreviewFingerprint) {
    throw new ContractProductError('This email has changed since it was previewed. Preview it again before sending.', 409)
  }
  const db = getAdminSupabase()
  let delivery: { sender: BroadcastSender; jobsUrl: string; fromAddress: string } | null = null
  let duplicate = false
  let campaignId = ''
  let products: BroadcastProduct[] = []
  let campaign: { status: string; sent_count: number; failed_count: number; skipped_count: number } | null = null
  const { data: existingCampaign, error: existingError } = await db.from('cleaner_broadcast_campaigns')
    .select('id, state, subject_snapshot, intro_snapshot, intro_html_snapshot, delivery_snapshot, recipient_mode, target_cleaner_id, sender_staff_id, status, sent_count, failed_count, skipped_count')
    .eq('idempotency_key', idempotencyKey).eq('created_by_staff_id', actor.id).maybeSingle()
  if (existingError) throw existingError
  if (existingCampaign) {
    duplicate = true
    campaignId = String(existingCampaign.id)
    if (existingCampaign.state !== state || existingCampaign.subject_snapshot !== subject || existingCampaign.intro_snapshot !== intro.text
      || (existingCampaign.intro_html_snapshot && existingCampaign.intro_html_snapshot !== intro.html)
      || existingCampaign.recipient_mode !== recipientMode
      || existingCampaign.sender_staff_id !== sender.id
      || String(existingCampaign.target_cleaner_id ?? '') !== targetCleanerId) {
      throw new ContractProductError('This send request ID belongs to a different broadcast.', 409)
    }
    if (recipientMode === 'multiple') {
      const existingRecipients = await readEmailPages((from, to) => db.from('cleaner_broadcast_recipients')
        .select('to_email').eq('campaign_id', campaignId).order('id').range(from, to))
      const existingEmails = (existingRecipients ?? []).map((row) => String(row.to_email).trim().toLowerCase()).sort()
      const requestedEmails = [...targetCleanerEmails].sort()
      if (existingEmails.length !== requestedEmails.length || existingEmails.some((email, index) => email !== requestedEmails[index])) {
        throw new ContractProductError('This send request ID belongs to a different cleaner selection.', 409)
      }
    }
    campaign = existingCampaign
    if (campaign.status !== 'sending') {
      return {
        campaignId, status: campaign.status, sentCount: Number(campaign.sent_count),
        failedCount: Number(campaign.failed_count), skippedCount: Number(campaign.skipped_count), duplicate: true,
      }
    }
    delivery = existingCampaign.delivery_snapshot
    if (!delivery?.sender || !delivery.jobsUrl || !delivery.fromAddress) throw new ContractProductError('This older or incomplete broadcast cannot be resumed. Check delivery history before starting another send.', 409)
    const { data: snapshotRows, error: snapshotError } = await db.from('cleaner_broadcast_campaign_products')
      .select('product_id, product_snapshot').eq('campaign_id', campaignId)
    if (snapshotError) throw snapshotError
    products = (snapshotRows ?? []).map((row) => row.product_snapshot as BroadcastProduct)
    const requestedIds = Array.isArray(input.productIds)
      ? new Set(input.productIds.filter((id): id is string => typeof id === 'string')) : new Set<string>()
    if (requestedIds.size > 0 && (requestedIds.size !== products.length || products.some((product) => !requestedIds.has(product.id)))) {
      throw new ContractProductError('This send request ID belongs to a different product selection.', 409)
    }
  } else {
    const [newProducts, recipients] = await Promise.all([
      getBroadcastProducts(actor, state, input.productIds),
      getEligibleCleaners(state),
    ])
    const selectedRecipients = selectBroadcastRecipients(recipients, recipientMode, targetCleanerId, targetCleanerEmails.join(','))
    if (selectedRecipients.length === 0) throw new ContractProductError('No eligible approved cleaners were found for this state.', 409)
    if (selectedRecipients.some((cleaner) => !cleaner.unsubscribeToken)) {
      throw new ContractProductError('One or more cleaner records are missing email preference details.', 409)
    }
    products = newProducts
    const { data: campaignIdValue, error: campaignError } = await db.rpc('create_cleaner_broadcast_campaign_v3', {
      p_idempotency_key: idempotencyKey,
      p_state: state,
      p_subject: subject,
      p_intro: intro.text,
      p_product_ids: products.map((product) => product.id),
      p_product_snapshots: products,
      p_recipient_mode: recipientMode,
      p_target_cleaner_id: targetCleanerId || null,
      p_recipient_cleaner_ids: selectedRecipients.map((cleaner) => cleaner.id),
      p_sender_staff_id: sender.id,
      p_actor_id: actor.id,
      p_actor_role: actor.role,
      p_actor_state: actor.productState,
    })
    if (campaignError || !campaignIdValue) throw campaignError ?? new Error('Campaign was not created.')
    campaignId = String(campaignIdValue)
    delivery = { sender: senderOption(sender as StaffAccount), jobsUrl: await getBroadcastJobsUrl(state), fromAddress: getVerifiedFromAddress(process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au') }
    const { error: campaignSnapshotError } = await db.from('cleaner_broadcast_campaigns').update({
      delivery_snapshot: delivery,
      intro_document_snapshot: intro.document,
      intro_html_snapshot: intro.html,
    }).eq('id', campaignId).eq('status', 'sending')
    if (campaignSnapshotError) {
      await db.from('cleaner_broadcast_campaigns').update({
        status: 'failed',
        failed_count: selectedRecipients.length,
        completed_at: new Date().toISOString(),
      }).eq('id', campaignId).eq('status', 'sending')
      throw campaignSnapshotError
    }
    const { data: createdCampaign, error: campaignLoadError } = await db.from('cleaner_broadcast_campaigns')
      .select('status, sent_count, failed_count, skipped_count').eq('id', campaignId).maybeSingle()
    if (campaignLoadError || !createdCampaign) throw campaignLoadError ?? new Error('Campaign could not be loaded.')
    campaign = createdCampaign
    if (campaign.status !== 'sending') {
      return {
        campaignId, status: campaign.status, sentCount: Number(campaign.sent_count),
        failedCount: Number(campaign.failed_count), skippedCount: Number(campaign.skipped_count), duplicate: true,
      }
    }
  }

  if (!delivery) throw new ContractProductError('Broadcast delivery details are missing.', 409)
  const { jobsUrl, fromAddress } = delivery
  const deliverySender = delivery.sender
  const runnerToken = crypto.randomUUID()
  const { data: leaseClaimed, error: leaseError } = await db.rpc('claim_cleaner_broadcast_campaign', {
    p_campaign_id: campaignId,
    p_runner_token: runnerToken,
    p_actor_id: actor.id,
    p_actor_role: actor.role,
    p_actor_state: actor.productState,
  })
  if (leaseError) throw leaseError
  if (leaseClaimed !== true) {
    const { data: current } = await db.from('cleaner_broadcast_campaigns')
      .select('status, sent_count, failed_count, skipped_count').eq('id', campaignId).maybeSingle()
    return {
      campaignId, status: String(current?.status ?? 'sending'), sentCount: Number(current?.sent_count ?? 0),
      failedCount: Number(current?.failed_count ?? 0), skippedCount: Number(current?.skipped_count ?? 0),
      duplicate: true, inProgress: current?.status === 'sending',
    }
  }

  const { data: recipientRows, error: recipientError } = await db.from('cleaner_broadcast_recipients')
    .select('id, cleaner_id, to_email, cleaner_name_snapshot, status').eq('campaign_id', campaignId).eq('status', 'queued').order('id').limit(EMAIL_DELIVERY_STEP_SIZE)
  if (recipientError) throw recipientError
  const cleanerIds = (recipientRows ?? []).map((row) => String(row.cleaner_id))
  const { data: cleanerRows, error: cleanerError } = cleanerIds.length > 0
    ? await db.from('cleaners').select('id, email, phone, address, contact_name, business_name, first_name, last_name, city, suburb, postcode, abn, services, broadcast_unsubscribe_token').in('id', cleanerIds)
    : { data: [], error: null }
  if (cleanerError) throw cleanerError
  const cleanersById = new Map((cleanerRows ?? []).map((row) => [String(row.id), {
    id: String(row.id), email: String(row.email ?? '').trim().toLowerCase(),
    name: String(row.contact_name ?? '').trim() || 'Cleaner', businessName: String(row.business_name ?? '').trim(),
    firstName: String(row.first_name ?? '').trim() || String(row.contact_name ?? '').trim().split(/\s+/)[0] || 'Cleaner',
    lastName: String(row.last_name ?? '').trim(), city: String(row.city ?? '').trim(), suburb: String(row.suburb ?? '').trim(),
    postcode: String(row.postcode ?? '').trim(), phone: String(row.phone ?? '').trim(), address: String(row.address ?? '').trim(),
    abn: String(row.abn ?? '').trim(), services: Array.isArray(row.services) ? row.services.map(String).join(', ') : '',
    unsubscribeToken: String(row.broadcast_unsubscribe_token ?? ''),
  } satisfies EligibleCleaner]))
  const { error: staleError } = await db.from('cleaner_broadcast_recipients')
    .update({ status: 'unknown', failure_code: 'expired_runner_outcome_unknown' })
    .eq('campaign_id', campaignId).eq('status', 'sending')
  if (staleError) throw staleError
  const deadline = Date.now() + EMAIL_DELIVERY_STEP_MS
  let paused = false
  for (const row of (recipientRows ?? []).filter((candidate) => candidate.status === 'queued')) {
    if (Date.now() >= deadline || !(await acquireEmailDeliverySlot())) break
    const recipientId = String(row.id)
    const leaseUntil = new Date(Date.now() + 2 * 60 * 1000).toISOString()
    const { data: renewed, error: renewError } = await db.from('cleaner_broadcast_campaigns')
      .update({ lease_expires_at: leaseUntil }).eq('id', campaignId).eq('runner_token', runnerToken)
      .eq('status', 'sending').select('id').maybeSingle()
    if (renewError) throw renewError
    if (!renewed) throw new ContractProductError('This broadcast is being continued by another request.', 409)
    const cleaner = cleanersById.get(String(row.cleaner_id))
    if (!cleaner?.unsubscribeToken) {
      await db.from('cleaner_broadcast_recipients').update({ status: 'skipped', failure_code: 'cleaner_record_unavailable' }).eq('id', recipientId).eq('status', 'queued')
      continue
    }
    const { data: claimed, error: claimError } = await db.rpc('claim_cleaner_broadcast_recipient', {
      p_campaign_id: campaignId,
      p_recipient_id: recipientId,
      p_runner_token: runnerToken,
      p_actor_id: actor.id,
      p_actor_role: actor.role,
      p_actor_state: actor.productState,
    })
    if (claimError) {
      await db.from('cleaner_broadcast_recipients').update({ status: 'skipped', failure_code: 'eligibility_check_failed' }).eq('id', recipientId).eq('status', 'queued')
      continue
    }
    if (claimed !== true) continue
    const unsubscribeUrl = `${getSiteUrl()}/cleaner-email-preferences/unsubscribe?token=${encodeURIComponent(cleaner.unsubscribeToken)}`
    try {
      const templateInput = { cleaner, products, jobsUrl, sender: deliverySender }
      const finalSubject = renderBroadcastSubject(subject, templateInput)
      const finalHtml = buildBroadcastHtml({ ...templateInput, introHtml: intro.html, unsubscribeUrl })
      const finalText = buildBroadcastText({ ...templateInput, introText: intro.text, unsubscribeUrl })
      const { data: snapshotted, error: snapshotError } = await db.from('cleaner_broadcast_recipients').update({
        subject_snapshot: finalSubject,
        final_html_snapshot: finalHtml,
        final_text_snapshot: finalText,
      }).eq('id', recipientId).eq('status', 'sending').select('id').maybeSingle()
      if (snapshotError || !snapshotted) {
        await db.from('cleaner_broadcast_recipients').update({
          status: 'rejected',
          failure_code: 'snapshot_write_failed',
        }).eq('id', recipientId).eq('status', 'sending')
        continue
      }
      const response = await sendEmailOrThrow({
        from: `${safeHeaderName(deliverySender.displayName)} - Secure Cleaning <${fromAddress}>`,
        to: cleaner.email,
        replyTo: deliverySender.email,
        subject: finalSubject,
        html: finalHtml,
        headers: {
          'List-Unsubscribe': `<${getSiteUrl()}/api/cleaner-email-preferences/unsubscribe?token=${encodeURIComponent(cleaner.unsubscribeToken)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      })
      const { data: finalized, error } = await db.from('cleaner_broadcast_recipients').update({
        status: 'sent', provider_message_id: providerId(response), sent_at: new Date().toISOString(),
      }).eq('id', recipientId).eq('status', 'sending').select('id').maybeSingle()
      if (error || !finalized) {
        await db.from('cleaner_broadcast_recipients').update({ status: 'unknown', failure_code: 'provider_accepted_finalize_failed' }).eq('id', recipientId)
      }
    } catch (error) {
      const pause = emailProviderPause(error)
      if (pause) {
        // These explicit provider responses establish non-acceptance; all ambiguous outcomes stay unknown.
        const { error: resetError } = await db.from('cleaner_broadcast_recipients')
          .update({ status: 'queued', failure_code: pause === 'quota' ? 'provider_quota' : 'provider_rate_limit' })
          .eq('id', recipientId).eq('status', 'sending')
        if (resetError) throw resetError
        paused = pause === 'quota'
        break
      }
      const rejected = error instanceof EmailProviderRejectedError && ['validation_error', 'missing_required_field', 'invalid_access', 'invalid_api_key'].includes(error.providerErrorName || '')
      await db.from('cleaner_broadcast_recipients').update({
        status: rejected ? 'rejected' : 'unknown',
        failure_code: rejected ? 'provider_rejected' : 'provider_outcome_unknown',
      }).eq('id', recipientId).eq('status', 'sending')
    }
  }
  const finalRows = await readEmailPages((from, to) => db.from('cleaner_broadcast_recipients')
    .select('status').eq('campaign_id', campaignId).order('id').range(from, to))
  const sentCount = (finalRows ?? []).filter((row) => row.status === 'sent').length
  const failedCount = (finalRows ?? []).filter((row) => row.status === 'unknown' || row.status === 'rejected').length
  const skippedCount = (finalRows ?? []).filter((row) => row.status === 'skipped' || row.status === 'suppressed').length
  const remainingCount = finalRows.filter(row => row.status === 'queued').length
  const status = remainingCount > 0 ? 'sending' : failedCount === 0 && skippedCount === 0 ? 'completed' : sentCount > 0 ? 'partially_failed' : 'failed'
  const { data: finalizedCampaign, error: finalizeError } = await db.from('cleaner_broadcast_campaigns').update({
    status,
    sent_count: sentCount,
    failed_count: failedCount,
    skipped_count: skippedCount,
    completed_at: remainingCount > 0 ? null : new Date().toISOString(),
    runner_token: null,
    lease_expires_at: null,
  }).eq('id', campaignId).eq('status', 'sending').eq('runner_token', runnerToken).select('id').maybeSingle()
  if (finalizeError) throw finalizeError
  if (!finalizedCampaign) throw new ContractProductError('This broadcast was completed by another request.', 409)
  return { campaignId, status, sentCount, failedCount, skippedCount, duplicate, inProgress: remainingCount > 0, remainingCount, paused }
}

export async function getContractProductBroadcastHistory(actor: ContractProductActor) {
  const db = getAdminSupabase()
  let query = db.from('cleaner_broadcast_campaigns')
    .select('id, state, subject_snapshot, recipient_mode, target_cleaner_id, status, recipient_count, sent_count, failed_count, skipped_count, sender_staff_id, sender_name_snapshot, sender_email_snapshot, created_at, completed_at')
    .order('created_at', { ascending: false }).limit(50)
  if (actor.role === 'agent') query = query.eq('sender_staff_id', actor.id)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: String(row.id), state: String(row.state), subject: String(row.subject_snapshot), status: String(row.status),
    recipientMode: row.recipient_mode === 'single' || row.recipient_mode === 'multiple' ? row.recipient_mode : 'state',
    senderName: String(row.sender_name_snapshot ?? ''), senderEmail: String(row.sender_email_snapshot ?? ''),
    recipientCount: Number(row.recipient_count), sentCount: Number(row.sent_count), failedCount: Number(row.failed_count),
    skippedCount: Number(row.skipped_count), createdAt: String(row.created_at), completedAt: row.completed_at ? String(row.completed_at) : null,
  }))
}

export async function getContractProductBroadcastHistoryPreview(
  actor: ContractProductActor,
  input: Record<string, unknown>,
) {
  const campaignId = clean(input.campaignId, 80)
  if (!campaignId) throw new ContractProductError('Select an email from history.')
  const db = getAdminSupabase()
  let campaignQuery = db.from('cleaner_broadcast_campaigns')
    .select('id, subject_snapshot, sender_name_snapshot, sender_email_snapshot')
    .eq('id', campaignId)
  if (actor.role === 'agent') campaignQuery = campaignQuery.eq('sender_staff_id', actor.id)
  const { data: campaign, error: campaignError } = await campaignQuery.maybeSingle()
  if (campaignError) throw campaignError
  if (!campaign) throw new ContractProductError('The selected email history is unavailable.', 404)

  const { data: recipient, error: recipientError } = await db.from('cleaner_broadcast_recipients')
    .select('to_email, subject_snapshot, final_html_snapshot, status, sent_at')
    .eq('campaign_id', campaignId)
    .not('final_html_snapshot', 'is', null)
    .order('sent_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (recipientError) throw recipientError
  if (!recipient?.final_html_snapshot) {
    throw new ContractProductError('A viewable copy was not stored for this older broadcast.', 404)
  }
  return {
    subject: String(recipient.subject_snapshot ?? campaign.subject_snapshot ?? ''),
    from: `${String(campaign.sender_name_snapshot ?? 'Secure Cleaning')} - Secure Cleaning <${getVerifiedFromAddress(process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au')}>`,
    to: String(recipient.to_email ?? ''),
    html: String(recipient.final_html_snapshot),
    status: String(recipient.status ?? ''),
  }
}

export async function continueContractProductBroadcast(actor: ContractProductActor, input: Record<string, unknown>) {
  const idempotencyKey = clean(input.idempotencyKey, 100)
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw new ContractProductError('Invalid broadcast request.')
  const db = getAdminSupabase()
  const { data: campaign, error } = await db.from('cleaner_broadcast_campaigns')
    .select('state,subject_snapshot,intro_snapshot,intro_html_snapshot,intro_document_snapshot,recipient_mode,target_cleaner_id,sender_staff_id,id')
    .eq('idempotency_key', idempotencyKey).eq('created_by_staff_id', actor.id).maybeSingle()
  if (error || !campaign) throw new ContractProductError('Broadcast request not found. Check history before starting another send.', 404)
  const recipientEmails = campaign.recipient_mode === 'multiple' ? await readEmailPages((from, to) => db.from('cleaner_broadcast_recipients')
    .select('to_email').eq('campaign_id', campaign.id).order('id').range(from, to)) : []
  const draft = { idempotencyKey, state: campaign.state, subject: campaign.subject_snapshot, intro: campaign.intro_snapshot,
    introHtml: campaign.intro_html_snapshot, introDocument: campaign.intro_document_snapshot,
    recipientMode: campaign.recipient_mode, cleanerId: campaign.target_cleaner_id,
    cleanerEmails: recipientEmails.map(row => row.to_email).join(','), senderStaffId: campaign.sender_staff_id }
  const state = assertBroadcastState(actor, draft.state)
  const intro = getBroadcastIntro(draft, state)
  const previewFingerprint = broadcastDraftFingerprint(draft, { state, recipientMode: getRecipientMode(draft.recipientMode), senderId: draft.senderStaffId, subject: draft.subject, intro })
  return sendContractProductBroadcast(actor, { ...draft, previewFingerprint })
}
