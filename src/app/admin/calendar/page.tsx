import CalendarAdmin from '@/components/admin/CalendarAdmin'
import { getAvailabilityConfig } from '@/lib/availability'
import { getAgentCalendarEvents } from '@/lib/availabilityCalendar'
import { withAdminPage } from '@/lib/adminPage'

export const dynamic = 'force-dynamic'

export default async function AdminCalendarPage() {
  return withAdminPage(async () => {
    const config = await getAvailabilityConfig()
    const calendars = await Promise.all(
      config.assignees
        .filter((assignee) => assignee.active)
        .map(async (assignee) => ({
          assignee,
          events: await getAgentCalendarEvents(config, assignee, {
            daysBehind: 42,
            daysAhead: 120,
            includeAvailability: true,
          }),
        })),
    )

    return <CalendarAdmin calendars={calendars} />
  })
}
