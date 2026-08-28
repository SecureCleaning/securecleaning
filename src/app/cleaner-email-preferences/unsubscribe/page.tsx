import type { Metadata } from 'next'
import Link from 'next/link'
import CleanerBroadcastUnsubscribeForm from '@/components/CleanerBroadcastUnsubscribeForm'

export const metadata: Metadata = {
  title: 'Cleaner email preferences | Secure Cleaning',
  robots: { index: false, follow: false, noarchive: true },
}

export default async function CleanerBroadcastUnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams
  return <main className="min-h-[60vh] bg-gray-50 px-4 py-16">
    <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-2xl font-bold text-gray-900">Cleaner email preferences</h1>
      <div className="mt-4"><CleanerBroadcastUnsubscribeForm token={token} /></div>
      <Link href="/" className="mt-6 inline-flex text-sm font-semibold text-teal-700">Return to Secure Cleaning</Link>
    </div>
  </main>
}
