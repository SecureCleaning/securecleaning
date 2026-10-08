// Keep ExcelJS and its dependency graph in the server deployment trace.
// Untrusted workbook parsing still runs only inside the bounded worker.
import 'exceljs'
import { inflateRawSync } from 'node:zlib'
import { Worker } from 'node:worker_threads'

const fail = () => new Error('The workbook is malformed or exceeds safe import limits.')
export function validateXlsxArchive(data: Buffer) {
  const maxExpanded = 20 * 1024 * 1024
  let end = -1
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (data.readUInt32LE(i) === 0x06054b50) { end = i; break }
  }
  if (end < 0 || data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6) || end + 22 + data.readUInt16LE(end + 20) !== data.length) throw fail()
  const count = data.readUInt16LE(end + 10); const centralSize = data.readUInt32LE(end + 12); const centralOffset = data.readUInt32LE(end + 16)
  if (!count || count > 128 || count !== data.readUInt16LE(end + 8) || centralOffset + centralSize !== end) throw fail()
  let cursor = centralOffset; let expanded = 0; const names = new Set<string>(); const ranges: Array<[number, number]> = []
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || data.readUInt32LE(cursor) !== 0x02014b50) throw fail()
    const flags = data.readUInt16LE(cursor + 8); const method = data.readUInt16LE(cursor + 10)
    const compressed = data.readUInt32LE(cursor + 20); const size = data.readUInt32LE(cursor + 24)
    const nameLength = data.readUInt16LE(cursor + 28); const extraLength = data.readUInt16LE(cursor + 30); const commentLength = data.readUInt16LE(cursor + 32)
    const local = data.readUInt32LE(cursor + 42)
    if (cursor + 46 + nameLength + extraLength + commentLength > end) throw fail()
    const name = data.toString('utf8', cursor + 46, cursor + 46 + nameLength)
    expanded += size
    if ((flags & 1) || ![0, 8].includes(method) || expanded > maxExpanded || size > 8 * 1024 * 1024 || size > Math.max(1024 * 1024, compressed * 200) || names.has(name) || /(^\/|\\|\.\.)/.test(name) || /vbaProject|externalLinks/i.test(name)) throw fail()
    const supported = /^(?:\[Content_Types\]\.xml|_rels\/\.rels|docProps\/(?:app|core|custom)\.xml|xl\/(?:workbook|styles|sharedStrings)\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/theme\/theme\d+\.xml|xl\/worksheets\/sheet\d+\.xml|xl\/worksheets\/_rels\/sheet\d+\.xml\.rels|xl\/tables\/table\d+\.xml|xl\/drawings\/drawing\d+\.xml|xl\/drawings\/_rels\/drawing\d+\.xml\.rels|xl\/media\/image\d+\.(?:png|jpeg|jpg|gif)|xl\/comments\d+\.xml|xl\/drawings\/vmlDrawing\d+\.vml)$/
    const directory = /^(?:_rels|docProps|xl|xl\/(?:_rels|theme|worksheets|worksheets\/_rels|tables|drawings|drawings\/_rels|media))\/$/.test(name)
    if (!supported.test(name) && !directory) throw fail()
    names.add(name)
    if (local + 30 > centralOffset || data.readUInt32LE(local) !== 0x04034b50 || data.readUInt16LE(local + 6) !== flags || data.readUInt16LE(local + 8) !== method) throw fail()
    if (!(flags & 8) && (data.readUInt32LE(local + 18) !== compressed || data.readUInt32LE(local + 22) !== size)) throw fail()
    const localNameLength = data.readUInt16LE(local + 26); const start = local + 30 + localNameLength + data.readUInt16LE(local + 28)
    if (data.toString('utf8', local + 30, local + 30 + localNameLength) !== name || start + compressed > centralOffset || ranges.some(([a, b]) => local < b && start + compressed > a)) throw fail()
    ranges.push([local, start + compressed])
    let bytes: Buffer
    try { bytes = method === 0 ? data.subarray(start, start + compressed) : inflateRawSync(data.subarray(start, start + compressed), { maxOutputLength: Math.min(size + 1, maxExpanded) }) } catch { throw fail() }
    if (bytes.length !== size) throw fail()
    if (name.endsWith('.xml')) {
      const xml = bytes.toString('utf8')
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw fail()
      if (/^xl\/worksheets\//.test(name)) {
        const cells = [...xml.matchAll(/\b(?:r|ref)\s*=\s*['"]([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?['"]/g)]
        for (const match of cells) {
          for (const [letters, row] of [[match[1], match[2]], [match[3], match[4]]]) {
            if (!letters) continue
            let column = 0; for (const c of letters) column = column * 26 + c.charCodeAt(0) - 64
            if (column > 64 || Number(row) > 2000) throw fail()
          }
        }
        if ((xml.match(/<c\b/g) ?? []).length > 40000) throw fail()
      }
    }
    cursor += 46 + nameLength + extraLength + commentLength
  }
  if (cursor !== end || !names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) throw fail()
}

// ExcelJS runs in a terminable isolate; a Promise timeout alone cannot stop parsing.
export async function readXlsxRows(data: Buffer): Promise<{ rows: Array<Array<string | number | boolean | null>>; formulas: Array<[string, string]> }> {
  validateXlsxArchive(data)
  return new Promise((resolve, reject) => {
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      (async () => {
        const runtimeRequire = require('node:module').createRequire(require('node:path').join(workerData.root, 'package.json'));
        const ExcelJS = runtimeRequire('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.from(workerData.data));
        const sheet = workbook.worksheets[0];
        if (!sheet || workbook.worksheets.length > 16 || sheet.rowCount > 2000 || sheet.columnCount > 64) throw new Error('Workbook dimensions exceed import limits.');
        const rows = []; const formulas = [];
        sheet.eachRow({ includeEmpty: true }, (source, n) => {
          const row = [];
          for (let c = 1; c <= sheet.columnCount; c++) {
            let value = source.getCell(c).value;
            if (value && typeof value === 'object') {
              if (typeof value.formula === 'string') formulas.push([n + ':' + c, value.formula]);
              value = value.result ?? value.text ?? null;
            }
            row.push(['string', 'number', 'boolean'].includes(typeof value) ? value : null);
          }
          rows.push(row);
        });
        parentPort.postMessage({ rows, formulas });
      })().catch(() => { throw new Error('Unable to safely parse workbook.'); });
    `, { eval: true, workerData: { data, root: process.cwd() }, resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 } })
    const timer = setTimeout(() => { void worker.terminate(); reject(fail()) }, 5000)
    worker.once('message', (result) => { clearTimeout(timer); void worker.terminate(); resolve(result) })
    worker.once('error', () => { clearTimeout(timer); reject(fail()) })
    worker.once('exit', (code) => { clearTimeout(timer); if (code !== 0) reject(fail()) })
  })
}
