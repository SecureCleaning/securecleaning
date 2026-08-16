'use client'

import { useState } from 'react'
import AvailabilityAgentNav from './AvailabilityAgentNav'

export default function AvailabilityAgentLogin({
  assigneeId,
  assigneeName,
  defaultUsername = '',
  lockUsername = false,
  redirectPath,
  title,
  description,
  submitLabel,
}: {
  assigneeId?: string
  assigneeName?: string
  defaultUsername?: string
  lockUsername?: boolean
  redirectPath?: string
  title?: string
  description?: string
  submitLabel?: string
}) {
  const [username, setUsername] = useState(defaultUsername)
  const [accessCode, setAccessCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUnlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: accessCode }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Invalid access code.')
      }

      if (result.role !== 'agent' || (assigneeId && result.assigneeId !== assigneeId)) {
        throw new Error('This login is not linked to the selected regional agent.')
      }
      window.location.href = redirectPath || `/availability/quoters/${result.assigneeId}`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to unlock your schedule page.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8">
        <AvailabilityAgentNav />
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h1 className="text-2xl font-bold mb-3" style={{ color: '#1a2744' }}>
            {title || (assigneeName ? `${assigneeName} Schedule Access` : 'Agent Schedule Login')}
          </h1>
          <p className="text-sm text-gray-600 mb-5">
            {description || 'Enter your username and password to update your recurring inspection windows and date-specific block-outs.'}
          </p>
          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Enter your username"
                required
                readOnly={lockUsername}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Enter your password"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg px-4 py-3 font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: '#1fb56c' }}
            >
              {isLoading ? 'Checking…' : (submitLabel || 'Open My Schedule')}
            </button>
          </form>
          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}
