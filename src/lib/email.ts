import type { QuoteInputs, QuoteResult, BookingInputs } from './types'
import { formatPriceRange } from './quoteEngine'
import { buildBookingInviteIcs } from './calendarInvite'
import { getSiteUrl } from './siteUrl'
import { isBathroomRoomScopeType, sanitizePublicRoomScope, summarizePublicRoomScope } from './publicRoomScope'
import type { FirmQuoteDisplayPrice } from './quoteWorkflow'
import { getAvailabilityAssignee, getAvailabilityAssigneesForLocation, getAvailabilityConfig } from './availability'

/**
 * Email helper module using Resend.
 * Resend is imported lazily to avoid build errors if RESEND_API_KEY is not set.
 */

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — emails will not be sent.')
    return null
  }

  try {
    const { Resend } = require('resend')
    return new Resend(process.env.RESEND_API_KEY)
  } catch (error) {
    console.error('[email] Failed to load resend package:', error)
    return null
  }
}

const FROM_EMAIL = process.env.FROM_EMAIL ?? 'quotes@securecleaning.com.au'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'info@securecleaning.com.au'
const SITE_URL = getSiteUrl()

async function getSelectedInspectionAssigneeEmail(inputs: BookingInputs): Promise<string | null> {
  if (!inputs.preferredInspectionAssigneeId) return null

  try {
    const config = await getAvailabilityConfig()
    const assignee = getAvailabilityAssignee(config, inputs.preferredInspectionAssigneeId)
    const email = assignee?.email?.trim().toLowerCase() ?? ''
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
  } catch (error) {
    console.error('[email] Failed to resolve inspection assignee email:', error)
    return null
  }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function getQuoteAssigneeEmails(inputs: QuoteInputs): Promise<string[]> {
  try {
    const assignees = await getAvailabilityAssigneesForLocation(
      { address: inputs.address, suburb: inputs.suburb, postcode: inputs.postcode },
      inputs.city,
    )

    return Array.from(
      new Set(
        assignees
          .map((assignee) => assignee.email?.trim().toLowerCase() ?? '')
          .filter((email) => isValidEmail(email))
          // The admin notification already goes to this address.
          .filter((email) => email !== ADMIN_EMAIL.trim().toLowerCase()),
      ),
    )
  } catch (error) {
    console.error('[email] Failed to resolve quote assignee emails:', error)
    return []
  }
}

// ─── Quote Email ──────────────────────────────────────────────────────────────

export async function sendEmailOrThrow(payload: Record<string, unknown>) {
  const resend = getResend()
  if (!resend) {
    throw new Error('Email service is not configured. Check RESEND_API_KEY.')
  }

  const response = await resend.emails.send(payload)
  if (response?.error) {
    throw new EmailProviderRejectedError(response.error.message || 'Email send failed')
  }
  return response?.data ?? response
}

export class EmailProviderRejectedError extends Error {
  readonly outcome = 'provider_rejected'
}

export async function sendEmailWithResult(payload: Record<string, unknown>) {
  const resend = getResend()
  if (!resend) {
    throw new Error('Email service is not configured. Check RESEND_API_KEY.')
  }

  const response = await resend.emails.send(payload)
  if (response?.error) {
    throw new Error(response.error.message || 'Email send failed')
  }

  return response?.data ?? response
}

export async function sendQuoteEmail(
  quoteRef: string,
  inputs: QuoteInputs,
  result: QuoteResult,
  displayPrice?: FirmQuoteDisplayPrice
): Promise<void> {
  const cityLabel = inputs.city === 'melbourne' ? 'Melbourne' : 'Sydney'
  const businessLabel = inputs.businessName?.trim() || 'your premises'
  const priceRangeFmt = formatPriceRange(displayPrice?.low ?? result.totalLow, displayPrice?.high ?? result.totalHigh)
  const timeLabel =
    inputs.timePreference === 'after_hours'
      ? 'After hours (sometimes cheaper!)'
      : inputs.timePreference === 'weekend'
        ? 'Weekend (sometimes cheaper!)'
        : 'Business hours'
  const roomScopeSummary = summarizePublicRoomScope(
    sanitizePublicRoomScope(inputs.roomScope).filter((room) => !isBathroomRoomScopeType(room.type) && room.type !== 'kitchen')
  )
  const bathroomScopeSummary = summarizePublicRoomScope(
    sanitizePublicRoomScope(inputs.roomScope).filter((room) => isBathroomRoomScopeType(room.type))
  )
  const scopeUrl = `${SITE_URL}/scope/${quoteRef}`
  const quoteAssigneeEmails = await getQuoteAssigneeEmails(inputs)

  // Email to client
  await sendEmailOrThrow({
    from: FROM_EMAIL,
    to: inputs.email,
    replyTo: ADMIN_EMAIL,
    subject: `Your Secure Cleaning Aus Quote — ${quoteRef}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a2744; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Secure Cleaning Aus</h1>
          <p style="color: #22c55e; margin: 4px 0 0;">Professional Commercial Cleaning</p>
        </div>
        <div style="padding: 32px 24px;">
          <p>Hi ${inputs.contactName},</p>
          <p>Thank you for requesting a remote quote from Secure Cleaning Aus. Here's your estimate for <strong>${businessLabel}</strong> in ${cityLabel}.</p>
          
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin: 24px 0;">
            <h2 style="color: #1a2744; margin: 0 0 16px;">Quote Reference: ${quoteRef}</h2>
            <p style="font-size: 28px; color: #1a2744; font-weight: bold; margin: 0;">
              ${priceRangeFmt}
              <span style="font-size: 16px; color: #64748b; font-weight: normal;"> per visit</span>
            </p>
            ${result.carpetSteamSeparate ? '<p style="color: #64748b; font-size: 14px;">* Carpet steam cleaning quoted separately</p>' : ''}
          </div>

          <h3 style="color: #1a2744;">Service Details</h3>
          <ul style="color: #334155; line-height: 1.8;">
            <li>Premises: ${inputs.premisesType} (${inputs.floorArea} sqm, ${inputs.floors} floor${inputs.floors > 1 ? 's' : ''})</li>
            <li>Frequency: ${inputs.frequency.replace(/_/g, ' ')}</li>
            <li>Time preference: ${timeLabel}</li>
            <li>City: ${cityLabel}</li>
            <li>Locality: ${inputs.suburb} ${inputs.postcode}</li>
            ${bathroomScopeSummary.length > 0 ? bathroomScopeSummary.map((item) => `<li>${item}</li>`).join('') : inputs.addOns.bathrooms > 0 ? `<li>Bathrooms / amenities: ${inputs.addOns.bathrooms}</li>` : ''}
            ${inputs.addOns.kitchens > 0 ? `<li>Kitchens / kitchenettes: ${inputs.addOns.kitchens}</li>` : ''}
            ${roomScopeSummary.map((item) => `<li>${item}</li>`).join('')}
            ${inputs.addOns.glassCleaningRequired ? '<li>Glass cleaning requested — estimated separately during site inspection</li>' : ''}
          </ul>

          <p style="margin-top: 32px;">
            Next step: request a site inspection so we can confirm your areas, requirements, and final pricing.
          </p>
          <a href="${SITE_URL}/booking?quoteRef=${quoteRef}" 
             style="display: inline-block; background: #22c55e; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-right: 12px;">
            Book Site Inspection
          </a>
          <a href="${SITE_URL}/quote/${quoteRef}" 
             style="display: inline-block; background: #1a2744; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            View Quote Online
          </a>
          <a href="${scopeUrl}"
             style="display: inline-block; background: #0b5f74; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 12px;">
            View Scope of Works
          </a>

          <p style="color: #64748b; font-size: 13px; margin-top: 32px;">
            This remote quote is valid for 30 days. Prices exclude GST. Final pricing is confirmed after a site inspection.
          </p>
          ${inputs.addOns.glassCleaningRequired ? '<p style="color: #64748b; font-size: 13px; margin-top: 12px;">Glass cleaning is not included in this remote estimate. We can estimate the cost during your inspection.</p>' : ''}
        </div>
        <div style="background: #f1f5f9; padding: 16px; text-align: center; color: #64748b; font-size: 12px;">
          Secure Cleaning Aus | Melbourne & Sydney
        </div>
      </div>
    `,
  })

  if (quoteAssigneeEmails.length > 0) {
    await sendEmailOrThrow({
      from: FROM_EMAIL,
      to: quoteAssigneeEmails,
      replyTo: ADMIN_EMAIL,
      subject: `[Quote Copy] ${quoteRef} — ${businessLabel} (${cityLabel})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 680px; margin: 0 auto; color: #334155;">
          <div style="background: #1a2744; padding: 24px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Secure Cleaning Aus</h1>
            <p style="color: #22c55e; margin: 4px 0 0;">Internal Quote Copy</p>
          </div>
          <div style="padding: 28px 24px;">
            <h2 style="color: #1a2744; margin: 0 0 16px;">${quoteRef} — ${businessLabel}</h2>
            <p><strong>Client:</strong> ${inputs.contactName}<br>
            <strong>Email:</strong> ${inputs.email}<br>
            <strong>Phone:</strong> ${inputs.phone}<br>
            <strong>Location:</strong> ${inputs.suburb} ${inputs.postcode}, ${cityLabel}<br>
            <strong>Premises:</strong> ${inputs.premisesType} (${inputs.floorArea} sqm)<br>
            <strong>Frequency:</strong> ${inputs.frequency.replace(/_/g, ' ')}<br>
            <strong>Time preference:</strong> ${timeLabel}</p>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 22px 0;">
              <p style="font-size: 24px; color: #1a2744; font-weight: bold; margin: 0;">${priceRangeFmt} <span style="font-size: 14px; font-weight: normal; color: #64748b;">per visit</span></p>
            </div>

            <h3 style="color: #1a2744;">Requested areas</h3>
            <ul style="line-height: 1.8;">
              ${bathroomScopeSummary.map((item) => `<li>${item}</li>`).join('')}
              ${inputs.addOns.kitchens > 0 ? `<li>Kitchens / kitchenettes: ${inputs.addOns.kitchens}</li>` : ''}
              ${roomScopeSummary.map((item) => `<li>${item}</li>`).join('')}
              ${inputs.addOns.glassCleaningRequired ? '<li>Glass cleaning requested — quote separately</li>' : ''}
            </ul>
            ${inputs.notes ? `<p><strong>Notes:</strong><br>${inputs.notes}</p>` : ''}

            <p style="margin-top: 24px;">
              <a href="${SITE_URL}/quote/${quoteRef}" style="display: inline-block; background: #1a2744; color: white; padding: 12px 18px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-right: 8px;">Open Quote</a>
              <a href="${scopeUrl}" style="display: inline-block; background: #0b5f74; color: white; padding: 12px 18px; border-radius: 6px; text-decoration: none; font-weight: bold;">Open Scope</a>
            </p>
          </div>
        </div>
      `,
    })
  }

}

export async function sendScopeOfWorksEmail(quoteRef: string, inputs: QuoteInputs): Promise<void> {
  const scopeUrl = `${SITE_URL}/scope/${quoteRef}`
  const businessLabel = inputs.businessName?.trim() || 'your premises'

  await sendEmailOrThrow({
    from: FROM_EMAIL,
    to: inputs.email,
    replyTo: ADMIN_EMAIL,
    subject: `Your Secure Cleaning Scope of Works - ${quoteRef}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1f2937;">
        <div style="background: #0b5f74; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Secure Cleaning Aus</h1>
          <p style="color: #bbf7d0; margin: 4px 0 0;">Client Scope of Works</p>
        </div>
        <div style="padding: 32px 24px;">
          <p>Hi ${inputs.contactName},</p>
          <p>Your client scope of works for <strong>${businessLabel}</strong> is ready to view online.</p>
          <p>The report lists the planned areas, regular tasks, and options selected for your remote quotation. Any agreed changes can be reflected in the same online report.</p>
          <p style="margin: 28px 0; text-align: center;">
            <a href="${scopeUrl}" style="display: inline-block; background: #22c55e; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Scope of Works</a>
          </p>
          <p style="color: #64748b; font-size: 13px;">Reference: ${quoteRef}<br>This link is provided by Secure Cleaning Aus and should be used as the current version of the report.</p>
        </div>
        <div style="background: #f1f5f9; padding: 16px; text-align: center; color: #64748b; font-size: 12px;">
          <a href="${SITE_URL}" style="color: #0b5f74;">securecleaning.com.au</a>
        </div>
      </div>
    `,
  })
}

export async function sendUpdatedQuoteEmail(
  quoteRef: string,
  inputs: QuoteInputs,
  displayPrice: FirmQuoteDisplayPrice,
  options?: {
    to?: string
    subject?: string
    message?: string
  },
) {
  const businessLabel = inputs.businessName?.trim() || 'your premises'
  const cityLabel = inputs.city === 'melbourne' ? 'Melbourne' : 'Sydney'
  const quoteUrl = `${SITE_URL}/quote/${quoteRef}`
  const finalQuoteUrl = `${quoteUrl}?variant=final`
  const scopeUrl = `${SITE_URL}/scope/${quoteRef}?variant=final`
  const priceLabel = formatPriceRange(displayPrice.low, displayPrice.high)
  const roomSummary = summarizePublicRoomScope(sanitizePublicRoomScope(inputs.roomScope))
  const recipient = options?.to?.trim() || inputs.email.trim()
  const subject = options?.subject?.trim() || `Your updated Secure Cleaning quote — ${quoteRef}`
  const message = options?.message?.trim() || 'Following our review of your requirements, your updated quote is ready to view online.'
  const messageHtml = message
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')

  return sendEmailOrThrow({
    from: FROM_EMAIL,
    to: recipient,
    replyTo: ADMIN_EMAIL,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #334155;">
        <div style="background: #1a2744; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Secure Cleaning Aus</h1>
          <p style="color: #22c55e; margin: 4px 0 0;">Updated Quote Confirmation</p>
        </div>
        <div style="padding: 32px 24px;">
          <p>Hi ${escapeHtml(inputs.contactName)},</p>
          ${messageHtml}
          <p>Your updated quote for <strong>${escapeHtml(businessLabel)}</strong> is ready to view online.</p>

          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 22px; margin: 24px 0;">
            <div style="color: #166534; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: .08em;">Updated price per visit</div>
            <div style="color: #14532d; font-size: 28px; font-weight: bold; margin-top: 6px;">${priceLabel}</div>
            <div style="color: #166534; font-size: 13px; margin-top: 6px;">Prices exclude GST · Quote reference: ${quoteRef}</div>
          </div>

          <h3 style="color: #1a2744;">Service details</h3>
          <ul style="line-height: 1.8;">
            <li>Premises: ${escapeHtml(inputs.premisesType)}</li>
            <li>Location: ${escapeHtml(inputs.suburb)} ${escapeHtml(inputs.postcode)}, ${cityLabel}</li>
            <li>Frequency: ${escapeHtml(inputs.frequency.replace(/_/g, ' '))}</li>
            ${roomSummary.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>

          <p style="margin-top: 28px;">Please use the links below to review the updated quote and the scope of works.</p>
          <p style="margin: 28px 0;">
            <a href="${finalQuoteUrl}" style="display: inline-block; background: #22c55e; color: white; padding: 14px 22px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-right: 8px;">View Updated Quote</a>
            <a href="${scopeUrl}" style="display: inline-block; background: #0b5f74; color: white; padding: 14px 22px; border-radius: 6px; text-decoration: none; font-weight: bold; margin-top: 8px;">View Scope of Works</a>
          </p>

          <p style="color: #64748b; font-size: 13px; margin-top: 28px;">This quote is provided for ${escapeHtml(businessLabel)}. If you have any questions or would like to discuss the next step, please reply to this email.</p>
        </div>
        <div style="background: #f1f5f9; padding: 16px; text-align: center; color: #64748b; font-size: 12px;">Secure Cleaning Aus | Melbourne & Sydney</div>
      </div>
    `,
  })
}

// ─── Booking Email ────────────────────────────────────────────────────────────

export async function sendBookingConfirmationEmail(
  bookingRef: string,
  inputs: BookingInputs
): Promise<void> {
  const cityLabel = inputs.city === 'melbourne' ? 'Melbourne' : 'Sydney'
  const businessLabel = inputs.businessName?.trim() || 'Your premises'
  const adminBusinessLabel = inputs.businessName?.trim() || `${inputs.contactName?.trim() || 'Customer'} enquiry`
  const bookingInvite = buildBookingInviteIcs(bookingRef, inputs)

  const selectedInspectionWindow = inputs.preferredInspectionSlotLabel
    ? `${inputs.preferredInspectionSlotLabel}`
    : null
  const selectedAssigneeEmail = await getSelectedInspectionAssigneeEmail(inputs)
  const internalRecipients = Array.from(
    new Set([ADMIN_EMAIL, selectedAssigneeEmail].filter((email): email is string => Boolean(email)))
  )

  await sendEmailOrThrow({
    from: FROM_EMAIL,
    to: inputs.email,
    replyTo: ADMIN_EMAIL,
    subject: `Site Inspection Request Received — ${bookingRef}`,
    attachments: [
      {
        filename: `${bookingRef}.ics`,
        content: bookingInvite,
        contentType: 'text/calendar',
      },
    ],
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a2744; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Secure Cleaning Aus</h1>
          <p style="color: #22c55e; margin: 4px 0 0;">Site Inspection Request Received ✓</p>
        </div>
        <div style="padding: 32px 24px;">
          <p>Hi ${inputs.contactName},</p>
          <p>Your site inspection request has been received. We'll be in touch shortly to confirm the inspection details, scope, and next steps.</p>
          
          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 24px; margin: 24px 0;">
            <h2 style="color: #1a2744; margin: 0 0 8px;">Inspection Request Reference: ${bookingRef}</h2>
            <p style="color: #334155; margin: 0;">
              ${businessLabel}<br>
              ${inputs.address}, ${inputs.suburb} ${inputs.postcode}, ${cityLabel}<br>
              Cleaning frequency: ${inputs.frequency.replace(/_/g, ' ')}<br>
              Preferred inspection date: ${inputs.preferredStartDate}<br>
              Cleaning time preference: ${inputs.timePreference.replace(/_/g, ' ')}${selectedInspectionWindow ? `<br>Provisional inspection time: ${selectedInspectionWindow}` : ''}
            </p>
          </div>

          <p style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; border-radius: 8px; padding: 14px 16px; margin: 24px 0;">
            We have selected the earliest available inspection time within the published inspection window. Travel time between inspection appointments is reserved. We will confirm the exact inspection time as soon as possible. The attached calendar invite is provisional until we confirm it.
          </p>

          <h3 style="color: #1a2744;">What happens next?</h3>
          <ol style="color: #334155; line-height: 2;">
            <li>Our team reviews your inspection request</li>
            <li>A site inspection is arranged</li>
            <li>We confirm the final scope, requirements, and pricing after inspection</li>
            <li>If you would like to proceed, we schedule commencement around your preferred date</li>
          </ol>

          <p>Questions? Reply to this email or call us.</p>
        </div>
        <div style="background: #f1f5f9; padding: 16px; text-align: center; color: #64748b; font-size: 12px;">
          Secure Cleaning Aus | Melbourne & Sydney
        </div>
      </div>
    `,
  })

  // Admin notification
  await sendEmailOrThrow({
    from: FROM_EMAIL,
    to: internalRecipients,
    subject: `[New Site Inspection Request] ${bookingRef} — ${adminBusinessLabel} (${cityLabel})`,
    html: `
      <p><strong>New site inspection request submitted:</strong> ${bookingRef}</p>
      <p>Business: ${adminBusinessLabel}<br>
      Contact: ${inputs.contactName}<br>
      Email: ${inputs.email}<br>
      Phone: ${inputs.phone}<br>
      Address: ${inputs.address}, ${inputs.suburb} ${inputs.postcode}, ${cityLabel}<br>
      Cleaning frequency: ${inputs.frequency}<br>
      Preferred inspection date: ${inputs.preferredStartDate}<br>
      Cleaning time preference: ${inputs.timePreference}${selectedInspectionWindow ? `<br>Inspection appointment window: ${selectedInspectionWindow}` : ''}${inputs.preferredInspectionAssigneeName ? `<br>Assigned quoter: ${inputs.preferredInspectionAssigneeName}` : ''}</p>
    `,
  })
}
