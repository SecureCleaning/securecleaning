'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { City } from '@/lib/types'

export type LocalitySuggestion = {
  label: string
  suburb: string
  postcode: string
  state?: string | null
}

interface LocalityAutocompleteProps {
  city?: City
  suburb: string
  postcode: string
  suburbError?: string
  postcodeError?: string
  required?: boolean
  onChange: (updates: { suburb: string; postcode: string }) => void
}

export default function LocalityAutocomplete({
  city,
  suburb,
  postcode,
  suburbError,
  postcodeError,
  required,
  onChange,
}: LocalityAutocompleteProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<LocalitySuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!city || query.trim().length < 2) {
      setSuggestions([])
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setIsLoading(true)
      try {
        const response = await fetch(
          `/api/locality-autocomplete?city=${encodeURIComponent(city)}&query=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        )
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Failed to load locality suggestions')

        const nextSuggestions = Array.isArray(result.suggestions)
          ? (result.suggestions as LocalitySuggestion[])
          : []

        setSuggestions(nextSuggestions)
        setIsOpen(nextSuggestions.length > 0)
        setActiveIndex(-1)
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([])
          setIsOpen(false)
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }, 250)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [city, query])

  const helpText = useMemo(() => {
    if (!city) return 'Select a state first to search by suburb or postcode.'
    if (isLoading) return 'Searching suburbs and postcodes…'
    return 'Type a suburb or postcode and select the correct locality.'
  }, [city, isLoading])

  const applySuggestion = (suggestion: LocalitySuggestion) => {
    onChange({ suburb: suggestion.suburb, postcode: suggestion.postcode })
    setQuery(suggestion.label)
    setSuggestions([])
    setIsOpen(false)
    setActiveIndex(-1)
  }

  useEffect(() => {
    if (suburb && postcode && !query) {
      setQuery(`${suburb} ${postcode}`)
    }
  }, [suburb, postcode, query])

  return (
    <div ref={containerRef} className="space-y-4">
      <div className="relative">
        <label htmlFor="locality-search" className="block text-sm font-medium text-gray-700 mb-1">
          Suburb or Postcode Search
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <input
          id="locality-search"
          type="text"
          placeholder={city ? 'Start typing a suburb or postcode…' : 'Select state first'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true)
          }}
          onKeyDown={(e) => {
            if (!isOpen || suggestions.length === 0) return

            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActiveIndex((prev) => (prev + 1) % suggestions.length)
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1))
            } else if (e.key === 'Enter' && activeIndex >= 0) {
              e.preventDefault()
              applySuggestion(suggestions[activeIndex])
            } else if (e.key === 'Escape') {
              setIsOpen(false)
            }
          }}
          className="block w-full px-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-navy-600 focus:border-transparent"
        />
        {isOpen && suggestions.length > 0 && (
          <div className="absolute z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
            {suggestions.map((suggestion, index) => {
              const isActive = index === activeIndex
              return (
                <button
                  key={`${suggestion.suburb}-${suggestion.postcode}-${index}`}
                  type="button"
                  className={`w-full text-left px-4 py-3 text-sm border-b last:border-b-0 border-gray-100 ${
                    isActive ? 'bg-green-50 text-gray-900' : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applySuggestion(suggestion)}
                >
                  <div className="font-medium">{suggestion.suburb}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {[suggestion.postcode, suggestion.state].filter(Boolean).join(' · ')}
                  </div>
                </button>
              )
            })}
          </div>
        )}
        {!suburbError && !postcodeError ? <p className="mt-1 text-xs text-gray-500">{helpText}</p> : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="suburb" className="block text-sm font-medium text-gray-700 mb-1">
            Suburb
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <input
            id="suburb"
            type="text"
            value={suburb}
            onChange={(e) => onChange({ suburb: e.target.value, postcode })}
            className={`block w-full px-4 py-3 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:border-transparent ${
              suburbError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:ring-navy-600'
            }`}
          />
          {suburbError ? <p className="mt-1 text-xs text-red-600">{suburbError}</p> : null}
        </div>
        <div>
          <label htmlFor="postcode" className="block text-sm font-medium text-gray-700 mb-1">
            Postcode
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
          <input
            id="postcode"
            type="text"
            inputMode="numeric"
            value={postcode}
            onChange={(e) => onChange({ suburb, postcode: e.target.value.replace(/[^\d]/g, '').slice(0, 4) })}
            className={`block w-full px-4 py-3 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:border-transparent ${
              postcodeError ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:ring-navy-600'
            }`}
          />
          {postcodeError ? <p className="mt-1 text-xs text-red-600">{postcodeError}</p> : null}
        </div>
      </div>
    </div>
  )
}
