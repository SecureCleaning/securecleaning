/** Reveal collapsed native details before asking the browser to focus an invalid input. */
export function revealInvalidFormField(form: HTMLFormElement): string | null {
  const field = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    'input:invalid, select:invalid, textarea:invalid',
  )
  if (!field) return null

  let parent = field.parentElement
  const sections: string[] = []
  while (parent && parent !== form) {
    if (parent.tagName === 'DETAILS') {
      ;(parent as HTMLDetailsElement).open = true
      const title = parent.querySelector('summary')?.textContent?.trim()
      if (title) sections.unshift(title)
    }
    parent = parent.parentElement
  }
  const label = field.labels?.[0]?.textContent?.trim() || field.getAttribute('aria-label') || 'Field'
  const location = [...sections, label].join(' - ')
  field.scrollIntoView({ block: 'center' })
  field.focus()
  field.reportValidity()
  return `Not saved. ${location}: ${field.validationMessage || 'Please check this value.'}`
}
