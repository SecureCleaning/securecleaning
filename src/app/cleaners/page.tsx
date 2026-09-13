import type { Metadata } from 'next'
import CleanerAccessRequestForm from '@/components/cleaners/CleanerAccessRequestForm'

export const metadata: Metadata = {
  title: 'Cleaner access',
  description: 'Securely request access to review and update your Secure Cleaning cleaner profile.',
  robots: { index: false, follow: false, noarchive: true },
}

export default function CleanerAccessPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-12 sm:py-16">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Cleaner portal</p>
        <h1 className="mt-2 text-3xl font-bold text-[#1a2744]">Review your cleaner details</h1>
        <p className="mt-3 text-gray-600">Enter the email address already registered with Secure Cleaning. We will send a private, time-limited access link if it matches a cleaner record.</p>
        <CleanerAccessRequestForm />
        <p className="mt-6 border-t border-gray-100 pt-5 text-sm text-gray-600">New to Secure Cleaning? Ask your Secure Cleaning contact to email you a registration invitation.</p>
      </div>
    </div>
  )
}
