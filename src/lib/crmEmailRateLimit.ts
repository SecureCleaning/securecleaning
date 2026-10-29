export const CRM_EMAIL_SEND_LIMIT = 100
export const CRM_EMAIL_PREVIEW_LIMIT = 300
export const CRM_EMAIL_WINDOW_MS = 60 * 60 * 1000

export function crmEmailLimitMessage(action: 'send' | 'preview', retryAfter: string | null) {
  const parsed = Number(retryAfter)
  const seconds = Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 60
  const minutes = Math.ceil(seconds / 60)
  const wait = seconds < 60 ? `${seconds} second${seconds === 1 ? '' : 's'}` : `${minutes} minute${minutes === 1 ? '' : 's'}`
  const limit = action === 'send' ? CRM_EMAIL_SEND_LIMIT : CRM_EMAIL_PREVIEW_LIMIT
  return `You have reached the limit of ${limit} email ${action === 'send' ? 'send attempts' : 'previews'} per hour. Please wait ${wait} before trying again.${action === 'send' ? ' This attempt did not send an email.' : ''}`
}
