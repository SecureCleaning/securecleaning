'use client'

import QuoteResultView from './QuoteResultView'
import type { QuoteResult as QuoteResultType, QuoteInputs } from '@/lib/types'

interface QuoteResultProps {
  quoteRef: string
  result: QuoteResultType
  inputs: QuoteInputs
  emailSent?: boolean
  emailError?: string | null
}

export default function QuoteResultComponent({ quoteRef, result, inputs, emailSent, emailError }: QuoteResultProps) {
  return <QuoteResultView quoteRef={quoteRef} result={result} inputs={inputs} emailSent={emailSent} emailError={emailError} />
}
