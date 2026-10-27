'use client'

import { useEffect, useState } from 'react'

// Keep the user's text while editing: formatting on each keystroke moves the
// caret and turns a partially typed amount such as 30 into 3.00.
export default function MoneyInput({ value, onChange, optional = false, placeholder }: {
  value: number | null
  onChange: (value: number | null) => void
  optional?: boolean
  placeholder?: string
}) {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState(value === null ? '' : (value / 100).toFixed(2))
  useEffect(() => {
    if (!focused) setText(value === null ? '' : (value / 100).toFixed(2))
  }, [value, focused])
  return <input type="number" min="0" max="1000000" step="0.01" required={!optional}
    value={text} placeholder={placeholder}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    onChange={(event) => {
      setText(event.target.value)
      if (event.target.value === '') { if (optional) onChange(null); return }
      if (event.target.validity.valid) onChange(Math.round(Number(event.target.value) * 100))
    }} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal" />
}
