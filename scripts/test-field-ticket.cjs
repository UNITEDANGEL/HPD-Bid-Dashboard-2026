const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.join(__dirname, '../app/field-command/FieldCommandClient.tsx');
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let expression;
function visit(node) {
  if (ts.isJsxExpression(node) && node.expression && node.expression.getText(source).startsWith('selectedPhoto ?') && node.getText(source).includes('fc-ticket-photo')) expression = node.expression;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(expression, 'The real ticket photo branch must be tested');
const compiled = ts.transpileModule(`function preview() { return (${expression.getText(source)}); }`, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
let requestedKind;
let cleared;
const context = {
  require, exports: {}, selectedPhoto: 'data:image/png;base64,test', id: 'TEST-JOB', stamps: {},
  PhotosIcon: () => null,
  suggestedPhotoKind: (stamps) => stamps.work ? 'after' : 'before',
  requestMediaUpload: (kind) => { requestedKind = kind; },
  setSelectedPhoto: (value) => { cleared = value; },
};
vm.createContext(context);
vm.runInContext(compiled, context);
const photo = context.preview();
assert.equal(photo.type, 'a');
assert.equal(photo.props.href, '/jobs/TEST-JOB');
assert.equal(photo.props.children[0].props.src, context.selectedPhoto);
assert.equal(photo.props.children[0].props.alt, 'Saved job photo for TEST-JOB');
photo.props.children[0].props.onError();
assert.equal(cleared, null);
context.selectedPhoto = null;
const empty = context.preview();
assert.equal(empty.type, 'button');
assert.equal(empty.props['aria-label'], 'Add before job photo');
empty.props.onClick();
assert.equal(requestedKind, 'before');
context.stamps = { work: 'sample' };
context.preview().props.onClick();
assert.equal(requestedKind, 'after');
console.log('PASS: real saved-photo preview, job link, broken-image fallback and before/after photo shortcuts');
