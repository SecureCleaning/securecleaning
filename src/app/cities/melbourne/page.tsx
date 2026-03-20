import type { Metadata } from 'next'
import Link from 'next/link'
import { getContentValue, getPublicContentMap } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Commercial Cleaning Melbourne — Secure Cleaning Aus',
  description:
    'Professional commercial cleaning services across Melbourne CBD, inner suburbs, and greater metro area. Verified Owner-Operators. Get an instant quote.',
}

const suburbs = [
  'CBD', 'Docklands', 'Southbank', 'South Yarra', 'Richmond', 'Fitzroy',
  'Collingwood', 'Carlton', 'North Melbourne', 'West Melbourne', 'St Kilda',
  'Prahran', 'South Melbourne', 'Port Melbourne', 'Williamstown',
  'Box Hill', 'Camberwell', 'Glen Waverley', 'Dandenong', 'Frankston',
  'Sunshine', 'Footscray', 'Essendon', 'Moonee Ponds', 'Brunswick',
  'Preston', 'Heidelberg', 'Ringwood', 'Knox', 'Werribee',
]

export default async function MelbournePage() {
  const content = await getPublicContentMap()
  const serviceLabels = ['Office Cleaning', 'Medical Cleaning', 'Childcare Cleaning', 'Retail Cleaning', 'Industrial Cleaning', 'Gym Cleaning', 'Warehouse Cleaning']

  return (
    <div className="min-h-screen">
      <section className="py-16 text-white" style={{ backgroundColor: '#1a2744' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-start gap-5">
            <div className="text-6xl">🏙️</div>
            <div>
              <h1 className="text-4xl md:text-5xl font-bold mb-4">
                {getContentValue(content, 'melbourne.hero_title', 'Commercial Cleaning Melbourne')}
              </h1>
              <p className="text-xl text-gray-300 max-w-2xl">
                {getContentValue(content, 'melbourne.hero_body', 'Secure Cleaning Aus operates across all of Melbourne — from the CBD and inner suburbs to the outer metro area. Our verified Owner-Operators are local business owners who know Melbourne inside out.')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-white rounded-2xl border border-gray-100 p-8">
                <h2 className="text-2xl font-bold mb-4" style={{ color: '#1a2744' }}>
                  {getContentValue(content, 'melbourne.why_title', 'Why Melbourne Businesses Choose Secure Cleaning Aus')}
                </h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  {getContentValue(content, 'melbourne.why_body_1', "Melbourne's commercial property market is dense and competitive. Whether you're in a Collins Street tower, a Fitzroy warehouse conversion, or an industrial estate in the west, your cleaning needs to be reliable, consistent, and professionally managed.")}
                </p>
                <p className="text-gray-600 leading-relaxed">
                  {getContentValue(content, 'melbourne.why_body_2', "Our Melbourne Owner-Operators have invested in their territories. They're not casuals who might not show up — they're business owners with a reputation to protect and a livelihood that depends on your satisfaction.")}
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-8">
                <h2 className="text-2xl font-bold mb-5" style={{ color: '#1a2744' }}>
                  {getContentValue(content, 'melbourne.areas_title', 'Areas We Cover')}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {suburbs.map((s) => (
                    <div key={s} className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="text-green-500">✓</span> {s}
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm text-gray-500">
                  {getContentValue(content, 'melbourne.areas_note', "Don't see your suburb? We likely cover it — get a quote and we'll confirm.")}
                </p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <h3 className="font-bold mb-4" style={{ color: '#1a2744' }}>{getContentValue(content, 'melbourne.pricing_title', 'Melbourne Pricing')}</h3>
                <p className="text-sm text-gray-600 mb-4">
                  {getContentValue(content, 'melbourne.pricing_body', 'Melbourne pricing includes a city rate adjustment reflecting local labour costs. Use our instant quote calculator for accurate estimates.')}
                </p>
                <Link href="/quote?city=melbourne"
                  className="block text-center px-5 py-3 rounded-xl font-bold text-white transition-all"
                  style={{ backgroundColor: '#22c55e' }}>
                  {getContentValue(content, 'melbourne.pricing_cta_label', 'Get Melbourne Quote')}
                </Link>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <h3 className="font-bold mb-3" style={{ color: '#1a2744' }}>{getContentValue(content, 'melbourne.services_title', 'Services Available')}</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  {serviceLabels.map((s) => (
                    <li key={s} className="flex gap-2 items-center">
                      <span className="text-green-500">✓</span> {s}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-navy-50 rounded-2xl border p-6" style={{ borderColor: '#1a2744', backgroundColor: 'rgba(26,39,68,0.04)' }}>
                <p className="text-sm font-semibold mb-2" style={{ color: '#1a2744' }}>
                  {getContentValue(content, 'melbourne.chat_title', '🤖 Chat with Max')}
                </p>
                <p className="text-xs text-gray-600">
                  {getContentValue(content, 'melbourne.chat_body', 'Questions about Melbourne services? Max can help 24/7.')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 text-white text-center" style={{ backgroundColor: '#22c55e' }}>
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-4">{getContentValue(content, 'melbourne.bottom_cta_title', 'Ready to get started in Melbourne?')}</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/quote?city=melbourne"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-bold text-white transition-all"
              style={{ backgroundColor: '#1a2744' }}>
              {getContentValue(content, 'melbourne.bottom_cta_primary_label', 'Get Melbourne Quote')}
            </Link>
            <Link href="/booking"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-semibold border-2 border-white text-white hover:bg-white hover:text-green-600 transition-all">
              {getContentValue(content, 'melbourne.bottom_cta_secondary_label', 'Book a Clean')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
