'use client'

import QuoteResultView from './QuoteResultView'
import type { QuoteResult as QuoteResultType, QuoteInputs } from '@/lib/types'

interface QuoteResultProps {
  quoteRef: string
  result: QuoteResultType
  inputs: QuoteInputs
}

export default function QuoteResultComponent({ quoteRef, result, inputs }: QuoteResultProps) {
  return <QuoteResultView quoteRef={quoteRef} result={result} inputs={inputs} />
}
