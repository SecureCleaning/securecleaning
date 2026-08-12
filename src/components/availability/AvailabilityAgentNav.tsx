'use client'

import { useState } from 'react'

export default function AvailabilityAgentNav({
  assigneeId,
  showLogout = false,
}: {
  assigneeId?: string
  showLogout?: boolean
}) {
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    setIsLoggingOut(true)

    try {
      await fetch('/api/availability-agent/session', { method: 'DELETE' })
    } finally {
      window.location.assign('/availability/login')
    }
  }

  return (
    <nav
      aria-label="Agent portal navigation"
      className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <a href="/availability/login" className="font-semibold text-gray-900 hover:text-teal-700">
          Agent login
        </a>
        {assigneeId ? (
          <a href={`/availability/quoters/${assigneeId}`} className="font-semibold text-teal-700 hover:text-teal-800">
            My availability
          </a>
        ) : null}
        {assigneeId ? (
          <a href={`/availability/quotes/${assigneeId}`} className="font-semibold text-teal-700 hover:text-teal-800">
            My quotes
          </a>
        ) : null}
        <a href="/" className="text-gray-600 hover:text-gray-900">
          Secure Cleaning home
        </a>
      </div>
      {showLogout ? (
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:border-gray-400 disabled:cursor-wait disabled:opacity-60"
        >
          {isLoggingOut ? 'Logging out...' : 'Log out'}
        </button>
      ) : null}
    </nav>
  )
}
