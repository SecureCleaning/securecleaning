import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const layout = readFileSync(new URL('../src/app/jobs/layout.tsx', import.meta.url), 'utf8')
const image = readFileSync(new URL('../src/app/jobs/opengraph-image.tsx', import.meta.url), 'utf8')

test('reusable jobs links select a dedicated large social preview', () => {
  assert.match(layout, /openGraph:[\s\S]+url: '\/jobs\/opengraph-image'[\s\S]+width: 1200[\s\S]+height: 630/)
  assert.match(layout, /twitter:[\s\S]+card: 'summary_large_image'[\s\S]+images: \['\/jobs\/opengraph-image'\]/)
})

test('jobs preview renders the approved logo on an opaque white panel', () => {
  assert.match(image, /secure-cleaning-logo-aug26\.png/)
  assert.match(image, /background: 'white'/)
  assert.match(image, /export const size = \{ width: 1200, height: 630 \}/)
  assert.match(image, /export const contentType = 'image\/png'/)
})
