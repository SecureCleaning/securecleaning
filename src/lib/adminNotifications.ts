import { getAdminSupabase } from '@/lib/supabase'
import { sendEmailOrThrow } from '@/lib/email'

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'info@securecleaning.com.au'
const FROM_EMAIL = process.env.FROM_EMAIL || 'quotes@securecleaning.com.au'

export async function createAdminNotification(type: string, subject: string, message: string, html?: string) {
  try {
    const db = getAdminSupabase()
    await db.from('admin_audit_log').insert({
      entity_type: 'notification',
      entity_ref: type,
      action: 'created',
      details: { subject, message },
    })
  } catch (error) {
    console.error('[adminNotifications] Failed to record notification:', error)
  }

  try {
    await sendEmailOrThrow({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      replyTo: ADMIN_EMAIL,
      subject,
      html: html ?? `<div style="font-family: Arial, sans-serif; line-height: 1.5;"><h2>${subject}</h2><p>${message}</p></div>`,
    })
  } catch (error) {
    console.error('[adminNotifications] Failed to send notification email:', error)
  }
}
