'use client'

import { useId, useRef, useState, type ComponentProps } from 'react'
import AlertsPanel from './AlertsPanel'
import ClientFollowUps from './ClientFollowUps'

const tabs = ['Operational actions', 'Client follow-ups'] as const

export default function AdminTodoPanel(props: ComponentProps<typeof AlertsPanel>) {
  const [selected, setSelected] = useState(0)
  const [followUpCount, setFollowUpCount] = useState<number | null>(null)
  const id = useId()
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const critical = props.alerts.filter(alert => alert.severity === 'critical').length
  const counts = [props.alerts.length, followUpCount]

  return <section aria-labelledby={`${id}-heading`} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
      <h2 id={`${id}-heading`} className="text-lg font-bold text-[#1a2744]">To do</h2>
      {critical > 0 ? <button type="button" onClick={() => { setSelected(0); buttons.current[0]?.focus() }} className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-800">
        {critical} critical {critical === 1 ? 'action' : 'actions'}
      </button> : null}
    </div>
    <div role="tablist" aria-label="To do categories" className="flex flex-wrap gap-2 border-b border-gray-100 p-4" onKeyDown={event => {
      let next: number
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = selected === 0 ? 1 : 0
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = 1
      else return
      event.preventDefault()
      setSelected(next)
      buttons.current[next]?.focus()
    }}>
      {tabs.map((label, index) => <button key={label} ref={node => { buttons.current[index] = node }} type="button" role="tab"
        id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1}
        onClick={() => setSelected(index)}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 ${selected === index ? 'border-green-700 bg-green-700 text-white' : 'border-gray-200 text-gray-700 hover:bg-green-50'}`}>
        {label}<span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">{counts[index] ?? '...'}</span>
      </button>)}
    </div>
    {/* Keep both mounted: tab changes must not discard reminder edits or duplicate refresh requests. */}
    <div role="tabpanel" id={`${id}-panel-0`} aria-labelledby={`${id}-tab-0`} hidden={selected !== 0} tabIndex={0}>
      <AlertsPanel {...props} embedded />
    </div>
    <div role="tabpanel" id={`${id}-panel-1`} aria-labelledby={`${id}-tab-1`} hidden={selected !== 1} tabIndex={0}>
      <ClientFollowUps embedded onCountChange={setFollowUpCount} />
    </div>
  </section>
}
