import Link from 'next/link'
import SmsInbox from '@/components/sms/SmsInbox'
import ClientFollowUps from '@/components/admin/ClientFollowUps'
import type { AgentDashboardData } from '@/lib/agentDashboard'
import AgentCalendarPanel from './AgentCalendarPanel'

function StatCard({ eyebrow, count, label, href, tone = 'plain' }: {
  eyebrow: string
  count: number
  label: string
  href: string
  tone?: 'green' | 'gold' | 'plain'
}) {
  const classes = tone === 'green'
    ? 'border-green-200 bg-green-50'
    : tone === 'gold' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'
  return (
    <Link href={href} className={`group rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${classes}`}>
      <span className="text-xs font-bold uppercase tracking-[0.16em] text-gray-600">{eyebrow}</span>
      <span className="mt-3 block text-3xl font-bold text-[#1a2744]">{count}</span>
      <span className="mt-1 block text-sm font-medium text-gray-700">{label}</span>
      <span className="mt-4 inline-flex text-sm font-bold text-green-700 group-hover:underline">Open <span aria-hidden="true" className="ml-1">→</span></span>
    </Link>
  )
}

export default function AgentPortalDashboard({ assigneeId, agentName, city, data }: {
  assigneeId: string
  agentName: string
  city: string
  data: AgentDashboardData
}) {
  const displayCity = city ? city[0].toUpperCase() + city.slice(1).toLowerCase() : 'regional'
  return (
    <main>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-green-700">Agent dashboard</p>
          <h1 className="mt-1 text-3xl font-bold text-[#1a2744]">Welcome, {agentName}</h1>
          <p className="mt-2 text-gray-600">Your next seven days and current {displayCity} sales priorities.</p>
        </div>
        <Link href={`/availability/quoters/${encodeURIComponent(assigneeId)}`} className="rounded-xl border border-green-200 bg-white px-4 py-3 text-sm font-bold text-green-700 shadow-sm hover:bg-green-50">Manage calendar</Link>
      </header>

      <section aria-label="Agent priorities" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard eyebrow="Quote priority" count={data.pendingQuoteCount} label="Pending quotes" href={`/availability/quotes/${encodeURIComponent(assigneeId)}`} tone="green" />
        <StatCard eyebrow="Marketplace" count={data.productsForSaleCount} label="Products for sale" href={`/availability/products/${encodeURIComponent(assigneeId)}`} />
        <StatCard eyebrow="Product sales" count={data.inductionsRequiredCount} label="Inductions required" href={`/availability/sales/${encodeURIComponent(assigneeId)}`} tone="gold" />
        <StatCard eyebrow="Quote follow-up" count={data.sentFollowUpCount} label="Sent quotes awaiting an outcome" href={`/availability/quotes/${encodeURIComponent(assigneeId)}?followUp=1`} />
      </section>

      <SmsInbox />
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(19rem,0.8fr)] xl:items-start">
        <div className="min-w-0">
          <AgentCalendarPanel key={data.weekOffset} dashboardWeekOffset={data.weekOffset} events={data.week.flatMap((day) => day.events)} dashboardDays={data.week} timeZone={data.timeZone} assigneeId={assigneeId} bookingApiPath={`/api/availability-agent/${encodeURIComponent(assigneeId)}/bookings`} />
        </div>

        <ClientFollowUps compact />
      </div>
    </main>
  )
}
