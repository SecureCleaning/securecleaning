'use client'

import { useState } from 'react'

interface AdminGateProps {
  title: string
  description: string
  children: React.ReactNode
}

export default function AdminGate({ title, description, children }: AdminGateProps) {
  const [password, setPassword] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
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

      setIsAuthenticated(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to unlock admin area.')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleLock() {
    await fetch('/api/admin/session', { method: 'DELETE' })
    setIsAuthenticated(false)
    setPassword('')
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-md bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        <h2 className="text-xl font-bold mb-3" style={{ color: '#1a2744' }}>
          {title}
        </h2>
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
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleLock}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300"
        >
          Lock admin
        </button>
      </div>
      {children}
    </div>
  )
}
