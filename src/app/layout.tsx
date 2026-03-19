import type { Metadata } from 'next'
import './globals.css'
import Header from '@/components/layout/Header'
import Footer from '@/components/layout/Footer'
import ChatWidget from '@/components/chat/ChatWidget'

export const metadata: Metadata = {
  title: {
    default: 'Secure Cleaning Aus — Professional Commercial Cleaning in Melbourne & Sydney',
    template: '%s | Secure Cleaning Aus',
  },
  description:
    'Professional commercial cleaning services in Melbourne and Sydney. Verified Owner-Operators, flexible frequencies, no lock-in contracts. Get an instant quote online.',
  keywords: [
    'commercial cleaning Melbourne',
    'commercial cleaning Sydney',
    'office cleaning',
    'industrial cleaning',
    'medical cleaning',
    'childcare cleaning',
    'Owner-Operator cleaning',
  ],
  authors: [{ name: 'Secure Contracts Pty Ltd' }],
  openGraph: {
    title: 'Secure Cleaning Aus — Professional Commercial Cleaning',
    description: 'Verified Owner-Operators. Flexible frequencies. No lock-in. Melbourne & Sydney.',
    url: 'https://securecleaning.com.au',
    siteName: 'Secure Cleaning Aus',
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
        <ChatWidget />
      </body>
    </html>
  )
}
