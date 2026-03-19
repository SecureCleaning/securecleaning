import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Contact Secure Cleaning Aus',
  description:
    'Get in touch with Secure Cleaning Aus. We service Melbourne and Sydney businesses.',
}

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4" style={{ color: '#1a2744' }}>Contact Us</h1>
          <p className="text-lg text-gray-600">
            Prefer to talk? We&apos;re here to help. Or skip the wait and get an instant quote online.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Contact info */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
              <h2 className="text-xl font-bold mb-6" style={{ color: '#1a2744' }}>Get in Touch</h2>
              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <span className="text-2xl">📧</span>
                  <div>
                    <p className="font-semibold text-gray-900">Email</p>
                    <a href="mailto:info@securecleaning.au"
                      className="text-green-600 hover:underline text-sm">
                      info@securecleaning.au
                    </a>
                    <p className="text-gray-500 text-xs mt-0.5">We aim to respond within 1 business day</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <span className="text-2xl">📍</span>
                  <div>
                    <p className="font-semibold text-gray-900">Service Areas</p>
                    <p className="text-gray-600 text-sm">Melbourne & Sydney, Australia</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <span className="text-2xl">🕐</span>
                  <div>
                    <p className="font-semibold text-gray-900">Business Hours</p>
                    <p className="text-gray-600 text-sm">Monday – Friday, 8am – 6pm AEST</p>
                    <p className="text-gray-500 text-xs mt-0.5">AI chat available 24/7</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
              <h2 className="text-xl font-bold mb-3" style={{ color: '#1a2744' }}>Quick Links</h2>
              <div className="space-y-2">
                {[
                  { href: '/quote', label: '⚡ Get an instant quote online' },
                  { href: '/booking', label: '📅 Book a cleaning service' },
                  { href: '/faq', label: '❓ View frequently asked questions' },
                  { href: '/services', label: '🧹 Browse our services' },
                ].map((l) => (
                  <Link key={l.href} href={l.href}
                    className="block text-sm text-gray-700 hover:text-green-600 py-1.5 transition-colors">
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Simple contact form (static — to be wired up) */}
          <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
            <h2 className="text-xl font-bold mb-6" style={{ color: '#1a2744' }}>Send a Message</h2>
            <form className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" placeholder="Your name"
                  className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" placeholder="you@example.com"
                  className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input type="text" placeholder="How can we help?"
                  className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea rows={5} placeholder="Tell us about your needs…"
                  className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm resize-none" />
              </div>
              <p className="text-xs text-gray-500">
                Note: This form is a placeholder. For fastest response, email us directly or use the live quote tool.
              </p>
              <button type="button" disabled
                className="w-full py-3 rounded-lg font-semibold text-white opacity-50 cursor-not-allowed"
                style={{ backgroundColor: '#22c55e' }}>
                Send Message (Coming Soon)
              </button>
            </form>
          </div>
        </div>

        {/* Chat CTA */}
        <div className="mt-8 p-6 rounded-2xl text-center" style={{ backgroundColor: '#1a2744' }}>
          <p className="text-white font-semibold mb-1">Need an answer right now? 🤖</p>
          <p className="text-gray-400 text-sm">
            Chat with <strong className="text-green-400">Max</strong>, our AI assistant, for instant answers about services, pricing, and more — available 24/7.
          </p>
        </div>
      </div>
    </div>
  )
}
