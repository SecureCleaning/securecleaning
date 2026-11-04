import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import { renderToStaticMarkup } from 'react-dom/server'
import * as display from '../src/lib/partnerAppointmentDisplay.ts'

const declined = {
  id: 'synthetic-request', assigned_assignee_id: 'test-agent', contact_review_required: false,
  decision_status: 'declined', email_status: 'review_required', calendar_status: 'review_required',
  decision_email_status: 'sent', decision_calendar_status: 'not_required',
  selected_proposal: null, decided_at: '2026-11-04T06:30:00Z', decision_reason: 'Unavailable',
  proposed_times: [{ date: '2026-11-12', startTime: '10:00' }],
  booking: { booking_ref: 'BK-TEST', opportunity_id: null, inputs: { businessName: 'Example declined request', contactName: 'Test Contact' } },
}

test('successful decline leaves the active queue despite earlier email and calendar failures', () => {
  assert.equal(display.needsAppointmentDeliveryCheck(declined), false)
  assert.equal(display.showAppointmentRequest(declined), false)
  assert.equal(display.showAppointmentRequest(declined, true), true)
  assert.equal(declined.email_status, 'review_required', 'historical failure is not rewritten')
})

test('successful confirmations also supersede initial delivery flags', () => {
  for (const initial of ['review_required', 'queued', 'sending']) {
    for (const current of ['sent', 'internal']) {
      const row = { ...declined, decision_status: 'confirmed', email_status: initial, calendar_status: initial, decision_calendar_status: current }
      assert.equal(display.needsAppointmentDeliveryCheck(row), false)
      assert.equal(display.showAppointmentRequest(row), false)
    }
  }
})

test('pending requests and current decision delivery problems remain visible', () => {
  for (const decision_status of ['pending', 'confirmed', 'declined']) {
    for (const status of ['queued', 'sending', 'review_required']) {
      for (const field of decision_status === 'pending' ? ['email_status', 'calendar_status'] : ['decision_email_status', 'decision_calendar_status']) {
        const row = { ...declined, email_status: 'sent', calendar_status: 'sent', decision_status, [field]: status }
        assert.equal(display.needsAppointmentDeliveryCheck(row), true, `${decision_status}/${field}/${status}`)
        assert.equal(display.showAppointmentRequest(row), true)
      }
    }
  }
  assert.equal(display.showAppointmentRequest({ ...declined, decision_status: 'pending', email_status: 'sent', calendar_status: 'sent' }), true)
})

test('independent client-detail checks are not hidden by a completed decision', () => {
  const row = { ...declined, contact_review_required: true }
  assert.equal(display.needsAppointmentDeliveryCheck(row), false)
  assert.equal(display.showAppointmentRequest(row), true)
})

const source = ts.transpileModule(readFileSync(new URL('../src/components/partner/PartnerAppointmentReview.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
function render(rows, history = false, assigneeId) {
  // Inject read-only view state; no effects, fetches, booking decisions or messages run.
  const states = [rows, false, false, history, '', false, '', {}]
  const exports = {}
  vm.runInNewContext(source, {
    exports, Date,
    require(name) {
      if (name === 'react') return { ...React, useState: () => [states.shift(), () => {}], useEffect: () => {}, useCallback: fn => fn }
      if (name === 'react/jsx-runtime') return jsxRuntime
      if (name === '@/lib/partnerAppointmentDisplay') return display
      if (name === '@/components/ActionToast') return { default: () => null }
      throw Error(`Unexpected dependency: ${name}`)
    },
  })
  return renderToStaticMarkup(React.createElement(exports.default, { assigneeId }))
}

test('admin and agent views hide the completed card and stale banner until history is selected', () => {
  for (const assigneeId of [undefined, 'test-agent']) {
    const active = render([declined], false, assigneeId)
    assert.match(active, /Appointment requests \(0\)/)
    assert.match(active, /No appointment requests awaiting approval/)
    assert.doesNotMatch(active, /Example declined request|notifications processing or needing a delivery check/)
    const history = render([declined], true, assigneeId)
    assert.match(history, /Example declined request/)
    assert.match(history, /Initial notification history: review_required/)
    assert.match(history, /Decision notifications: sent/)
    assert.doesNotMatch(history, /notifications processing or needing a delivery check/)
  }
})

test('current decline delivery failures still show both the card and the warning with history unchecked', () => {
  const html = render([{ ...declined, decision_email_status: 'review_required' }])
  assert.match(html, /Example declined request/)
  assert.match(html, /1 request\(s\) have notifications processing or needing a delivery check/)
  assert.match(html, /Decision notifications: review_required/)
})
