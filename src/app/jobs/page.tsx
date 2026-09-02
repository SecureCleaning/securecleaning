import Link from 'next/link'
import { cookies } from 'next/headers'
import { unstable_noStore as noStore } from 'next/cache'
import { CLEANER_JOBS_SESSION_COOKIE, verifyCleanerJobsSessionToken } from '@/lib/cleanerJobsAccess'
import { CONTRACT_PRODUCT_STATES, normalizeContractProductState } from '@/lib/contractProductPolicy'
import { getAvailableCleanerJobs, getJobsAccessLink } from '@/lib/contractProducts'

export const dynamic = 'force-dynamic'

function money(cents: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(cents / 100)
}

export default async function AvailableJobsPage({ searchParams }: { searchParams?: { state?: string | string[] } }) {
  noStore()
  const cookieStore = await cookies()
  const accessLinkId = verifyCleanerJobsSessionToken(cookieStore.get(CLEANER_JOBS_SESSION_COOKIE)?.value)
  const accessLink = accessLinkId ? await getJobsAccessLink(accessLinkId) : null
  if (!accessLink) {
    return <main className="min-h-[70vh] bg-gray-50 px-4 py-16"><div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-8 text-center"><h1 className="text-2xl font-bold">Available cleaning contracts</h1><p className="mt-3 text-gray-600">Use the current reusable link supplied by Secure Cleaning to view available jobs.</p></div></main>
  }
  const state = accessLink.state ?? normalizeContractProductState(typeof searchParams?.state === 'string' ? searchParams.state : '')
  const jobs = await getAvailableCleanerJobs(state)
  return <main className="min-h-screen bg-slate-100 px-4 py-8"><div className="mx-auto max-w-6xl"><header className="rounded-2xl bg-slate-950 p-6 text-white"><p className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-300">Secure Cleaning</p><h1 className="mt-2 text-3xl font-bold">Available cleaning contracts</h1><p className="mt-2 max-w-2xl text-slate-300">Review current opportunities and register your interest. Client identities and exact addresses are provided only during the approved handover process.</p></header>{!accessLink.state ? <form className="my-5 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4"><label className="text-sm font-semibold">State or territory<select name="state" defaultValue={state ?? ''} className="ml-3 rounded-lg border border-gray-300 bg-white px-3 py-2"><option value="">All locations</option>{CONTRACT_PRODUCT_STATES.map((item) => <option key={item}>{item}</option>)}</select></label><button className="rounded-lg bg-gray-900 px-4 py-2 font-semibold text-white">Apply</button></form> : <p className="my-5 rounded-xl border border-gray-200 bg-white p-4 text-sm font-semibold">Showing {accessLink.state} opportunities</p>}<div className="grid gap-4 md:grid-cols-2">{jobs.map((job) => <article key={job.productCode} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex justify-between gap-3"><span className="font-mono text-sm font-bold text-teal-700">{job.productCode}</span><span className="text-sm font-semibold text-gray-600">{job.suburb}, {job.state}</span></div><h2 className="mt-3 text-xl font-bold text-gray-900">{job.heading}</h2><p className="mt-2 text-sm leading-6 text-gray-600">{job.description}</p><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-gray-500">Schedule</dt><dd className="font-semibold">{job.frequency.replaceAll('_', ' ')}</dd></div><div><dt className="text-gray-500">Timing</dt><dd className="font-semibold">{job.timePreference.replaceAll('_', ' ')}</dd></div><div><dt className="text-gray-500">Annual value</dt><dd className="font-semibold">{money(Math.round(job.annualContractValueExGstCents * 1.1))} inc GST</dd></div><div><dt className="text-gray-500">Purchase price</dt><dd className="font-semibold">{money(Math.round(job.purchasePriceExGstCents * 1.1))} inc GST</dd></div></dl><Link href={`/jobs/${encodeURIComponent(job.productCode)}`} className="mt-5 inline-flex rounded-lg bg-green-600 px-4 py-2.5 font-semibold text-white">View job details</Link></article>)}{jobs.length === 0 ? <p className="rounded-xl border border-gray-200 bg-white p-6 text-gray-600">No available jobs currently match this location.</p> : null}</div></div></main>
}
