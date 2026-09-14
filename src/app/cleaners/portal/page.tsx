import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import Link from 'next/link'
import CleanerPortalForm from '@/components/cleaners/CleanerPortalForm'
import { CLEANER_PORTAL_COOKIE, verifyCleanerPortalToken } from '@/lib/cleanerPortalAccess'
import { getCleanerPortalProfile } from '@/lib/cleanerPortal'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Cleaner portal', robots: { index: false, follow: false, noarchive: true } }

export default async function CleanerPortalPage() {
  const token = cookies().get(CLEANER_PORTAL_COOKIE)?.value
  const claims = verifyCleanerPortalToken(token)
  if (!claims) {
    return <div className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-3xl font-bold text-[#1a2744]">Cleaner access required</h1><p className="mt-3 text-gray-600">Your access link is invalid or has expired.</p><Link href="/cleaners" className="mt-6 inline-flex rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white">Request a new link</Link></div>
  }

  try {
    const profile = await getCleanerPortalProfile(claims)
    return <CleanerPortalForm mode={claims.mode} registeredEmail={claims.email} initialProfile={profile} lockedState={claims.state} />
  } catch {
    return <div className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-3xl font-bold text-[#1a2744]">Cleaner access unavailable</h1><p className="mt-3 text-gray-600">This cleaner record is no longer available through that link.</p><Link href="/cleaners" className="mt-6 inline-flex rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white">Request another link</Link></div>
  }
}
