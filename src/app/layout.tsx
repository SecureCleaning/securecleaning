import type { Metadata } from 'next'
import './globals.css'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import ChatWidget from '@/components/chat/ChatWidget'
import RobofyWidget from '@/components/chat/RobofyWidget'
import { getCanonicalSiteUrl } from '@/lib/siteUrl'

const siteUrl = getCanonicalSiteUrl()

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: 'Secure Cleaning — Professional Commercial Cleaning in Melbourne & Sydney',
    template: '%s | Secure Cleaning',
  },
  description:
    'Professional commercial cleaning services in Melbourne and Sydney. Verified Owner-Operators, flexible frequencies, no lock-in contracts. Get an instant quote online.',
  keywords: [
    'commercial cleaning Melbourne',
    'commercial cleaning Sydney',
    'office cleaning',
    'medical cleaning',
    'childcare cleaning',
    'function centre cleaning',
    'sports facilities cleaning',
    'Owner-Operator cleaning',
  ],
  authors: [{ name: 'Secure Cleaning' }],
  icons: {
    icon: '/secure-cleaning-logo-aug26.png',
    shortcut: '/secure-cleaning-logo-aug26.png',
    apple: '/secure-cleaning-logo-aug26.png',
  },
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Secure Cleaning — Professional Commercial Cleaning',
    description: 'Verified Owner-Operators. Flexible frequencies. No lock-in. Melbourne & Sydney.',
    url: siteUrl,
    siteName: 'Secure Cleaning',
    images: [
      {
        url: '/secure-cleaning-logo-aug26.png',
        width: 993,
        height: 662,
        alt: 'Secure Cleaning',
      },
    ],
    locale: 'en_AU',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en-AU">
      <body className="flex flex-col min-h-screen">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        {process.env.NEXT_PUBLIC_ROBOFY_PID && process.env.NEXT_PUBLIC_ROBOFY_CID ? <RobofyWidget /> : <ChatWidget />}
      </body>
    </html>
  )
}
