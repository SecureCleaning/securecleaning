import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

test('homepage does not render unverified testimonial or rating content', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../src/app/page.tsx', import.meta.url)),
    'utf8',
  )

  for (const unverifiedContent of [
    'home.testimonial_',
    'home.testimonials_title',
    'What Our Clients Say',
    'Sarah M.',
    'James T.',
    'Priya K.',
    'text-yellow-400',
  ]) {
    assert.doesNotMatch(source, new RegExp(unverifiedContent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})
