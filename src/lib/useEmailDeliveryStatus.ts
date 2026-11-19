'use client'

import { useEffect, useRef, useState } from 'react'

// This hook only polls delivery status. Closing/unmounting stops polling, not the server queue.
export function useEmailDeliveryStatus() {
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
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
    } finally {
      active.current = false
      if (mounted.current) setRunning(false)
    }
  }
  return { run, running }
}
