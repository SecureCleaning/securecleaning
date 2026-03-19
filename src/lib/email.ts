import type { QuoteInputs, QuoteResult, BookingInputs } from './types'
import { formatCurrency } from './quoteEngine'

/**
 * Email helper module using Resend.
 * Resend is imported lazily to avoid build errors if RESEND_API_KEY is not set.
 */

function getResend() {
  const { Resend } = require('resend')
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set — emails will not be sent.')
    return null
  }
  return new Resend(process.env.RESEND_API_KEY)
}

const FROM_EMAIL = process.env.FROM_EMAIL ?? 'info@securecleaning.au'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'info@securecleaning.au'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://securecleaning.com.au'

// ─── Quote Email ──────────────────────────────────────────────────────────────

export async function sendQuoteEmail(
  quoteRef: string,
  inputs: QuoteInputs,
  result: QuoteResult
): Promise<void> {
  const resend = getResend()
  if (!resend) return

  const cityLabel = inputs.city === 'melbourne' ? 'Melbourne' : 'Sydney'
  const lowFmt = formatCurrency(result.totalLow)
  const highFmt = formatCurrency(result.totalHigh)

  // Email to client
  await resend.emails.send({
    from: FROM_EMAIL,
    to: inputs.email,
    subject: `Your Secure Cleaning Quote — ${quoteRef}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a2744; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Secure Cleaning</h1>
          <p style="color: #22c55e; margin: 4px 0 0;">Professional Commercial Cleaning</p>
        </div>
        <div style="padding: 32px 24px;">
          <p>Hi ${inputs.contactName},</p>
          <p>Thank you for requesting a quote from Secure Cleaning. Here's your estimate for <strong>${inputs.businessName}</strong> in ${cityLabel}.</p>
          
          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin: 24px 0;">
            <h2 style="color: #1a2744; margin: 0 0 16px;">Quote Reference: ${quoteRef}</h2>
            <p style="font-size: 28px; color: #1a2744; font-weight: bold; margin: 0;">
              ${lowFmt} – ${highFmt}
              <span style="font-size: 16px; color: #64748b; font-weight: normal;"> per visit</span>
            </p>
            ${result.carpetSteamSeparate ? '<p style="color: #64748b; font-size: 14px;">* Carpet steam cleaning quoted separately</p>' : ''}
          </div>

          <h3 style="color: #1a2744;">Service Details</h3>
          <ul style="color: #334155; line-height: 1.8;">
            <li>Premises: ${inputs.premisesType} (${inputs.floorArea} sqm, ${inputs.floors} floor${inputs.floors > 1 ? 's' : ''})</li>
            <li>Frequency: ${inputs.frequency.replace(/_/g, ' ')}</li>
            <li>Time preference: ${inputs.timePreference.replace(/_/g, ' ')}</li>
            <li>City: ${cityLabel}</li>
            <li>Estimated hours per visit: ${result.estimatedHours}h</li>
          </ul>

          <p style="margin-top: 32px;">
            Ready to proceed? Book your first clean:
          </p>
          <a href="${SITE_URL}/booking?quoteRef=${quoteRef}" 
             style="display: inline-block; background: #22c55e; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            Book Now
          </a>

          <p style="color: #64748b; font-size: 13px; margin-top: 32px;">
            This quote is valid for 30 days. Prices exclude GST. Final pricing may vary after a site inspection.
          </p>
        </div>
        <div style="background: #f1f5f9; padding: 16px; text-align: center; color: #64748b; font-size: 12px;">
          Secure Contracts Pty Ltd | ABN: TBC | Melbourne & Sydney
        </div>
      </div>
    `,
  })

  // Notification to admin
  await resend.emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    subject: `[New Quote] ${quoteRef} — ${inputs.businessName} (${cityLabel})`,
    html: `
      <p><strong>New quote generated:</strong> ${quoteRef}</p>
      <p>Business: ${inputs.businessName}<br>
      Contact: ${inputs.contactName}<br>
      Email: ${inputs.email}<br>
      Phone: ${inputs.phone}<br>
      City: ${cityLabel}<br>
      Premises: ${inputs.premisesType} — ${inputs.floorArea} sqm<br>
      Frequency: ${inputs.frequency}<br>
      Estimate: ${lowFmt} – ${highFmt} per visit</p>
    `,
  })
}

// ─── Booking Email ────────────────────────────────────────────────────────────

export async function sendBookingConfirmationEmail(
  bookingRef: string,
  inputs: BookingInputs
): Promise<void> {
  const resend = getResend()
  if (!resend) return

  const cityLabel = inputs.city === 'melbourne' ? 'Melbourne' : 'Sydney'

  await resend.emails.send({
    from: FROM_EMAIL,
    to: inputs.email,
    subject: `Booking Confirmed — ${bookingRef}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a2744; padding: 24px; text-align: center;">
          <h1 style="color: white; margin: 0;">Secure Cleaning</h1>
          <p style="color: #22c55e; margin: 4px 0 0;">Booking Confirmed ✓</p>
        </div>
        <div style="padding: 32px 24px;">
          <p>Hi ${inputs.contactName},</p>
          <p>Your cleaning service has been booked! We'll be in touch shortly to confirm your assigned Owner-Operator and first clean date.</p>
          
          <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 24px; margin: 24px 0;">
            <h2 style="color: #1a2744; margin: 0 0 8px;">Booking Reference: ${bookingRef}</h2>
            <p style="color: #334155; margin: 0;">
              ${inputs.businessName}<br>
              ${inputs.address}, ${cityLabel}<br>
              Frequency: ${inputs.frequency.replace(/_/g, ' ')}<br>
              Preferred start: ${inputs.preferredStartDate}
            </p>
          </div>

          <h3 style="color: #1a2744;">What happens next?</h3>
          <ol style="color: #334155; line-height: 2;">
            <li>We'll match you with a verified Owner-Operator in your area</li>
            <li>A site inspection will be arranged (usually within 48h)</li>
            <li>You'll receive your operator's contact details directly</li>
            <li>Your first clean will be scheduled to your preference</li>
          </ol>

          <p>Questions? Reply to this email or call us.</p>
        </div>
        <div style="background: #f1f5f9; padding: 16px; text-align: center; color: #64748b; font-size: 12px;">
          Secure Contracts Pty Ltd | Melbourne & Sydney
        </div>
      </div>
    `,
  })

  // Admin notification
  await resend.emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    subject: `[New Booking] ${bookingRef} — ${inputs.businessName} (${cityLabel})`,
    html: `
      <p><strong>New booking submitted:</strong> ${bookingRef}</p>
      <p>Business: ${inputs.businessName}<br>
      Contact: ${inputs.contactName}<br>
      Email: ${inputs.email}<br>
      Phone: ${inputs.phone}<br>
      Address: ${inputs.address}, ${cityLabel}<br>
      Frequency: ${inputs.frequency}<br>
      Start date: ${inputs.preferredStartDate}</p>
    `,
  })
}
