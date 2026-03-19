'use client'

import { InputHTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  description?: string
  error?: string
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, error, className, id, ...props }, ref) => {
    const checkId = id ?? label.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex items-start gap-3">
        <div className="flex items-center h-5 mt-0.5">
          <input
            ref={ref}
            type="checkbox"
            id={checkId}
            className={clsx(
              'w-4 h-4 rounded border-gray-300 text-green-600 transition-colors',
              'focus:ring-green-500 focus:ring-2 focus:ring-offset-1',
              'cursor-pointer',
              className
            )}
            {...props}
          />
        </div>
        <div className="flex-1 min-w-0">
          <label
            htmlFor={checkId}
            className="text-sm font-medium text-gray-900 cursor-pointer select-none"
          >
            {label}
          </label>
          {description && (
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
          )}
          {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
        </div>
      </div>
    )
  }
)

Checkbox.displayName = 'Checkbox'
export default Checkbox
