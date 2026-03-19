import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'FAQ — Frequently Asked Questions',
  description: 'Answers to common questions about Secure Cleaning Aus services, pricing, Owner-Operators, and how the booking process works.',
}

const faqs = [
  {
    q: 'What is an Owner-Operator?',
    a: 'An Owner-Operator is an independent business owner who has purchased a cleaning territory from Secure Contracts. Unlike casual workers employed by a franchise, Owner-Operators have invested their own money and have a genuine financial stake in the quality of their work. They run their cleaning business as their own enterprise.',
  },
  {
    q: 'Which cities do you service?',
    a: 'We currently operate in Melbourne and Sydney only. We cover metro and greater suburban areas in both cities. More cities will be added in the future.',
  },
  {
    q: 'How is pricing calculated?',
    a: 'Our pricing is based on your floor area, premises type, number of floors, cleaning frequency, time of day, and any add-ons you require. Use our instant online quote calculator to get a transparent price estimate in under 2 minutes — no waiting for a callback.',
  },
  {
    q: 'Is there a minimum contract period?',
    a: 'No. We don\'t believe in lock-in contracts. You stay because the service is excellent, not because you\'re trapped. We do ask for reasonable notice to cancel — typically 2 weeks for regular services.',
  },
  {
    q: 'What does the verification process involve?',
    a: 'Every Secure Cleaning Aus operator must complete a national police check, provide evidence of public liability insurance, pass reference checks, undergo a skills assessment, and complete a site induction process for each new client. We do not send unverified people to your premises.',
  },
  {
    q: 'How quickly can a clean be arranged?',
    a: 'For new clients, we aim to arrange a site inspection within 48 hours of your booking. From there, your first clean can typically be scheduled within 1–2 weeks, depending on your preferred start date and operator availability.',
  },
  {
    q: 'Will I always have the same cleaner?',
    a: 'Yes. You\'re matched with a specific Owner-Operator who is responsible for your premises. You get their direct contact details. This continuity is one of the core advantages of the Owner-Operator model.',
  },
  {
    q: 'What if I\'m not happy with the service?',
    a: 'Contact your operator directly — they have a strong incentive to address any concerns immediately because their business reputation depends on it. If issues persist, contact us and we\'ll intervene. In rare cases where an operator match isn\'t working, we\'ll rematch you.',
  },
  {
    q: 'Do you bring your own cleaning products and equipment?',
    a: 'Yes. Owner-Operators supply all equipment and cleaning products. If you require specific products (e.g. environmentally certified, fragrance-free), let us know in your booking notes and we\'ll match you with an operator who can accommodate this.',
  },
  {
    q: 'What add-on services are available?',
    a: 'Available add-ons include: bathroom/toilet servicing, kitchen and kitchenette cleaning, external window cleaning, consumables supply (toilet paper, soap, paper towels), and high-touch point disinfection. Carpet steam cleaning is quoted separately.',
  },
  {
    q: 'Can I get a spring clean or one-off deep clean?',
    a: 'Yes. Select "Once-Off" as your frequency, and check the Spring Clean option in our quote form. Spring cleans are priced higher than regular cleans (typically 2–3x the regular rate) to reflect the additional time and effort required.',
  },
  {
    q: 'Are your cleaners insured?',
    a: 'All Secure Cleaning Aus Owner-Operators are required to hold public liability insurance as a condition of operating. We verify this before any operator is permitted to take on clients.',
  },
  {
    q: 'Do you clean residential properties?',
    a: 'No. Secure Cleaning Aus focuses exclusively on commercial and business premises. We do not offer residential cleaning services.',
  },
  {
    q: 'Can you clean at night or on weekends?',
    a: 'Yes. We offer after-hours (post 6pm weekdays) and weekend cleaning. Note that after-hours and weekend cleaning attracts a surcharge (25% and 50% respectively), which is reflected in your quote.',
  },
]

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4" style={{ color: '#1a2744' }}>
            Frequently Asked Questions
          </h1>
          <p className="text-lg text-gray-600">
            Can&apos;t find your answer here? Chat with Max or{' '}
            <Link href="/contact" className="text-green-600 hover:underline">contact our team</Link>.
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <details key={i} className="group bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer list-none font-semibold text-gray-900 hover:text-green-700 transition-colors">
                <span>{faq.q}</span>
                <svg className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform shrink-0 ml-4"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-6 pb-6 text-gray-600 leading-relaxed border-t border-gray-50 pt-4">
                {faq.a}
              </div>
            </details>
          ))}
        </div>

        <div className="mt-12 p-8 rounded-2xl text-white text-center" style={{ backgroundColor: '#1a2744' }}>
          <h2 className="text-xl font-bold mb-3">Still have questions?</h2>
          <p className="text-gray-300 mb-6 text-sm">
            Get an instant estimate with our quote calculator, chat with Max 24/7, or reach out directly.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/quote"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg font-semibold text-white transition-all"
              style={{ backgroundColor: '#22c55e' }}>
              Get a Quote
            </Link>
            <Link href="/contact"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg font-semibold border-2 border-white/30 text-white hover:bg-white/10 transition-all">
              Contact Us
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
