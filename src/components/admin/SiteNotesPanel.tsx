'use client'

type SiteListItem = {
  id: string
  site_name?: string | null
  address: string
  access_notes?: string | null
  alarm_notes?: string | null
  induction_notes?: string | null
}

export default function SiteNotesPanel({ sites }: { sites: SiteListItem[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-bold" style={{ color: '#1a2744' }}>Site notes snapshot</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {sites.map((site) => (
          <div key={site.id} className="px-6 py-4">
            <div className="font-semibold text-gray-900">{site.site_name || site.address}</div>
            <div className="text-sm text-gray-600 mt-1">{site.address}</div>
            {site.access_notes ? <div className="text-xs text-gray-600 mt-2">Access: {site.access_notes}</div> : null}
            {site.alarm_notes ? <div className="text-xs text-gray-600 mt-1">Alarm: {site.alarm_notes}</div> : null}
            {site.induction_notes ? <div className="text-xs text-gray-600 mt-1">Induction: {site.induction_notes}</div> : null}
          </div>
        ))}
        {sites.length === 0 ? <div className="px-6 py-4 text-sm text-gray-500">No sites available.</div> : null}
      </div>
    </div>
  )
}
