import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Available cleaning contracts | Secure Cleaning',
  robots: { index: false, follow: false, noarchive: true },
  referrer: 'no-referrer',
}

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return children
}
