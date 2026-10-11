const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync('lib/email-package.ts', 'utf8');
let compact = 'data:image/jpeg;base64,small';
const context = { exports: {}, require: () => ({ compactImageDataUrl: async (url, side) => typeof compact === 'function' ? compact(side) : compact,
  dataUrlToBytes: value => ({ byteLength: /size:(\d+)/.test(value) ? Number(value.match(/size:(\d+)/)[1]) : value.includes('small') ? 10 : 100 }) }) };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { assertEmailPackageSize, emailMediaCopies, fitEmailVideos, emailPhotoBudget } = context.exports;
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
  // Photos use the best quality that fits the email: few photos stay sharp, many step down.
  compact = side => `data:image/jpeg;size:${side * 1000}`;
  const big = [{ name: 'b1.jpg', mediaType: 'image', dataUrl: 'size:99999999' }];
  assert.equal((await emailMediaCopies(big, 10000000))[0].dataUrl, 'data:image/jpeg;size:4032000', 'one photo goes at full quality');
  assert.equal((await emailMediaCopies(big, 2000000))[0].dataUrl, 'data:image/jpeg;size:1800000', 'steps down until it fits');
  assert.equal(emailPhotoBudget(big), 16000000);
  assert.equal(emailPhotoBudget([...big, { mediaType: 'video' }]), 8000000, 'photos leave room for videos');
  compact = 'original';
  let calls = 0;
  await fitEmailVideos(rows, 0, () => {}, async () => { calls++; });
  assert.equal(calls, 0, 'No compression when it already fits');
  const large = [{ name: 'before.mp4', mediaType: 'video', dataUrl: 'size:20000000' }, { name: 'after.mp4', mediaType: 'video', dataUrl: 'size:10000000' }];
  const reduced = await fitEmailVideos(large, 1000000, () => {}, async (row, budget) => ({ ...row, dataUrl: `size:${budget}` }));
  assert.equal(reduced.length, 2);
  assert.equal(large[0].dataUrl, 'size:20000000');
  await assert.rejects(fitEmailVideos(large, 1000000, () => {}, async row => row), /exceeds/);
  await assert.rejects(fitEmailVideos(large, 1000000, () => {}, async () => { throw new Error('Unsupported codec'); }), /Unsupported/);
  const card = fs.readFileSync('app/field-command/FieldCommandClient.tsx', 'utf8');
  // Upload entries: the Before/After tiles in Media & Documents, plus the guided steps'
  // "Start work" (before) and "Finish work" (after) buttons, plus "+ More before/after", plus "Got in" on a
  // no-access 2nd try -- all open the same picker.
  assert.equal((card.match(/requestMediaUpload\(/g) || []).length, 7, 'definition + tile handler + 2 guided steps + 2 more-media buttons + got in');
  assert.ok(card.includes('{(["before", "after"] as const).map((kind) => {') && card.includes('onClick={() => requestMediaUpload(kind)}'));
  assert.ok(!card.includes('fc-quick-action is-photos'));
  const mediaSource = fs.readFileSync('lib/field-photo-store.ts', 'utf8');
  const mediaAst = ts.createSourceFile('media.ts', mediaSource, ts.ScriptTarget.Latest, true);
  const decodeNode = mediaAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'dataUrlToBytes');
  const decodeContext = { exports: {}, window: { atob }, Uint8Array };
  vm.runInNewContext(ts.transpileModule(decodeNode.getText(mediaAst), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, decodeContext);
  assert.deepEqual([...decodeContext.exports.dataUrlToBytes('data:video/webm;codecs=vp8,opus;base64,AQID')], [1,2,3]);
  assert.throws(() => decodeContext.exports.dataUrlToBytes('invalid'));
  const page = fs.readFileSync('app/paperwork/page.tsx', 'utf8');
  const guard = page.indexOf('assertEmailPackageSize(zipBytes.byteLength)');
  assert.ok(guard > 0 && guard < page.indexOf('await saveFieldPacket({', guard));
  console.log('PASS email package boundary, smaller-copy selection, video retention, originals unchanged and pre-save guard');
})().catch(error => { console.error(error); process.exitCode = 1; });
