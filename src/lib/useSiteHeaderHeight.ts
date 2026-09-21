'use client'

import { useEffect, useState } from 'react'

export function useSiteHeaderHeight() {
  const [headerHeight, setHeaderHeight] = useState<number | null>(null)

  useEffect(() => {
    const header = document.querySelector('.site-header')
    if (!header) {
      setHeaderHeight(0)
      return
    }
    const updateHeight = () => setHeaderHeight(header.getBoundingClientRect().height)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  return headerHeight
}
