'use client'

import { useEffect, useRef, useState } from 'react'
import type { City } from '@/lib/types'

type AddressSuggestion = {
  label: string
  value: string
  streetAddress?: string
  postcode?: string | null
  suburb?: string | null
  state?: string | null
  latitude?: string | null
  longitude?: string | null
}

interface AddressAutocompleteProps {
  value: string
  city?: City
  error?: string
  required?: boolean
  disabled?: boolean
  suburb?: string
  postcode?: string
  onChange: (value: string) => void
  onSelect?: (suggestion: AddressSuggestion) => void
}

export default function AddressAutocomplete({
  value,
  city,
  error,
  required,
  disabled = false,
  suburb = '',
  postcode = '',
  onChange,
  onSelect,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [search, setSearch] = useState<{ value: string; city: City; suburb: string; postcode: string } | null>(null)
  const [lookupMessage, setLookupMessage] = useState('')
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
    if (disabled || !search || search.city !== city || search.value !== value || search.suburb !== suburb || search.postcode !== postcode) {
      setSuggestions([])
      setIsLoading(false)
      setIsOpen(false)
      return
    }

    const controller = new AbortController()
    void (async () => {
      setIsLoading(true)
      setSuggestions([])
      setLookupMessage('')
      try {
        const params = new URLSearchParams({ city: search.city, query: search.value, ...(search.suburb && search.postcode ? { suburb: search.suburb, postcode: search.postcode } : {}) })
        const response = await fetch(
          `/api/address-autocomplete?${params}`,
          { signal: controller.signal }
        )
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Failed to load address suggestions')

        const nextSuggestions = Array.isArray(result.suggestions)
          ? (result.suggestions as AddressSuggestion[])
          : []

        if (controller.signal.aborted) return
        setSuggestions(nextSuggestions)
        setIsOpen(nextSuggestions.length > 0)
        if (!nextSuggestions.length) setLookupMessage('No matching address found. Check the street number and spelling, or confirm and enter it manually.')
        setActiveIndex(-1)
      } catch (failure) {
        if (!controller.signal.aborted) {
          setSuggestions([])
          setIsOpen(false)
          setLookupMessage(failure instanceof Error ? failure.message : 'Address search is unavailable. Confirm and enter the address manually.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    })()

    return () => {
      controller.abort()
    }
  }, [city, value, suburb, postcode, disabled, search])

  const helpText = !city ? 'Select a state first to search for addresses.' : isLoading ? 'Searching addresses...' : lookupMessage || `Enter the street address and click Find address${suburb ? ` to search in ${suburb} ${postcode}` : ''}. Confirm the street number and any unit details with the customer.`

  const applySuggestion = (suggestion: AddressSuggestion) => {
    onChange(suburb && postcode && suggestion.streetAddress ? suggestion.streetAddress : suggestion.value)
    onSelect?.(suggestion)
    setSuggestions([])
    setIsOpen(false)
    setActiveIndex(-1)
    setSearch(null)
    setLookupMessage('Address selected. Confirm the street number and any unit details with the customer.')
  }

  return (
    <div ref={containerRef} className="w-full relative">
      <label htmlFor="street-address" className="block text-sm font-medium text-gray-700 mb-1">
        Street Address
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        id="street-address"
        type="text"
        required={required}
        disabled={disabled}
        maxLength={180}
        autoComplete="street-address"
        placeholder={city ? 'Start typing your address…' : 'Select state first'}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setSearch(null)
          setLookupMessage('')
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
        className={`block w-full px-4 py-3 rounded-lg border transition-colors placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent ${
          error
            ? 'border-red-400 focus:ring-red-400'
            : 'border-gray-300 focus:ring-navy-600'
        }`}
      />
      <button type="button" disabled={disabled || isLoading || !city || value.trim().length < 3} className="mt-2 rounded-lg border border-teal-600 px-3 py-2 font-semibold text-teal-800 disabled:opacity-50" onClick={() => city && setSearch({ value, city, suburb, postcode })}>{isLoading ? 'Searching...' : 'Find address'}</button>
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden">
          {suggestions.map((suggestion, index) => {
            const isActive = index === activeIndex
            return (
              <button
                key={`${suggestion.value}-${index}`}
                type="button"
                className={`w-full text-left px-4 py-3 text-sm border-b last:border-b-0 border-gray-100 ${
                  isActive ? 'bg-green-50 text-gray-900' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applySuggestion(suggestion)}
              >
                <div className="font-medium">{suggestion.value}</div>
                {(suggestion.suburb || suggestion.postcode) && (
                  <div className="text-xs text-gray-500 mt-1">
                    {[suggestion.suburb, suggestion.postcode].filter(Boolean).join(' · ')}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
      {!error && <p role="status" className="mt-1 text-xs text-gray-500">{helpText}</p>}
      <p className="mt-1 text-xs text-gray-500">Address data: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">OpenStreetMap contributors</a>.</p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
