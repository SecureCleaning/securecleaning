import Link from 'next/link'
import Image from 'next/image'
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
  { name: 'Function Centres', icon: '🎟️', desc: 'Events & venues' },
  { name: 'Retail', icon: '🛍️', desc: 'Shops, showrooms & boutiques' },
  { name: 'Gym', icon: '💪', desc: 'Gyms, studios & leisure' },
  { name: 'Sports Facilities', icon: '⚽', desc: 'Clubs, courts & recreation' },
  { name: 'Other', icon: '🔧', desc: 'Bespoke commercial premises' },
]

const benefitIcons = ['🔓', '👔', '💼', '✅', '🏗️', '📱']

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
    'Verified Owner-Operators. Transparent pricing. No lock-in contracts. Start with an instant remote quote or request a site inspection today.'
  )
  const heroBadge = getContentValue(
    content,
    'home.hero_badge',
    "Melbourne & Sydney's Owner-Operator Cleaning Network"
  )
  const primaryCtaLabel = getContentValue(content, 'home.cta_primary_label', 'Get an Instant Quote →')
  const secondaryCtaLabel = getContentValue(content, 'home.cta_secondary_label', 'View Services')
  const trustItems = [1, 2, 3, 4].map((item) =>
    getContentValue(content, `home.trust_${item}`, [
      'No lock-in contracts',
      'Fully insured & verified',
      'Instant online pricing',
      'Direct operator contact',
    ][item - 1])
  )
  const steps = [1, 2, 3].map((step) => ({
    step: `0${step}`,
    title: getContentValue(content, `home.step_${step}_title`, [
      'Get an Instant Quote',
      'Book a Site Inspection',
      'Approve and Commence',
    ][step - 1]),
    desc: getContentValue(content, `home.step_${step}_desc`, [
      'Answer a few questions about your premises and schedule. Our pricing engine gives you a transparent remote estimate in under 2 minutes — no waiting for a callback.',
      'Request a site inspection so we can confirm your areas, requirements, and the right Owner-Operator for your premises. Inspections are usually arranged within 48 hours.',
      "Once the inspection is complete, we confirm final pricing and, if you're happy to proceed, schedule commencement on your preferred timeline.",
    ][step - 1]),
  }))
  const benefits = benefitIcons.map((icon, index) => {
    const item = index + 1
    return {
      icon,
      title: getContentValue(content, `home.benefit_${item}_title`, [
        'No Lock-In Contracts',
        'Real Professionals',
        'Financially Committed',
        'Fully Verified',
        'Site Inducted',
        'Direct Contact',
      ][index]),
      desc: getContentValue(content, `home.benefit_${item}_desc`, [
        "Stay because you love the service — not because you're trapped. Cancel any time with reasonable notice.",
        'Every cleaner is a trained, experienced professional — not a day-hire casual.',
        'Owner-Operators have purchased their territory. They have skin in the game and a business to protect.',
        "Police checked, insured, and reference verified. We don't send strangers to your premises.",
        "Your operator learns your site's specific requirements, hazards, and preferences before they start.",
        "You get your operator's direct number. No call centres, no middlemen, no runaround.",
      ][index]),
    }
  })
  return (
    <>
      <section
        className="relative overflow-hidden text-white py-24 md:py-32"
        style={{ backgroundColor: 'var(--brand-ink)' }}
      >
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              'radial-gradient(ellipse at 70% 50%, rgba(201,155,52,0.22) 0%, transparent 60%)',
          }}
        />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium mb-6"
              style={{ backgroundColor: 'rgba(201,155,52,0.14)', color: 'var(--brand-gold)', border: '1px solid rgba(201,155,52,0.28)' }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--brand-gold)' }} />
              {heroBadge}
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
                style={{ backgroundColor: 'var(--brand-gold)', color: 'var(--brand-ink)' }}
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
              {trustItems.map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <span style={{ color: 'var(--brand-gold)' }}>✓</span> {item}
                </span>
              ))}
            </div>
          </div>

          <aside className="relative lg:justify-self-end">
            <div className="overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-2xl">
              <Image
                src="/commercial-cleaning-hero.png"
                alt="Commercial cleaning professional working in a modern office"
                width={1536}
                height={1024}
                className="aspect-[4/3] w-full object-cover"
                priority
              />
              <div className="grid grid-cols-2 border-t border-white/10 bg-white/95 text-sm text-gray-700">
                <div className="border-r border-gray-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Typical start</p>
                  <p className="mt-1 font-bold" style={{ color: 'var(--brand-ink)' }}>Quote in 2 minutes</p>
                </div>
                <div className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Service model</p>
                  <p className="mt-1 font-bold" style={{ color: 'var(--brand-ink)' }}>Direct operator care</p>
                </div>
              </div>
            </div>
          </aside>
          </div>
        </div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#1a2744' }}>
              {getContentValue(content, 'home.how_title', 'How It Works')}
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              {getContentValue(content, 'home.how_subtitle', 'From quote to clean in three simple steps. No phone tag, no waiting.')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step) => (
              <div key={step.step} className="relative bg-white rounded-xl p-8 shadow-sm border border-gray-100">
                <div
                  className="text-5xl font-black mb-4"
                  style={{ color: 'rgba(201,155,52,0.22)' }}
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
              style={{ backgroundColor: 'var(--brand-teal)' }}
            >
              {getContentValue(content, 'home.how_cta_label', 'Start Your Quote')}
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20 text-white" style={{ backgroundColor: 'var(--brand-teal)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {getContentValue(content, 'home.why_title', 'Why Secure Cleaning Aus?')}
            </h2>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              {getContentValue(content, 'home.why_subtitle', "The Owner-Operator model is fundamentally different — and better. Here's why businesses across Melbourne and Sydney choose us.")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((benefit) => (
              <div
                key={benefit.title}
                className="rounded-xl p-6 border transition-all duration-200"
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

      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#1a2744' }}>
              {getContentValue(content, 'home.premises_title', 'Premises We Clean')}
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              {getContentValue(content, 'home.premises_subtitle', 'From boutique offices to large industrial facilities — we have Owner-Operators specialised in every type of commercial premises.')}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {premisesTypes.map((type) => (
              <Link
                key={type.name}
                href={`/services#${type.name.toLowerCase()}`}
                className="flex flex-col items-center text-center p-6 rounded-xl border border-gray-100 hover:border-navy-300 hover:shadow-md transition-all duration-200 group"
              >
                <div className="text-4xl mb-3">{type.icon}</div>
                <h3 className="font-semibold text-gray-900 transition-colors group-hover:text-navy-700">
                  {type.name}
                </h3>
                <p className="text-xs text-gray-500 mt-1">{type.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: '#1a2744' }}>
              {getContentValue(content, 'home.cities_title', 'Where We Operate')}
            </h2>
            <p className="text-lg text-gray-600">
              {getContentValue(content, 'home.cities_subtitle', 'Melbourne and Sydney — with more cities coming soon.')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            <Link
              href="/cities/melbourne"
              className="relative rounded-2xl overflow-hidden text-white p-8 group transition-transform hover:-translate-y-1"
              style={{ backgroundColor: 'var(--brand-ink)' }}
            >
              <div
                className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity"
                style={{ background: 'radial-gradient(circle at 30% 70%, rgba(201,155,52,0.8) 0%, transparent 60%)' }}
              />
              <div className="relative">
                <div className="text-5xl mb-4">🏙️</div>
                <h3 className="text-2xl font-bold mb-2">Melbourne</h3>
                <p className="text-gray-300 text-sm mb-4">
                  {getContentValue(content, 'home.city_melbourne_desc', 'CBD, inner suburbs, and greater metro area. Owner-Operators across all Melbourne zones.')}
                </p>
                <span className="font-semibold text-sm" style={{ color: 'var(--brand-gold-soft)' }}>
                  {getContentValue(content, 'home.city_melbourne_label', 'View Melbourne →')}
                </span>
              </div>
            </Link>

            <Link
              href="/cities/sydney"
              className="relative rounded-2xl overflow-hidden text-white p-8 group transition-transform hover:-translate-y-1"
              style={{ backgroundColor: 'var(--brand-ink)' }}
            >
              <div
                className="absolute inset-0 opacity-20 group-hover:opacity-30 transition-opacity"
                style={{ background: 'radial-gradient(circle at 70% 30%, rgba(201,155,52,0.8) 0%, transparent 60%)' }}
              />
              <div className="relative">
                <div className="text-5xl mb-4">🌉</div>
                <h3 className="text-2xl font-bold mb-2">Sydney</h3>
                <p className="text-gray-300 text-sm mb-4">
                  {getContentValue(content, 'home.city_sydney_desc', 'CBD, North Shore, Western Sydney, and surrounding areas. Fully covered.')}
                </p>
                <span className="font-semibold text-sm" style={{ color: 'var(--brand-gold-soft)' }}>
                  {getContentValue(content, 'home.city_sydney_label', 'View Sydney →')}
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <section
        className="py-20 text-white text-center"
        style={{ backgroundColor: 'var(--brand-gold)' }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-4" style={{ color: 'var(--brand-ink)' }}>
            {getContentValue(content, 'home.bottom_cta_title', 'Ready for a cleaner, better workplace?')}
          </h2>
          <p className="text-xl mb-10" style={{ color: 'rgba(8,61,76,0.8)' }}>
            {getContentValue(content, 'home.bottom_cta_body', 'Get your instant quote in under 2 minutes. No commitment required.')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/quote"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-bold text-lg text-white transition-all duration-200"
              style={{ backgroundColor: 'var(--brand-ink)' }}
            >
              {getContentValue(content, 'home.bottom_cta_primary_label', 'Get an Instant Quote')}
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-semibold text-lg border-2 transition-all duration-200"
              style={{ borderColor: 'var(--brand-ink)', color: 'var(--brand-ink)' }}
            >
              {getContentValue(content, 'home.bottom_cta_secondary_label', 'Contact Us')}
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
