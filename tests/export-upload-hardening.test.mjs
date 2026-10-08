import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs'
import { escapeIcsText, serializeIcs } from '../src/lib/ics.ts'
import { csvCell } from '../src/lib/csvCell.ts'
import { validateDocumentContent, documentDownloadHeaders } from '../src/lib/documentContent.ts'
import { validateXlsxArchive, readXlsxRows } from '../src/lib/xlsxSafety.ts'

test('ICS normalizes all newline forms and folds UTF8 at 75 bytes without field injection', () => {
 const value = 'safe\rATTENDEE:evil\r\nnext\nlast;,'
 assert.equal(escapeIcsText(value), 'safe\\nATTENDEE:evil\\nnext\\nlast\\;\\,')
 const result = serializeIcs(['DESCRIPTION:' + escapeIcsText(value) + '😀'.repeat(80)])
 for (const line of result.trimEnd().split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75)
 assert.ok(!result.includes('\r\nATTENDEE:'))
 assert.throws(() => serializeIcs(['SUMMARY:a\rEVIL:yes']))
})
test('CSV protects formulas behind whitespace and control prefixes', () => {
 for (const value of ['=1+1',' \t=1+1','\u0000+cmd','\r@formula','-1','\ttext']) assert.ok(csvCell(value).startsWith('"\''))
 assert.equal(csvCell('ordinary, quoted'), '"ordinary, quoted"')
})
test('documents reject spoofed MIME, truncated signatures and unsafe headers', () => {
 for (const bytes of [Buffer.from('<html>payload</html>'), Buffer.from('%PDF-1.7'), Buffer.from([255,216,255,217]), Buffer.from('RIFFfakeWEBP')]) assert.throws(() => validateDocumentContent(bytes,'safe.pdf','application/pdf'))
 const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC', 'base64')
 assert.equal(validateDocumentContent(png, 'photo.exe', 'image/png').fileName, 'photo.png')
 const corrupt = Buffer.from(png); corrupt[30] ^= 1; assert.throws(() => validateDocumentContent(corrupt, 'bad.png', 'image/png'))
 let pdfText = '%PDF-1.7\n'
 const offsets = [0]
 const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 1 /Kids [3 0 R] >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>']
 for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdfText)); pdfText += `${index + 1} 0 obj\n${object}\nendobj\n` }
 const xref = Buffer.byteLength(pdfText)
 pdfText += 'xref\n0 4\n0000000000 65535 f \n' + offsets.slice(1).map(n => String(n).padStart(10,'0') + ' 00000 n \n').join('') + `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
 const pdf = Buffer.from(pdfText)
 assert.equal(validateDocumentContent(pdf, 'evil.html', 'application/pdf').fileName, 'evil.pdf')
 assert.throws(() => validateDocumentContent(pdf, 'x.png', 'image/png'))
 for (const active of ['/JavaScript', '/J#53', '/OpenAction', '/EmbeddedFile', '<html><script>']) {
   assert.throws(() => validateDocumentContent(Buffer.from(pdf.toString().replace('/Type /Catalog', '/Type /Catalog ' + active)), 'active.pdf', 'application/pdf'))
 }
 const headers = documentDownloadHeaders('evil\r\nX-Test: yes.html')
 assert.ok(!/[\r\n]/.test(headers['Content-Disposition']))
 assert.equal(headers['X-Content-Type-Options'], 'nosniff')
 assert.equal(headers['Content-Type'], 'application/octet-stream')
})
test('XLSX accepts normal imports and rejects oversized dimensions and lying ZIP sizes', async () => {
 const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Products'); sheet.addRow(['title','cost']); sheet.addRow(['Soap',2])
 const data = Buffer.from(await book.xlsx.writeBuffer()); validateXlsxArchive(data)
 const parsed = await readXlsxRows(data); assert.deepEqual(parsed.rows[1], ['Soap',2])
 const tampered = Buffer.from(data); const central = tampered.indexOf(Buffer.from([0x50,0x4b,0x01,0x02])); tampered.writeUInt32LE(100 * 1024 * 1024, central+24)
 assert.throws(() => validateXlsxArchive(tampered))
 const underreported = Buffer.from(data); underreported.writeUInt32LE(1, central+24); assert.throws(() => validateXlsxArchive(underreported))
 sheet.getCell('ZZ9999').value = 'bomb'; const wide = Buffer.from(await book.xlsx.writeBuffer()); assert.throws(() => validateXlsxArchive(wide))
})
