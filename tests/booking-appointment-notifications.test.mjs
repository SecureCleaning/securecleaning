import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { buildBookingCancellationIcs, buildBookingInviteIcs } from '../src/lib/calendarInvite.ts'

const bookingInputs = {
  businessName: 'Example Business', contactName: 'Casey', email: 'client@example.test', phone: '0400 000 000',
  address: '1 Example Street', city: 'sydney', suburb: 'Sydney', postcode: '2000', premisesType: 'office',
  frequency: 'weekly', timePreference: 'business_hours', preferredStartDate: '2026-11-05',
  preferredInspectionStartTime: '10:00', preferredInspectionEndTime: '10:10', addOns: {},
}

function loadNotificationModule({ send }) {
  const exports = {}
  const audits = []
  const source = readFileSync(new URL('../src/lib/bookingAppointmentNotifications.ts', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  class Rejected extends Error {}
  vm.runInNewContext(code, {
    exports, Buffer, console, Intl, Date,
    process: { env: { FROM_EMAIL: 'quotes@example.test', ADMIN_EMAIL: 'admin@example.test' } },
    require(name) {
      if (name === '@/lib/htmlEscape') return { escapeHtml: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;') }
      if (name === '@/lib/auditLog') return { writeAuditLog: async (...args) => audits.push(args) }
      if (name === '@/lib/calendarInvite') return {
        buildBookingInviteIcs: () => 'updated-calendar', buildBookingCancellationIcs: () => 'cancelled-calendar', getCityTimeZone: () => 'Australia/Sydney',
      }
      if (name === '@/lib/email') return { EmailProviderRejectedError: Rejected, sendEmailOrThrow: send }
      throw new Error(`Unexpected dependency: ${name}`)
    },
  })
  return { module: exports, audits }
}

test('appointment changes notify the client and assigned agent with distinct idempotency keys', async () => {
  const sends = []
  const { module, audits } = loadNotificationModule({ send: async (payload, options) => { sends.push({ payload, options }); return { id: `message-${sends.length}` } } })
  const outcomes = await module.sendAppointmentChangeNotifications({
    bookingRef: 'BK-EXAMPLE', inputs: bookingInputs, change: 'rescheduled', previousScheduledFor: '2026-11-05T00:00:00Z',
    scheduledFor: '2026-11-05T01:00:00Z', agentEmail: 'agent@example.test', agentName: 'NSW Agent', revision: 2,
  })

  assert.deepEqual(sends.map(item => item.payload.to), ['client@example.test', 'agent@example.test'])
  assert.deepEqual(sends.map(item => item.options.idempotencyKey), [
    'booking-appointment-BK-EXAMPLE-2-rescheduled-client', 'booking-appointment-BK-EXAMPLE-2-rescheduled-agent',
  ])
  assert.equal(outcomes.map(item => item.status).join(','), 'sent,sent')
  assert.equal(audits.length, 2)
  assert.match(sends[0].payload.subject, /appointment updated/i)
})

test('amended and cancelled calendars retain the UID and increase their revision sequence', () => {
  const original = buildBookingInviteIcs('BK-EXAMPLE', bookingInputs)
  const amended = buildBookingInviteIcs('BK-EXAMPLE', bookingInputs, 2)
  const cancelled = buildBookingCancellationIcs('BK-EXAMPLE', bookingInputs, 3)
  for (const calendar of [original, amended, cancelled]) assert.match(calendar, /UID:bk-example@securecleaning\.com\.au/)
  assert.match(original, /SEQUENCE:0/)
  assert.match(amended, /SEQUENCE:2/)
  assert.match(cancelled, /METHOD:CANCEL/)
  assert.match(cancelled, /STATUS:CANCELLED/)
  assert.match(cancelled, /SEQUENCE:3/)
})
