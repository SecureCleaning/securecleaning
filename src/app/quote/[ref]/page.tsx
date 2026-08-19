import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import QuoteResultView from '@/components/quote/QuoteResultView'
import { getPublicQuoteDocumentByRef } from '@/lib/quoteWorkflowData'
import { isQuoteBookingHandoffToken } from '@/lib/quoteBookingAccess'

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
}

export default async function QuoteByRefPage({ params, searchParams }: { params: { ref: string }; searchParams?: { variant?: string; handoff?: string } }) {
  const variant = searchParams?.variant === 'final' ? 'final' : 'remote_review'
  const quote = await getPublicQuoteDocumentByRef(params.ref, variant)

  if (!quote) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <QuoteResultView
          quoteRef={quote.quoteRef}
          result={quote.result}
          inputs={quote.inputs}
          documentVariant={quote.variant}
          bookingHandoffToken={isQuoteBookingHandoffToken(searchParams?.handoff) ? searchParams?.handoff : undefined}
        />
      </div>
    </div>
  )
}
