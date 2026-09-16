'use client'

import { Component, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import type { RichEmailEditorProps } from '@/components/admin/RichEmailEditor'
import { createRichEmailContent } from '@/lib/richEmailContent'

const Editor = dynamic(() => import('@/components/admin/RichEmailEditor'), {
  ssr: false,
  loading: () => <div role="status" className="min-h-64 rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">Loading formatting tools...</div>,
})
class EditorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
export default function RichEmailComposer(props: RichEmailEditorProps) {
  return <EditorBoundary key={props.resetKey} fallback={<div className="rounded-xl border border-amber-300 p-4"><p role="alert" className="mb-2 text-sm text-amber-900">Formatting tools could not load. Reload to keep editing with formatting, or edit the plain-text version below. Editing here replaces the formatting.</p><label className="block text-sm font-medium">{props.label || 'Message'}<textarea disabled={props.disabled} rows={10} value={props.value.text} onChange={event => props.onChange(createRichEmailContent({ text: event.target.value }))} className="mt-2 w-full rounded-lg border p-3" /></label></div>}><Editor {...props} /></EditorBoundary>
}
