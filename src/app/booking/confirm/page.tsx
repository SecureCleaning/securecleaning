'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { BookingInputs } from '@/lib/types'

interface StoredBooking {
  bookingRef: string
  inputs: BookingInputs
}

function BookingConfirmContent() {
  const searchParams = useSearchParams()
  const ref = searchParams.get('ref')
  const [stored, setStored] = useState<StoredBooking | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('bookingConfirm')
    if (raw) {
      try {
        const parsed: StoredBooking = JSON.parse(raw)
        if (!ref || parsed.bookingRef === ref) {
          setStored(parsed)
          return
        }
      } catch {}
    }
    setNotFound(true)
  }, [ref])

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-3" style={{ color: '#1a2744' }}>Booking not found</h1>
          <p className="text-gray-600 mb-6">Check your confirmation email or contact us.</p>
          <Link href="/" className="inline-flex items-center px-6 py-3 rounded-lg font-semibold text-white" style={{ backgroundColor: '#22c55e' }}>
            Back to Home
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

  const { bookingRef, inputs } = stored
  const cityLabel = inputs.city === 'melbourne' ? 'Melbourne' : 'Sydney'
  const nextStep2 = `We match you with a verified Owner-Operator in ${cityLabel}`

  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="max-w-2xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6" style={{ backgroundColor: '#22c55e' }}>
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold mb-2" style={{ color: '#1a2744' }}>
            Booking Submitted!
          </h1>
          <p className="text-gray-500">
            Reference: <span className="font-mono font-semibold text-gray-700">{bookingRef}</span>
          </p>
          <p className="text-gray-500 text-sm mt-1">
            Confirmation sent to <strong>{inputs.email}</strong>
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 mb-8">
          <h2 className="text-lg font-bold mb-5" style={{ color: '#1a2744' }}>Booking Summary</h2>
          <dl className="grid grid-cols-2 gap-y-4 text-sm">
            <div>
              <dt className="text-gray-500">Business</dt>
              <dd className="font-semibold mt-0.5">{inputs.businessName}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Contact</dt>
              <dd className="font-semibold mt-0.5">{inputs.contactName}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Address</dt>
              <dd className="font-semibold mt-0.5">{inputs.address}, {cityLabel}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Frequency</dt>
              <dd className="font-semibold mt-0.5 capitalize">{inputs.frequency.replace(/_/g, ' ')}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Preferred Start</dt>
              <dd className="font-semibold mt-0.5">{inputs.preferredStartDate}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Time Preference</dt>
              <dd className="font-semibold mt-0.5 capitalize">{inputs.timePreference.replace(/_/g, ' ')}</dd>
            </div>
          </dl>
        </div>

        <div className="bg-green-50 rounded-2xl border border-green-100 p-8 mb-8">
          <h2 className="text-lg font-bold mb-4 text-green-800">What Happens Next?</h2>
          <ol className="space-y-3">
            {[
              { step: '1', text: 'Our team reviews your booking (usually within 1 business day)' },
              { step: '2', text: nextStep2 },
              { step: '3', text: 'A site inspection is arranged — typically within 48 hours' },
              { step: '4', text: 'You receive your operator\'s direct contact details' },
              { step: '5', text: 'Your first clean is scheduled to your preferred date' },
            ].map((item) => (
              <li key={item.step} className="flex gap-3 text-sm text-green-800">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold">
                  {item.step}
                </span>
                {item.text}
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link href="/" className="flex-1 inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold text-white transition-all" style={{ backgroundColor: '#1a2744' }}>
            Back to Home
          </Link>
          <Link href="/contact" className="flex-1 inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold border-2 border-gray-200 text-gray-700 hover:border-gray-300 transition-all">
            Contact Us
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function BookingConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full" />
        </div>
      }
    >
      <BookingConfirmContent />
    </Suspense>
  )
}
