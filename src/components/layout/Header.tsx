'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import Navigation from './Navigation'

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  function handleLogoClick() {
    if (pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <header className="site-header sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 md:h-24">
          {/* Logo */}
          <Link
            href="/"
            aria-label="Secure Cleaning Aus home"
            title="Go to homepage"
            onClick={handleLogoClick}
            className="relative z-10 inline-flex items-center shrink-0"
          >
            <Image
              src="/secure-cleaning-logo-aug26.png"
              alt="Secure Cleaning Aus"
              width={993}
              height={662}
              className="h-16 w-auto md:h-20"
              priority
            />
          </Link>

          {/* Desktop Navigation */}
          <Navigation />

          {/* CTA + Mobile Toggle */}
          <div className="flex items-center gap-3">
            <Link
              href="/quote"
              className="hidden md:inline-flex items-center px-6 py-3 rounded-xl font-semibold text-base transition-all hover:opacity-90"
              style={{ backgroundColor: 'var(--brand-gold)', color: 'var(--brand-ink)' }}
            >
              Get a Quote
            </Link>

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white shadow-lg">
          <div className="max-w-6xl mx-auto px-4">
            <Navigation mobile onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </header>
  )
}
