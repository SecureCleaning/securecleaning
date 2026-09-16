import type { Metadata } from 'next'
import { getPublicConsumablesCatalog } from '@/lib/consumables'

/* eslint-disable @next/next/no-img-element */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Consumables Pricing',
  description: 'Current Secure Cleaning washroom and workplace consumables pricing.',
  robots: { index: false, follow: false, noarchive: true },
}

function money(cents: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)
}

function dateLabel(value: string | null) {
  if (!value) return 'Recently updated'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Recently updated' : `Updated ${new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)}`
}

export default async function ConsumablesPage() {
  const catalog = await getPublicConsumablesCatalog()
  const categories = [...new Set(catalog.products.map((product) => product.category))]

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="bg-[#1a2744] py-12 text-white md:py-16">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-green-300">Secure Cleaning consumables</p>
          <h1 className="mt-3 text-4xl font-bold md:text-5xl">Washroom and workplace supplies</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-gray-200">Products your cleaner can arrange as part of your ongoing service.</p>
          <p className="mt-4 text-sm text-gray-300">{dateLabel(catalog.updatedAt)} · Prices {catalog.pricesExcludeGst ? 'exclude' : 'include'} GST</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 md:py-14">
        {catalog.products.length === 0 ? <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600">The consumables catalogue is being updated. Please contact your cleaner for current pricing.</div> : null}
        <div className="space-y-12">
          {categories.map((category) => {
            const products = catalog.products.filter((product) => product.category === category)
            return <section key={category} aria-labelledby={`category-${category.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>
              <h2 id={`category-${category.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`} className="mb-5 text-2xl font-bold text-gray-900">{category}</h2>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => <article key={product.id} className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex h-56 items-center justify-center bg-white p-5">
                    {product.imageUrl ? <img src={product.imageUrl} alt={product.title} className="h-full w-full object-contain" /> : <div className="flex h-full w-full items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400">Image coming soon</div>}
                  </div>
                  <div className="flex flex-1 flex-col border-t border-gray-100 p-5">
                    <h3 className="text-lg font-bold text-[#1a2744]">{product.title}</h3>
                    <p className="mt-2 text-sm font-semibold text-teal-700">{product.packSize}</p>
                    <p className="mt-3 flex-1 whitespace-pre-line text-sm leading-6 text-gray-600">{product.description}</p>
                    <div className="mt-5 border-t border-gray-100 pt-4">
                      <div className="text-2xl font-bold text-green-700">{money(product.priceCents)}</div>
                      <div className="mt-1 text-xs text-gray-500">Per pack or carton shown · {catalog.pricesExcludeGst ? 'Excludes' : 'Includes'} GST</div>
                    </div>
                  </div>
                </article>)}
              </div>
            </section>
          })}
        </div>

        <div className="mt-12 rounded-2xl border border-teal-200 bg-teal-50 p-6 text-sm leading-6 text-teal-950">
          <h2 className="font-bold">Ordering and availability</h2>
          <p className="mt-2">{catalog.publicNote}</p>
          <p className="mt-2">Please contact your Secure Cleaning representative or reply to your quote email to discuss quantities and delivery.</p>
        </div>
      </section>
    </div>
  )
}
