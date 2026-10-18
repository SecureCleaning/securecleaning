import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeProductDescription, productDescriptionText } from '../src/lib/productDescription.ts'

test('product formatting survives saving and reopening', () => {
  const html = '<p><strong>Daily cleaning</strong> <u>after midnight</u></p><ul><li>Floors</li><li><em>Bathrooms</em></li></ul>'
  assert.equal(sanitizeProductDescription(html), html)
  assert.equal(sanitizeProductDescription(sanitizeProductDescription(html)), html)
  assert.equal(productDescriptionText(html), 'Daily cleaning after midnight\nFloors\nBathrooms')
})

test('product description rejects active content, links and hidden styling', () => {
  const html = sanitizeProductDescription('<script>alert(1)</script><p onclick="alert(1)" style="display:none"><u>Visible</u></p><img src=x onerror="alert(1)"><a href="javascript:alert(1)">Link text</a>')
  assert.equal(html, '<p><u>Visible</u></p>Link text')
})

test('plain text for privacy checks includes formatted and entity-encoded text', () => {
  assert.equal(productDescriptionText(sanitizeProductDescription('<p>A&#99;me &amp; Sons</p><p>Unit <b>12</b></p>')), 'Acme & Sons\nUnit 12')
})
