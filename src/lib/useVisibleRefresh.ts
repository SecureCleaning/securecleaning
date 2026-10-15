'use client'
import { useCallback, useEffect, useRef } from 'react'
import { createVisibleRefresh } from './visibleRefresh'

export function useVisibleRefresh(run: (signal: AbortSignal) => Promise<void>, interval: number,
  onError: (error: unknown) => void, key: unknown = '', eventName?: string) {
  const current = useRef({ run, onError })
  current.current = { run, onError }
  const controller = useRef<ReturnType<typeof createVisibleRefresh> | null>(null)
  useEffect(() => {
    const next = createVisibleRefresh({
      run: signal => current.current.run(signal),
      onError: error => current.current.onError(error),
      visible: () => document.visibilityState === 'visible',
    })
    controller.current = next
    const refresh = () => { void next.refresh() }
    refresh()
    const timer = window.setInterval(refresh, interval)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    if (eventName) window.addEventListener(eventName, refresh)
    return () => {
      next.stop()
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      if (eventName) window.removeEventListener(eventName, refresh)
    }
  }, [interval, key, eventName])
  return useCallback(() => controller.current?.refresh() ?? Promise.resolve(), [])
}
