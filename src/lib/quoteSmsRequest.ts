import 'server-only'
import { getAdminSupabase } from './supabase'
import { normalizeSmsMobile } from './smsPolicy'
import { QUOTE_SMS_NOTICE_VERSION } from './quoteSmsNotice'

export async function recordQuoteSmsRequest(input: {
  quoteRef: string; phone: string; source: 'online_request' | 'agent_request'; actorId: string; allowed: boolean
}) {
  const mobile = normalizeSmsMobile(input.phone)
  if (!mobile) return false
  const { data, error } = await getAdminSupabase().rpc('sms_record_quote_request', {
    p_quote_ref: input.quoteRef, p_mobile: mobile, p_source: input.source,
    p_actor: input.actorId, p_allowed: input.allowed, p_notice_version: QUOTE_SMS_NOTICE_VERSION,
  })
  if (error) throw error
  return data === true
}

export async function recordRemoteQuoteEmail(input: {
  quoteRef: string; phone: string; email: string; providerMessageId: string | null
}) {
  const mobile = normalizeSmsMobile(input.phone)
  if (!mobile || !input.providerMessageId) return false
  const { data, error } = await getAdminSupabase().rpc('sms_record_remote_quote_email', {
    p_quote_ref: input.quoteRef, p_mobile: mobile, p_recipient: input.email,
    p_provider_message_id: input.providerMessageId,
  })
  if (error) throw error
  return data === true
}
