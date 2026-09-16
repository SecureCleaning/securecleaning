'use client'

import { useEffect, useRef, useState } from 'react'
import { EmailEditor, type EmailEditorRef } from '@react-email/editor'
import '@react-email/editor/themes/default.css'
import '@react-email/editor/styles/slash-command.css'
import EmailMergeFieldPicker from '@/components/admin/EmailMergeFieldPicker'
import type { EmailMergeField } from '@/lib/emailMergeFields'
import type { RichEmailContent } from '@/lib/richEmailContent'
import { createRichEmailContent } from '@/lib/richEmailContent'

export type RichEmailEditorProps = {
  disabled?: boolean
  value: RichEmailContent
  onChange: (value: RichEmailContent) => void
  resetKey: string
  label?: string
  placeholder?: string
  minHeight?: number
  mergeFields?: readonly EmailMergeField[]
}

type ToolbarAction = 'paragraph' | 'heading1' | 'heading2' | 'bold' | 'italic' | 'bulletList' | 'orderedList' | 'link' | 'undo' | 'redo'

type RichEditorCommands = {
  setParagraph: () => boolean
  toggleHeading: (attributes: { level: 1 | 2 }) => boolean
  toggleBold: () => boolean
  toggleItalic: () => boolean
  toggleBulletList: () => boolean
  toggleOrderedList: () => boolean
  undo: () => boolean
  redo: () => boolean
  extendMarkRange: (name: string) => boolean
  unsetLink: () => boolean
  setLink: (attributes: { href: string }) => boolean
  insertContent: (content: string) => boolean
}

function ToolbarButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onClick} title={title} className="min-h-10 shrink-0 touch-manipulation rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:border-teal-300 hover:text-teal-700 sm:min-h-9">{children}</button>
}

export default function RichEmailEditor({ value, onChange, resetKey, label = 'Message', placeholder = 'Write your email…', minHeight = 260, mergeFields = [], disabled = false }: RichEmailEditorProps) {
  const editorRef = useRef<EmailEditorRef | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => { editorRef.current?.editor?.setEditable(!disabled) }, [disabled, ready])

  function emit(ref: EmailEditorRef) {
    const editor = ref.editor
    if (!editor || disabled) return
    onChange({
      document: ref.getJSON() as Record<string, unknown>,
      html: editor.getHTML(),
      text: editor.getText({ blockSeparator: '\n\n' }),
    })
  }

  function run(action: ToolbarAction) {
    const editor = editorRef.current?.editor
    if (!editor || disabled) return
    editor.commands.focus()
    const commands = editor.commands as unknown as RichEditorCommands
    if (action === 'paragraph') commands.setParagraph()
    if (action === 'heading1') commands.toggleHeading({ level: 1 })
    if (action === 'heading2') commands.toggleHeading({ level: 2 })
    if (action === 'bold') commands.toggleBold()
    if (action === 'italic') commands.toggleItalic()
    if (action === 'bulletList') commands.toggleBulletList()
    if (action === 'orderedList') commands.toggleOrderedList()
    if (action === 'undo') commands.undo()
    if (action === 'redo') commands.redo()
    if (action === 'link') {
      const current = editor.getAttributes('link').href as string | undefined
      const href = window.prompt('Link address (https://… or mailto:…)', current ?? 'https://')
      if (href === null) return
      commands.extendMarkRange('link')
      if (!href.trim()) commands.unsetLink()
      else { if (!/^(https?:\/\/|mailto:|tel:)/i.test(href.trim())) { window.alert('Use an https://, http://, mailto: or tel: link.'); return } commands.setLink({ href: href.trim() }) }
    }
  }

  function insertMergeField(token: string) {
    const editor = editorRef.current?.editor
    if (!editor || disabled) return
    editor.commands.focus()
    const commands = editor.commands as unknown as RichEditorCommands
    commands.insertContent(token)
  }

  const initialContent = value.document ?? value.html ?? createRichEmailContent({ text: value.text }).html

  return (
    <div data-rich-email-editor="true" aria-disabled={disabled} className={disabled ? 'pointer-events-none opacity-70' : undefined}>
      <div className="mb-1 text-sm font-medium text-gray-700">{label}</div>
      <div className="overflow-hidden rounded-xl border border-gray-300 bg-white focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
        <div className="rich-email-editor-toolbar overflow-x-auto border-b border-gray-200 bg-gray-50 p-2 sm:overflow-visible" aria-label={`${label} formatting controls`}>
          <div className="flex min-w-max gap-1.5 sm:min-w-0 sm:flex-wrap">
            <ToolbarButton onClick={() => run('paragraph')} title="Normal paragraph">Text</ToolbarButton>
            <ToolbarButton onClick={() => run('heading1')} title="Large heading">Heading 1</ToolbarButton>
            <ToolbarButton onClick={() => run('heading2')} title="Small heading">Heading 2</ToolbarButton>
            <ToolbarButton onClick={() => run('bold')} title="Bold"><strong>B</strong></ToolbarButton>
            <ToolbarButton onClick={() => run('italic')} title="Italic"><em>I</em></ToolbarButton>
            <ToolbarButton onClick={() => run('bulletList')} title="Bullet list">• List</ToolbarButton>
            <ToolbarButton onClick={() => run('orderedList')} title="Numbered list">1. List</ToolbarButton>
            <ToolbarButton onClick={() => run('link')} title="Add or edit link">Link</ToolbarButton>
            <span className="mx-1 h-7 w-px bg-gray-200" />
            <ToolbarButton onClick={() => run('undo')} title="Undo">Undo</ToolbarButton>
            <ToolbarButton onClick={() => run('redo')} title="Redo">Redo</ToolbarButton>
            {mergeFields.length > 0 ? <>
              <span className="mx-1 h-7 w-px bg-gray-200" />
              <EmailMergeFieldPicker fields={mergeFields} onInsert={insertMergeField} compact />
            </> : null}
          </div>
        </div>
        <EmailEditor
          key={resetKey}
          ref={editorRef}
          content={initialContent}
          placeholder={placeholder}
          onReady={(ref) => { editorRef.current = ref; ref.editor?.setEditable(!disabled); setReady(true) }}
          onUpdate={emit}
          className="rich-email-editor px-4 py-3 text-sm leading-6 text-gray-900 outline-none"
        />
        {!ready ? <div className="px-4 pb-3 text-xs text-gray-400">Loading editor…</div> : null}
      </div>
      {mergeFields.length > 0 ? <p className="mt-1 text-xs text-gray-500">Database fields are filled with the selected record&apos;s saved details when you preview the email.</p> : null}
      <style jsx global>{`
        .rich-email-editor-toolbar { -webkit-overflow-scrolling: touch; display: block !important; }
        .rich-email-editor .ProseMirror { min-height: ${minHeight}px; outline: none; touch-action: manipulation; -webkit-user-select: text; user-select: text; }
        .rich-email-editor .ProseMirror p { margin: 0 0 0.85rem; }
        .rich-email-editor .ProseMirror h1 { margin: 0 0 0.9rem; font-size: 1.55rem; font-weight: 700; line-height: 1.25; }
        .rich-email-editor .ProseMirror h2 { margin: 0 0 0.8rem; font-size: 1.25rem; font-weight: 700; line-height: 1.3; }
        .rich-email-editor .ProseMirror ul { margin: 0 0 0.85rem; list-style: disc; padding-left: 1.5rem; }
        .rich-email-editor .ProseMirror ol { margin: 0 0 0.85rem; list-style: decimal; padding-left: 1.5rem; }
        .rich-email-editor .ProseMirror a { color: #0f766e; text-decoration: underline; }
        .rich-email-editor .ProseMirror blockquote { border-left: 3px solid #cbd5e1; margin: 0 0 0.85rem; padding-left: 1rem; color: #475569; }
        @media (min-width: 640px) {
          .rich-email-editor-toolbar { overflow: visible; }
        }
      `}</style>
    </div>
  )
}
