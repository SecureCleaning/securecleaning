import Link from 'next/link'
import QuoteResultView from '@/components/quote/QuoteResultView'
import { getQuoteByRef } from '@/lib/quoteData'

export default async function QuoteByRefPage({ params }: { params: { ref: string } }) {
  const quote = await getQuoteByRef(params.ref)

  if (!quote) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: '#1a2744' }}>
            Quote not found
          </h1>
          <p className="text-gray-600 mb-6">
            This quote could not be found. It may have expired or the reference may be incorrect.
          </p>
          <Link
            href="/quote"
            className="inline-flex items-center px-6 py-3 rounded-lg font-semibold text-white transition-all"
            style={{ backgroundColor: '#22c55e' }}
          >
            Get a New Quote
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <QuoteResultView quoteRef={quote.quoteRef} result={quote.result} inputs={quote.inputs} />
      </div>
    </div>
  )
}
