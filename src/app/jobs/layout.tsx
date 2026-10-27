import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Available cleaning contracts',
  description: 'View commercial cleaning opportunities available through Secure Cleaning.',
  openGraph: {
    title: 'Available cleaning contracts | Secure Cleaning',
    description: 'View commercial cleaning opportunities available through Secure Cleaning.',
    images: [
      {
        url: '/secure-cleaning-jobs-social-card-v2.png',
        width: 1200,
        height: 630,
        alt: 'Secure Cleaning available cleaning contracts',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Available cleaning contracts | Secure Cleaning',
    description: 'View commercial cleaning opportunities available through Secure Cleaning.',
    images: ['/secure-cleaning-jobs-social-card-v2.png'],
  },
  robots: { index: false, follow: false, noarchive: true },
  referrer: 'no-referrer',
}

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return children
}
