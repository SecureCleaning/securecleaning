'use client'

interface ProgressBarProps {
  currentStep: number
  totalSteps: number
  stepLabels?: string[]
}

export default function ProgressBar({ currentStep, totalSteps, stepLabels }: ProgressBarProps) {
  const progress = (currentStep / totalSteps) * 100

  return (
    <div className="w-full">
      {/* Step indicators */}
      <div className="flex justify-between mb-2">
        {Array.from({ length: totalSteps }).map((_, i) => {
          const stepNum = i + 1
          const isCompleted = stepNum < currentStep
          const isActive = stepNum === currentStep

          return (
            <div key={i} className="flex flex-col items-center" style={{ width: `${100 / totalSteps}%` }}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                  isCompleted
                    ? 'bg-green-500 text-white'
                    : isActive
                    ? 'bg-navy-800 text-white ring-4 ring-navy-200'
                    : 'bg-gray-200 text-gray-500'
                }`}
                style={isActive ? { backgroundColor: '#1a2744' } : undefined}
              >
                {isCompleted ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              {stepLabels && stepLabels[i] && (
                <span
                  className={`text-xs mt-1 text-center hidden sm:block transition-colors ${
                    isActive ? 'text-navy-800 font-semibold' : isCompleted ? 'text-green-600' : 'text-gray-400'
                  }`}
                >
                  {stepLabels[i]}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${progress}%`,
            backgroundColor: '#22c55e',
          }}
        />
      </div>

      <p className="text-xs text-gray-500 mt-2 text-right">
        Step {currentStep} of {totalSteps}
      </p>
    </div>
  )
}
