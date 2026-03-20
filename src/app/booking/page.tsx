import type { Metadata } from 'next'
import { Suspense } from 'react'
import BookingForm from '@/components/booking/BookingForm'
import { getContentValue, getPublicContentMap } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Book a Commercial Cleaning Service',
  description:
    'Book your commercial cleaning service in Melbourne or Sydney. A verified Owner-Operator will be matched to your premises.',
}

export default async function BookingPage() {
  const content = await getPublicContentMap()

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-3" style={{ color: '#1a2744' }}>
            {getContentValue(content, 'booking.hero_title', 'Book Your Clean')}
          </h1>
          <p className="text-lg text-gray-600 max-w-xl mx-auto">
            {getContentValue(content, 'booking.hero_subtitle', "Complete your booking request and we'll match you with a verified Owner-Operator in your area within 1 business day.")}
          </p>
        </div>

        <Suspense fallback={
          <div className="flex justify-center py-20">
            <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" />
          </div>
        }>
          <BookingForm />
        </Suspense>
      </div>
    </div>
  )
}
