'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { City } from '@/lib/types'

type AddressSuggestion = {
  label: string
  value: string
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
  onChange: (value: string) => void
  onSelect?: (suggestion: AddressSuggestion) => void
}

export default function AddressAutocomplete({
  value,
  city,
  error,
  required,
  onChange,
  onSelect,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
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
    if (!city || value.trim().length < 3) {
      setSuggestions([])
      setIsLoading(false)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setIsLoading(true)
      try {
        const response = await fetch(
          `/api/address-autocomplete?city=${encodeURIComponent(city)}&query=${encodeURIComponent(value)}`,
          { signal: controller.signal }
        )
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Failed to load address suggestions')

        const nextSuggestions = Array.isArray(result.suggestions)
          ? (result.suggestions as AddressSuggestion[])
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
  }, [city, value])

  const helpText = useMemo(() => {
    if (!city) return 'Select a city first to enable address suggestions.'
    if (isLoading) return 'Searching addresses…'
    return 'Start typing your street address and choose a suggested match.'
  }, [city, isLoading])

  const applySuggestion = (suggestion: AddressSuggestion) => {
    onChange(suggestion.value)
    onSelect?.(suggestion)
    setSuggestions([])
    setIsOpen(false)
    setActiveIndex(-1)
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
        autoComplete="street-address"
        placeholder={city ? 'Start typing your address…' : 'Select city first'}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
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
        className={`block w-full px-4 py-3 rounded-lg border transition-colors placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent ${
          error
            ? 'border-red-400 focus:ring-red-400'
            : 'border-gray-300 focus:ring-navy-600'
        }`}
      />
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
      {!error && <p className="mt-1 text-xs text-gray-500">{helpText}</p>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
