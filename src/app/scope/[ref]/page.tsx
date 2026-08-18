import Link from 'next/link'
import ScopePrintButton from '@/components/scope/ScopePrintButton'
import { getPublicScopeDocumentByRef } from '@/lib/quoteWorkflowData'
import { getSiteUrl } from '@/lib/siteUrl'
import { isQuoteBookingHandoffToken } from '@/lib/quoteBookingAccess'

export const dynamic = 'force-dynamic'

function formatDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

export default async function ScopeOfWorksPage({ params, searchParams }: { params: { ref: string }; searchParams?: { variant?: string; handoff?: string } }) {
  const variant = searchParams?.variant === 'final' ? 'final' : 'remote_review'
  const handoff = isQuoteBookingHandoffToken(searchParams?.handoff) ? searchParams?.handoff : undefined
  const report = /^SC-\d{8}-[A-Z0-9]{4}$/.test(params.ref) ? await getPublicScopeDocumentByRef(params.ref, variant) : null
  const siteUrl = getSiteUrl()

  if (!report) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-20">
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Secure Cleaning Aus</p>
          <h1 className="text-3xl font-bold text-slate-900">Scope not found</h1>
          <p className="mt-3 text-slate-600">This scope link may be incorrect, expired, or no longer available.</p>
          <Link href="/" className="mt-6 inline-flex rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white hover:bg-teal-800">
            Visit securecleaning.com.au
          </Link>
        </div>
      </div>
    )
  }

  const validUntil = formatDate(report.validUntil)
  const createdAt = formatDate(report.createdAt)

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-6 sm:px-6 sm:py-10">
      <article className="scope-report-shell mx-auto max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="scope-report-content">
          <header className="border-b border-slate-200 bg-slate-950 px-6 py-7 text-white sm:px-10">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <Link href="/" className="text-lg font-bold tracking-tight hover:text-emerald-300">Secure Cleaning Aus</Link>
                <p className="mt-2 text-sm text-slate-300">{variant === 'final' ? 'Final scope of works' : 'Remote-review scope of works'}</p>
              </div>
              <div className="text-left text-sm sm:text-right">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Reference</p>
                <p className="mt-1 font-mono font-semibold text-emerald-300">{report.quoteRef}</p>
                <div className="mt-3 sm:flex sm:justify-end">
                  <ScopePrintButton />
                </div>
              </div>
            </div>
          </header>

          <main className="px-6 py-7 sm:px-10 sm:py-9">
            <div className="flex flex-wrap items-end justify-between gap-5 border-b border-slate-200 pb-7">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.16em] text-teal-700">Scope of works</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{report.businessName}</h1>
                <p className="mt-2 text-slate-600">{report.location} · {report.premisesLabel}</p>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-stretch">
                <div className="min-w-[220px] rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">{report.priceLabel}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-950">{report.displayedPrice}</p>
                  <p className="mt-1 text-xs text-slate-600">Prices exclude GST</p>
                </div>
                {variant !== 'final' ? <Link
                  href={`/booking?${new URLSearchParams({
                    quoteRef: report.quoteRef,
                    ...(handoff ? { handoff } : {}),
                  }).toString()}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[96px] min-w-[220px] items-center justify-center rounded-xl bg-emerald-600 px-5 py-4 text-center text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  Book site inspection
                </Link> : null}
              </div>
            </div>

            <section className="grid gap-4 border-b border-slate-200 py-6 sm:grid-cols-3">
              <div>
                <p className="scope-label">Service frequency</p>
                <p className="scope-value">{report.frequencyLabel}</p>
              </div>
              <div>
                <p className="scope-label">Preferred timing</p>
                <p className="scope-value">{report.timePreferenceLabel}</p>
              </div>
              <div>
                <p className="scope-label">Prepared for</p>
                <p className="scope-value">{report.contactName || report.businessName}</p>
              </div>
            </section>

            <section className="border-b border-slate-200 py-7">
              <h2 className="scope-heading">Service summary</h2>
              <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-slate-700">{report.summary}</p>
            </section>

            <section className="border-b border-slate-200 py-7">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="scope-heading">Areas and regular tasks</h2>
                  <p className="mt-1 text-sm text-slate-500">The following tasks form the planned recurring service for the listed areas.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{report.rooms.length} area group{report.rooms.length === 1 ? '' : 's'}</span>
              </div>

              <div className="mt-4 space-y-3">
                {report.rooms.map((room) => (
                  <section key={room.id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold leading-tight text-slate-950">
                          {room.label}
                          <span className="ml-2 text-xs font-medium text-slate-500 sm:text-sm">
                            - {room.typeLabel} · Quantity {room.quantity}
                          {room.size ? ` · ${room.size} sqm each` : ''}
                          {room.floor > 1 ? ` · Floor ${room.floor}` : ''}
                          </span>
                        </h3>
                        {room.description ? <p className="mt-1.5 max-w-2xl text-sm leading-5 text-slate-700">{room.description}</p> : null}
                      </div>
                    </div>
                    <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] leading-5 text-slate-700 sm:grid-cols-2">
                      {room.tasks.map((task) => <li key={task} className="scope-task">{task}</li>)}
                    </ul>
                    {room.selectedOptions.length > 0 ? (
                      <div className="mt-2 border-t border-slate-100 pt-2 text-xs leading-5 text-slate-700">
                        <span className="scope-label">Selected for this area:</span>
                        <span className="ml-2">{room.selectedOptions.join(' · ')}</span>
                      </div>
                    ) : null}
                  </section>
                ))}
              </div>
            </section>

            {report.selectedOptions.length > 0 ? (
              <section className="border-b border-slate-200 py-7">
                <h2 className="scope-heading">Selected options</h2>
                <ul className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  {report.selectedOptions.map((option) => <li key={option} className="scope-task">{option}</li>)}
                </ul>
              </section>
            ) : null}

            {report.inclusions ? (
              <section className="border-b border-slate-200 py-7">
                <h2 className="scope-heading">Included service notes</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{report.inclusions}</p>
              </section>
            ) : null}

            <section className="border-b border-slate-200 py-7">
              <h2 className="scope-heading">Assumptions and exclusions</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{report.exclusions}</p>
            </section>

            <footer className="pt-7 text-sm text-slate-500">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  {createdAt ? <p>Prepared {createdAt}</p> : null}
                  {validUntil ? <p className="mt-1">Valid until {validUntil}</p> : null}
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-semibold text-slate-700">Secure Cleaning Aus</p>
                  <Link href="/" className="mt-1 inline-block text-teal-700 hover:underline">{siteUrl.replace(/^https?:\/\//, '')}</Link>
                </div>
              </div>
              <p className="mt-6 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
                {variant === 'final'
                  ? 'This is the reviewed final scope prepared for the named business. Any later change requires a newly reviewed document.'
                  : 'This scope is prepared for the named business and is provided for quotation purposes. Final service details are confirmed after access, site conditions, and any agreed changes are reviewed.'}
              </p>
            </footer>
          </main>
        </div>
      </article>
    </div>
  )
}
