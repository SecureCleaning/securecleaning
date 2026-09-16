'use client'

import { useEffect, useRef, useState } from 'react'

// A closed page stops requesting new chunks; already claimed messages are never retried.
export function useEmailQueueRunner() {
  const active = useRef(false)
  const mounted = useRef(true)
  const [running, setRunning] = useState(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current = false } }, [])
  async function run<T extends { inProgress?: boolean; paused?: boolean }>(step: () => Promise<T>, progress: (value: T) => void) {
    if (active.current) return
    active.current = true
    setRunning(true)
    try {
      while (active.current && mounted.current) {
        const value = await step()
        if (!mounted.current) return
        progress(value)
        if (!value.inProgress || value.paused) return
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    } finally {
      active.current = false
      if (mounted.current) setRunning(false)
    }
  }
  return { run, running }
}
