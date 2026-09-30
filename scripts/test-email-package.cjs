const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync('lib/email-package.ts', 'utf8');
let compact = 'data:image/jpeg;base64,small';
const context = { exports: {}, require: () => ({ compactImageDataUrl: async () => compact,
  dataUrlToBytes: value => ({ byteLength: value.includes('small') ? 10 : 100 }) }) };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { assertEmailPackageSize, emailMediaCopies } = context.exports;
(async () => {
  assertEmailPackageSize(18000000);
  for (const size of [18000001, 25000000, NaN, 0, -1]) assert.throws(() => assertEmailPackageSize(size));
  const rows = [{ name: 'before.png', mediaType: 'image', dataUrl: 'original', type: 'image/png' }, { name: 'after.mp4', mediaType: 'video', dataUrl: 'original-video' }];
  const result = await emailMediaCopies(rows);
  assert.equal(result[0].name, 'before.jpg');
  assert.equal(result[0].size, 10);
  assert.equal(result[1].dataUrl, 'original-video');
  assert.equal(rows[0].dataUrl, 'original');
  compact = 'original';
  assert.equal((await emailMediaCopies(rows))[0].dataUrl, 'original');
  const page = fs.readFileSync('app/paperwork/page.tsx', 'utf8');
  const guard = page.indexOf('assertEmailPackageSize(zipBytes.byteLength)');
  assert.ok(guard > 0 && guard < page.indexOf('await saveFieldPacket({', guard));
  console.log('PASS email package boundary, smaller-copy selection, video retention, originals unchanged and pre-save guard');
})().catch(error => { console.error(error); process.exitCode = 1; });
