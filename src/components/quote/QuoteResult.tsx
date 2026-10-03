'use client'

import QuoteResultView from './QuoteResultView'
import type { QuoteResult as QuoteResultType, QuoteInputs } from '@/lib/types'

interface QuoteResultProps {
  quoteRef: string
  result: QuoteResultType
  inputs: QuoteInputs
  documentAccessToken?: string
  bookingHandoffToken?: string
  emailSent?: boolean
  emailError?: string | null
}

export default function QuoteResultComponent({ quoteRef, result, inputs, emailSent, emailError, bookingHandoffToken, documentAccessToken }: QuoteResultProps) {
  return <QuoteResultView bookingHandoffToken={bookingHandoffToken} documentAccessToken={documentAccessToken} quoteRef={quoteRef} result={result} inputs={inputs} customerEmail={inputs.email} emailSent={emailSent} emailError={emailError} />
}
