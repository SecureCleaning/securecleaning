import Link from 'next/link'
import type { AgentDashboardData } from '@/lib/agentDashboard'

function date(value: string | null, timeZone: string) {
  if (!value) return 'No expiry date'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-AU', { timeZone, day: 'numeric', month: 'short', year: 'numeric' })
}

function time(value: string, timeZone: string) {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'Time unavailable' : parsed.toLocaleTimeString('en-AU', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  })
}

function eventTone(kind: 'booking' | 'availability' | 'blockout') {
  if (kind === 'booking') return 'border-blue-200 bg-blue-50 text-blue-950'
  if (kind === 'blockout') return 'border-red-200 bg-red-50 text-red-950'
  return 'border-emerald-200 bg-emerald-50 text-emerald-950'
}

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
  return (
    <main>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-green-700">Agent dashboard</p>
          <h1 className="mt-1 text-3xl font-bold text-[#1a2744]">Welcome, {agentName}</h1>
          <p className="mt-2 text-gray-600">Your next seven days and current {city} sales priorities.</p>
        </div>
        <Link href={`/availability/quoters/${encodeURIComponent(assigneeId)}`} className="rounded-xl border border-green-200 bg-white px-4 py-3 text-sm font-bold text-green-700 shadow-sm hover:bg-green-50">Manage calendar</Link>
      </header>

      <section aria-label="Agent priorities" className="grid gap-4 sm:grid-cols-3">
        <StatCard eyebrow="Quote priority" count={data.pendingQuoteCount} label="Pending quotes" href={`/availability/quotes/${encodeURIComponent(assigneeId)}`} tone="green" />
        <StatCard eyebrow="Marketplace" count={data.productsForSaleCount} label="Products for sale" href={`/availability/products/${encodeURIComponent(assigneeId)}`} />
        <StatCard eyebrow="Product sales" count={data.inductionsRequiredCount} label="Inductions required" href={`/availability/sales/${encodeURIComponent(assigneeId)}`} tone="gold" />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(19rem,0.8fr)] xl:items-start">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="text-xl font-bold text-[#1a2744]">Seven-day calendar</h2>
              <p className="mt-1 text-sm text-gray-600">Appointments, availability and block-outs from today.</p>
            </div>
            <Link href={`/availability/quoters/${encodeURIComponent(assigneeId)}`} className="text-sm font-bold text-green-700 hover:underline">Open full calendar</Link>
          </div>
          <div className="overflow-x-auto p-4">
            <div className="grid min-w-[820px] grid-cols-7 gap-2">
              {data.week.map((day) => (
                <article key={day.key} className={`min-h-56 rounded-xl border p-2.5 ${day.isToday ? 'border-green-400 bg-green-50/60' : 'border-gray-200 bg-gray-50/70'}`}>
                  <div className="border-b border-gray-200 pb-2">
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500">{day.label}</div>
                    <div className="text-sm font-bold text-[#1a2744]">{day.dateLabel}</div>
                  </div>
                  <div className="mt-2 space-y-2">
                    {day.events.length === 0 ? <p className="py-3 text-xs text-gray-400">No events</p> : null}
                    {day.events.slice(0, 5).map((event) => (
                      <div key={event.id} className={`rounded-lg border px-2 py-2 text-xs ${eventTone(event.kind)}`}>
                        <div className="font-bold">{time(event.startsAt, data.timeZone)}</div>
                        <div className="mt-0.5 line-clamp-2 font-semibold">{event.title}</div>
                        {event.subtitle ? <div className="mt-0.5 line-clamp-1 opacity-75">{event.subtitle}</div> : null}
                      </div>
                    ))}
                    {day.events.length > 5 ? <p className="text-xs font-semibold text-gray-500">+{day.events.length - 5} more</p> : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <aside className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-[#1a2744]">Quote follow-up</h2>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">{data.sentFollowUpCount}</span>
            </div>
            <p className="mt-1 text-sm text-gray-600">Sent quotes still awaiting an outcome.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {data.sentFollowUps.length === 0 ? <p className="px-5 py-10 text-center text-sm text-gray-500">No sent quotes require follow-up.</p> : null}
            {data.sentFollowUps.map((quote) => (
              <Link key={quote.quoteRef} href={`/availability/quotes/${encodeURIComponent(assigneeId)}/${encodeURIComponent(quote.quoteRef)}`} className="block px-5 py-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-gray-900">{quote.businessName || quote.contactName || 'Private customer'}</div>
                    <div className="mt-0.5 text-xs text-gray-500">{quote.suburb || 'Suburb unavailable'} {quote.postcode}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-800">Sent</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-gray-500">
                  <span>{quote.quoteRef}</span>
                  <span>Valid {date(quote.validUntil, data.timeZone)}</span>
                </div>
              </Link>
            ))}
          </div>
          {data.sentFollowUpCount > data.sentFollowUps.length ? (
            <Link href={`/availability/quotes/${encodeURIComponent(assigneeId)}`} className="block border-t border-gray-100 px-5 py-3 text-center text-sm font-bold text-green-700 hover:bg-green-50">View all {data.sentFollowUpCount} quotes</Link>
          ) : null}
        </aside>
      </div>
    </main>
  )
}
