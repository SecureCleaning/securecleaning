'use client'

import Link from 'next/link'
import { useState } from 'react'
import type {
  AvailabilityAssignee,
  AvailabilityConfig,
  ServiceZone,
} from '@/lib/availability'
import { getCalendarSubscriptionUrl, getCalendarViewUrl } from '@/lib/calendarLinks'
import { getAdminHeaders } from '@/lib/useAdminHeaders'

function toCsv(values: string[]): string {
  return values.join(', ')
}

function fromCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function slugifyUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
}

function buildAgentLoginPath(assigneeId: string) {
  return `/availability/quoters/${assigneeId}`
}

type OwnerOperatorOption = {
  id: string
  business_name: string
  operator_name: string
  city: 'melbourne' | 'sydney'
  is_active: boolean
}

export default function AvailabilityAdmin({
  initialConfig,
  ownerOperators,
}: {
  initialConfig: AvailabilityConfig
  ownerOperators: OwnerOperatorOption[]
}) {
  const [config, setConfig] = useState<AvailabilityConfig>(initialConfig)
  const [draftAccessCodes, setDraftAccessCodes] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'idle'; message: string }>({
    type: 'idle',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setStatus({ type: 'idle', message: '' })

    try {
      const response = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminHeaders(),
        },
        body: JSON.stringify({ config, draftAccessCodes }),
      })

      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Save failed.')
      }

      setConfig(result.config as AvailabilityConfig)
      setDraftAccessCodes({})
      setStatus({ type: 'success', message: 'Agent access and availability settings saved.' })
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to save availability settings.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  function updateZone(zoneId: string, updates: Partial<ServiceZone>) {
    setConfig((current) => ({
      ...current,
      zones: current.zones.map((zone) => (zone.id === zoneId ? { ...zone, ...updates } : zone)),
    }))
  }

  function updateAssignee(assigneeId: string, updates: Partial<AvailabilityAssignee>) {
    setConfig((current) => ({
      ...current,
      assignees: current.assignees.map((assignee) =>
        assignee.id === assigneeId ? { ...assignee, ...updates } : assignee
      ),
    }))
  }

  function addZone() {
    const id = `zone-${Date.now()}`
    setConfig((current) => ({
      ...current,
      zones: [
        ...current.zones,
        { id, name: 'New Zone', city: 'melbourne', matchTerms: [], postcodes: [], notes: '' },
      ],
    }))
  }

  function addAssignee() {
    const id = `assignee-${Date.now()}`
    const defaultName = 'New Agent'
    setConfig((current) => ({
      ...current,
      assignees: [
        ...current.assignees,
        {
          id,
          name: defaultName,
          username: `${slugifyUsername(defaultName) || 'agent'}.${current.assignees.length + 1}`,
          city: 'melbourne',
          email: '',
          ownerOperatorId: '',
          calendarId: '',
          active: true,
          notes: '',
        },
      ],
    }))
  }

  function removeZone(zoneId: string) {
    setConfig((current) => ({
      ...current,
      zones: current.zones.filter((zone) => zone.id !== zoneId),
      weeklySlots: current.weeklySlots.map((slot) => ({
        ...slot,
        zoneIds: slot.zoneIds.filter((id) => id !== zoneId),
      })),
    }))
  }

  function removeAssignee(assigneeId: string) {
    setConfig((current) => ({
      ...current,
      assignees: current.assignees.filter((assignee) => assignee.id !== assigneeId),
      weeklySlots: current.weeklySlots.filter((slot) => slot.assigneeId !== assigneeId),
      oneOffBlocks: current.oneOffBlocks.filter((block) => block.assigneeId !== assigneeId),
    }))

    setDraftAccessCodes((current) => {
      const next = { ...current }
      delete next[assigneeId]
      return next
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 py-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10">
          <h1 className="text-4xl font-bold mb-3" style={{ color: '#1a2744' }}>
            Availability Admin
          </h1>
          <p className="text-gray-600 max-w-3xl">
            Regional agent profiles are linked to individual logins under Staff Access. Use this page for
            inspection schedules, calendar connections, owner-operator links, and service zones.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-8">
          <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>
                Agent access setup
              </h2>
              <p className="text-sm text-gray-600">
                Save after creating new agents, changing usernames or passwords, or updating calendar assignments.
              </p>
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center rounded-lg px-5 py-3 font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: '#22c55e' }}
            >
              {isSubmitting ? 'Saving…' : 'Save Agent Settings'}
            </button>
          </div>

          <section className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Active agents</div>
              <div className="mt-2 text-3xl font-bold" style={{ color: '#1a2744' }}>
                {config.assignees.filter((assignee) => assignee.active).length}
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recurring slots</div>
              <div className="mt-2 text-3xl font-bold" style={{ color: '#1a2744' }}>
                {config.weeklySlots.length}
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">One-off block-outs</div>
              <div className="mt-2 text-3xl font-bold" style={{ color: '#1a2744' }}>
                {config.oneOffBlocks.length}
              </div>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Service zones</div>
              <div className="mt-2 text-3xl font-bold" style={{ color: '#1a2744' }}>
                {config.zones.length}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold" style={{ color: '#1a2744' }}>
                  Agents
                </h3>
                <p className="text-sm text-gray-600">
                  Profiles used by the inspection schedule. Create and manage individual agent access under Staff Access.
                </p>
              </div>
              <Link href="/admin/staff" className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-300">
                Manage access
              </Link>
            </div>

            <div className="space-y-4">
              {config.assignees.map((assignee) => {
                const loginPath = buildAgentLoginPath(assignee.id)
                const slotCount = config.weeklySlots.filter((slot) => slot.assigneeId === assignee.id).length
                const blockCount = config.oneOffBlocks.filter((block) => block.assigneeId === assignee.id).length
                const calendarViewUrl = getCalendarViewUrl(assignee)
                const calendarSubscriptionUrl = getCalendarSubscriptionUrl(assignee)

                return (
                  <div key={assignee.id} className="rounded-xl border border-gray-200 p-4 space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Agent name</label>
                        <input
                          value={assignee.name}
                          onChange={(event) =>
                            updateAssignee(assignee.id, {
                              name: event.target.value,
                              username:
                                assignee.username && assignee.username.trim().length > 0
                                  ? assignee.username
                                  : slugifyUsername(event.target.value),
                            })
                          }
                          className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Username</label>
                        <input
                          value={assignee.username ?? ''}
                          readOnly
                          className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-500">This is what the agent signs in with.</p>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">City</label>
                        <select
                          value={assignee.city}
                          onChange={(event) =>
                            updateAssignee(assignee.id, { city: event.target.value as AvailabilityAssignee['city'] })
                          }
                          className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
                        >
                          <option value="melbourne">Melbourne</option>
                          <option value="sydney">Sydney</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                        <input
                          value={assignee.email ?? ''}
                          onChange={(event) => updateAssignee(assignee.id, { email: event.target.value })}
                          className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-700">Linked owner-operator</label>
                        <select
                          value={assignee.ownerOperatorId ?? ''}
                          onChange={(event) => updateAssignee(assignee.id, { ownerOperatorId: event.target.value })}
                          className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
                        >
                          <option value="">Not linked yet</option>
                          {ownerOperators
                            .filter((operator) => (
                              operator.city === assignee.city
                              && (operator.is_active || operator.id === assignee.ownerOperatorId)
                            ))
                            .map((operator) => (
                              <option key={operator.id} value={operator.id}>
                                {operator.business_name} — {operator.operator_name} ({operator.city})
                              </option>
                            ))}
                        </select>
                        <p className="mt-1 text-xs text-gray-500">Bookings assigned to this agent will also be assigned to this owner-operator.</p>
                      </div>
                      <div className="lg:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-700">Calendar ID</label>
                        <input
                          value={assignee.calendarId ?? ''}
                          onChange={(event) => updateAssignee(assignee.id, { calendarId: event.target.value })}
                          className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-700">Calendar view URL</label>
                        <input
                          value={assignee.calendarViewUrl ?? ''}
                          onChange={(event) => updateAssignee(assignee.id, { calendarViewUrl: event.target.value })}
                          className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                          placeholder="Optional override. Leave blank to derive from Google Calendar ID."
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-700">Calendar subscription / feed URL</label>
                        <input
                          value={assignee.calendarSubscriptionUrl ?? ''}
                          onChange={(event) =>
                            updateAssignee(assignee.id, { calendarSubscriptionUrl: event.target.value })
                          }
                          className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                          placeholder="Optional ICS / webcal / external subscription link"
                        />
                      </div>
                      <div className="rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm text-teal-900">
                        Login and password changes are managed under Staff Access.
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                        <input
                          value={assignee.notes ?? ''}
                          onChange={(event) => updateAssignee(assignee.id, { notes: event.target.value })}
                          className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Agent login details
                        </div>
                        <div className="mt-3 space-y-2 text-sm text-gray-700">
                          <div>
                            <span className="font-semibold text-gray-900">Username:</span>{' '}
                            {assignee.username || 'Set a username before saving'}
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900">Login page:</span>{' '}
                            <span className="break-all">{loginPath}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900">Availability:</span>{' '}
                            {slotCount} recurring slot{slotCount === 1 ? '' : 's'} and {blockCount} block-out
                            {blockCount === 1 ? '' : 's'}
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900">Calendar view:</span>{' '}
                            {calendarViewUrl ? (
                              <a
                                href={calendarViewUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="break-all text-blue-700 underline underline-offset-2"
                              >
                                Open calendar
                              </a>
                            ) : (
                              'Not set yet'
                            )}
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900">External feed:</span>{' '}
                            {calendarSubscriptionUrl ? (
                              <span className="break-all">{calendarSubscriptionUrl}</span>
                            ) : (
                              'Not set yet'
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Link
                          href={`/admin/availability/quoters/${assignee.id}`}
                          className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:border-gray-300"
                        >
                          Open admin detail page
                        </Link>
                        <Link
                          href={loginPath}
                          className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:border-gray-300"
                        >
                          Open agent login page
                        </Link>
                        {calendarViewUrl ? (
                          <a
                            href={calendarViewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:border-gray-300"
                          >
                            Open calendar view
                          </a>
                        ) : null}
                        <label className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700">
                          <input
                            type="checkbox"
                            checked={assignee.active}
                            onChange={(event) => updateAssignee(assignee.id, { active: event.target.checked })}
                          />
                          Active agent
                        </label>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold" style={{ color: '#1a2744' }}>
                  Service zones
                </h3>
                <p className="text-sm text-gray-600">
                  These zones are used to match suburb/postcode requests to the right inspection agent.
                </p>
              </div>
              <button
                type="button"
                onClick={addZone}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: '#1a2744' }}
              >
                Add Zone
              </button>
            </div>

            <div className="space-y-4">
              {config.zones.map((zone) => (
                <div key={zone.id} className="rounded-xl border border-gray-200 p-4 space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Zone name</label>
                      <input
                        value={zone.name}
                        onChange={(event) => updateZone(zone.id, { name: event.target.value })}
                        className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">City</label>
                      <select
                        value={zone.city}
                        onChange={(event) => updateZone(zone.id, { city: event.target.value as ServiceZone['city'] })}
                        className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
                      >
                        <option value="melbourne">Melbourne</option>
                        <option value="sydney">Sydney</option>
                      </select>
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <div className="break-all text-xs text-gray-500">ID: {zone.id}</div>
                      <button
                        type="button"
                        onClick={() => removeZone(zone.id)}
                        className="text-sm font-semibold text-red-600 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Suburb / area terms (comma separated)
                    </label>
                    <textarea
                      rows={3}
                      value={toCsv(zone.matchTerms)}
                      onChange={(event) => updateZone(zone.id, { matchTerms: fromCsv(event.target.value) })}
                      className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Postcodes (comma separated)
                    </label>
                    <input
                      value={toCsv(zone.postcodes)}
                      onChange={(event) => updateZone(zone.id, { postcodes: fromCsv(event.target.value) })}
                      className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                    <input
                      value={zone.notes ?? ''}
                      onChange={(event) => updateZone(zone.id, { notes: event.target.value })}
                      className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-bold" style={{ color: '#1a2744' }}>
              How this works now
            </h3>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="font-semibold text-gray-900">1. Admin creates agent</div>
                <p className="mt-2 text-sm text-gray-600">
                  Set the name, username, password, city, email, and calendar ID here.
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="font-semibold text-gray-900">2. Agent signs in</div>
                <p className="mt-2 text-sm text-gray-600">
                  Give them their username plus their personal login page so they can open their own schedule.
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="font-semibold text-gray-900">3. Agent edits only their own times</div>
                <p className="mt-2 text-sm text-gray-600">
                  Weekly inspection windows and date-specific block-outs are managed on their dedicated page, while admin keeps full oversight.
                </p>
              </div>
            </div>
          </section>

          {status.message ? (
            <p className={`text-sm ${status.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
              {status.message}
            </p>
          ) : null}
        </form>
      </div>
    </div>
  )
}
