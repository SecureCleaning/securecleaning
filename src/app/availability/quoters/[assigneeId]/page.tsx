import AssigneeAvailabilityEditor from '@/components/availability/AssigneeAvailabilityEditor'
import AvailabilityAgentLogin from '@/components/availability/AvailabilityAgentLogin'
import { getAvailabilityAssignee, getAvailabilityConfig } from '@/lib/availability'
import { getAgentCalendarEvents } from '@/lib/availabilityCalendar'
import {
  createAvailabilityAgentFeedToken,
  hasAvailabilityAgentSession,
} from '@/lib/availabilityAgentAuth'
import { getSiteUrl } from '@/lib/siteUrl'

export const dynamic = 'force-dynamic'

export default async function AvailabilityQuoterPage({
  params,
}: {
  params: Promise<{ assigneeId: string }>
}) {
  const { assigneeId } = await params
  const config = await getAvailabilityConfig()
  const assignee = getAvailabilityAssignee(config, assigneeId)

  if (!assignee?.active) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-3" style={{ color: '#1a2744' }}>Agent not found</h1>
          <p className="text-gray-600">This availability page does not exist or is no longer active.</p>
        </div>
      </div>
    )
  }

  if (!assignee.accessCodeHash) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h1 className="text-2xl font-bold mb-3" style={{ color: '#1a2744' }}>
            Access not configured yet
          </h1>
          <p className="text-gray-600">
            This agent page exists, but the admin team still needs to set a password before it can be used.
          </p>
        </div>
      </div>
    )
  }

  const authenticated = await hasAvailabilityAgentSession(assigneeId)
  if (!authenticated) {
    return (
      <AvailabilityAgentLogin
        assigneeId={assigneeId}
        assigneeName={assignee.name}
        defaultUsername={assignee.username ?? ''}
        lockUsername={Boolean(assignee.username)}
      />
    )
  }

  const initialCalendarEvents = await getAgentCalendarEvents(config, assignee)
  const feedToken = assignee.accessCodeHash
    ? createAvailabilityAgentFeedToken(assignee.id, assignee.accessCodeHash)
    : null
  const calendarFeedUrl = feedToken
    ? `${getSiteUrl()}/api/availability-agent/${assignee.id}/feed?token=${encodeURIComponent(feedToken)}`
    : undefined

  return (
    <AssigneeAvailabilityEditor
      assignee={assignee}
      initialWeeklySlots={config.weeklySlots.filter((slot) => slot.assigneeId === assigneeId)}
      initialOneOffBlocks={config.oneOffBlocks.filter((block) => block.assigneeId === assigneeId)}
      zones={config.zones.filter((zone) => zone.city === assignee.city)}
      apiPath={`/api/availability-agent/${assigneeId}`}
      title={`${assignee.name} Availability`}
      description="Update your recurring inspection windows and add date-specific block-outs when you are unavailable."
      allowAddSlot
      allowDeleteSlot
      allowZoneEditing
      initialCalendarEvents={initialCalendarEvents}
      calendarFeedUrl={calendarFeedUrl}
    />
  )
}
