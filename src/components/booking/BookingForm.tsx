'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import CalendarPicker from './CalendarPicker'
import AddressAutocomplete from './AddressAutocomplete'
import type { BookingInputs, City, PremisesType, CleaningFrequency, TimePreference, QuoteAddOns } from '@/lib/types'
import { getBookingPrefillFromQuote } from '@/lib/quoteSession'

const defaultAddOns: QuoteAddOns = {
  bathrooms: 0,
  kitchens: 0,
  windows: 0,
  consumables: false,
  highTouchDisinfection: false,
  carpetSteam: false,
}

const cityOptions = [
  { value: 'melbourne', label: 'Melbourne' },
  { value: 'sydney', label: 'Sydney' },
]

const premisesOptions = [
  { value: 'office', label: 'Office / Workplace' },
  { value: 'medical', label: 'Medical / Healthcare' },
  { value: 'childcare', label: 'Childcare Centre' },
  { value: 'industrial', label: 'Industrial / Manufacturing' },
  { value: 'retail', label: 'Retail / Showroom' },
  { value: 'gym', label: 'Gym / Fitness Studio' },
  { value: 'warehouse', label: 'Warehouse / Distribution' },
  { value: 'other', label: 'Other' },
]

const frequencyOptions = [
  { value: 'daily', label: 'Daily (5x/week)' },
  { value: '3x_week', label: '3x per Week' },
  { value: '2x_week', label: '2x per Week' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'once_off', label: 'Once-Off' },
]

const timeOptions = [
  { value: 'business_hours', label: 'Business Hours (6am–6pm weekdays)' },
  { value: 'after_hours', label: 'After Hours (after 6pm)' },
  { value: 'weekend', label: 'Weekend' },
]

// Get 14 days from now as default start
function getDefaultStart(): string {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().split('T')[0]
}

function getTomorrowStr(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

type FormErrors = Partial<Record<keyof BookingInputs, string>>

type AvailabilitySuggestion = {
  slotId: string
  label: string
  day: string
  startTime: string
  endTime: string
  zoneNames: string[]
}

function validate(data: Partial<BookingInputs>, hasAvailabilityOptions: boolean): FormErrors {
  const errors: FormErrors = {}
  if (!data.businessName?.trim()) errors.businessName = 'Required'
  if (!data.contactName?.trim()) errors.contactName = 'Required'
  if (!data.email?.trim()) errors.email = 'Required'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'Invalid email'
  if (!data.phone?.trim()) errors.phone = 'Required'
  if (!data.address?.trim()) errors.address = 'Required'
  if (!data.city) errors.city = 'Required'
  if (!data.premisesType) errors.premisesType = 'Required'
  if (!data.floorArea || data.floorArea <= 0) errors.floorArea = 'Required'
  else if (data.floorArea < 50 || data.floorArea > 400) errors.floorArea = 'Enter a floor area between 50 and 400 sqm'
  if (!data.frequency) errors.frequency = 'Required'
  if (!data.timePreference) errors.timePreference = 'Required'
  if (!data.preferredStartDate) errors.preferredStartDate = 'Please select a start date'
  if (hasAvailabilityOptions && !data.preferredInspectionSlotId) {
    errors.preferredInspectionSlotId = 'Please choose an inspection window'
  }
  return errors
}

export default function BookingForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const quoteRef = searchParams.get('quoteRef') ?? undefined

  const [formData, setFormData] = useState<Partial<BookingInputs>>({
    quoteRef,
    preferredStartDate: getDefaultStart(),
    addOns: defaultAddOns,
    floorArea: 0,
  })
  const [prefilledFromQuote, setPrefilledFromQuote] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [availabilitySuggestions, setAvailabilitySuggestions] = useState<AvailabilitySuggestion[]>([])
  const [availabilityMessage, setAvailabilityMessage] = useState<string>('')

  const update = (updates: Partial<BookingInputs>) => {
    setFormData((prev) => ({ ...prev, ...updates }))
    const cleared = { ...errors }
    Object.keys(updates).forEach((k) => delete cleared[k as keyof BookingInputs])
    setErrors(cleared)
  }

  useEffect(() => {
    if (prefilledFromQuote) return

    const quotePrefill = getBookingPrefillFromQuote(quoteRef)
    if (!quotePrefill) return

    setFormData((current) => ({
      ...current,
      ...quotePrefill,
      quoteRef: quotePrefill.quoteRef ?? quoteRef,
      preferredStartDate:
        quotePrefill.preferredStartDate ?? current.preferredStartDate ?? getDefaultStart(),
      addOns: quotePrefill.addOns ?? current.addOns ?? defaultAddOns,
      floorArea: quotePrefill.floorArea ?? current.floorArea,
    }))
    setPrefilledFromQuote(true)
  }, [quoteRef, prefilledFromQuote])

  useEffect(() => {
    const address = formData.address?.trim()
    const city = formData.city

    if (!address || !city) {
      setAvailabilitySuggestions([])
      setAvailabilityMessage('')
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/availability?city=${encodeURIComponent(city)}&address=${encodeURIComponent(address)}`,
          { signal: controller.signal }
        )
        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || 'Unable to load availability.')
        }

        const suggestions = Array.isArray(result.suggestions)
          ? (result.suggestions as AvailabilitySuggestion[])
          : []

        setAvailabilitySuggestions(suggestions)
        setAvailabilityMessage(
          suggestions.length > 0
            ? 'Available inspection windows for this area:'
            : 'No zone match yet for this address. You can still submit, and we will confirm manually.'
        )

        setFormData((current) => {
          const existingSelectionStillValid = suggestions.some(
            (suggestion) => suggestion.slotId === current.preferredInspectionSlotId
          )

          if (existingSelectionStillValid || suggestions.length === 0) {
            return suggestions.length === 0
              ? {
                  ...current,
                  preferredInspectionSlotId: undefined,
                  preferredInspectionSlotLabel: undefined,
                  preferredInspectionDay: undefined,
                  preferredInspectionStartTime: undefined,
                  preferredInspectionEndTime: undefined,
                }
              : current
          }

          const first = suggestions[0]
          return {
            ...current,
            preferredInspectionSlotId: first.slotId,
            preferredInspectionSlotLabel: first.label,
            preferredInspectionDay: first.day,
            preferredInspectionStartTime: first.startTime,
            preferredInspectionEndTime: first.endTime,
          }
        })
      } catch (error) {
        if (controller.signal.aborted) return
        setAvailabilitySuggestions([])
        setAvailabilityMessage('Unable to check availability right now. You can still submit your booking request.')
      }
    }, 350)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [formData.address, formData.city])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate(formData, availabilitySuggestions.length > 0)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Booking failed')

      sessionStorage.setItem('bookingConfirm', JSON.stringify({ bookingRef: data.bookingRef, inputs: formData }))
      router.push(`/booking/confirm?ref=${data.bookingRef}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl mx-auto">
      {quoteRef ? (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
          <strong>Quote Reference: {quoteRef}</strong> — Completing your booking based on your quote.
          {prefilledFromQuote ? ' Your quote details have been carried through.' : ' If anything is missing, you can still complete it here.'}
        </div>
      ) : (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
          <strong>Prefer a tailored recommendation?</strong> Use this form to book a free onsite quote with a cleaning specialist.
        </div>
      )}

      {/* Contact */}
      <section className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
        <h2 className="text-lg font-bold mb-5" style={{ color: '#1a2744' }}>Your Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Business Name" required
            value={formData.businessName ?? ''} onChange={(e) => update({ businessName: e.target.value })} error={errors.businessName} />
          <Input label="Contact Name" required
            value={formData.contactName ?? ''} onChange={(e) => update({ contactName: e.target.value })} error={errors.contactName} />
          <Input label="Email" type="email" required
            value={formData.email ?? ''} onChange={(e) => update({ email: e.target.value })} error={errors.email} />
          <Input label="Phone" type="tel" required
            value={formData.phone ?? ''} onChange={(e) => update({ phone: e.target.value })} error={errors.phone} />
        </div>
      </section>

      {/* Premises */}
      <section className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
        <h2 className="text-lg font-bold mb-5" style={{ color: '#1a2744' }}>Premises Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <AddressAutocomplete
              required
              city={formData.city}
              value={formData.address ?? ''}
              onChange={(value) => update({ address: value })}
              error={errors.address}
            />
          </div>
          <Select label="City" options={cityOptions} placeholder="Select city…" required
            value={formData.city ?? ''} onChange={(e) => update({ city: e.target.value as City })} error={errors.city} />
          <Select label="Premises Type" options={premisesOptions} placeholder="Select type…" required
            value={formData.premisesType ?? ''} onChange={(e) => update({ premisesType: e.target.value as PremisesType })} error={errors.premisesType} />
          <Input label="Floor Area (sqm)" type="number" min={50} max={400} required
            value={formData.floorArea || ''} onChange={(e) => update({ floorArea: Number(e.target.value) })} error={errors.floorArea} />
        </div>
      </section>

      {formData.address?.trim() && formData.city && availabilityMessage ? (
        <section className="bg-blue-50 rounded-2xl border border-blue-100 p-6">
          <h2 className="text-base font-bold mb-2 text-blue-900">Area-based inspection availability</h2>
          <p className="text-sm text-blue-800 mb-3">{availabilityMessage}</p>
          {availabilitySuggestions.length > 0 ? (
            <div className="space-y-2 text-sm text-blue-900">
              {availabilitySuggestions.map((suggestion) => {
                const checked = formData.preferredInspectionSlotId === suggestion.slotId
                return (
                  <label
                    key={suggestion.slotId}
                    className={`block rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                      checked ? 'bg-white border-blue-500 ring-2 ring-blue-200' : 'bg-white/80 border-blue-100'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="preferredInspectionSlot"
                        className="mt-1"
                        checked={checked}
                        onChange={() =>
                          update({
                            preferredInspectionSlotId: suggestion.slotId,
                            preferredInspectionSlotLabel: suggestion.label,
                            preferredInspectionDay: suggestion.day,
                            preferredInspectionStartTime: suggestion.startTime,
                            preferredInspectionEndTime: suggestion.endTime,
                          })
                        }
                      />
                      <div>
                        <div className="font-semibold">{suggestion.label}</div>
                        <div className="text-blue-700 text-xs mt-1">
                          Matched zone{suggestion.zoneNames.length > 1 ? 's' : ''}: {suggestion.zoneNames.join(', ')}
                        </div>
                      </div>
                    </div>
                  </label>
                )
              })}
              <label className={`block rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                formData.preferredInspectionSlotId === 'contact_me'
                  ? 'bg-white border-blue-500 ring-2 ring-blue-200'
                  : 'bg-white/80 border-blue-100'
              }`}>
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="preferredInspectionSlot"
                    className="mt-1"
                    checked={formData.preferredInspectionSlotId === 'contact_me'}
                    onChange={() =>
                      update({
                        preferredInspectionSlotId: 'contact_me',
                        preferredInspectionSlotLabel: 'Please contact me to arrange a suitable inspection time',
                        preferredInspectionDay: undefined,
                        preferredInspectionStartTime: undefined,
                        preferredInspectionEndTime: undefined,
                      })
                    }
                  />
                  <div>
                    <div className="font-semibold">Please contact me to arrange a suitable inspection time</div>
                    <div className="text-blue-700 text-xs mt-1">
                      Use this if the suggested inspection windows don&apos;t suit.
                    </div>
                  </div>
                </div>
              </label>
            </div>
          ) : null}
          {errors.preferredInspectionSlotId ? (
            <p className="text-sm text-red-600 mt-3">{errors.preferredInspectionSlotId}</p>
          ) : null}
        </section>
      ) : null}

      {/* Schedule */}
      <section className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
        <h2 className="text-lg font-bold mb-5" style={{ color: '#1a2744' }}>Cleaning Schedule</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <Select label="Frequency" options={frequencyOptions} placeholder="Select frequency…" required
            value={formData.frequency ?? ''} onChange={(e) => update({ frequency: e.target.value as CleaningFrequency })} error={errors.frequency} />
          <Select label="Time Preference" options={timeOptions} placeholder="Select time…" required
            value={formData.timePreference ?? ''} onChange={(e) => update({ timePreference: e.target.value as TimePreference })} error={errors.timePreference} />
        </div>

        <CalendarPicker
          label="Preferred Start Date"
          value={formData.preferredStartDate ?? getDefaultStart()}
          onChange={(date) => update({ preferredStartDate: date })}
          minDate={getTomorrowStr()}
          error={errors.preferredStartDate}
        />
      </section>

      {/* Notes */}
      <section className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
        <h2 className="text-lg font-bold mb-4" style={{ color: '#1a2744' }}>Additional Notes</h2>
        <textarea
          rows={4}
          className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent placeholder-gray-400 resize-none"
          placeholder="Any access instructions, specific requirements, or questions for your operator…"
          value={formData.notes ?? ''}
          onChange={(e) => update({ notes: e.target.value })}
        />
      </section>

      {submitError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <strong>Error:</strong> {submitError}
        </div>
      )}

      <Button type="submit" variant="primary" size="lg" fullWidth loading={isSubmitting}>
        Confirm Booking Request
      </Button>

      <p className="text-center text-xs text-gray-500">
        By submitting, you agree to our Terms of Service. No payment is taken online —
        your operator will confirm pricing after a free site inspection.
      </p>
    </form>
  )
}
