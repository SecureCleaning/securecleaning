'use client'

import { useState } from 'react'

export default function AdminLogin({
  title = 'Unlock admin',
  description = 'Enter the internal admin password to continue.',
}: {
  title?: string
  description?: string
}) {
  const [password, setPassword] = useState('')
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
        body: JSON.stringify({ password }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Invalid password.')
      }

      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to unlock admin area.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h1 className="text-2xl font-bold mb-3" style={{ color: '#1a2744' }}>
            {title}
          </h1>
          <p className="text-sm text-gray-600 mb-5">{description}</p>
          <form onSubmit={handleUnlock} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="Enter CONTENT_ADMIN_PASSWORD"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg px-4 py-3 font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: '#1fb56c' }}
            >
              {isLoading ? 'Checking…' : 'Unlock Admin'}
            </button>
          </form>
          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}
