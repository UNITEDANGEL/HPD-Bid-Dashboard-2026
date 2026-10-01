const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PDFDocument } = require('pdf-lib');
const root = path.resolve(__dirname, '..');
require.extensions['.ts'] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const { drawInvoicePage, INVOICE_COMPANY } = require(path.join(root, 'lib/invoice-pdf.ts'));

const base = {
  omo: 'TEST-OMO', invoiceNo: 'TEST-OMO', invoiceDate: '09/29/26', taxId: '203444624', trade: 'GENERAL CONSTRUCTION',
  borough: 'MANHATTAN', address: '100 SAMPLE STREET, 10001', location: '1B', dateStarted: '09/29/26', dateCompleted: '09/29/26',
  permitRequired: false, approvedChange: false, rcMini: false, bidAmount: '411.00', changeAmount: '0.00', totalCharge: '411.00',
  signerName: 'TEST SIGNER', title: 'VP', materials: [{ name: 'TRASH BAGS', qty: '1' }],
};

(async () => {
  // Normal invoice: one Letter page.
  let doc = await PDFDocument.create();
  await drawInvoicePage(doc, { ...base, description: 'TEST ONLY - INSTALL HINGES' });
  assert.equal(doc.getPageCount(), 1);
  const { width, height } = doc.getPage(0).getSize();
  assert.deepEqual([width, height], [612, 792]);

  // ITB text with curly quotes, dashes and characters standard fonts cannot encode must not fail.
  doc = await PDFDocument.create();
  await drawInvoicePage(doc, { ...base, description: 'NYC HPD – “ESSENTIAL SERVICE WORK” ≈ 120 S.F. → DONE 中', address: '“38” ST NICHOLAS – PLACE' });
  assert.equal(doc.getPageCount(), 1);

  // A very long description and long values still fit on one page.
  doc = await PDFDocument.create();
  await drawInvoicePage(doc, { ...base, description: 'REPAIR DOOR AND FRAME. '.repeat(200), address: 'X'.repeat(200), materials: Array.from({ length: 15 }, (_, i) => ({ name: `ITEM ${i}`, qty: '1' })) });
  assert.equal(doc.getPageCount(), 1);
  await doc.save();

  assert.equal(INVOICE_COMPANY.name, 'UNITED ANGEL CONSTRUCTION CORP.');
  console.log('Invoice PDF: drawn as one Letter page; unusual characters and overflow handled.');
})().catch(error => { console.error(error); process.exit(1); });
