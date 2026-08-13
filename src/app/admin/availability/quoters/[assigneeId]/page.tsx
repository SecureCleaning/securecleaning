import Link from 'next/link'
import AdminPageHeader from '@/components/admin/AdminPageHeader'
import AssigneeAvailabilityEditor from '@/components/availability/AssigneeAvailabilityEditor'
import { getAvailabilityAssignee, getAvailabilityConfig } from '@/lib/availability'
import { getAgentCalendarEvents } from '@/lib/availabilityCalendar'
import { createAvailabilityAgentFeedToken } from '@/lib/availabilityAgentAuth'
import { withAdminPage } from '@/lib/adminPage'
import { getSiteUrl } from '@/lib/siteUrl'

export const dynamic = 'force-dynamic'

export default async function AdminAvailabilityQuoterPage({
  params,
}: {
  params: Promise<{ assigneeId: string }>
}) {
  const { assigneeId } = await params

  return withAdminPage(async () => {
    const config = await getAvailabilityConfig()
    const assignee = getAvailabilityAssignee(config, assigneeId)

    if (!assignee) {
      return (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="mb-3 text-2xl font-bold" style={{ color: '#1a2744' }}>Agent not found</h1>
          <Link href="/admin/availability" className="inline-flex min-h-10 items-center rounded-lg px-6 py-3 font-semibold text-white" style={{ backgroundColor: '#22c55e' }}>
            Back to Availability
          </Link>
        </div>
      )
    }

    const feedToken = assignee.accessCodeHash
      ? createAvailabilityAgentFeedToken(assignee.id, assignee.accessCodeHash)
      : null
    const calendarFeedUrl = feedToken
      ? `${getSiteUrl()}/api/availability-agent/${assignee.id}/feed?token=${encodeURIComponent(feedToken)}`
      : undefined
    const initialCalendarEvents = await getAgentCalendarEvents(config, assignee)

    return (
      <div>
        <AdminPageHeader
          title={`${assignee.name} Availability`}
          description="Manage this agent's recurring inspection windows, service zones, block-outs, and calendar feed."
          backHref="/admin/availability"
          backLabel="Back to availability"
        />
        <AssigneeAvailabilityEditor
          assignee={assignee}
          initialWeeklySlots={config.weeklySlots.filter((slot) => slot.assigneeId === assigneeId)}
          initialOneOffBlocks={config.oneOffBlocks.filter((block) => block.assigneeId === assigneeId)}
          zones={config.zones.filter((zone) => zone.city === assignee.city)}
          apiPath={`/api/availability-agent/${assigneeId}`}
          title={`${assignee.name} Availability`}
          description="Admin view for this agent's recurring inspection windows and date-specific block-outs."
          allowAddSlot
          allowDeleteSlot
          allowZoneEditing
          initialCalendarEvents={initialCalendarEvents}
          calendarFeedUrl={calendarFeedUrl}
          compactLayout
          showAgentNav={false}
        />
      </div>
    )
  })
}
