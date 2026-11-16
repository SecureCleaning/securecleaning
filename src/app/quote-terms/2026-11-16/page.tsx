import type { Metadata } from 'next'
import terms from '@/content/quote-service-terms-2026-11-16.json'
import { QUOTE_TERMS_PDF_PATH } from '@/lib/quoteTerms'

export const metadata: Metadata = { title: 'Quote & Service Terms | Secure Cleaning' }

export default function QuoteTermsPage() {
  return <main className="bg-gray-50 px-4 py-10"><article className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm sm:p-10">
    <p className="font-semibold text-teal-700">Secure Cleaning</p>
    <h1 className="mt-2 text-3xl font-bold text-[#1a2744]">{terms.title}</h1>
    <p className="mt-3 text-sm text-gray-600">Version 16 November 2026 · Quote validity: 30 days</p>
    <a href={QUOTE_TERMS_PDF_PATH} download className="mt-5 inline-block rounded-lg bg-teal-700 px-4 py-3 font-semibold text-white">Download terms PDF</a>
    <p className="mt-5 text-sm text-gray-600">Read these terms with your quote and Scope of Works. Existing agreed arrangements are not changed merely by viewing this page.</p>
    {terms.sections.map((section, index) => <section key={section.heading} className="mt-7">
      <h2 className="text-lg font-bold text-[#1a2744]">{index + 1}. {section.heading}</h2>
      {section.paragraphs.map(paragraph => <p key={paragraph} className="mt-3 text-sm leading-6 text-gray-700">{paragraph}</p>)}
    </section>)}
  </article></main>
}
