'use client'

import { useState } from 'react'
import type { QuotePricingConfig, PricingItem, PricingItemUnit } from '@/lib/pricing'
import AdminGate from './AdminGate'

const UNIT_OPTIONS: PricingItemUnit[] = ['fixed', 'count', 'sqm', 'flag']

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
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3" style={{ color: '#1a2744' }}>
            Pricing Editor
          </h1>
          <p className="text-gray-600 max-w-3xl">
            Manage the quote calculator settings, multipliers, and pricing items. Changes affect future remote quote calculations.
          </p>
        </div>

        <AdminGate
          title="Unlock pricing editor"
          description="Enter the internal content password to manage pricing configuration."
        >
          <form onSubmit={handleSave} className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div>
                <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Quote pricing configuration</h2>
                <p className="text-sm text-gray-600">Save once you&apos;ve finished adjusting rates and multipliers.</p>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-lg px-5 py-3 font-semibold text-white transition-opacity disabled:opacity-60"
                style={{ backgroundColor: '#22c55e' }}
              >
                {isSubmitting ? 'Saving…' : 'Save Pricing'}
              </button>
            </div>

            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="text-xl font-bold mb-5" style={{ color: '#1a2744' }}>Global settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(config.settings).map(([key, value]) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{key}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={value}
                      onChange={(event) => updateSetting(key as keyof QuotePricingConfig['settings'], event.target.value)}
                      className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                    />
                  </div>
                ))}
              </div>
            </section>

            {(Object.entries(config.multipliers) as Array<[keyof QuotePricingConfig['multipliers'], Record<string, number>]>).map(([section, values]) => (
              <section key={section} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <h3 className="text-xl font-bold capitalize mb-5" style={{ color: '#1a2744' }}>{section} multipliers</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(values).map(([key, value]) => (
                    <div key={key}>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{key}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={value}
                        onChange={(event) => updateMultiplier(section, key, event.target.value)}
                        className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </section>
            ))}

            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
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
                      <input
                        type="text"
                        value={item.code}
                        onChange={(event) => updateItem(item.id, { code: event.target.value })}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Code"
                      />
                      <input
                        type="text"
                        value={item.name}
                        onChange={(event) => updateItem(item.id, { name: event.target.value })}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Name"
                      />
                      <select
                        value={item.unitType}
                        onChange={(event) => updateItem(item.id, { unitType: event.target.value as PricingItemUnit })}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      >
                        {UNIT_OPTIONS.map((unit) => (
                          <option key={unit} value={unit}>{unit}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        value={item.rate}
                        onChange={(event) => updateItem(item.id, { rate: Number(event.target.value) })}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Rate"
                      />
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={item.active}
                          onChange={(event) => updateItem(item.id, { active: event.target.checked })}
                        />
                        Active
                      </label>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                    <textarea
                      value={item.notes ?? ''}
                      onChange={(event) => updateItem(item.id, { notes: event.target.value })}
                      className="mt-3 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      rows={2}
                      placeholder="Internal notes"
                    />
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
        </AdminGate>
      </div>
    </div>
  )
}
