import 'server-only'

import { EmailProviderRejectedError, sendEmailOrThrow } from '@/lib/email'
import { createCleanerJobsAccessToken } from '@/lib/cleanerJobsAccess'
import type { ContractProductActor } from '@/lib/contractProductAuth'
import { normalizeContractProductState, type ContractProductState } from '@/lib/contractProductPolicy'
import { ContractProductError, getActiveJobsAccessLinkId, getContractProducts } from '@/lib/contractProducts'
import { hasCompleteCrmSignature } from '@/lib/clientCrmPolicy'
import { getSiteUrl } from '@/lib/siteUrl'
import { getAdminSupabase } from '@/lib/supabase'

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
  unsubscribeToken: string
}

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;')
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
  const { data, error } = await db.from('cleaners')
    .select('id, email, contact_name, business_name, broadcast_unsubscribe_token')
    .eq('status', 'approved').eq('state', state).order('created_at', { ascending: true }).limit(500)
  if (error) throw error
  const candidates = data ?? []
  const emails = candidates.map((row) => String(row.email ?? '').trim().toLowerCase()).filter(Boolean)
  const [globalSuppressions, cleanerSuppressions] = emails.length ? await Promise.all([
    db.from('crm_email_suppressions').select('email_normalized').in('email_normalized', emails).eq('blocks_all', true),
    db.from('cleaner_broadcast_suppressions').select('cleaner_id'),
  ]) : [{ data: [], error: null }, { data: [], error: null }]
  if (globalSuppressions.error) throw globalSuppressions.error
  if (cleanerSuppressions.error) throw cleanerSuppressions.error
  const suppressedEmails = new Set((globalSuppressions.data ?? []).map((row) => String(row.email_normalized)))
  const suppressedCleanerIds = new Set((cleanerSuppressions.data ?? []).map((row) => String(row.cleaner_id)))
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
      unsubscribeToken: String(row.broadcast_unsubscribe_token ?? ''),
    })
  }
  return { eligible, excluded, considered: candidates.length }
}

export async function previewContractProductBroadcast(actor: ContractProductActor, input: Record<string, unknown>) {
  const state = assertBroadcastState(actor, input.state)
  const [products, recipients] = await Promise.all([
    getBroadcastProducts(actor, state, input.productIds),
    getEligibleCleaners(state),
  ])
  return {
    state,
    products,
    recipientCount: recipients.eligible.length,
    consideredCount: recipients.considered,
    excluded: recipients.excluded,
    defaultSubject: `Available cleaning contracts in ${state}`,
    defaultIntro: `The following Secure Cleaning contract opportunities are currently available in ${state}.`,
  }
}

function buildBroadcastHtml(input: {
  cleaner: EligibleCleaner
  products: BroadcastProduct[]
  intro: string
  jobsUrl: string
  unsubscribeUrl: string
  actor: ContractProductActor
}) {
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
        <p>Hi ${escapeHtml(input.cleaner.name)},</p>
        <p>${escapeHtml(input.intro)}</p>
        ${cards}
        <p style="margin:26px 0;"><a href="${escapeHtml(input.jobsUrl)}" style="display:inline-block;background:#16a34a;color:white;padding:13px 20px;border-radius:7px;text-decoration:none;font-weight:700;">View all available jobs</a></p>
        <p>Kind regards,<br><br>${escapeHtml(input.actor.displayName)}<br>${escapeHtml(input.actor.jobTitle)}<br>Secure Cleaning<br>${escapeHtml(input.actor.phone)}<br>${escapeHtml(input.actor.email)}</p>
      </div>
      <div style="border-top:1px solid #e5e7eb;padding:18px 24px;color:#64748b;font-size:12px;">
        <p>These opportunities were sent because your cleaner profile is approved for work in ${escapeHtml(input.products[0].state)}.</p>
        <p><a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#0f766e;">Unsubscribe from available-job broadcasts</a></p>
        <p>Secure Cleaning | securecleaning.com.au</p>
      </div>
    </div>`
}

function providerId(response: unknown) {
  return response && typeof response === 'object' && typeof (response as { id?: unknown }).id === 'string'
    ? (response as { id: string }).id : null
}

export async function sendContractProductBroadcast(actor: ContractProductActor, input: Record<string, unknown>) {
  if (!hasCompleteCrmSignature(actor)) throw new ContractProductError('Complete the sender details in Team Access before sending.', 409)
  const idempotencyKey = clean(input.idempotencyKey, 100)
  if (!/^[0-9a-f-]{36}$/i.test(idempotencyKey)) throw new ContractProductError('A valid send request ID is required.')
  const state = assertBroadcastState(actor, input.state)
  const subject = clean(input.subject, 240)
  const intro = clean(input.intro, 2000)
  if (!subject || !intro) throw new ContractProductError('Subject and introductory message are required.')
  const db = getAdminSupabase()
  let duplicate = false
  let campaignId = ''
  let products: BroadcastProduct[] = []
  let campaign: { status: string; sent_count: number; failed_count: number; skipped_count: number } | null = null
  const { data: existingCampaign, error: existingError } = await db.from('cleaner_broadcast_campaigns')
    .select('id, state, subject_snapshot, intro_snapshot, status, sent_count, failed_count, skipped_count')
    .eq('idempotency_key', idempotencyKey).eq('sender_staff_id', actor.id).maybeSingle()
  if (existingError) throw existingError
  if (existingCampaign) {
    duplicate = true
    campaignId = String(existingCampaign.id)
    if (existingCampaign.state !== state || existingCampaign.subject_snapshot !== subject || existingCampaign.intro_snapshot !== intro) {
      throw new ContractProductError('This send request ID belongs to a different broadcast.', 409)
    }
    campaign = existingCampaign
    if (campaign.status !== 'sending') {
      return {
        campaignId, status: campaign.status, sentCount: Number(campaign.sent_count),
        failedCount: Number(campaign.failed_count), skippedCount: Number(campaign.skipped_count), duplicate: true,
      }
    }
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
    if (recipients.eligible.length === 0) throw new ContractProductError('No eligible approved cleaners were found for this state.', 409)
    if (recipients.eligible.some((cleaner) => !cleaner.unsubscribeToken)) {
      throw new ContractProductError('One or more cleaner records are missing email preference details.', 409)
    }
    if (recipients.eligible.length > 50) throw new ContractProductError('This broadcast exceeds the current 50-recipient safety limit.', 409)
    products = newProducts
    const { data: campaignIdValue, error: campaignError } = await db.rpc('create_cleaner_broadcast_campaign', {
      p_idempotency_key: idempotencyKey,
      p_state: state,
      p_subject: subject,
      p_intro: intro,
      p_product_ids: products.map((product) => product.id),
      p_product_snapshots: products,
      p_actor_id: actor.id,
      p_actor_role: actor.role,
      p_actor_state: actor.productState,
      p_actor_name: actor.displayName,
      p_actor_email: actor.email,
    })
    if (campaignError || !campaignIdValue) throw campaignError ?? new Error('Campaign was not created.')
    campaignId = String(campaignIdValue)
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

  const accessLinkId = await getActiveJobsAccessLinkId()
  if (!accessLinkId) throw new ContractProductError('The reusable cleaner jobs link is not active.', 409)
  const accessToken = createCleanerJobsAccessToken(accessLinkId)
  if (!accessToken) throw new ContractProductError('The cleaner jobs access link could not be signed.', 500)
  const jobsUrl = `${getSiteUrl()}/jobs/access/${encodeURIComponent(accessToken)}?state=${state}`
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
    .select('id, cleaner_id, to_email, cleaner_name_snapshot, status').eq('campaign_id', campaignId).order('created_at')
  if (recipientError) throw recipientError
  const cleanerIds = (recipientRows ?? []).map((row) => String(row.cleaner_id))
  const { data: cleanerRows, error: cleanerError } = cleanerIds.length > 0
    ? await db.from('cleaners').select('id, email, contact_name, business_name, broadcast_unsubscribe_token').in('id', cleanerIds)
    : { data: [], error: null }
  if (cleanerError) throw cleanerError
  const cleanersById = new Map((cleanerRows ?? []).map((row) => [String(row.id), {
    id: String(row.id), email: String(row.email ?? '').trim().toLowerCase(),
    name: String(row.contact_name ?? '').trim() || 'Cleaner', businessName: String(row.business_name ?? '').trim(),
    unsubscribeToken: String(row.broadcast_unsubscribe_token ?? ''),
  } satisfies EligibleCleaner]))
  const staleSendingIds = (recipientRows ?? []).filter((row) => row.status === 'sending').map((row) => String(row.id))
  if (staleSendingIds.length > 0) {
    const { error } = await db.from('cleaner_broadcast_recipients')
      .update({ status: 'unknown', failure_code: 'expired_runner_outcome_unknown' })
      .in('id', staleSendingIds).eq('status', 'sending')
    if (error) throw error
  }
  for (const row of (recipientRows ?? []).filter((candidate) => candidate.status === 'queued')) {
    const recipientId = String(row.id)
    const leaseUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
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
      const response = await sendEmailOrThrow({
        from: process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au',
        to: cleaner.email,
        replyTo: actor.email,
        subject,
        html: buildBroadcastHtml({ cleaner, products, intro, jobsUrl, unsubscribeUrl, actor }),
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
      const rejected = error instanceof EmailProviderRejectedError
      await db.from('cleaner_broadcast_recipients').update({
        status: rejected ? 'rejected' : 'unknown',
        failure_code: rejected ? 'provider_rejected' : 'provider_outcome_unknown',
      }).eq('id', recipientId).eq('status', 'sending')
    }
  }
  const { data: finalRows, error: finalRowsError } = await db.from('cleaner_broadcast_recipients')
    .select('status').eq('campaign_id', campaignId)
  if (finalRowsError) throw finalRowsError
  const sentCount = (finalRows ?? []).filter((row) => row.status === 'sent').length
  const failedCount = (finalRows ?? []).filter((row) => row.status === 'unknown' || row.status === 'rejected').length
  const skippedCount = (finalRows ?? []).filter((row) => row.status === 'skipped' || row.status === 'suppressed').length
  const status = failedCount === 0 && skippedCount === 0 ? 'completed' : sentCount > 0 ? 'partially_failed' : 'failed'
  const { data: finalizedCampaign, error: finalizeError } = await db.from('cleaner_broadcast_campaigns').update({
    status,
    sent_count: sentCount,
    failed_count: failedCount,
    skipped_count: skippedCount,
    completed_at: new Date().toISOString(),
    runner_token: null,
    lease_expires_at: null,
  }).eq('id', campaignId).eq('status', 'sending').eq('runner_token', runnerToken).select('id').maybeSingle()
  if (finalizeError) throw finalizeError
  if (!finalizedCampaign) throw new ContractProductError('This broadcast was completed by another request.', 409)
  return { campaignId, status, sentCount, failedCount, skippedCount, duplicate }
}

export async function getContractProductBroadcastHistory(actor: ContractProductActor) {
  const db = getAdminSupabase()
  let query = db.from('cleaner_broadcast_campaigns')
    .select('id, state, subject_snapshot, status, recipient_count, sent_count, failed_count, skipped_count, sender_staff_id, created_at, completed_at')
    .order('created_at', { ascending: false }).limit(50)
  if (actor.role === 'agent') query = query.eq('sender_staff_id', actor.id)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: String(row.id), state: String(row.state), subject: String(row.subject_snapshot), status: String(row.status),
    recipientCount: Number(row.recipient_count), sentCount: Number(row.sent_count), failedCount: Number(row.failed_count),
    skippedCount: Number(row.skipped_count), createdAt: String(row.created_at), completedAt: row.completed_at ? String(row.completed_at) : null,
  }))
}
