import Link from 'next/link'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import ContractProductInterestForm from '@/components/products/ContractProductInterestForm'
import { CLEANER_JOBS_SESSION_COOKIE, verifyCleanerJobsSessionToken } from '@/lib/cleanerJobsAccess'
import { getAvailableCleanerJobs, getJobsAccessLink } from '@/lib/contractProducts'

export const dynamic = 'force-dynamic'

function money(cents: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(cents / 100)
}

export default async function AvailableJobDetailPage({ params }: { params: { code: string } }) {
  noStore()
  const cookieStore = await cookies()
  const accessLinkId = verifyCleanerJobsSessionToken(cookieStore.get(CLEANER_JOBS_SESSION_COOKIE)?.value)
  const accessLink = accessLinkId ? await getJobsAccessLink(accessLinkId) : null
  if (!accessLink) notFound()
  const job = (await getAvailableCleanerJobs(accessLink.state)).find((candidate) => candidate.productCode === params.code)
  if (!job) notFound()
  return <main className="min-h-screen bg-slate-100 px-4 py-8"><div className="mx-auto max-w-4xl">
    <Link href={`/jobs?state=${job.state}`} className="mb-4 inline-flex text-sm font-semibold text-teal-700">← Back to available jobs</Link>
    <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap justify-between gap-3"><span className="font-mono font-bold text-teal-700">{job.productCode}</span><span className="font-semibold text-gray-600">{job.suburb}, {job.state}</span></div>
      <h1 className="mt-3 text-3xl font-bold text-gray-900">{job.heading}</h1><p className="mt-3 leading-7 text-gray-600">{job.description}</p>
      <div className="mt-6 grid gap-4 rounded-xl bg-gray-50 p-4 sm:grid-cols-3"><div><p className="text-xs font-bold uppercase text-gray-500">Annual value</p><p className="mt-1 text-xl font-bold">{money(Math.round(job.annualContractValueExGstCents * 1.1))}</p><p className="text-xs text-gray-500">including GST</p></div><div><p className="text-xs font-bold uppercase text-gray-500">Purchase price</p><p className="mt-1 text-xl font-bold">{money(Math.round(job.purchasePriceExGstCents * 1.1))}</p><p className="text-xs text-gray-500">including GST</p></div><div><p className="text-xs font-bold uppercase text-gray-500">Expected schedule</p><p className="mt-1 font-bold">{job.frequency.replaceAll('_', ' ')}</p><p className="text-xs text-gray-500">{job.annualVisits} visits annually</p></div></div>
      <div className="mt-4 grid gap-3 rounded-xl border border-gray-200 p-4 text-sm sm:grid-cols-3">
        <div><span className="block text-xs font-bold uppercase text-gray-500">Proposed start</span>{job.startDate || 'To be confirmed'}</div>
        <div><span className="block text-xs font-bold uppercase text-gray-500">Timing</span>{job.timePreference.replaceAll('_', ' ')}</div>
        <div><span className="block text-xs font-bold uppercase text-gray-500">Hours per visit</span>{job.estimatedHoursPerVisit ? `${job.estimatedHoursPerVisit} hours` : 'To be confirmed'}</div>
        <div><span className="block text-xs font-bold uppercase text-gray-500">Key access</span>{job.keyedJob.replaceAll('_', ' ')}</div>
        <div><span className="block text-xs font-bold uppercase text-gray-500">Formal contract</span>{job.formalContract ? 'Yes' : 'No'}</div>
        <div><span className="block text-xs font-bold uppercase text-gray-500">Initial clean</span>{job.freeInitialClean ? 'Included at no charge' : 'Standard arrangement'}</div>
      </div>
      <section className="mt-7"><h2 className="text-xl font-bold">Scope overview</h2><p className="mt-2 text-gray-600">{job.cleanerScopeSnapshot.summary}</p>
        <p className="mt-2 text-sm text-gray-600">Approx. {job.cleanerScopeSnapshot.floorArea} sqm across {job.cleanerScopeSnapshot.floors} floor{job.cleanerScopeSnapshot.floors === 1 ? '' : 's'}.</p>
        {job.cleanerScopeSnapshot.selectedOptions.length > 0 ? <div className="mt-4"><h3 className="font-bold">Selected options</h3><ul className="mt-2 list-disc pl-5 text-sm text-gray-600">{job.cleanerScopeSnapshot.selectedOptions.map((option) => <li key={option}>{option}</li>)}</ul></div> : null}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{job.cleanerScopeSnapshot.rooms.map((room, index) => <div key={`${room.type}-${index}`} className="rounded-xl border border-gray-200 p-4"><h3 className="font-bold">{room.label} · Qty {room.quantity}</h3><p className="mt-1 text-xs text-gray-500">{room.size > 0 ? `${room.size} sqm each · ` : ''}Floor {room.floor}</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">{room.tasks.map((task) => <li key={task}>{task}</li>)}</ul></div>)}</div>
      </section>
      <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Client identity, exact address, contact details, and site-security information are shared only after Secure Cleaning approves the next stage.</p>
    </article><div className="mt-5"><ContractProductInterestForm productCode={job.productCode} /></div>
  </div></main>
}
