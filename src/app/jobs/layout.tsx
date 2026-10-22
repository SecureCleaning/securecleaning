import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Available cleaning contracts',
  description: 'View commercial cleaning opportunities available through Secure Cleaning.',
  openGraph: {
    title: 'Available cleaning contracts | Secure Cleaning',
    description: 'View commercial cleaning opportunities available through Secure Cleaning.',
    images: [
      {
        url: '/jobs/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Secure Cleaning available cleaning contracts',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Available cleaning contracts | Secure Cleaning',
    description: 'View commercial cleaning opportunities available through Secure Cleaning.',
    images: ['/jobs/opengraph-image'],
  },
  robots: { index: false, follow: false, noarchive: true },
  referrer: 'no-referrer',
}

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return children
}
