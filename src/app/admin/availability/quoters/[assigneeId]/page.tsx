import Link from 'next/link'
import AdminNav from '@/components/admin/AdminNav'
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <AdminNav currentPath="/admin/availability" />
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8 text-center">
            <h1 className="text-2xl font-bold mb-3" style={{ color: '#1a2744' }}>Agent not found</h1>
            <Link href="/admin/availability" className="inline-flex items-center px-6 py-3 rounded-lg font-semibold text-white" style={{ backgroundColor: '#22c55e' }}>
              Back to Availability
            </Link>
          </div>
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
      <>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <AdminNav currentPath="/admin/availability" />
        </div>
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
        />
      </>
    )
  })
}
