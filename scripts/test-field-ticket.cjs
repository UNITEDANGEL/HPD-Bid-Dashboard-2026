const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const file = 'app/field-command/BuildingPhoto.tsx';
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let expression;
function visit(node) {
  if (ts.isJsxExpression(node) && node.expression && node.expression.getText(source).startsWith('photo ?') && node.getText(source).includes('fc-building-image')) expression = node.expression;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(expression, 'The real building photo branch must be tested');
const compiled = ts.transpileModule(`function preview() { return (${expression.getText(source)}); }`, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
let cleared, error, enlarged;
const context = { require, exports: {}, photo: {dataUrl:'data:image/png;base64,test'}, googlePicture: null, setGooglePicture: () => {}, address:'Test address', expanded:false,
  setPhoto: value => { cleared = value; }, setError: value => { error = value; }, setExpanded: value => { enlarged = value; } };
vm.createContext(context);
vm.runInContext(compiled, context);
const photo = context.preview();
assert.equal(photo.type, 'button');
assert.equal(photo.props.children.props.src, context.photo.dataUrl);
assert.equal(photo.props.children.props.alt, 'Building exterior at Test address');
photo.props.onClick();
assert.equal(enlarged, true);
photo.props.children.props.onError();
assert.equal(cleared, null);
assert.ok(error.includes('saved file is retained'));
context.photo = null;
assert.equal(context.preview().props.children, 'No building photo');
// No photo of your own, but Google has Street View there: its picture shows automatically.
context.googlePicture = { url: 'https://maps.googleapis.com/maps/api/streetview?pano=P', date: '2025-06' };
const google = context.preview();
assert.equal(google.props['data-hpd-smoke'], 'building-street-view');
assert.equal(google.props.children[0].props.src, context.googlePicture.url);
assert.equal(google.props.children[0].props.alt, 'Google Street View of Test address');
console.log('PASS: actual building photo rendering, enlargement, empty state, broken-image fallback and automatic Street View picture');
