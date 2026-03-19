import Link from 'next/link'

const serviceLinks = [
  { href: '/services#office', label: 'Office Cleaning' },
  { href: '/services#medical', label: 'Medical Cleaning' },
  { href: '/services#childcare', label: 'Childcare Cleaning' },
  { href: '/services#industrial', label: 'Industrial Cleaning' },
  { href: '/services#retail', label: 'Retail Cleaning' },
  { href: '/services#gym', label: 'Gym Cleaning' },
]

const cityLinks = [
  { href: '/cities/melbourne', label: 'Melbourne' },
  { href: '/cities/sydney', label: 'Sydney' },
]

const companyLinks = [
  { href: '/about', label: 'About Us' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
  { href: '/quote', label: 'Get a Quote' },
  { href: '/booking', label: 'Book a Clean' },
]

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer style={{ backgroundColor: '#1a2744' }} className="text-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand column */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-navy-800 font-black bg-white text-sm">
                SC
              </div>
              <span className="font-bold text-lg">Secure Cleaning Aus</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-6">
              Professional commercial cleaning in Melbourne and Sydney.
              Verified Owner-Operators. Flexible frequencies. No lock-in contracts.
            </p>
            <div className="text-sm text-gray-400 space-y-1">
              <p>📧 <a href="mailto:info@securecleaning.au" className="hover:text-white transition-colors">info@securecleaning.au</a></p>
              <p>📍 Melbourne &amp; Sydney, Australia</p>
              <p className="text-xs mt-3 text-gray-500">ABN: TBC</p>
            </div>
          </div>

          {/* Services */}
          <div>
            <h3 className="font-semibold text-white mb-4">Services</h3>
            <ul className="space-y-2">
              {serviceLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Cities */}
          <div>
            <h3 className="font-semibold text-white mb-4">Cities</h3>
            <ul className="space-y-2">
              {cityLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            <h3 className="font-semibold text-white mb-4 mt-8">Company</h3>
            <ul className="space-y-2">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA column */}
          <div>
            <h3 className="font-semibold text-white mb-4">Get Started</h3>
            <p className="text-gray-400 text-sm mb-4">
              Ready for a cleaner workplace? Get an instant quote in under 2 minutes.
            </p>
            <Link
              href="/quote"
              className="inline-flex items-center px-5 py-2.5 rounded-lg font-semibold text-sm text-white transition-all hover:opacity-90"
              style={{ backgroundColor: '#22c55e' }}
            >
              Get a Quote →
            </Link>

            <div className="mt-8 p-4 rounded-lg border border-gray-700 text-sm">
              <p className="text-gray-300 font-medium mb-1">🤖 Chat with Max</p>
              <p className="text-gray-500 text-xs">
                Our AI assistant can answer questions about services, pricing, and more — 24/7.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gray-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <p>© {year} Secure Contracts Pty Ltd. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-gray-300 transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-gray-300 transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
