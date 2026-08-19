import type { Metadata } from 'next'
import Link from 'next/link'
import { getContentValue, getPublicContentMap } from '@/lib/content'

export const metadata: Metadata = {
  title: 'About Secure Cleaning Aus',
  description:
    'Learn about Secure Cleaning Aus and the Owner-Operator model that delivers better commercial cleaning outcomes for Melbourne and Sydney businesses.',
  alternates: { canonical: '/about' },
}

export default async function AboutPage() {
  const content = await getPublicContentMap()

  const modelPoints = [1, 2, 3, 4].map((item) =>
    getContentValue(content, `about.model_point_${item}`, [
      "Financial commitment: Our operators have real money at stake. They've purchased their territory and have a business to protect.",
      'Personal accountability: When you call about a concern, you call your operator directly — not a 1300 number.',
      'Long-term thinking: Owner-Operators build client relationships over years, not weeks.',
      "Professional pride: These aren't casuals. They're trained cleaning professionals who run their own business.",
    ][item - 1])
  )

  const standards = [1, 2, 3, 4, 5, 6].map((item) =>
    getContentValue(content, `about.standard_${item}`, [
      'National police check',
      'Public liability insurance verification',
      'Reference checks',
      'Skills assessment',
      'Site induction process for each new client',
      'Ongoing performance monitoring through client feedback',
    ][item - 1])
  )

  return (
    <div className="min-h-screen">
      <section className="py-18 md:py-20 text-white" style={{ backgroundColor: 'var(--brand-ink)' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-5">{getContentValue(content, 'about.hero_title', 'About Secure Cleaning Aus')}</h1>
          <p className="text-xl text-gray-200 leading-relaxed">
            {getContentValue(content, 'about.hero_subtitle', 'A better way to clean your business. Built on the Owner-Operator model.')}
          </p>
        </div>
      </section>

      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-10 md:space-y-12">
          <section className="space-y-5">
            <h2 className="text-3xl font-bold" style={{ color: 'var(--brand-ink)' }}>
              {getContentValue(content, 'about.section_1_title', 'Who We Are')}
            </h2>
            <div className="space-y-5 text-lg leading-8 text-gray-700">
              <p>{getContentValue(content, 'about.intro', 'Secure Cleaning Aus is focused on delivering professional commercial cleaning services to businesses in Melbourne and Sydney through our trusted Owner-Operator network.')}</p>
              <p>{getContentValue(content, 'about.section_1_paragraph_2', 'We started with a simple observation: the commercial cleaning industry was dominated by large franchise operators who hired casual, low-paid workers with minimal investment in quality or consistency. Clients were locked into long contracts, left dealing with call centres, and had no direct relationship with the person cleaning their premises.')}</p>
              <p>{getContentValue(content, 'about.section_1_paragraph_3', 'We believed there was a better way.')}</p>
            </div>
          </section>

          <section className="space-y-5 rounded-3xl border border-gray-100 bg-gray-50 p-8 md:p-10">
            <h2 className="text-3xl font-bold" style={{ color: 'var(--brand-ink)' }}>
              {getContentValue(content, 'about.section_2_title', 'The Owner-Operator Model')}
            </h2>
            <p className="text-lg leading-8 text-gray-700">
              {getContentValue(content, 'about.section_2_intro', 'Every Secure Cleaning Aus operator is an independent business owner who has purchased a territory and invested in their own business. This creates fundamentally different incentives:')}
            </p>
            <ul className="space-y-4">
              {modelPoints.map((point) => {
                const [lead, ...rest] = point.split(': ')
                return (
                  <li key={point} className="rounded-2xl bg-white px-5 py-4 text-gray-700 leading-7 shadow-sm">
                    <strong style={{ color: 'var(--brand-ink)' }}>{lead}:</strong> {rest.join(': ')}
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="space-y-5">
            <h2 className="text-3xl font-bold" style={{ color: 'var(--brand-ink)' }}>
              {getContentValue(content, 'about.section_3_title', 'Verification & Standards')}
            </h2>
            <p className="text-lg leading-8 text-gray-700">
              {getContentValue(content, 'about.section_3_intro', 'Every Secure Cleaning Aus operator must pass our verification process before taking on clients:')}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {standards.map((standard) => (
                <div key={standard} className="rounded-2xl border border-gray-200 bg-white px-5 py-4 text-gray-700 shadow-sm">
                  {standard}
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--brand-ink)' }}>
                {getContentValue(content, 'about.section_4_title', 'Our Coverage')}
              </h2>
              <p className="text-lg leading-8 text-gray-700">
                {getContentValue(content, 'about.section_4_body', 'We currently operate in Melbourne and Sydney, with plans to expand to other major Australian cities. Our operators cover metro and surrounding areas in both cities.')}
              </p>
            </div>

            <div className="rounded-3xl border border-gray-100 bg-white p-8 shadow-sm">
              <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--brand-ink)' }}>
                {getContentValue(content, 'about.section_5_title', 'No Lock-In Contracts')}
              </h2>
              <p className="text-lg leading-8 text-gray-700">
                {getContentValue(content, 'about.section_5_body', "We don't believe in trapping clients. If the service isn't working for you, you can cancel with reasonable notice. We believe the only valid reason to stay is that the service is genuinely excellent — and that's what we're here to deliver.")}
              </p>
            </div>
          </section>
        </div>
      </section>

      <section className="py-12 bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--brand-ink)' }}>{getContentValue(content, 'about.bottom_cta_title', 'Ready to experience the difference?')}</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/quote"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-bold transition-all"
              style={{ backgroundColor: 'var(--brand-gold)', color: 'var(--brand-ink)' }}>
              {getContentValue(content, 'about.bottom_cta_primary_label', 'Get an Instant Quote')}
            </Link>
            <Link href="/contact"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-semibold border-2 transition-all"
              style={{ borderColor: 'var(--brand-teal)', color: 'var(--brand-teal)' }}>
              {getContentValue(content, 'about.bottom_cta_secondary_label', 'Contact Us')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
