import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const layout = readFileSync(new URL('../src/app/jobs/layout.tsx', import.meta.url), 'utf8')

function readPngMetadata(relativePath) {
  const image = readFileSync(new URL(relativePath, import.meta.url))
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  return {
    width: image.readUInt32BE(16),
    height: image.readUInt32BE(20),
    colorType: image[25],
  }
}

test('reusable jobs links select a dedicated large social preview', () => {
  assert.match(layout, /openGraph:[\s\S]+url: '\/secure-cleaning-jobs-social-card-v2\.png'[\s\S]+width: 1200[\s\S]+height: 630/)
  assert.match(layout, /twitter:[\s\S]+card: 'summary_large_image'[\s\S]+images: \['\/secure-cleaning-jobs-social-card-v2\.png'\]/)
})

test('global links select a finished large social preview instead of the transparent logo', () => {
  const rootLayout = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8')
  assert.match(rootLayout, /openGraph:[\s\S]+url: '\/secure-cleaning-social-card-v2\.png'[\s\S]+width: 1200[\s\S]+height: 630/)
  assert.match(rootLayout, /twitter:[\s\S]+card: 'summary_large_image'[\s\S]+images: \['\/secure-cleaning-social-card-v2\.png'\]/)
  assert.doesNotMatch(rootLayout, /openGraph:[\s\S]+url: '\/secure-cleaning-logo-aug26\.png'/)
})

test('social preview files are full-size opaque PNG images', () => {
  for (const imagePath of [
    '../public/secure-cleaning-social-card-v2.png',
    '../public/secure-cleaning-jobs-social-card-v2.png',
  ]) {
    assert.deepEqual(readPngMetadata(imagePath), { width: 1200, height: 630, colorType: 2 })
  }
})
