import test from 'node:test'
import assert from 'node:assert/strict'
import { revealInvalidFormField } from '../src/lib/formValidation.ts'

test('valid form needs no error or focus changes', () => {
  assert.equal(revealInvalidFormField({ querySelector: () => null }), null)
})

test('invalid field opens nested sections and identifies the field without changing its value', () => {
  const calls = []
  const form = { querySelector: () => field }
  const outer = { tagName: 'DETAILS', open: false, parentElement: form, querySelector: () => ({ textContent: 'Saved fields' }) }
  const inner = { tagName: 'DETAILS', open: false, parentElement: outer, querySelector: () => ({ textContent: 'Dust Vents' }) }
  const field = {
    parentElement: inner, value: '0.1', labels: [{ textContent: 'Default value' }],
    validationMessage: 'Enter a whole number.',
    scrollIntoView() { assert.equal(inner.open, true); assert.equal(outer.open, true); calls.push('scroll') },
    focus() { calls.push('focus') }, reportValidity() { calls.push('report') },
  }
  assert.equal(revealInvalidFormField(form), 'Not saved. Saved fields - Dust Vents - Default value: Enter a whole number.')
  assert.equal(field.value, '0.1')
  assert.deepEqual(calls, ['scroll', 'focus', 'report'])
})
