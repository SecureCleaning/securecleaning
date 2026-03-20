import type { Metadata } from 'next'
import Link from 'next/link'
import { getContentValue, getPublicContentMap } from '@/lib/content'

export const metadata: Metadata = {
  title: 'About Secure Cleaning Aus — Secure Contracts Pty Ltd',
  description:
    'Learn about Secure Contracts Pty Ltd and the Owner-Operator model that delivers better commercial cleaning outcomes for Melbourne and Sydney businesses.',
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
      <section className="py-16 text-white" style={{ backgroundColor: '#1a2744' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{getContentValue(content, 'about.hero_title', 'About Secure Cleaning Aus')}</h1>
          <p className="text-xl text-gray-300">
            {getContentValue(content, 'about.hero_subtitle', 'A better way to clean your business. Built on the Owner-Operator model.')}
          </p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 prose prose-gray max-w-none">
          <h2 style={{ color: '#1a2744' }}>{getContentValue(content, 'about.section_1_title', 'Who We Are')}</h2>
          <p>{getContentValue(content, 'about.intro', 'Secure Cleaning Aus is a trading name of Secure Contracts Pty Ltd, an Australian company focused on delivering professional commercial cleaning services to businesses in Melbourne and Sydney through our Owner-Operator network.')}</p>
          <p>{getContentValue(content, 'about.section_1_paragraph_2', 'We started with a simple observation: the commercial cleaning industry was dominated by large franchise operators who hired casual, low-paid workers with minimal investment in quality or consistency. Clients were locked into long contracts, left dealing with call centres, and had no direct relationship with the person cleaning their premises.')}</p>
          <p>{getContentValue(content, 'about.section_1_paragraph_3', 'We believed there was a better way.')}</p>

          <h2 style={{ color: '#1a2744' }}>{getContentValue(content, 'about.section_2_title', 'The Owner-Operator Model')}</h2>
          <p>{getContentValue(content, 'about.section_2_intro', 'Every Secure Cleaning Aus operator is an independent business owner who has purchased a territory and invested in their own business. This creates fundamentally different incentives:')}</p>
          <ul>
            {modelPoints.map((point) => {
              const [lead, ...rest] = point.split(': ')
              return (
                <li key={point}><strong>{lead}:</strong> {rest.join(': ')}</li>
              )
            })}
          </ul>

          <h2 style={{ color: '#1a2744' }}>{getContentValue(content, 'about.section_3_title', 'Verification & Standards')}</h2>
          <p>{getContentValue(content, 'about.section_3_intro', 'Every Secure Cleaning Aus operator must pass our verification process before taking on clients:')}</p>
          <ul>
            {standards.map((standard) => (
              <li key={standard}>{standard}</li>
            ))}
          </ul>

          <h2 style={{ color: '#1a2744' }}>{getContentValue(content, 'about.section_4_title', 'Our Coverage')}</h2>
          <p>{getContentValue(content, 'about.section_4_body', 'We currently operate in Melbourne and Sydney, with plans to expand to other major Australian cities. Our operators cover metro and surrounding areas in both cities.')}</p>

          <h2 style={{ color: '#1a2744' }}>{getContentValue(content, 'about.section_5_title', 'No Lock-In Contracts')}</h2>
          <p>{getContentValue(content, 'about.section_5_body', "We don't believe in trapping clients. If the service isn't working for you, you can cancel with reasonable notice. We believe the only valid reason to stay is that the service is genuinely excellent — and that's what we're here to deliver.")}</p>
        </div>
      </section>

      <section className="py-12 bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#1a2744' }}>{getContentValue(content, 'about.bottom_cta_title', 'Ready to experience the difference?')}</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/quote"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-bold text-white transition-all"
              style={{ backgroundColor: '#22c55e' }}>
              {getContentValue(content, 'about.bottom_cta_primary_label', 'Get an Instant Quote')}
            </Link>
            <Link href="/contact"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-semibold border-2 border-gray-300 text-gray-700 hover:border-gray-400 transition-all">
              {getContentValue(content, 'about.bottom_cta_secondary_label', 'Contact Us')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
