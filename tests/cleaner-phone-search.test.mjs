import test from 'node:test'
import assert from 'node:assert/strict'
import { agentCleanerSearchFilter } from '../src/lib/cleanerSearch.ts'

function phonePattern(search) {
  const filter = agentCleanerSearchFilter(search)
  const match = filter.match(/phone\.match\.("[^"]*")/)
  return match ? new RegExp(JSON.parse(match[1])) : null
}

test('phone searches ignore formatting in both search and stored numbers', () => {
  for (const input of ['0400125252', '0400 125 252', '(0400) 125-252']) {
    const pattern = phonePattern(input)
    for (const stored of ['0400125252', '0400 125 252', '(0400) 125-252', '0400\u00a0125\u00a0252']) {
      assert.equal(pattern.test(stored), true)
    }
    assert.equal(pattern.test('04009125252'), false)
    assert.equal(pattern.test('0400125253'), false)
    assert.match(agentCleanerSearchFilter(input), /alternate_phone\.match\./)
  }
})

test('partial numbers work and non-phone searches do not create regex filters', () => {
  assert.equal(phonePattern('125 252').test('0400 125 252'), true)
  for (const input of ['Mary', 'Studio 12', 'name@example.com', '()+ -', '']) {
    assert.equal(phonePattern(input), null)
  }
})

test('filter punctuation is quoted and escaped without introducing conditions', () => {
  const result = agentCleanerSearchFilter('Jones, (NSW) "team"')
  assert.ok(result.startsWith('business_name.ilike."%Jones, (NSW) \\"team\\"%"'))
  assert.equal(phonePattern('0400,phone.neq.null'), null)
  assert.ok(agentCleanerSearchFilter('100%_').includes('100\\\\%\\\\_'))
})
