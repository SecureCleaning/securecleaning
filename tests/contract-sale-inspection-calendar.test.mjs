import assert from 'node:assert/strict'
import test from 'node:test'

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key'

const { buildContractSaleInspectionEvents } = await import('../src/lib/availabilityCalendar.ts')

test('product-sale inspections become agent appointment events with their saved duration and details', () => {
  const events = buildContractSaleInspectionEvents([{
    id: 'inspection-one',
    sale_id: 'sale-one',
    status: 'scheduled',
    starts_at: '2026-10-01T03:00:00.000Z',
    duration_minutes: 30,
    location_snapshot: '7/13 Boundary Rd, Northmead NSW 2152',
    client_name_snapshot: 'Harsha Vardhana',
    cleaner_name_snapshot: 'Niral Patel',
    notes: 'Meet at reception',
  }], new Date('2026-09-30T00:00:00.000Z'), new Date('2026-10-02T00:00:00.000Z'))

  assert.deepEqual(events, [{
    id: 'sale-inspection-inspection-one',
    kind: 'sale_inspection',
    title: 'Harsha Vardhana',
    startsAt: '2026-10-01T03:00:00.000Z',
    endsAt: '2026-10-01T03:30:00.000Z',
    subtitle: 'scheduled',
    description: 'Client: Harsha Vardhana\nCleaner: Niral Patel\nLocation: 7/13 Boundary Rd, Northmead NSW 2152\nNotes: Meet at reception',
    location: '7/13 Boundary Rd, Northmead NSW 2152',
    details: [
      { label: 'Client', value: 'Harsha Vardhana' },
      { label: 'Cleaner', value: 'Niral Patel' },
      { label: 'Location', value: '7/13 Boundary Rd, Northmead NSW 2152' },
      { label: 'Notes', value: 'Meet at reception' },
    ],
  }])
})

test('product-sale inspections outside the requested calendar range are omitted', () => {
  const events = buildContractSaleInspectionEvents([{
    id: 'inspection-old',
    sale_id: 'sale-old',
    status: 'completed',
    starts_at: '2026-08-01T03:00:00.000Z',
    duration_minutes: 30,
  }], new Date('2026-09-30T00:00:00.000Z'), new Date('2026-10-02T00:00:00.000Z'))

  assert.deepEqual(events, [])
})
