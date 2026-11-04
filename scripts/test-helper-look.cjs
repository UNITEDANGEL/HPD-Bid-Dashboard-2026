// 🌤 What the robot wears (4 Nov): party hat for good news, nightcap at night, umbrella before rain or snow, a scarf
// when it's cold, sunglasses on a hot sunny day, nothing special otherwise.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.resolve('lib/helper-look.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', code)((m) => (m === 'react' ? { useEffect() {}, useState: (v) => [v, () => {}] } : require(m)), mod, mod.exports);
const { robotOutfit } = mod.exports;
assert.equal(robotOutfit({ happy: true, sleep: true, wx: { temp: 30, icon: '☀️', note: 'rain 2 PM' } }), 'party');
assert.equal(robotOutfit({ sleep: true, wx: { temp: 30, icon: '☀️', note: '' } }), 'pajamas');
assert.equal(robotOutfit({ wx: { temp: 58, icon: '🌧', note: 'rain 2 PM' } }), 'umbrella');
assert.equal(robotOutfit({ wx: { temp: 28, icon: '❄️', note: 'snow now' } }), 'umbrella');
assert.equal(robotOutfit({ wx: { temp: 36, icon: '☁️', note: 'H 41° L 30°' } }), 'scarf');
assert.equal(robotOutfit({ wx: { temp: 88, icon: '☀️', note: 'H 90° L 72°' } }), 'sunglasses');
assert.equal(robotOutfit({ wx: { temp: 88, icon: '☁️', note: 'H 90° L 72°' } }), '');
assert.equal(robotOutfit({ wx: { temp: 62, icon: '⛅', note: 'H 66° L 55°' } }), '');
assert.equal(robotOutfit({ wx: null }), '');
console.log('helper look ok: party, nightcap, umbrella (rain/snow), scarf (≤40°), sunglasses (≥80° and sunny)');
