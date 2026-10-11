const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
// The building picture at the top of the job card (BuildingHero): your own photo wins over
// Google's Street View picture; a broken image falls back; the 360° link opens Street View.
const file = 'app/field-command/BuildingPhoto.tsx';
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let expression;
function visit(node) {
  if (ts.isJsxExpression(node) && node.expression && node.expression.getText(source).startsWith('src ? <img')) expression = node.expression;
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(expression, 'The real building picture branch must be tested');
const compiled = ts.transpileModule(`function preview() { return (${expression.getText(source)}); }`, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
let ownCleared, googleCleared;
const context = { require, exports: {}, address: 'Test address', src: 'data:image/png;base64,test', own: { dataUrl: 'data:image/png;base64,test' },
  setOwn: (v) => { ownCleared = v; }, setGoogle: (v) => { googleCleared = v; } };
vm.createContext(context);
vm.runInContext(compiled, context);
const own = context.preview();
assert.equal(own.type, 'img');
assert.equal(own.props.src, context.src);
assert.equal(own.props.alt, 'Building at Test address');
own.props.onError();
assert.equal(ownCleared, null, 'a broken own photo falls back to Google');
context.own = null; context.src = 'https://maps.googleapis.com/maps/api/streetview?pano=P';
context.preview().props.onError();
assert.equal(googleCleared, null, 'a broken Google picture is hidden');
context.src = '';
assert.equal(context.preview().props.children, 'No building picture yet');
const hero = fs.readFileSync(file, 'utf8');
assert.ok(hero.includes('data-hpd-smoke="jc-hero-360"') && hero.includes('streetViewLink(point, google?.pano'), '360° view uses the panorama facing the building');
console.log('PASS: building picture: own photo first, Google fallback, broken-image fallback, empty state, 360° view link');
