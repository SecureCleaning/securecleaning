'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import CalendarPicker from './CalendarPicker'
import AddressAutocomplete from './AddressAutocomplete'
import LocalityAutocomplete from '@/components/shared/LocalityAutocomplete'
import type { BookingInputs, City, PremisesType, CleaningFrequency, TimePreference, QuoteAddOns } from '@/lib/types'
import { getBookingPrefillFromQuote } from '@/lib/quoteSession'
import { buildBookingPrefillFromQuoteInputs } from '@/lib/quoteBookingPrefill'

const defaultAddOns: QuoteAddOns = {
  bathrooms: 0,
  kitchens: 0,
  windows: 0,
  glassCleaningRequired: false,
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
  { value: 'retail', label: 'Retail / Showroom' },
  { value: 'gym', label: 'Gym / Fitness Studio' },
  { value: 'function_centre', label: 'Function Centre / Venue' },
  { value: 'sports_facility', label: 'Sports Facility / Recreation Centre' },
  { value: 'other', label: 'Other' },
]

const frequencyOptions = [
  { value: 'daily', label: 'Daily (5x/week)' },
  { value: '3x_week', label: '3x per Week' },
  { value: '2x_week', label: '2x per Week' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
]

const timeOptions = [
  { value: 'business_hours', label: 'Business Hours (6am–6pm weekdays)' },
  { value: 'after_hours', label: 'After Hours (sometimes cheaper!)' },
  { value: 'weekend', label: 'Weekend (sometimes cheaper!)' },
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
  windowLabel?: string
  day: string
  startTime: string
  endTime: string
  zoneNames: string[]
  assigneeId: string
  assigneeName: string
  calendarId?: string
}

function formatInspectionDate(dateString?: string) {
  if (!dateString) return ''
  const date = new Date(`${dateString}T12:00:00`)
  if (Number.isNaN(date.getTime())) return dateString
  return date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatInspectionTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return time
  const suffix = hours >= 12 ? 'pm' : 'am'
  const displayHour = hours % 12 || 12
  return `${displayHour}:${String(minutes).padStart(2, '0')}${suffix}`
}

function validate(data: Partial<BookingInputs>, hasAvailabilityOptions: boolean): FormErrors {
  const errors: FormErrors = {}
  if (!data.contactName?.trim()) errors.contactName = 'Required'
  if (!data.email?.trim()) errors.email = 'Required'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'Invalid email'
  if (!data.phone?.trim()) errors.phone = 'Required'
  if (!data.address?.trim()) errors.address = 'Required'
  if (!data.city) errors.city = 'Required'
  if (!data.suburb?.trim()) errors.suburb = 'Required'
  if (!data.postcode?.trim()) errors.postcode = 'Required'
  else if (!/^\d{4}$/.test(data.postcode)) errors.postcode = 'Invalid postcode'
  if (!data.premisesType) errors.premisesType = 'Required'
  if (!data.floorArea || data.floorArea <= 0) errors.floorArea = 'Required'
  else if (data.floorArea <= 0) errors.floorArea = 'Enter a floor area greater than 0 sqm'
  if (!data.frequency) errors.frequency = 'Required'
  if (!data.timePreference) errors.timePreference = 'Required'
  if (!data.preferredStartDate) errors.preferredStartDate = 'Please select a start date'
  if (!data.acceptableUseAccepted) errors.acceptableUseAccepted = 'Please confirm this is a genuine authorised enquiry'
  if (hasAvailabilityOptions && !data.preferredInspectionSlotId) {
    errors.preferredInspectionSlotId = 'Please choose an inspection window'
  }
  return errors
}

export default function BookingForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const quoteRef = searchParams.get('quoteRef') ?? undefined
  const handoffToken = searchParams.get('handoff') ?? undefined

  const [formData, setFormData] = useState<Partial<BookingInputs>>({
    quoteRef,
    preferredStartDate: getDefaultStart(),
    addOns: defaultAddOns,
    floorArea: 0,
    suburb: '',
    postcode: '',
    formStartedAt: Date.now(),
  })
  const [prefilledFromQuote, setPrefilledFromQuote] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [availabilitySuggestions, setAvailabilitySuggestions] = useState<AvailabilitySuggestion[]>([])
  const [availabilityDates, setAvailabilityDates] = useState<string[]>([])
  const [nextAvailableDate, setNextAvailableDate] = useState<string | undefined>()
  const [nextAvailableSuggestions, setNextAvailableSuggestions] = useState<AvailabilitySuggestion[]>([])
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
    if (quotePrefill) {
      setFormData((current) => ({
        ...current,
        ...quotePrefill,
        quoteRef: quotePrefill.quoteRef ?? quoteRef,
        preferredStartDate:
          quotePrefill.preferredStartDate ?? current.preferredStartDate ?? getDefaultStart(),
        addOns: quotePrefill.addOns ?? current.addOns ?? defaultAddOns,
        floorArea: quotePrefill.floorArea ?? current.floorArea,
        formStartedAt: current.formStartedAt ?? Date.now(),
      }))
      setPrefilledFromQuote(true)
      return
    }

    if (!quoteRef) return

    const controller = new AbortController()
    const privatePrefillUrl = handoffToken
      ? `/api/quote/${encodeURIComponent(quoteRef)}/booking-prefill?handoff=${encodeURIComponent(handoffToken)}`
      : null
    const publicPrefillUrl = `/api/quote/${encodeURIComponent(quoteRef)}`

    fetch(privatePrefillUrl ?? publicPrefillUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok && privatePrefillUrl) {
          const fallback = await fetch(publicPrefillUrl, { signal: controller.signal })
          if (!fallback.ok) return null
          const fallbackPayload = await fallback.json()
          return fallbackPayload.success && fallbackPayload.quote?.inputs ? fallbackPayload.quote.inputs : null
        }
        if (!response.ok) return null
        const payload = await response.json()
        if (!payload.success) return null
        return payload.prefill ?? payload.quote?.inputs ?? null
      })
      .then((inputs) => {
        if (!inputs) return
        const remotePrefill = buildBookingPrefillFromQuoteInputs(quoteRef, inputs)
        setFormData((current) => ({
          ...current,
          ...remotePrefill,
          quoteRef,
          preferredStartDate: remotePrefill.preferredStartDate ?? current.preferredStartDate ?? getDefaultStart(),
          addOns: remotePrefill.addOns ?? current.addOns ?? defaultAddOns,
          floorArea: remotePrefill.floorArea ?? current.floorArea,
          formStartedAt: current.formStartedAt ?? Date.now(),
        }))
        setPrefilledFromQuote(true)
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [handoffToken, quoteRef, prefilledFromQuote])

  useEffect(() => {
    const address = formData.address?.trim()
    const suburb = formData.suburb?.trim()
    const postcode = formData.postcode?.trim()
    const city = formData.city

    if ((!address && !suburb && !postcode) || !city) {
      setAvailabilitySuggestions([])
      setAvailabilityDates([])
      setNextAvailableDate(undefined)
      setNextAvailableSuggestions([])
      setAvailabilityMessage('')
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/availability?city=${encodeURIComponent(city)}&address=${encodeURIComponent(address ?? '')}&suburb=${encodeURIComponent(suburb ?? '')}&postcode=${encodeURIComponent(postcode ?? '')}&preferredDate=${encodeURIComponent(formData.preferredStartDate ?? '')}`,
          { signal: controller.signal }
        )
        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || 'Unable to load availability.')
        }

        const suggestions = Array.isArray(result.suggestions)
          ? (result.suggestions as AvailabilitySuggestion[])
          : []
        const availableDates = Array.isArray(result.availableDates)
          ? result.availableDates.filter((date: unknown): date is string => typeof date === 'string')
          : []
        const futureDate = typeof result.nextAvailableDate === 'string' ? result.nextAvailableDate : availableDates[0]
        const futureSuggestions = Array.isArray(result.nextAvailableSuggestions)
          ? (result.nextAvailableSuggestions as AvailabilitySuggestion[])
          : []
        const matched = Boolean(result.zoneMatched)

        setAvailabilitySuggestions(suggestions)
        setAvailabilityDates(availableDates)
        setNextAvailableDate(futureDate)
        setNextAvailableSuggestions(futureSuggestions)
        setAvailabilityMessage(
            suggestions.length > 0
            ? `Available inspection times for ${formatInspectionDate(formData.preferredStartDate)}:`
            : matched && availableDates.length > 0
              ? `No window is available on ${formatInspectionDate(formData.preferredStartDate)}. The next available inspection is ${formatInspectionDate(futureDate)}.`
              : matched
                ? 'This address is in our catchment. No published inspection dates are currently available, but you can still submit and we will confirm manually.'
                : 'No published catchment match yet for this address. You can still submit, and we will confirm manually.'
        )

        setFormData((current) => {
          if (suggestions.length === 0) {
            const nextSuggestion = futureSuggestions[0]
            return {
              ...current,
              ...(futureDate ? { preferredStartDate: futureDate } : {}),
              preferredInspectionSlotId: nextSuggestion?.slotId,
              preferredInspectionSlotLabel: nextSuggestion?.label,
              preferredInspectionDay: nextSuggestion?.day,
              preferredInspectionStartTime: nextSuggestion?.startTime,
              preferredInspectionEndTime: nextSuggestion?.endTime,
              preferredInspectionAssigneeId: nextSuggestion?.assigneeId,
              preferredInspectionAssigneeName: nextSuggestion?.assigneeName,
              preferredInspectionCalendarId: nextSuggestion?.calendarId,
            }
          }

          const selected = suggestions.find(
            (suggestion) => suggestion.slotId === current.preferredInspectionSlotId,
          ) ?? suggestions[0]
          return {
            ...current,
            preferredInspectionSlotId: selected.slotId,
            preferredInspectionSlotLabel: selected.label,
            preferredInspectionDay: selected.day,
            preferredInspectionStartTime: selected.startTime,
            preferredInspectionEndTime: selected.endTime,
            preferredInspectionAssigneeId: selected.assigneeId,
            preferredInspectionAssigneeName: selected.assigneeName,
            preferredInspectionCalendarId: selected.calendarId,
          }
        })
      } catch (error) {
        if (controller.signal.aborted) return
        setAvailabilitySuggestions([])
        setAvailabilityDates([])
        setNextAvailableDate(undefined)
        setNextAvailableSuggestions([])
        setAvailabilityMessage('Unable to check availability right now. You can still submit your site inspection request.')
      }
    }, 350)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [formData.address, formData.city, formData.preferredStartDate, formData.suburb, formData.postcode])

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
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Inspection request failed')

      sessionStorage.setItem('bookingConfirm', JSON.stringify({ bookingRef: data.bookingRef, inputs: data.inputs ?? formData }))
      router.push(`/booking/confirm?ref=${data.bookingRef}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const quotePreferencesAreReadOnly = Boolean(quoteRef && prefilledFromQuote)
  const frequencyLabel = frequencyOptions.find((option) => option.value === formData.frequency)?.label ?? 'Not selected'
  const timePreferenceLabel = timeOptions.find((option) => option.value === formData.timePreference)?.label ?? 'Not selected'
  const contactMeSelected = formData.preferredInspectionSlotId === 'contact_me'

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-2xl mx-auto">
      {quoteRef ? (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
          <strong>Quote Reference: {quoteRef}</strong> — Use this form to book a site inspection so we can confirm your scope and final pricing.
          {prefilledFromQuote ? ' Your quote details have been carried through.' : ' If anything is missing, you can still complete it here.'}
        </div>
      ) : (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
          <strong>Prefer a tailored recommendation?</strong> Use this form to book a free site inspection with a cleaning specialist.
        </div>
      )}

      {/* Contact */}
      <section className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
        <h2 className="text-lg font-bold mb-5" style={{ color: '#1a2744' }}>Your Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Business Name (optional)"
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
              onSelect={(suggestion) =>
                update({
                  address: suggestion.value,
                  suburb: suggestion.suburb ?? formData.suburb ?? '',
                  postcode: suggestion.postcode ?? formData.postcode ?? '',
                })
              }
              error={errors.address}
            />
          </div>
          <Select label="City" options={cityOptions} placeholder="Select city…" required
            value={formData.city ?? ''} onChange={(e) => update({ city: e.target.value as City })} error={errors.city} />
          <Select label="Premises Type" options={premisesOptions} placeholder="Select type…" required
            value={formData.premisesType ?? ''} onChange={(e) => update({ premisesType: e.target.value as PremisesType })} error={errors.premisesType} />
          <Input label="Floor Area (sqm)" type="number" min={0} required
            value={formData.floorArea || ''} onChange={(e) => update({ floorArea: Number(e.target.value) })} error={errors.floorArea} />
        </div>

        <div className="mt-4">
          <LocalityAutocomplete
            city={formData.city}
            suburb={formData.suburb ?? ''}
            postcode={formData.postcode ?? ''}
            suburbError={errors.suburb}
            postcodeError={errors.postcode}
            required
            onChange={({ suburb, postcode }) => update({ suburb, postcode })}
          />
        </div>
      </section>

      {/* Schedule */}
      <section className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
        <h2 className="text-lg font-bold mb-2" style={{ color: '#1a2744' }}>Book Your Site Inspection</h2>
        <p className="text-sm text-gray-600 mb-5">
          Choose an inspection date and window. Cleaning frequency and cleaning-time preferences are carried through from your remote quote.
        </p>

        {quotePreferencesAreReadOnly ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 rounded-xl border border-green-100 bg-green-50 p-4 text-sm">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-green-800">Cleaning frequency</div>
              <div className="font-semibold text-gray-900 mt-1">{frequencyLabel}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-green-800">Cleaning time preference</div>
              <div className="font-semibold text-gray-900 mt-1">{timePreferenceLabel}</div>
            </div>
            <div className="sm:col-span-2 text-xs text-green-800">
              These are from your remote quote. Select the inspection date below; they do not limit the inspection appointment window.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <Select label="Cleaning Frequency" options={frequencyOptions} placeholder="Select frequency…" required
              value={formData.frequency ?? ''} onChange={(e) => update({ frequency: e.target.value as CleaningFrequency })} error={errors.frequency} />
            <Select label="Cleaning Time Preference" options={timeOptions} placeholder="Select time…" required
              value={formData.timePreference ?? ''} onChange={(e) => update({ timePreference: e.target.value as TimePreference })} error={errors.timePreference} />
          </div>
        )}

        {(formData.address?.trim() || formData.suburb?.trim() || formData.postcode?.trim()) && formData.city && availabilityMessage ? (
          <div className="mb-6 rounded-xl border border-blue-100 bg-blue-50 p-5">
            <h3 className="text-base font-bold text-blue-900">Next inspection availability</h3>
            <p className="mt-1 text-sm text-blue-800">{availabilityMessage}</p>

            {nextAvailableDate && nextAvailableSuggestions.length > 0 && availabilitySuggestions.length === 0 && !contactMeSelected ? (
              <div className="mt-3 space-y-2 text-sm text-blue-900">
                <div className="font-semibold text-blue-950">{formatInspectionDate(nextAvailableDate)}</div>
                {nextAvailableSuggestions.map((suggestion) => (
                  <label
                    key={suggestion.slotId}
                    className={`block rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                      formData.preferredInspectionSlotId === suggestion.slotId
                        ? 'bg-white border-blue-500 ring-2 ring-blue-200'
                        : 'bg-white/80 border-blue-100'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="preferredInspectionSlot"
                        className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                        checked={formData.preferredInspectionSlotId === suggestion.slotId}
                        onChange={() =>
                          update({
                            preferredStartDate: nextAvailableDate,
                            preferredInspectionSlotId: suggestion.slotId,
                            preferredInspectionSlotLabel: suggestion.label,
                            preferredInspectionDay: suggestion.day,
                            preferredInspectionStartTime: suggestion.startTime,
                            preferredInspectionEndTime: suggestion.endTime,
                            preferredInspectionAssigneeId: suggestion.assigneeId,
                            preferredInspectionAssigneeName: suggestion.assigneeName,
                            preferredInspectionCalendarId: suggestion.calendarId,
                          })
                        }
                      />
                      <div>
                        <div className="font-semibold">{formatInspectionTime(suggestion.startTime)}</div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            ) : null}

            {availabilitySuggestions.length > 0 ? (
              <div className="mt-3 space-y-2 text-sm text-blue-900">
                <div className="font-semibold text-blue-950">{formatInspectionDate(formData.preferredStartDate)}</div>
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
                          className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                          checked={checked}
                          onChange={() =>
                            update({
                              preferredInspectionSlotId: suggestion.slotId,
                              preferredInspectionSlotLabel: suggestion.label,
                              preferredInspectionDay: suggestion.day,
                              preferredInspectionStartTime: suggestion.startTime,
                              preferredInspectionEndTime: suggestion.endTime,
                              preferredInspectionAssigneeId: suggestion.assigneeId,
                              preferredInspectionAssigneeName: suggestion.assigneeName,
                              preferredInspectionCalendarId: suggestion.calendarId,
                            })
                          }
                        />
                        <div>
                          <div className="font-semibold">{formatInspectionTime(suggestion.startTime)}</div>
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            ) : null}

            <label className={`mt-2 block rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
              contactMeSelected ? 'bg-white border-blue-500 ring-2 ring-blue-200' : 'bg-white/80 border-blue-100'
            }`}>
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="preferredInspectionSlot"
                  className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
                  checked={contactMeSelected}
                  onChange={() =>
                    update({
                      preferredInspectionSlotId: 'contact_me',
                      preferredInspectionSlotLabel: 'Please contact me to arrange a suitable inspection time',
                      preferredInspectionDay: undefined,
                      preferredInspectionStartTime: undefined,
                      preferredInspectionEndTime: undefined,
                      preferredInspectionAssigneeId: undefined,
                      preferredInspectionAssigneeName: undefined,
                      preferredInspectionCalendarId: undefined,
                    })
                  }
                />
                <div>
                  <div className="font-semibold">Please contact me to arrange a suitable inspection time</div>
                  <div className="text-blue-700 text-xs mt-1">
                    {contactMeSelected ? 'We will contact you to agree a suitable time.' : 'Or select an alternate date for more options in the calendar below.'}
                  </div>
                </div>
              </div>
            </label>

            {errors.preferredInspectionSlotId ? (
              <p className="text-sm text-red-600 mt-3">{errors.preferredInspectionSlotId}</p>
            ) : null}
          </div>
        ) : null}

        {!contactMeSelected ? (
          <CalendarPicker
            label="Preferred inspection date"
            value={formData.preferredStartDate ?? getDefaultStart()}
            onChange={(date) => update({ preferredStartDate: date })}
            minDate={getTomorrowStr()}
            availableDates={availabilityDates}
            error={errors.preferredStartDate}
          />
        ) : (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <strong>Inspection date:</strong> We will contact you to arrange a suitable inspection time.
          </div>
        )}
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

      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={formData.website ?? ''}
        onChange={(e) => update({ website: e.target.value })}
        className="hidden"
      />

      <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
        <input
          type="checkbox"
          checked={formData.acceptableUseAccepted ?? false}
          onChange={(e) => update({ acceptableUseAccepted: e.target.checked })}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
        />
        <span>
          I confirm this is a genuine enquiry for my business, or a business I am authorised to represent,
          and I will not use this site inspection request for scraping, resale, automated testing, spam, or competitor data collection.
        </span>
      </label>

      {errors.acceptableUseAccepted ? (
        <p className="-mt-6 text-sm text-red-600">{errors.acceptableUseAccepted}</p>
      ) : null}

      {submitError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          <strong>Error:</strong> {submitError}
        </div>
      )}

      <Button type="submit" variant="primary" size="lg" fullWidth loading={isSubmitting}>
        Book Site Inspection
      </Button>

      <p className="text-center text-xs text-gray-500">
        By submitting, you agree to our Terms of Service. No payment is taken online —
        we confirm scope, requirements, and final pricing after your free site inspection.
      </p>
    </form>
  )
}
