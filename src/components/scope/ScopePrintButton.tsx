'use client'

export default function ScopePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="scope-print-button inline-flex items-center justify-center rounded-lg border border-slate-600 px-3 py-2 text-sm font-semibold text-white transition hover:border-emerald-300 hover:text-emerald-200 print:hidden"
    >
      Print scope
    </button>
  )
}
