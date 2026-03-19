import Link from 'next/link'
import type { Metadata } from 'next'
import { getContentValue, getPublicContentMap } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Professional Commercial Cleaning in Melbourne & Sydney | Secure Cleaning Aus',
  description:
    'Get an instant quote for professional commercial cleaning. Verified Owner-Operators serving Melbourne and Sydney businesses. No lock-in contracts.',
}

const premisesTypes = [
  { name: 'Office', icon: '🏢', desc: 'Workplaces of all sizes' },
  { name: 'Medical', icon: '🏥', desc: 'Clinics, dentists, allied health' },
  { name: 'Childcare', icon: '🎨', desc: 'Centres, kindergartens, OOSH' },
  { name: 'Industrial', icon: '🏭', desc: 'Factories & warehouses' },
  { name: 'Retail', icon: '🛍️', desc: 'Shops, showrooms & boutiques' },
  { name: 'Gym', icon: '💪', desc: 'Gyms, studios & leisure' },
  { name: 'Warehouse', icon: '📦', desc: 'Distribution & logistics' },
  { name: 'Other', icon: '🔧', desc: 'Bespoke commercial premises' },
]

const ownerOperatorBenefits = [
  {
    icon: '🔓',
    title: 'No Lock-In Contracts',
    desc: 'Stay because you love the service — not because you\'re trapped. Cancel any time with reasonable notice.',
  },
  {
    icon: '👔',
    title: 'Real Professionals',
    desc: 'Every cleaner is a trained, experienced professional — not a day-hire casual.',
  },
  {
    icon: '💼',
    title: 'Financially Committed',
    desc: 'Owner-Operators have purchased their territory. They have skin in the game and a business to protect.',
  },
  {
    icon: '✅',
    title: 'Fully Verified',
    desc: 'Police checked, insured, and reference verified. We don\'t send strangers to your premises.',
  },
  {
    icon: '🏗️',
    title: 'Site Inducted',
    desc: 'Your operator learns your site\'s specific requirements, hazards, and preferences before they start.',
  },
  {
    icon: '📱',
    title: 'Direct Contact',
    desc: 'You get your operator\'s direct number. No call centres, no middlemen, no runaround.',
  },
]

const testimonials = [
  {
    name: 'Sarah M.',
    business: 'Parkville Medical Centre',
    city: 'Melbourne',
    quote:
      'Switched from a national franchise 18 months ago. The difference is night and day — our operator treats our clinic like it\'s their own business. Because it is.',
    rating: 5,
  },
  {
    name: 'James T.',
    business: 'East Sydney Co-Working',
    city: 'Sydney',
    quote:
      'Loved that I could get an instant quote online and book without playing phone tag. Our space has been spotless since day one.',
    rating: 5,
  },
  {
    name: 'Priya K.',
    business: 'Little Stars Childcare',
    city: 'Melbourne',
    quote:
      'As a childcare centre, we need someone we can trust completely. Our operator came in for a site induction before starting and hasn\'t missed a clean in 8 months.',
    rating: 5,
  },
]

const steps = [
  {
    step: '01',
    title: 'Get an Instant Quote',
    desc: 'Answer a few questions about your premises and schedule. Our pricing engine gives you a transparent estimate in under 2 minutes — no waiting for a callback.',
  },
  {
    step: '02',
    title: 'We Match Your Operator',
    desc: 'We pair you with a verified, insured Owner-Operator in your area who specialises in your type of premises. Site inspection arranged within 48 hours.',
  },
  {
    step: '03',
    title: 'Your Space, Professionally Cleaned',
    desc: 'Your operator starts on your schedule. You have their direct number. If anything ever isn\'t right, you tell them — and it gets fixed.',
  },
]

export default async function HomePage() {
  const content = await getPublicContentMap()
  const heroTitle = getContentValue(
    content,
    'home.hero_title',
    'Professional Commercial Cleaning for Melbourne & Sydney Businesses'
  )
  const heroSubtitle = getContentValue(
    content,
    'home.hero_subtitle',
    'Verified Owner-Operators. Transparent pricing. No lock-in contracts. Get an instant online quote and book your first clean today.'
  )
  const primaryCtaLabel = getContentValue(content, 'home.cta_primary_label', 'Get an Instant Quote →')
  const secondaryCtaLabel = getContentValue(content, 'home.cta_secondary_label', 'View Services')
  const whyTitle = getContentValue(content, 'home.why_title', 'Why Secure Cleaning Aus?')

  return (
    <>
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden text-white py-24 md:py-32"
        style={{ backgroundColor: '#1a2744' }}
      >
        {/* Background gradient overlay */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              'radial-gradient(ellipse at 70% 50%, rgba(34,197,94,0.3) 0%, transparent 60%)',
          }}
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mb-6"
              style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Melbourne &amp; Sydney&apos;s Owner-Operator Cleaning Network
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              {heroTitle}
            </h1>

            <p className="text-xl text-gray-300 mb-10 max-w-2xl leading-relaxed">
              {heroSubtitle}
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/quote"
                className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-bold text-lg text-white transition-all duration-200 hover:opacity-90 hover:-translate-y-0.5"
                style={{ backgroundColor: '#22c55e' }}
              >
                {primaryCtaLabel}
              </Link>
              <Link
                href="/services"
                className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-semibold text-lg border-2 border-white/30 text-white hover:bg-white/10 transition-all duration-200"
              >
                {secondaryCtaLabel}
              </Link>
            </div>

            <div className="flex flex-wrap gap-6 mt-10 text-sm text-gray-400">
              <span className="flex items-center gap-2">
                <span className="text-green-400">✓</span> No lock-in contracts
              </span>
              <span className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Fully insured &amp; verified
              </span>
              <span className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Instant online pricing
              </span>
              <span className="flex items-center gap-2">
                <span className="text-green-400">✓</span> Direct operator contact
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#1a2744' }}>
              How It Works
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From quote to clean in three simple steps. No phone tag, no waiting.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step) => (
              <div key={step.step} className="relative bg-white rounded-xl p-8 shadow-sm border border-gray-100">
                <div
                  className="text-5xl font-black mb-4"
                  style={{ color: 'rgba(34,197,94,0.2)' }}
                >
                  {step.step}
                </div>
                <h3 className="text-xl font-bold mb-3" style={{ color: '#1a2744' }}>
                  {step.title}
                </h3>
                <p className="text-gray-600 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link
              href="/quote"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-bold text-white transition-all duration-200 hover:opacity-90"
              style={{ backgroundColor: '#1a2744' }}
            >
              Start Your Quote
            </Link>
          </div>
        </div>
      </section>

      {/* ── WHY SECURE CLEANING ───────────────────────────────────────────── */}
      <section className="py-20 text-white" style={{ backgroundColor: '#1a2744' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {whyTitle}
            </h2>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              The Owner-Operator model is fundamentally different — and better.
              Here&apos;s why businesses across Melbourne and Sydney choose us.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {ownerOperatorBenefits.map((benefit) => (
              <div
                key={benefit.title}
                className="rounded-xl p-6 border transition-all duration-200 hover:border-green-500/50"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}
              >
                <div className="text-3xl mb-4">{benefit.icon}</div>
                <h3 className="text-lg font-bold mb-2">{benefit.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{benefit.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PREMISES TYPES ────────────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#1a2744' }}>
              Premises We Clean
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From boutique offices to large industrial facilities — we have
              Owner-Operators specialised in every type of commercial premises.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {premisesTypes.map((type) => (
              <Link
                key={type.name}
                href={`/services#${type.name.toLowerCase()}`}
                className="flex flex-col items-center text-center p-6 rounded-xl border border-gray-100 hover:border-green-300 hover:shadow-md transition-all duration-200 group"
              >
                <div className="text-4xl mb-3">{type.icon}</div>
                <h3 className="font-semibold text-gray-900 group-hover:text-green-600 transition-colors">
                  {type.name}
                </h3>
                <p className="text-xs text-gray-500 mt-1">{type.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── CITIES ────────────────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#1a2744' }}>
              Where We Operate
            </h2>
            <p className="text-lg text-gray-600">
              Melbourne and Sydney — with more cities coming soon.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            <Link
              href="/cities/melbourne"
              className="relative rounded-2xl overflow-hidden text-white p-8 group transition-transform hover:-translate-y-1"
              style={{ backgroundColor: '#1a2744' }}
            >
              <div
                className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity"
                style={{ background: 'radial-gradient(circle at 30% 70%, #22c55e 0%, transparent 60%)' }}
              />
              <div className="relative">
                <div className="text-5xl mb-4">🏙️</div>
                <h3 className="text-2xl font-bold mb-2">Melbourne</h3>
                <p className="text-gray-300 text-sm mb-4">
                  CBD, inner suburbs, and greater metro area. Owner-Operators across all Melbourne zones.
                </p>
                <span className="text-green-400 font-semibold text-sm">
                  View Melbourne →
                </span>
              </div>
            </Link>

            <Link
              href="/cities/sydney"
              className="relative rounded-2xl overflow-hidden text-white p-8 group transition-transform hover:-translate-y-1"
              style={{ backgroundColor: '#1a2744' }}
            >
              <div
                className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity"
                style={{ background: 'radial-gradient(circle at 70% 30%, #22c55e 0%, transparent 60%)' }}
              />
              <div className="relative">
                <div className="text-5xl mb-4">🌉</div>
                <h3 className="text-2xl font-bold mb-2">Sydney</h3>
                <p className="text-gray-300 text-sm mb-4">
                  CBD, North Shore, Western Sydney, and surrounding areas. Fully covered.
                </p>
                <span className="text-green-400 font-semibold text-sm">
                  View Sydney →
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ──────────────────────────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#1a2744' }}>
              What Our Clients Say
            </h2>
            <p className="text-lg text-gray-600">
              Don&apos;t take our word for it.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((t) => (
              <div key={t.name} className="bg-gray-50 rounded-xl p-6 border border-gray-100">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <span key={i} className="text-yellow-400 text-lg">★</span>
                  ))}
                </div>
                <p className="text-gray-700 leading-relaxed mb-6 italic">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div>
                  <p className="font-semibold text-gray-900">{t.name}</p>
                  <p className="text-sm text-gray-500">
                    {t.business} · {t.city}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ────────────────────────────────────────────────────── */}
      <section
        className="py-20 text-white text-center"
        style={{ backgroundColor: '#22c55e' }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready for a cleaner, better workplace?
          </h2>
          <p className="text-xl mb-10 text-green-50">
            Get your instant quote in under 2 minutes. No commitment required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/quote"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-bold text-lg text-white bg-navy-800 hover:bg-navy-900 transition-all duration-200"
              style={{ backgroundColor: '#1a2744' }}
            >
              Get an Instant Quote
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-semibold text-lg border-2 border-white text-white hover:bg-white hover:text-green-600 transition-all duration-200"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
