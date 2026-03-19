import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About Secure Cleaning Aus — Secure Contracts Pty Ltd',
  description:
    'Learn about Secure Contracts Pty Ltd and the Owner-Operator model that delivers better commercial cleaning outcomes for Melbourne and Sydney businesses.',
}

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="py-16 text-white" style={{ backgroundColor: '#1a2744' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">About Secure Cleaning Aus</h1>
          <p className="text-xl text-gray-300">
            A better way to clean your business. Built on the Owner-Operator model.
          </p>
        </div>
      </section>

      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 prose prose-gray max-w-none">
          <h2 style={{ color: '#1a2744' }}>Who We Are</h2>
          <p>
            Secure Cleaning Aus is a trading name of <strong>Secure Contracts Pty Ltd</strong>, an
            Australian company focused on delivering professional commercial cleaning services to
            businesses in Melbourne and Sydney through our Owner-Operator network.
          </p>
          <p>
            We started with a simple observation: the commercial cleaning industry was dominated
            by large franchise operators who hired casual, low-paid workers with minimal investment
            in quality or consistency. Clients were locked into long contracts, left dealing with
            call centres, and had no direct relationship with the person cleaning their premises.
          </p>
          <p>
            We believed there was a better way.
          </p>

          <h2 style={{ color: '#1a2744' }}>The Owner-Operator Model</h2>
          <p>
            Every Secure Cleaning Aus operator is an independent business owner who has purchased a
            territory and invested in their own business. This creates fundamentally different
            incentives:
          </p>
          <ul>
            <li><strong>Financial commitment:</strong> Our operators have real money at stake. They&apos;ve purchased their territory and have a business to protect.</li>
            <li><strong>Personal accountability:</strong> When you call about a concern, you call your operator directly — not a 1300 number.</li>
            <li><strong>Long-term thinking:</strong> Owner-Operators build client relationships over years, not weeks.</li>
            <li><strong>Professional pride:</strong> These aren&apos;t casuals. They&apos;re trained cleaning professionals who run their own business.</li>
          </ul>

          <h2 style={{ color: '#1a2744' }}>Verification & Standards</h2>
          <p>
            Every Secure Cleaning Aus operator must pass our verification process before taking on clients:
          </p>
          <ul>
            <li>National police check</li>
            <li>Public liability insurance verification</li>
            <li>Reference checks</li>
            <li>Skills assessment</li>
            <li>Site induction process for each new client</li>
            <li>Ongoing performance monitoring through client feedback</li>
          </ul>

          <h2 style={{ color: '#1a2744' }}>Our Coverage</h2>
          <p>
            We currently operate in <strong>Melbourne</strong> and <strong>Sydney</strong>, with
            plans to expand to other major Australian cities. Our operators cover metro and
            surrounding areas in both cities.
          </p>

          <h2 style={{ color: '#1a2744' }}>No Lock-In Contracts</h2>
          <p>
            We don&apos;t believe in trapping clients. If the service isn&apos;t working for you,
            you can cancel with reasonable notice. We believe the only valid reason to stay is
            that the service is genuinely excellent — and that&apos;s what we&apos;re here to deliver.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 bg-gray-50">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-2xl font-bold mb-4" style={{ color: '#1a2744' }}>Ready to experience the difference?</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/quote"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-bold text-white transition-all"
              style={{ backgroundColor: '#22c55e' }}>
              Get an Instant Quote
            </Link>
            <Link href="/contact"
              className="inline-flex items-center justify-center px-8 py-4 rounded-lg font-semibold border-2 border-gray-300 text-gray-700 hover:border-gray-400 transition-all">
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
