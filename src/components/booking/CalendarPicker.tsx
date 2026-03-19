'use client'

import { useState } from 'react'
import { clsx } from 'clsx'

interface CalendarPickerProps {
  value: string        // ISO date string YYYY-MM-DD
  onChange: (date: string) => void
  minDate?: string     // ISO date string
  label?: string
  error?: string
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CalendarPicker({ value, onChange, minDate, label, error }: CalendarPickerProps) {
  const today = new Date()
  const min = minDate ? new Date(minDate) : today

  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const selectedDate = value ? new Date(value + 'T00:00:00') : null

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const selectDay = (day: number) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const date = new Date(dateStr + 'T00:00:00')
    if (date >= min) {
      onChange(dateStr)
    }
  }

  const isDisabled = (day: number) => {
    const date = new Date(viewYear, viewMonth, day)
    return date < min
  }

  const isSelected = (day: number) => {
    if (!selectedDate) return false
    return (
      selectedDate.getFullYear() === viewYear &&
      selectedDate.getMonth() === viewMonth &&
      selectedDate.getDate() === day
    )
  }

  const isToday = (day: number) => {
    return (
      today.getFullYear() === viewYear &&
      today.getMonth() === viewMonth &&
      today.getDate() === day
    )
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
      )}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100" style={{ backgroundColor: '#1a2744' }}>
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            ‹
          </button>
          <span className="text-white font-semibold text-sm">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            ›
          </button>
        </div>

        {/* Day names */}
        <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-500 py-2 bg-gray-50">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 gap-0.5 p-2">
          {cells.map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} />

            const disabled = isDisabled(day)
            const selected = isSelected(day)
            const todayCell = isToday(day)

            return (
              <button
                key={day}
                type="button"
                disabled={disabled}
                onClick={() => selectDay(day)}
                className={clsx(
                  'rounded-lg text-sm py-2 transition-all duration-150 font-medium',
                  disabled && 'text-gray-300 cursor-not-allowed',
                  !disabled && !selected && !todayCell && 'text-gray-700 hover:bg-green-50 hover:text-green-700',
                  selected && 'text-white font-bold',
                  todayCell && !selected && 'ring-2 ring-inset ring-[#1a2744] text-gray-900',
                )}
                style={
                  selected
                    ? { backgroundColor: '#22c55e' }
                    : undefined
                }
              >
                {day}
              </button>
            )
          })}
        </div>

        {/* Selected date */}
        {selectedDate && (
          <div className="px-4 py-2 bg-green-50 border-t border-green-100 text-sm text-green-700 text-center">
            Selected: <strong>{selectedDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
