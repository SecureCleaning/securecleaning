'use client'

import { useState } from 'react'
import type { QuotePricingConfig, PricingItem, PricingItemUnit } from '@/lib/pricing'
import { getAdminHeaders } from '@/lib/useAdminHeaders'
import AdminPageHeader from './AdminPageHeader'

const UNIT_OPTIONS: PricingItemUnit[] = ['fixed', 'count', 'sqm', 'flag']

const LABELS: Record<string, string> = {
  hourlyRate: 'Hourly rate', minimumInvoice: 'Minimum invoice', multiFloorBase: 'Multi-floor base multiplier',
  multiFloorPerExtra: 'Additional floor multiplier', springCleanLow: 'Spring clean low multiplier',
  springCleanHigh: 'Spring clean high multiplier', rangeLow: 'Standard range low multiplier', rangeHigh: 'Standard range high multiplier',
  office: 'Office', medical: 'Medical and healthcare', industrial: 'Industrial', childcare: 'Childcare', retail: 'Retail', gym: 'Gym and fitness', warehouse: 'Warehouse', function_centre: 'Function centre', sports_facility: 'Sports facility', other: 'Other',
  daily: 'Daily', '3x_week': '3 times per week', '2x_week': '2 times per week', weekly: 'Weekly', fortnightly: 'Fortnightly', once_off: 'Once-off',
  melbourne: 'Melbourne', sydney: 'Sydney', business_hours: 'Business hours', after_hours: 'After hours', weekend: 'Weekend',
}

function readableLabel(key: string) {
  return LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function isCurrencyKey(key: string) {
  return key === 'hourlyRate' || key === 'minimumInvoice'
}

export default function PricingAdmin({ initialConfig }: { initialConfig: QuotePricingConfig }) {
  const [config, setConfig] = useState<QuotePricingConfig>(initialConfig)
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'idle'; message: string }>({
    type: 'idle',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await fetch('/api/admin/pricing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminHeaders(),
        },
        body: JSON.stringify({ config }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Save failed.')
      }

      setConfig(result.config as QuotePricingConfig)
      setStatus({ type: 'success', message: 'Pricing saved successfully.' })
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to save pricing.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  function updateSetting(key: keyof QuotePricingConfig['settings'], value: string) {
    setConfig((current) => ({
      ...current,
      settings: {
        ...current.settings,
        [key]: Number(value),
      },
    }))
  }

  function updateMultiplier(
    section: keyof QuotePricingConfig['multipliers'],
    key: string,
    value: string
  ) {
    setConfig((current) => ({
      ...current,
      multipliers: {
        ...current.multipliers,
        [section]: {
          ...current.multipliers[section],
          [key]: Number(value),
        },
      },
    }))
  }

  function updateItem(itemId: string, updates: Partial<PricingItem>) {
    setConfig((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
    }))
  }

  function addItem() {
    const id = `item-${Date.now()}`
    setConfig((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          id,
          code: `custom_${current.items.length + 1}`,
          name: 'New pricing item',
          unitType: 'fixed',
          rate: 0,
          active: true,
          notes: '',
        },
      ],
    }))
  }

  function removeItem(itemId: string) {
    setConfig((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== itemId),
    }))
  }

  const knownCodes = ['bathrooms', 'kitchens', 'windows', 'consumables', 'highTouchDisinfection', 'carpetSteam']

  return (
    <div>
      <AdminPageHeader
        title="Pricing Editor"
        description="Manage quote calculator settings, multipliers, and pricing items. Changes affect future remote quote calculations."
        actions={<button type="submit" form="pricing-editor-form" disabled={isSubmitting} className="inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60" style={{ backgroundColor: '#22c55e' }}>{isSubmitting ? 'Saving…' : 'Save pricing'}</button>}
      />

        <form id="pricing-editor-form" onSubmit={handleSave} className="space-y-5">
            <div className="flex flex-col gap-1 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Quote pricing configuration</h2>
                <p className="text-sm text-gray-600">Save once you&apos;ve finished adjusting rates and multipliers.</p>
              </div>
              <span className="text-xs text-gray-500">Changes apply to future quotes.</span>
            </div>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
              <h3 className="mb-4 text-lg font-bold" style={{ color: '#1a2744' }}>Global settings</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {Object.entries(config.settings).map(([key, value]) => (
                  <div key={key}>
                    <label htmlFor={`pricing-setting-${key}`} className="mb-1 block text-sm font-medium text-gray-700">{readableLabel(key)}</label>
                    <input
                      id={`pricing-setting-${key}`}
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={value}
                      onChange={(event) => updateSetting(key as keyof QuotePricingConfig['settings'], event.target.value)}
                      className="block min-h-10 w-full max-w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                    <span className="mt-1 block text-xs text-gray-500">{isCurrencyKey(key) ? 'AUD per visit' : 'Multiplier or factor'}</span>
                  </div>
                ))}
              </div>
            </section>

            {(Object.entries(config.multipliers) as Array<[keyof QuotePricingConfig['multipliers'], Record<string, number>]>).map(([section, values]) => (
              <section key={section} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
                <h3 className="mb-4 text-lg font-bold capitalize" style={{ color: '#1a2744' }}>{readableLabel(section)} multipliers</h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(values).map(([key, value]) => (
                    <div key={key}>
                      <label htmlFor={`pricing-multiplier-${section}-${key}`} className="mb-1 block text-sm font-medium text-gray-700">{readableLabel(key)}</label>
                      <input
                        id={`pricing-multiplier-${section}-${key}`}
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={value}
                        onChange={(event) => updateMultiplier(section, key, event.target.value)}
                        className="block min-h-10 w-full max-w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                      <span className="mt-1 block text-xs text-gray-500">1.10 = 10% increase</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                  <h3 className="text-xl font-bold" style={{ color: '#1a2744' }}>Pricing items</h3>
                  <p className="text-sm text-gray-600">
                    Current calculator-connected codes: {knownCodes.join(', ')}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addItem}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                  style={{ backgroundColor: '#1a2744' }}
                >
                  Add Item
                </button>
              </div>

              <div className="space-y-4">
                {config.items.map((item) => (
                  <div key={item.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                      <div>
                        <label htmlFor={`${item.id}-code`} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Calculator code</label>
                        <input
                          id={`${item.id}-code`}
                          type="text"
                          value={item.code}
                          onChange={(event) => updateItem(item.id, { code: event.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          placeholder="e.g. bathrooms"
                        />
                      </div>
                      <div>
                        <label htmlFor={`${item.id}-name`} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Display name</label>
                        <input
                          id={`${item.id}-name`}
                          type="text"
                          value={item.name}
                          onChange={(event) => updateItem(item.id, { name: event.target.value })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          placeholder="e.g. Bathrooms"
                        />
                      </div>
                      <div>
                        <label htmlFor={`${item.id}-unit`} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Unit charged</label>
                        <select
                          id={`${item.id}-unit`}
                          value={item.unitType}
                          onChange={(event) => updateItem(item.id, { unitType: event.target.value as PricingItemUnit })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        >
                          {UNIT_OPTIONS.map((unit) => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`${item.id}-rate`} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Rate ($)</label>
                        <input
                          id={`${item.id}-rate`}
                          type="number"
                          step="0.01"
                          value={item.rate}
                          onChange={(event) => updateItem(item.id, { rate: Number(event.target.value) })}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          placeholder="e.g. 10.00"
                        />
                      </div>
                      <div className="flex items-end">
                        <label className="flex min-h-10 items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={item.active}
                            onChange={(event) => updateItem(item.id, { active: event.target.checked })}
                          />
                          Active item
                        </label>
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                        >
                          Remove item
                        </button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <label htmlFor={`${item.id}-notes`} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Internal notes</label>
                      <textarea
                        id={`${item.id}-notes`}
                        value={item.notes ?? ''}
                        onChange={(event) => updateItem(item.id, { notes: event.target.value })}
                        className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        rows={2}
                        placeholder="Explain what this price covers"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {status.message ? (
              <p className={`text-sm ${status.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                {status.message}
              </p>
            ) : null}
        </form>
      </div>
  )
}
