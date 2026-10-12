import type { CrmOpportunity } from '@/lib/clientCrmData'

export default function ClientEmailStatus({ lead }: { lead: Pick<CrmOpportunity, 'suppressed' | 'suppression'> }) {
  if (!lead.suppressed) return null
  const detail = lead.suppression
  const reasons: Record<string, string> = {
    unsubscribed: 'Unsubscribed from marketing emails',
    hard_bounce: 'Email suppressed - permanent delivery failure',
    complaint: 'Email suppressed - spam complaint',
    manual: 'Email suppressed manually',
  }
  const sources: Record<string, string> = {
    unsubscribe_link: 'Email unsubscribe link',
    client_crm: 'Client CRM',
  }
  const statusDate = (value: string) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString('en-AU', {
      timeZone: 'Australia/Melbourne', dateStyle: 'medium', timeStyle: 'short',
    }) + ' (Melbourne/Sydney time)'
  }
  return <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
    <p className="font-semibold">{detail ? reasons[detail.reason] || 'Email suppressed - reason unavailable' : 'Email suppressed - details unavailable'}</p>
    {detail ? <>
      <p className="mt-1">Source: {sources[detail.source] || 'Other recorded source'}</p>
      <p>First recorded: {statusDate(detail.createdAt)}</p>
      {detail.updatedAt && detail.updatedAt !== detail.createdAt ? <p>Last updated: {statusDate(detail.updatedAt)}</p> : null}
    </> : null}
    <p className="mt-1">CRM outreach is disabled for this email address.</p>
  </div>
}
