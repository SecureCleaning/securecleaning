'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import ProgressBar from '@/components/ui/ProgressBar'
import Button from '@/components/ui/Button'
import StepOne from './StepOne'
import StepTwo from './StepTwo'
import StepThree from './StepThree'
import StepFour from './StepFour'
import type { QuoteInputs, QuoteAddOns } from '@/lib/types'
import { getQuoteDraft, saveQuoteDraft, saveQuoteResult } from '@/lib/quoteSession'

const TOTAL_STEPS = 4

const STEP_LABELS = ['Your Details', 'Premises', 'Schedule', 'Finalise']

const defaultAddOns: QuoteAddOns = {
  bathrooms: 0,
  kitchens: 0,
  windows: 0,
  consumables: false,
  highTouchDisinfection: false,
  carpetSteam: false,
}

const initialData: Partial<QuoteInputs> = {
  floors: 1,
  floorArea: 150,
  addOns: defaultAddOns,
  isSpringClean: false,
}

type StepErrors = Partial<Record<keyof QuoteInputs, string>>

function validateStep(step: number, data: Partial<QuoteInputs>): StepErrors {
  const errors: StepErrors = {}

  if (step === 1) {
    if (!data.businessName?.trim()) errors.businessName = 'Business name is required'
    if (!data.contactName?.trim()) errors.contactName = 'Contact name is required'
    if (!data.email?.trim()) errors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'Please enter a valid email'
    if (!data.phone?.trim()) errors.phone = 'Phone number is required'
    if (!data.city) errors.city = 'Please select a city'
    if (!data.premisesType) errors.premisesType = 'Please select a premises type'
  }

  if (step === 2) {
    if (!data.floorArea || data.floorArea <= 0) errors.floorArea = 'Please enter your floor area'
    if (data.floorArea && data.floorArea > 100000) errors.floorArea = 'Floor area seems too large — please check'
    if (!data.floors || data.floors < 1) errors.floors = 'Please enter number of floors'
  }

  if (step === 3) {
    if (!data.frequency) errors.frequency = 'Please select a frequency'
    if (!data.timePreference) errors.timePreference = 'Please select a time preference'
  }

  return errors
}

export default function QuoteForm() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<Partial<QuoteInputs>>(initialData)
  const [errors, setErrors] = useState<StepErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    const draft = getQuoteDraft()
    if (draft) {
      setFormData((prev) => ({ ...prev, ...draft }))
    }
  }, [])

  useEffect(() => {
    saveQuoteDraft(formData)
  }, [formData])

  const updateData = (updates: Partial<QuoteInputs>) => {
    setFormData((prev) => ({ ...prev, ...updates }))
    // Clear errors for updated fields
    const clearedErrors = { ...errors }
    Object.keys(updates).forEach((key) => {
      delete clearedErrors[key as keyof QuoteInputs]
    })
    setErrors(clearedErrors)
  }

  const goNext = () => {
    const stepErrors = validateStep(currentStep, formData)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      // Scroll to first error
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setErrors({})
    setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const goBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async () => {
    const stepErrors = validateStep(currentStep, formData)
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors)
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const response = await fetch('/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error ?? 'Failed to submit quote')
      }

      saveQuoteResult({
        quoteRef: data.quoteRef,
        result: data.result,
        inputs: formData as QuoteInputs,
      })

      if (data.emailSent === false) {
        setSubmitError(data.emailError ?? 'Your quote was created, but the email could not be sent.')
      }

      router.push(`/quote/result?ref=${data.quoteRef}`)
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="mb-10">
        <ProgressBar
          currentStep={currentStep}
          totalSteps={TOTAL_STEPS}
          stepLabels={STEP_LABELS}
        />
      </div>

      {/* Step content */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        {currentStep === 1 && (
          <StepOne data={formData} onChange={updateData} errors={errors} />
        )}
        {currentStep === 2 && (
          <StepTwo data={formData} onChange={updateData} errors={errors} />
        )}
        {currentStep === 3 && (
          <StepThree data={formData} onChange={updateData} errors={errors} />
        )}
        {currentStep === 4 && (
          <StepFour data={formData} onChange={updateData} errors={errors} />
        )}

        {/* Submit error */}
        {submitError && (
          <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            <strong>Error:</strong> {submitError}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={currentStep === 1}
            className="text-gray-600"
          >
            ← Back
          </Button>

          {currentStep < TOTAL_STEPS ? (
            <Button variant="primary" onClick={goNext}>
              Next →
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={isSubmitting}
              size="lg"
            >
              Get My Quote
            </Button>
          )}
        </div>
      </div>

      {/* Trust indicators */}
      <div className="mt-6 flex flex-wrap justify-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="text-green-500">🔒</span> Secure &amp; confidential
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-green-500">⚡</span> Instant estimate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-green-500">✓</span> No obligation
        </span>
      </div>
    </div>
  )
}
