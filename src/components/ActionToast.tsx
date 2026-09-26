'use client'

import { useEffect, useRef, useState } from 'react'

export type ActionToastTone = 'success' | 'error' | 'info'

export default function ActionToast({ message, tone = 'success', onDismiss, successDurationMs = 6500 }: {
  message?: string | null
  tone?: ActionToastTone
  onDismiss?: () => void
  successDurationMs?: number
}) {
  const [visible, setVisible] = useState(Boolean(message))
  const onDismissRef = useRef(onDismiss)

  useEffect(() => { onDismissRef.current = onDismiss }, [onDismiss])

  useEffect(() => {
    setVisible(Boolean(message))
    if (!message || tone !== 'success' || successDurationMs <= 0) return
    const timeout = window.setTimeout(() => {
      setVisible(false)
      onDismissRef.current?.()
    }, successDurationMs)
    return () => window.clearTimeout(timeout)
  }, [message, successDurationMs, tone])

  if (!message || !visible) return null

  const styles = tone === 'error'
    ? 'border-red-300 bg-red-50 text-red-950'
    : tone === 'info'
      ? 'border-blue-300 bg-blue-50 text-blue-950'
      : 'border-green-300 bg-green-50 text-green-950'
  const heading = tone === 'error' ? 'Action unsuccessful' : tone === 'info' ? 'Update' : 'Success'

  function dismiss() {
    setVisible(false)
    onDismiss?.()
  }

  return <div role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'} className={`fixed right-4 top-24 z-[120] flex w-[min(26rem,calc(100vw-2rem))] items-start gap-3 rounded-xl border p-4 shadow-xl ${styles}`}>
    <div className="min-w-0 flex-1"><strong className="block text-sm">{heading}</strong><p className="mt-1 text-sm">{message}</p></div>
    <button type="button" onClick={dismiss} aria-label="Dismiss notification" className="rounded-lg px-2 py-1 text-lg leading-none hover:bg-black/5">&times;</button>
  </div>
}
