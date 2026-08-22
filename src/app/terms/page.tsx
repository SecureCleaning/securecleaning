import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service | Secure Cleaning Aus',
  description: 'Website and service enquiry terms for Secure Cleaning Aus.',
  alternates: { canonical: '/terms' },
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-10 sm:py-14">
      <article className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Secure Cleaning Aus</p>
        <h1 className="mt-2 text-3xl font-bold text-[#1a2744]">Terms of Service</h1>
        <p className="mt-3 text-sm text-gray-500">Last updated 22 August 2026</p>
        <div className="mt-8 space-y-6 text-sm leading-6 text-gray-700">
          <section><h2 className="text-lg font-semibold text-gray-900">Website estimates</h2><p className="mt-2">Online prices and scopes are indicative until premises, access and service requirements are confirmed through the inspection and quotation process.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900">Acceptable use</h2><p className="mt-2">Use this website only for genuine, authorised business enquiries. Do not submit automated, abusive, misleading or unlawful requests, probe private areas, or use information obtained from the site for resale or competing solicitation.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900">Service arrangements</h2><p className="mt-2">A quote, scope or inspection request does not create a service contract. Final arrangements are confirmed separately after review of the premises and requirements.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900">Contact</h2><p className="mt-2">Questions about these terms can be sent to <a className="text-teal-700 underline" href="mailto:info@securecleaning.com.au">info@securecleaning.com.au</a>.</p></section>
        </div>
      </article>
    </main>
  )
}
