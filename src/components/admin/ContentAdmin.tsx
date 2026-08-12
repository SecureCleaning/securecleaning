'use client'

import { useMemo, useState } from 'react'
import type { SiteContentRow } from '@/lib/content'
import { getAdminHeaders } from '@/lib/useAdminHeaders'

const groupMeta: Record<string, { label: string; description: string }> = {
  home: {
    label: 'Homepage',
    description: 'Hero, trust items, process steps, testimonials, and bottom CTA.',
  },
  about: {
    label: 'About',
    description: 'Company story, owner-operator model, standards, and About page CTA.',
  },
  services: {
    label: 'Services',
    description: 'Service cards, hero copy, and Services page CTA content.',
  },
  cities: {
    label: 'Cities',
    description: 'Overview page for serviced cities and metro coverage messaging.',
  },
  melbourne: {
    label: 'Melbourne',
    description: 'Melbourne city page, pricing notes, and local CTA copy.',
  },
  sydney: {
    label: 'Sydney',
    description: 'Sydney city page, pricing notes, and local CTA copy.',
  },
  faq: {
    label: 'FAQ',
    description: 'Questions, answers, and FAQ page CTA content.',
  },
  contact: {
    label: 'Contact',
    description: 'Contact details, quick links, form placeholder, and support prompts.',
  },
  quote: {
    label: 'Quote',
    description: 'Quote page copy, quote result messaging, and quote fallback text.',
  },
  booking: {
    label: 'Booking',
    description: 'Booking page copy, confirmation messaging, and next-step wording.',
  },
}

const preferredGroupOrder = ['home', 'services', 'cities', 'melbourne', 'sydney', 'about', 'faq', 'contact']

function humanizeGroupName(groupName: string) {
  return groupMeta[groupName]?.label ?? groupName.charAt(0).toUpperCase() + groupName.slice(1)
}

function getEntrySection(entry: SiteContentRow): { key: string; label: string } {
  const localKey = entry.key.startsWith(`${entry.group_name}.`)
    ? entry.key.slice(entry.group_name.length + 1)
    : entry.key

  const sectionMatchers: Record<string, Array<{ match: RegExp; key: string; label: string }>> = {
    home: [
      { match: /^hero_/, key: 'hero', label: 'Hero' },
      { match: /^cta_/, key: 'hero-cta', label: 'Hero CTAs' },
      { match: /^trust_/, key: 'trust', label: 'Trust items' },
      { match: /^how_/, key: 'how', label: 'How it works' },
      { match: /^step_/, key: 'steps', label: 'Steps' },
      { match: /^why_/, key: 'why', label: 'Why choose us' },
      { match: /^benefit_/, key: 'benefits', label: 'Benefits' },
      { match: /^premises_/, key: 'premises', label: 'Premises section' },
      { match: /^cities_/, key: 'cities', label: 'Cities section' },
      { match: /^city_/, key: 'city-cards', label: 'City cards' },
      { match: /^testimonials_/, key: 'testimonials', label: 'Testimonials intro' },
      { match: /^testimonial_/, key: 'testimonials-list', label: 'Testimonials' },
      { match: /^bottom_cta_/, key: 'bottom-cta', label: 'Bottom CTA' },
    ],
    about: [
      { match: /^hero_/, key: 'hero', label: 'Hero' },
      { match: /^section_1_/, key: 'who-we-are', label: 'Who we are' },
      { match: /^section_2_/, key: 'owner-operator', label: 'Owner-operator model' },
      { match: /^model_point_/, key: 'owner-operator-points', label: 'Model points' },
      { match: /^section_3_/, key: 'standards', label: 'Verification & standards' },
      { match: /^standard_/, key: 'standards-list', label: 'Standards list' },
      { match: /^section_4_/, key: 'coverage', label: 'Coverage' },
      { match: /^section_5_/, key: 'contracts', label: 'Contracts' },
      { match: /^bottom_cta_/, key: 'bottom-cta', label: 'Bottom CTA' },
      { match: /^intro$/, key: 'who-we-are', label: 'Who we are' },
    ],
    services: [
      { match: /^hero_/, key: 'hero', label: 'Hero' },
      { match: /^(item_[1-8]|function_centres|sports_facilities)_title$/, key: 'service-titles', label: 'Service titles' },
      { match: /^(item_[1-8]|function_centres|sports_facilities)_description$/, key: 'service-descriptions', label: 'Service descriptions' },
      { match: /^(item_[1-8]|function_centres|sports_facilities)_features$/, key: 'service-features', label: 'Service tick lists' },
      { match: /^bottom_cta_/, key: 'bottom-cta', label: 'Bottom CTA' },
    ],
    cities: [
      { match: /^hero_/, key: 'hero', label: 'Hero' },
      { match: /^melbourne_/, key: 'melbourne-card', label: 'Melbourne card' },
      { match: /^sydney_/, key: 'sydney-card', label: 'Sydney card' },
    ],
    melbourne: [
      { match: /^hero_/, key: 'hero', label: 'Hero' },
      { match: /^why_/, key: 'why', label: 'Why Melbourne' },
      { match: /^areas_/, key: 'areas', label: 'Areas' },
      { match: /^pricing_/, key: 'pricing', label: 'Pricing box' },
      { match: /^services_/, key: 'services', label: 'Services box' },
      { match: /^chat_/, key: 'chat', label: 'Chat box' },
      { match: /^bottom_cta_/, key: 'bottom-cta', label: 'Bottom CTA' },
    ],
    sydney: [
      { match: /^hero_/, key: 'hero', label: 'Hero' },
      { match: /^why_/, key: 'why', label: 'Why Sydney' },
      { match: /^areas_/, key: 'areas', label: 'Areas' },
      { match: /^pricing_/, key: 'pricing', label: 'Pricing box' },
      { match: /^services_/, key: 'services', label: 'Services box' },
      { match: /^chat_/, key: 'chat', label: 'Chat box' },
      { match: /^bottom_cta_/, key: 'bottom-cta', label: 'Bottom CTA' },
    ],
    faq: [
      { match: /^heading$|^intro$/, key: 'intro', label: 'Intro' },
      { match: /^item_\d+_question$/, key: 'questions', label: 'Questions' },
      { match: /^item_\d+_answer$/, key: 'answers', label: 'Answers' },
      { match: /^recurring_cleaning_question$/, key: 'questions', label: 'Questions' },
      { match: /^recurring_cleaning_answer$/, key: 'answers', label: 'Answers' },
      { match: /^cta_/, key: 'bottom-cta', label: 'Bottom CTA' },
    ],
    contact: [
      { match: /^hero_/, key: 'hero', label: 'Hero' },
      { match: /^card_/, key: 'details-card', label: 'Details card' },
      { match: /^(email|phone|service_areas|hours)/, key: 'contact-details', label: 'Contact details' },
      { match: /^quick_/, key: 'quick-links', label: 'Quick links' },
      { match: /^form_/, key: 'form', label: 'Form messaging' },
      { match: /^bottom_banner_/, key: 'bottom-banner', label: 'Bottom banner' },
    ],
    quote: [
      { match: /^hero_/, key: 'hero', label: 'Hero' },
      { match: /^result_/, key: 'result', label: 'Quote result' },
    ],
    booking: [
      { match: /^hero_/, key: 'hero', label: 'Hero' },
      { match: /^confirm_/, key: 'confirmation', label: 'Confirmation' },
      { match: /^summary_/, key: 'summary', label: 'Summary' },
      { match: /^next_/, key: 'next-steps', label: 'Next steps' },
      { match: /^bottom_/, key: 'bottom-actions', label: 'Bottom actions' },
    ],
  }

  const matchers = sectionMatchers[entry.group_name] ?? []
  const matched = matchers.find((matcher) => matcher.match.test(localKey))

  if (matched) {
    return { key: matched.key, label: matched.label }
  }

  return { key: 'general', label: 'General' }
}

export default function ContentAdmin({ initialEntries }: { initialEntries: SiteContentRow[] }) {
  const [entries, setEntries] = useState<SiteContentRow[]>(initialEntries)
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(initialEntries.map((entry) => [entry.key, entry.content]))
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'idle'; message: string }>({
    type: 'idle',
    message: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const groupedEntries = useMemo(() => {
    return entries.reduce<Record<string, SiteContentRow[]>>((acc, entry) => {
      if (!acc[entry.group_name]) {
        acc[entry.group_name] = []
      }
      acc[entry.group_name].push(entry)
      return acc
    }, {})
  }, [entries])

  const orderedGroupNames = useMemo(() => {
    const available = Object.keys(groupedEntries)
    const preferred = preferredGroupOrder.filter((name) => available.includes(name))
    const remaining = available
      .filter((name) => !preferred.includes(name))
      .sort((left, right) => humanizeGroupName(left).localeCompare(humanizeGroupName(right)))
    return [...preferred, ...remaining]
  }, [groupedEntries])

  const [selectedGroup, setSelectedGroup] = useState<string>(orderedGroupNames[0] ?? 'home')

  const selectedEntries = useMemo(() => {
    return [...(groupedEntries[selectedGroup] ?? [])].sort((left, right) => left.key.localeCompare(right.key))
  }, [groupedEntries, selectedGroup])

  const sectionsForSelectedGroup = useMemo(() => {
    const bySection = new Map<string, { key: string; label: string; entries: SiteContentRow[] }>()

    selectedEntries.forEach((entry) => {
      const section = getEntrySection(entry)
      if (!bySection.has(section.key)) {
        bySection.set(section.key, { ...section, entries: [] })
      }
      bySection.get(section.key)?.entries.push(entry)
    })

    return Array.from(bySection.values())
  }, [selectedEntries])

  const [selectedSection, setSelectedSection] = useState<string>('all')

  const sectionFilteredEntries = useMemo(() => {
    if (selectedSection === 'all') {
      return selectedEntries
    }
    return selectedEntries.filter((entry) => getEntrySection(entry).key === selectedSection)
  }, [selectedEntries, selectedSection])

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return sectionFilteredEntries
    }
    return sectionFilteredEntries.filter((entry) => {
      return [entry.title, entry.key, values[entry.key] ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [searchQuery, sectionFilteredEntries, values])

  const dirtyKeys = useMemo(() => {
    return new Set(
      entries
        .filter((entry) => (values[entry.key] ?? '') !== entry.content)
        .map((entry) => entry.key)
    )
  }, [entries, values])

  const dirtyCountByGroup = useMemo(() => {
    return entries.reduce<Record<string, number>>((acc, entry) => {
      if (!dirtyKeys.has(entry.key)) {
        return acc
      }
      acc[entry.group_name] = (acc[entry.group_name] ?? 0) + 1
      return acc
    }, {})
  }, [dirtyKeys, entries])

  const selectedGroupMeta = groupMeta[selectedGroup]
  const totalDirtyCount = dirtyKeys.size

  function resetSelectedGroup() {
    const groupEntries = groupedEntries[selectedGroup] ?? []
    setValues((current) => {
      const next = { ...current }
      groupEntries.forEach((entry) => {
        next[entry.key] = entry.content
      })
      return next
    })
    setStatus({ type: 'idle', message: '' })
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setStatus({ type: 'idle', message: '' })

    try {
      const payload = entries.map((entry) => ({
        key: entry.key,
        title: entry.title,
        group_name: entry.group_name,
        content: values[entry.key] ?? '',
      }))

      const response = await fetch('/api/admin/content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminHeaders(),
        },
        body: JSON.stringify({ entries: payload }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Save failed.')
      }

      const nextEntries = result.entries as SiteContentRow[]
      setEntries(nextEntries)
      setValues(Object.fromEntries(nextEntries.map((entry) => [entry.key, entry.content])))
      setStatus({ type: 'success', message: 'Content saved successfully.' })
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unable to save content.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-3" style={{ color: '#1a2744' }}>
            Content Editor
          </h1>
          <p className="text-gray-600 max-w-3xl">
            Update website copy page by page instead of digging through one long form. Select a page, review just that content, and save all staged changes back to Supabase.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-8">
          <div className="flex flex-col xl:flex-row gap-6">
            <aside className="xl:w-80 xl:flex-shrink-0">
              <div className="xl:sticky xl:top-28 space-y-4">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Website pages</h2>
                      <p className="text-sm text-gray-600 mt-1">
                        Choose the page you want to review.
                      </p>
                    </div>
                    <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                      {orderedGroupNames.length} pages
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {orderedGroupNames.map((groupName) => {
                      const isActive = groupName === selectedGroup
                      const dirtyCount = dirtyCountByGroup[groupName] ?? 0
                      return (
                        <button
                          key={groupName}
                          type="button"
                          onClick={() => {
                            setSelectedGroup(groupName)
                            setSelectedSection('all')
                            setSearchQuery('')
                            setStatus({ type: 'idle', message: '' })
                          }}
                          className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                            isActive
                              ? 'border-green-200 bg-green-50 shadow-sm'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className={`font-semibold ${isActive ? 'text-green-800' : 'text-gray-900'}`}>
                                {humanizeGroupName(groupName)}
                              </div>
                              <div className="mt-1 text-xs text-gray-500">
                                {groupedEntries[groupName]?.length ?? 0} fields
                              </div>
                            </div>
                            {dirtyCount > 0 ? (
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                {dirtyCount} unsaved
                              </span>
                            ) : null}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Editing now</h3>
                  <div className="mt-3">
                    <div className="text-xl font-bold" style={{ color: '#1a2744' }}>
                      {humanizeGroupName(selectedGroup)}
                    </div>
                    <p className="mt-2 text-sm text-gray-600">
                      {selectedGroupMeta?.description ?? 'Content for the selected page.'}
                    </p>
                  </div>
                </div>
              </div>
            </aside>

            <div className="min-w-0 flex-1 space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div>
                  <div className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    {humanizeGroupName(selectedGroup)}
                  </div>
                  <h2 className="mt-3 text-2xl font-bold" style={{ color: '#1a2744' }}>
                    {selectedGroupMeta?.label ?? humanizeGroupName(selectedGroup)}
                  </h2>
                  <p className="mt-2 text-sm text-gray-600 max-w-2xl">
                    {selectedGroupMeta?.description ?? 'Editable copy for this page.'}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={resetSelectedGroup}
                    disabled={(dirtyCountByGroup[selectedGroup] ?? 0) === 0}
                    className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-5 py-3 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reset this page
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex items-center justify-center rounded-lg px-5 py-3 font-semibold text-white transition-opacity disabled:opacity-60"
                    style={{ backgroundColor: '#22c55e' }}
                  >
                    {isSubmitting ? 'Saving…' : totalDirtyCount > 0 ? `Save ${totalDirtyCount} change${totalDirtyCount === 1 ? '' : 's'}` : 'Save Changes'}
                  </button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <label className="block text-sm font-semibold text-gray-700 mb-2" htmlFor="content-search">
                    Search within this page
                  </label>
                  <input
                    id="content-search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search field name, content key, or copy…"
                    className="block w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="text-sm font-semibold text-gray-700">Page status</div>
                  <div className="mt-3 text-3xl font-bold" style={{ color: '#1a2744' }}>
                    {dirtyCountByGroup[selectedGroup] ?? 0}
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    unsaved field{(dirtyCountByGroup[selectedGroup] ?? 0) === 1 ? '' : 's'} on this page
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-700">Page sections</div>
                    <p className="mt-1 text-sm text-gray-500">
                      Filter this page down to one content block at a time.
                    </p>
                  </div>
                  <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                    {sectionsForSelectedGroup.length} sections
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSection('all')}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                      selectedSection === 'all'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    All sections
                  </button>
                  {sectionsForSelectedGroup.map((section) => (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => setSelectedSection(section.key)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        selectedSection === section.key
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {section.label}
                    </button>
                  ))}
                </div>
              </div>

              <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-lg font-bold" style={{ color: '#1a2744' }}>
                      Editable copy
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {filteredEntries.length} of {sectionFilteredEntries.length} field{sectionFilteredEntries.length === 1 ? '' : 's'} shown
                    </p>
                  </div>
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-sm font-semibold text-gray-500 hover:text-gray-700"
                    >
                      Clear search
                    </button>
                  ) : null}
                </div>

                {filteredEntries.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-8 text-center text-sm text-gray-500">
                    No fields matched this search on the {humanizeGroupName(selectedGroup)} page.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredEntries.map((entry) => {
                      const isDirty = dirtyKeys.has(entry.key)
                      return (
                        <article
                          key={entry.key}
                          className={`rounded-2xl border p-5 transition ${
                            isDirty ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200 bg-white'
                          }`}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3 mb-3">
                            <div className="min-w-0">
                              <label htmlFor={entry.key} className="block font-semibold text-gray-900">
                                {entry.title}
                              </label>
                              <div className="mt-1 text-xs text-gray-500 break-all">
                                {entry.key}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isDirty ? (
                                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                  Unsaved
                                </span>
                              ) : (
                                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                                  Saved
                                </span>
                              )}
                            </div>
                          </div>
                          <textarea
                            id={entry.key}
                            rows={Math.max(3, Math.min(8, Math.ceil((values[entry.key] ?? '').length / 90)))}
                            value={values[entry.key] ?? ''}
                            onChange={(event) =>
                              setValues((current) => ({
                                ...current,
                                [entry.key]: event.target.value,
                              }))
                            }
                            className="block w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </article>
                      )
                    })}
                  </div>
                )}
              </section>

              {status.message ? (
                <p className={`text-sm ${status.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                  {status.message}
                </p>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
