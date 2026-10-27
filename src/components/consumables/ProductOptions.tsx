'use client'

import { useState } from 'react'
import type { PublicConsumableProduct } from '@/lib/consumablesShared'

export default function ProductOptions({ product, excludesGst }: { product: PublicConsumableProduct; excludesGst: boolean }) {
  const [selected, setSelected] = useState(0)
  const option = product.variants?.[selected]
  const price = option?.priceCents ?? product.priceCents
  return <div className="mt-5 border-t border-gray-100 pt-4">
    {product.variants?.length ? <label className="mb-3 block text-sm font-semibold">Size
      <select className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2" value={selected}
        onChange={(event) => setSelected(Number(event.target.value))}>
        {product.variants.map((variant, index) => <option key={variant.label} value={index}>{variant.label}</option>)}
      </select>
    </label> : null}
    {option ? <p className="mb-2 text-sm text-teal-700">{option.packSize}</p> : null}
    <div className="text-2xl font-bold text-green-700">{new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(price / 100)}</div>
    <div className="mt-1 text-xs text-gray-500">Per pack or carton shown · {excludesGst ? 'Excludes' : 'Includes'} GST</div>
  </div>
}
