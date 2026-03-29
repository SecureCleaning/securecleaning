'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import QuoteResultComponent from '@/components/quote/QuoteResult'
import Link from 'next/link'
import { getQuoteResult, type StoredQuoteResult } from '@/lib/quoteSession'

function QuoteResultContent() {
  const searchParams = useSearchParams()
  const ref = searchParams.get('ref')
  const [stored, setStored] = useState<StoredQuoteResult | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const storedResult = getQuoteResult()
    if (storedResult && (!ref || storedResult.quoteRef === ref)) {
      setStored(storedResult)
      return
    }

    setNotFound(true)
  }, [ref])

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold mb-2" style={{ color: '#1a2744' }}>
            Quote not found
          </h1>
          <p className="text-gray-600 mb-6">
            This quote may have expired or was accessed from a different browser.
            Check your email for your quote, or generate a new one.
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

  if (!stored) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <QuoteResultComponent
          quoteRef={stored.quoteRef}
          result={stored.result}
          inputs={stored.inputs}
        />
      </div>
    </div>
  )
}

export default function QuoteResultPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" />
        </div>
      }
    >
      <QuoteResultContent />
    </Suspense>
  )
}
