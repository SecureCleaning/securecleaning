'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Quote directories should not keep deleted rows when another owner session removes them.
export function useQuoteListRefresh() {
  const router = useRouter()
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') router.refresh() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    const timer = window.setInterval(refresh, 30_000)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
      window.clearInterval(timer)
    }
  }, [router])
}
