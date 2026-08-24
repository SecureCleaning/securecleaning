import type { Metadata } from 'next'
import Link from 'next/link'
import UnsubscribeForm from '@/components/UnsubscribeForm'

export const metadata: Metadata = {
  title: 'Email preferences | Secure Cleaning Aus',
  robots: { index: false, follow: false, noarchive: true },
}
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams
  return (
    <main className="min-h-[60vh] bg-gray-50 px-4 py-16">
      <div className="mx-auto max-w-xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-gray-900">Email preferences</h1>
        <div className="mt-4"><UnsubscribeForm token={token} /></div>
        <Link href="/" className="mt-6 inline-flex text-sm font-semibold text-teal-700">Return to Secure Cleaning Aus</Link>
      </div>
    </main>
  )
}
