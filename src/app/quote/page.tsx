import type { Metadata } from 'next'
import QuoteForm from '@/components/quote/QuoteForm'
import { getContentValue, getPublicContentMap } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Get an Instant Commercial Cleaning Quote',
  description:
    'Answer a few questions about your premises and get an instant estimate for commercial cleaning in Melbourne or Sydney. No obligation.',
}

export default async function QuotePage() {
  const content = await getPublicContentMap()

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-3" style={{ color: '#1a2744' }}>
            {getContentValue(content, 'quote.hero_title', 'Get an Instant Quote')}
          </h1>
          <p className="text-lg text-gray-600 max-w-xl mx-auto">
            {getContentValue(content, 'quote.hero_subtitle', 'Takes under 2 minutes. Get an instant estimate sent to your email — no waiting for a callback.')}
          </p>
        </div>

        <QuoteForm />
      </div>
    </div>
  )
}
