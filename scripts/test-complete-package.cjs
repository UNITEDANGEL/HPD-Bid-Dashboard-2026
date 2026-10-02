const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const pdf = require('pdf-lib');
const root = path.resolve(__dirname, '..');
const text = fs.readFileSync(path.join(root, 'app/paperwork/page.tsx'), 'utf8');
const ast = ts.createSourceFile('page.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = ast.statements.filter(n => (ts.isFunctionDeclaration(n) && n.name?.text !== 'renderPdfFirstPageImage' && !n.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) || ts.isVariableStatement(n)).map(n => n.getText(ast)).join('\n');
const start = text.indexOf('  async function generateAffidavitPdf(');
const end = text.indexOf('  function canSharePackageFiles(', start);
assert.ok(start > 0 && end > start);
const source = ts.transpileModule(declarations + '\n' + text.slice(start, end) + '\nthis.generate = generateCompletePackage;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function loadTs(file) {
  const context = { exports: {}, require: name => name.startsWith('.') ? loadTs(path.resolve(path.dirname(file), name + '.ts')) : require(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  return context.exports;
}
const paperwork = loadTs(path.join(root, 'lib/paperwork.ts'));
const { calendarDay } = loadTs(path.join(root, 'lib/job-priority.ts'));
const noAccess = loadTs(path.join(root, 'lib/no-access.ts'));
const tenantContact = loadTs(path.join(root, 'lib/tenantContact.ts'));
const materials = loadTs(path.join(root, 'lib/invoice-materials.ts'));
// pdf-lib rejects objects created inside a vm context, so the invoice drawer loads in this realm.
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const { drawInvoicePage } = require(path.join(root, 'lib/invoice-pdf.ts'));
const { signatureBytes } = require(path.join(root, 'lib/signature.ts'));
const output = path.join(root, 'output/pdf/complete-package-test');
fs.mkdirSync(output, { recursive: true });
// Synthetic packaging fixture only, never uploaded to a real job or Drive.
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
async function run(outcome, awardDate, broken = false) {
  const saved = [], statuses = [], requested = [], forms = [];
  const media = ['before', 'after', 'general'].map((kind, i) => ({ id: `TEST-${i}`, jobId: 'TEST-PACKAGE', kind, mediaType: 'image', evidenceLabel: kind === 'general' ? 'Building exterior' : `${kind} TEST ONLY`, name: `TEST-ONLY-${kind}.png`, type: 'image/png', size: imageBytes.length, capturedAt: '2026-09-15T12:00:00Z', dataUrl: broken && i === 0 ? '' : `data:image/png;base64,${imageBytes.toString('base64')}`, stamped: false }));
  const context = { ...pdf, ...paperwork, ...noAccess, ...tenantContact, ...materials, drawInvoicePage, signatureBytes, signatureRef: { current: `data:image/png;base64,${imageBytes.toString('base64')}` }, calendarDay, console, Uint8Array, ArrayBuffer, TextEncoder, Date, Buffer, Blob, File, URL,
    emailMediaCopies: async rows => rows,
    fitEmailVideos: async rows => rows,
    packageBusyRef: { current: false }, setPackageBusy() {},
    assertEmailPackageSize: size => assert.ok(size > 0 && size <= 18000000),
    outcome, selectedId: 'TEST-PACKAGE', selectedJob: { OMO: 'TEST-PACKAGE', AwardDate: awardDate },
    form: { jobId: 'TEST-PACKAGE', address: '100 SAMPLE STREET', borough: 'Queens', location: 'APT 2A', amount: '100', bidAmount: '630', invoiceNo: 'TEST-INVOICE', signer: '', fieldDate: '2026-09-15', workStart: '2026-09-10', workComplete: '2026-09-15', firstAttempt: '2026-09-10', secondAttempt: '2026-09-15', description: 'TEST ONLY - SAMPLE REPAIR', notes: 'TEST ONLY', deniedName: 'SAMPLE PERSON', deniedRelationship: 'TENANT', deniedDescription: 'TEST ONLY', deniedPhone: '', tenantPhone: '', phone1Date: '', phone2Date: '', phoneNote: '', partialReason: 'TEST ONLY', partialWorkDone: 'TEST ONLY', materialsText: '', affidavitReason: 'TEST ONLY' },
    fetch: async url => { requested.push(url); return { ok: true, arrayBuffer: async () => fs.readFileSync(path.join(root, 'public', url)) }; },
    setPdfStatus: value => statuses.push(value), saveFieldPacket: async value => saved.push(value), listFieldEvidence: async () => media,
    bytesToDataUrl: (bytes, mime) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`,
    dataUrlToBytes: value => new Uint8Array(Buffer.from(value.split(',')[1], 'base64')),
    renderPdfFirstPageImage: async bytes => ({ imageUrl: '', pageCount: (await pdf.PDFDocument.load(bytes)).getPageCount(), error: 'Headless test: preview rendered separately' }),
    clearPackagePreview() {}, setFullScreenPdfOpen() {}, setIncludePackageMedia() {}, setIncludePackageSignature() {}, setForm(value) { forms.push(value); }, setPackagePreview() {}, setPackagePreviewOpen() {},
    notaryRef: { current: null }, setNotaryKey() {}, rememberNotary() {}, packageNotaryRef: { current: null }, lastIncludeMediaRef: { current: true },
    pendingCompletePackageRef: { current: null }, markPackageGenerated: async () => 'TEST ONLY - no job mutation',
  };
  new Function(`with (this) { ${source} }`).call(context);
  await context.generate(true, false);
  const packet = saved.find(row => row.packetType === 'full_evidence_zip');
  if (!broken && (calendarDay(awardDate) === null || calendarDay(awardDate) < calendarDay('2026-08-28'))) {
    assert.equal(packet, undefined);
    assert.ok(statuses.some(value => value.includes('Legacy field mapping') || value.includes('Verify the job award date')));
    console.log(`PASS ${awardDate || 'missing award'}: unsafe affidavit version blocked`);
    return;
  }
  if (broken) {
    assert.equal(packet, undefined);
    assert.ok(statuses.some(value => value.includes('Package stopped')));
    return;
  }
  assert.ok(packet, statuses.join('; '));
  assert.equal(forms.at(-1).workStart, '2026-09-10', 'Photo date must not replace entered start');
  assert.equal(forms.at(-1).workComplete, '2026-09-15');
  const pending = context.pendingCompletePackageRef.current;
  assert.equal(pending.imageCount, 3);
  for (const folder of ['images/before/', 'images/after/', 'images/building/', 'invoice-affidavit-package/']) assert.ok(pending.folderEntries.some(entry => entry.path.startsWith(folder)), folder);
  const pdfEntry = pending.folderEntries.find(entry => entry.section === 'pdf');
  const doc = await pdf.PDFDocument.load(pdfEntry.bytes);
  assert.equal(doc.getPageCount(), 3);
  for (const page of doc.getPages()) for (const ref of page.node.Annots()?.asArray() || []) assert.ok(doc.context.lookup(ref), 'No dangling PDF annotation');
  assert.deepEqual(Buffer.from(packet.dataUrl.split(',')[1], 'base64'), Buffer.from(pending.zipBytes));
  const name = `${awardDate}-${outcome}`;
  fs.writeFileSync(path.join(output, `${name}.zip`), pending.zipBytes);
  fs.writeFileSync(path.join(output, `${name}.pdf`), pdfEntry.bytes);
  console.log(`PASS ${name}: ${doc.getPageCount()} pages, 3 fixture media, full ZIP retained; templates: ${requested.join(', ')}`);
}
(async () => {
  for (const awardDate of ['2026-08-27', '2026-08-28']) for (const outcome of ['work_completed', 'partial_work_completed', 'no_access', 'refused_access', 'completed_by_others']) await run(outcome, awardDate);
  await run('work_completed', '2026-08-28', true);
  await run('work_completed', '');
  console.log('PASS: unreadable media blocks complete package');
})().catch(error => { console.error(error); process.exitCode = 1; });
