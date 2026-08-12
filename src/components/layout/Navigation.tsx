'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'

const navLinks = [
  { href: '/services', label: 'Services' },
  { href: '/cities', label: 'Cities' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
]

interface NavigationProps {
  mobile?: boolean
  onClose?: () => void
}

export default function Navigation({ mobile = false, onClose }: NavigationProps) {
  const pathname = usePathname()

  if (mobile) {
    return (
      <nav className="flex flex-col gap-1 py-4">
        {navLinks.map((link) => {
          const active = pathname === link.href || pathname.startsWith(link.href + '/')
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className={clsx(
                'px-4 py-3 rounded-lg text-base font-medium transition-colors',
                active
                  ? 'text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              )}
              style={active ? { backgroundColor: 'var(--brand-teal)' } : undefined}
            >
              {link.label}
            </Link>
          )
        })}
        <Link
          href="/quote"
          onClick={onClose}
          className="mt-2 mx-4 px-6 py-3 rounded-lg font-bold text-center transition-all"
          style={{ backgroundColor: 'var(--brand-gold)', color: 'var(--brand-ink)' }}
        >
          Get a Quote
        </Link>
      </nav>
    )
  }

  return (
    <nav className="hidden md:flex items-center gap-2">
      {navLinks.map((link) => {
        const active = pathname === link.href || pathname.startsWith(link.href + '/')
        return (
          <Link
            key={link.href}
            href={link.href}
            className={clsx(
              'px-4 py-2.5 rounded-xl text-[15px] font-semibold transition-colors',
              active
                ? 'text-white'
                : 'text-gray-700 hover:text-navy-800 hover:bg-gray-100'
            )}
            style={active ? { backgroundColor: 'var(--brand-teal)' } : undefined}
          >
            {link.label}
          </Link>
        )
      })}
    </nav>
  )
}
