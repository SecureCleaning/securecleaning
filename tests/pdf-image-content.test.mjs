import assert from 'node:assert/strict'
import test from 'node:test'
import { validateDocumentContent } from '../src/lib/documentContent.ts'
import { pdfWithoutImagePayloads } from '../src/lib/pdfImageStreamScan.ts'

const payload = 'encoded image bytes /JS /AA /J#53 <script> endstream /OpenAction'
function pdf(dictionary = '', tail = '', length = payload.length, subtype = '/Image') {
  return `%PDF-1.4\n1 0 obj\n<< /Type /XObject /Subtype ${subtype} /Length ${length} ${dictionary} >>\nstream\n${payload}\nendstream\nendobj\n${tail}\ntrailer\n<< /Size 2 >>\nstartxref\n0\n%%EOF\n`
}
const validate = text => validateDocumentContent(Buffer.from(text, 'latin1'), 'document.pdf', 'application/pdf')
test('encoded image payload bytes are not interpreted as PDF action names', () => {
  assert.equal(validate(pdf()).contentType, 'application/pdf')
  assert.ok(!pdfWithoutImagePayloads(pdf()).includes(payload))
})
test('real active names before and after an image remain rejected, including escaped names', () => {
  for (const action of ['/JavaScript', '/J#53', '/AA', '/OpenAction', '/EmbeddedFile', '/Launch']) {
    assert.throws(() => validate(pdf(action + ' true')))
    assert.throws(() => validate(pdf('', `2 0 obj << ${action} true >> endobj`)))
  }
})
test('non-image streams and uncertain boundaries retain the conservative scan', () => {
  for (const text of [pdf('', '', 5), pdf('', '', 999999), pdf('', '', '2 0 R'), pdf('/Length 5'), pdf('', '', payload.length, '/Form'), pdf('', '', payload.length, '/ObjStm')]) {
    assert.throws(() => validate(text))
  }
})
test('strings/comments cannot masquerade as image dictionaries, malformed input terminates', () => {
  for (const text of [pdf().replace('1 0 obj', '1 0 obj (' ).replace('endobj', ') endobj'), pdf().replace('<< /Type', '% << /Type'), pdf().replace('trailer\n<< /Size 2 >>', 'trailer\n[')]) {
    assert.equal(pdfWithoutImagePayloads(text), text)
    assert.throws(() => validate(text))
  }
})
