'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const [isLocking, setIsLocking] = useState(false)

  async function handleLock() {
    setIsLocking(true)
    try {
      await fetch('/api/admin/session', { method: 'DELETE' })
      try {
        sessionStorage.removeItem('admin_password')
      } catch {}
      window.location.reload()
    } finally {
      setIsLocking(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link href="/admin" className="text-sm font-semibold text-gray-700 hover:text-gray-900">
          ← Back to admin overview
        </Link>
        <button
          type="button"
          onClick={handleLock}
          disabled={isLocking}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300 disabled:opacity-60"
        >
          {isLocking ? 'Locking…' : 'Lock admin'}
        </button>
      </div>
      {children}
    </div>
  )
}
