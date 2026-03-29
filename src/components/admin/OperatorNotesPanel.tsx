'use client'

import type { AdminDashboardData } from './AdminDashboard'

type OperatorItem = AdminDashboardData['operators'][number]

export default function OperatorNotesPanel({ operators }: { operators: OperatorItem[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Operator fit view</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {operators.map((operator) => (
          <div key={operator.id} className="px-6 py-4">
            <div className="font-semibold text-gray-900">{operator.business_name} — {operator.operator_name}</div>
            <div className="text-sm text-gray-600 mt-1 capitalize">{operator.city}</div>
            <div className="text-xs text-gray-500 mt-1">
              Premises types: {operator.premises_types?.length ? operator.premises_types.join(', ') : 'Not specified'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Verified: {operator.is_verified ? 'Yes' : 'No'} · Active: {operator.is_active ? 'Yes' : 'No'}
            </div>
          </div>
        ))}
        {operators.length === 0 ? <div className="px-6 py-4 text-sm text-gray-500">No operators loaded.</div> : null}
      </div>
    </div>
  )
}
