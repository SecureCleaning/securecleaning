import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy | Secure Cleaning',
  description: 'How Secure Cleaning handles information submitted through the website.',
  alternates: { canonical: '/privacy' },
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-10 sm:py-14">
      <article className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Secure Cleaning</p>
        <h1 className="mt-2 text-3xl font-bold text-[#1a2744]">Privacy Policy</h1>
        <p className="mt-3 text-sm text-gray-500">Last updated 22 August 2026</p>
        <div className="mt-8 space-y-6 text-sm leading-6 text-gray-700">
          <section><h2 className="text-lg font-semibold text-gray-900">Information we collect</h2><p className="mt-2">We collect information you submit through quote, inspection, contact and other website forms, including contact details, premises information and service preferences.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900">How we use it</h2><p className="mt-2">We use submitted information to prepare estimates, arrange inspections, respond to enquiries, coordinate regional service work and maintain operational records.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900">Sharing and security</h2><p className="mt-2">Information is shared only with people and service providers who need it to handle your request. We use access controls, rate limits and server-side validation to reduce unauthorised access and misuse.</p></section>
          <section><h2 className="text-lg font-semibold text-gray-900">Contact</h2><p className="mt-2">For privacy questions or requests, email <a className="text-teal-700 underline" href="mailto:info@securecleaning.com.au">info@securecleaning.com.au</a>.</p></section>
        </div>
      </article>
    </main>
  )
}
